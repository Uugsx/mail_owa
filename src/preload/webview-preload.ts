import { ipcRenderer, webFrame } from 'electron';

if (typeof window !== 'undefined' && window.self === window.top) {
  runPreload();
}

function runPreload() {
  console.log('🔧 OWA webview preload script initialized');

let isTabActive = false;
let cpuStyleElement: HTMLStyleElement | null = null;

function applyCpuOptimization(active: boolean) {
  try {
    if (!active) {
      if (!cpuStyleElement && document.documentElement) {
        cpuStyleElement = document.createElement('style');
        cpuStyleElement.id = 'owa-cpu-optimization-style';
        cpuStyleElement.textContent = `
          *, *::before, *::after {
            animation: none !important;
            transition: none !important;
            animation-duration: 0s !important;
            transition-duration: 0s !important;
          }
        `;
        document.documentElement.appendChild(cpuStyleElement);
        console.log('💤 CPU optimization stylesheet injected (animations disabled)');
      }
    } else {
      if (cpuStyleElement) {
        cpuStyleElement.remove();
        cpuStyleElement = null;
        console.log('⚡ CPU optimization stylesheet removed (animations enabled)');
      }
    }
  } catch (err) {
    console.warn('Failed to apply CPU optimization style:', err);
  }
}

// Apply initially if document.documentElement is already available
if (typeof document !== 'undefined' && document.documentElement) {
  applyCpuOptimization(isTabActive);
}

// 1. Inject Main World Override Script via webFrame
// This runs in the guest page's main context, bypassing CSP and allowing us to override read-only visibilityState properties.
const mainWorldCode = `
  (function() {
    let isTabActive = false;

    // A. Dynamic Visibility API Override
    try {
      Object.defineProperty(document, 'hidden', {
        get: () => !isTabActive,
        configurable: true
      });
      Object.defineProperty(document, 'visibilityState', {
        get: () => isTabActive ? 'visible' : 'hidden',
        configurable: true
      });
      console.log('✅ Page Visibility API overridden in main world');
    } catch (e) {
      console.warn('❌ Failed to override Page Visibility API in main world:', e);
    }

    // B. WebSocket/EventSource close methods interception
    try {
      const _origWsClose = WebSocket.prototype.close;
      WebSocket.prototype.close = function(code, reason) {
        if (!isTabActive && (code === undefined || code === 1000)) {
          console.log('🔌 Blocked WebSocket.close() while tab is hidden — keeping push alive');
          return;
        }
        return _origWsClose.call(this, code, reason);
      };

      if (typeof EventSource !== 'undefined') {
        const _origEsClose = EventSource.prototype.close;
        EventSource.prototype.close = function() {
          if (!isTabActive) {
            console.log('🔌 Blocked EventSource.close() while tab is hidden — keeping push alive');
            return;
          }
          return _origEsClose.call(this);
        };
      }
      console.log('✅ WebSocket/EventSource close methods intercepted in main world');
    } catch (e) {
      console.warn('❌ Failed to intercept socket close in main world:', e);
    }

    // C. Listen to messages from isolated world to sync isTabActive
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'sync-active-state') {
        const active = event.data.active;
        if (isTabActive !== active) {
          isTabActive = active;
          console.log('👁️ Main world visibility updated:', active ? 'visible' : 'hidden');
          
          if (active) {
            flushRaf();
          }

          // Dispatch visibilitychange event
          const ev = new Event('visibilitychange', { bubbles: true });
          document.dispatchEvent(ev);
        }
      }
    });

    // D. requestAnimationFrame throttling to freeze custom background loops
    let activeRafCallbacks = new Map();
    let nextRafId = 1;
    const _origRaf = window.requestAnimationFrame;
    const _origCancelRaf = window.cancelAnimationFrame;

    window.requestAnimationFrame = function(callback) {
      if (!isTabActive) {
        const fakeId = nextRafId++;
        const timeoutId = setTimeout(() => {
          if (activeRafCallbacks.has(fakeId)) {
            activeRafCallbacks.delete(fakeId);
            try { callback(performance.now()); } catch (e) {}
          }
        }, 2000); // 0.5 FPS in background
        activeRafCallbacks.set(fakeId, { type: 'timeout', id: timeoutId, callback });
        return fakeId;
      }
      return _origRaf.call(window, callback);
    };

    window.cancelAnimationFrame = function(id) {
      if (activeRafCallbacks.has(id)) {
        const entry = activeRafCallbacks.get(id);
        if (entry.type === 'timeout') {
          clearTimeout(entry.id);
        }
        activeRafCallbacks.delete(id);
        return;
      }
      return _origCancelRaf.call(window, id);
    };

    function flushRaf() {
      const callbacks = Array.from(activeRafCallbacks.values());
      activeRafCallbacks.clear();
      callbacks.forEach(entry => {
        if (entry.type === 'timeout') {
          clearTimeout(entry.id);
        }
        try { _origRaf.call(window, entry.callback); } catch (e) {}
      });
    }
  })();
`;

try {
  webFrame.executeJavaScript(mainWorldCode);
  console.log('✅ Main world bridge injected via webFrame');
} catch (err) {
  console.warn('Failed to inject main world bridge:', err);
}

// IPC listener in isolated context that forwards active state changes to the main world
ipcRenderer.on('set-active', (_event, active: boolean) => {
  try {
    isTabActive = active;
    window.postMessage({ type: 'sync-active-state', active }, '*');
    applyCpuOptimization(active);
  } catch (err) {
    console.warn('Failed to send set-active message to main world:', err);
  }
});

// Receive accountId from host renderer and expose it for message posts
try {
  // Synchronously initialize OWA_ACCOUNT_ID from UserAgent or window.name (prevents race conditions and persists across navigations)
  const getAccountId = (): string | null => {
    if (typeof navigator !== 'undefined') {
      const match = navigator.userAgent.match(/OWA-Account-ID\/([a-zA-Z0-9-]+)/);
      if (match) return match[1];
    }
    if (typeof window !== 'undefined' && window.name) {
      return window.name;
    }
    return null;
  };
  
  const parsedId = getAccountId();
  if (parsedId) {
    (window as any).OWA_ACCOUNT_ID = parsedId;
    console.log('✅ Account ID synchronously initialized in preload:', parsedId);
  }

  ipcRenderer.on('set-account-id', (_event, accountId: string) => {
    try {
      (window as any).OWA_ACCOUNT_ID = accountId;
      console.log('✅ Account ID received in preload via IPC:', accountId);
    } catch {}
  });
} catch {}

// Auto-fill password function
function autoFillPassword(): void {
  try {
    // Look for password fields
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    if (passwordFields.length > 0) {
      console.log('🔑 Found password field, attempting auto-fill');
      
      // Get account info from parent window
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'webview-message',
          channel: 'get-account-info',
          data: { action: 'get-password' }
        }, '*');
      }
    }
  } catch (error) {
    console.warn('Failed to auto-fill password:', error);
  }
}

// Function to fill password when received
function fillPassword(password: string): void {
  try {
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    passwordFields.forEach(field => {
      if (field instanceof HTMLInputElement) {
        field.value = password;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('✅ Password auto-filled successfully');
      }
    });
  } catch (error) {
    console.warn('Failed to fill password:', error);
  }
}

// Listen for password from parent
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'password-fill') {
    fillPassword(event.data.password);
  }
});

// Simple unread count detection for OWA
function detectUnreadCount(): void {
  try {
    console.log('🔍 Checking for unread count...');
    let unreadCount = 0;
    let hasValidSource = false;
    let foundInbox = false;

    // 1. Try checking the tab/document title first (fastest, most generic & 0% CPU impact)
    const title = document.title || '';
    const titleMatch = title.match(/\((\d+)\)/);
    if (titleMatch) {
      const num = parseInt(titleMatch[1], 10);
      if (!isNaN(num) && num >= 0 && num < 10000) {
        console.log(`Found count from document title: ${num}`);
        unreadCount = num;
        hasValidSource = true;
      }
    }

    // 2. Fallback to targeted aria-label / tree-item search (only touches Inbox-related elements)
    if (!hasValidSource) {
      try {
        // Only query elements with Inbox-related aria-labels or tree roles — avoids scanning thousands of spans/divs
        const queryElements = document.querySelectorAll(
          '[aria-label*="Входящие" i], [aria-label*="Inbox" i], [aria-label*="unread" i], [aria-label*="непрочитан" i], [role="treeitem"], [data-testid*="inbox" i], [data-testid*="unread" i]'
        );
        
        for (let i = 0; i < queryElements.length; i++) {
          const el = queryElements[i] as HTMLElement;
          if (!el) continue;
          
          const text = (el.textContent || '').trim();
          const aria = el.getAttribute('aria-label') || '';
          
          const isInboxText = text === 'Входящие' || text === 'Inbox' || (el.getAttribute('role') === 'treeitem' && (text.startsWith('Входящие') || text.startsWith('Inbox')));
          const isInboxAria = aria.includes('Входящие') || aria.toLowerCase().includes('inbox') || 
                              aria.includes('непрочитанные') || aria.toLowerCase().includes('unread');
          
          if (isInboxText || isInboxAria) {
            if (el.offsetParent === null && el.clientHeight === 0 && el.clientWidth === 0) continue;
            
            foundInbox = true;
            
            // Check if the element itself has a number (e.g. "Входящие (2)")
            const m = (text + ' ' + aria).match(/\d+/);
            if (m) {
              const num = parseInt(m[0], 10);
              if (!isNaN(num) && num > 0) {
                unreadCount = Math.max(unreadCount, num);
              }
            }
            
            // Check sibling elements for count badge
            let sibling = el.nextElementSibling;
            while (sibling) {
              const sibText = (sibling.textContent || '').trim();
              const match = sibText.match(/^(\d+)(?:\s*[\/|of]\s*\d+)?$/i);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > 0) {
                  unreadCount = Math.max(unreadCount, num);
                  break;
                }
              }
              sibling = sibling.nextElementSibling;
            }
            
            // Check parent row children (siblings of the name element within the same folder row)
            const parent = el.parentElement;
            if (parent) {
              const children = Array.from(parent.children);
              for (const child of children) {
                if (child === el || child.contains(el)) continue;
                const childText = (child.textContent || '').trim();
                const match = childText.match(/^(\d+)(?:\s*[\/|of]\s*\d+)?$/i);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num) && num > 0) {
                    unreadCount = Math.max(unreadCount, num);
                  }
                }
              }
              
              // Also check the immediate parent row's combined text content (only contains this folder's name and badge)
              const parentText = (parent.textContent || '').trim();
              const parentAria = parent.getAttribute('aria-label') || '';
              const parentMatch = (parentText + ' ' + parentAria).match(/\d+/);
              if (parentMatch) {
                const num = parseInt(parentMatch[0], 10);
                if (!isNaN(num) && num > 0 && num < 10000) {
                  unreadCount = Math.max(unreadCount, num);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('DOM unread search failed:', e);
      }
    }

    // 3. Fallback to highly specific selectors
    let foundSelector = false;
    if (!hasValidSource && unreadCount === 0) {
      const unreadSelectors = [
        '[data-testid="unread-count"]',
        '.unread-count',
        '.bsU', // Gmail unread badge (Inbox-only)
        '[href="#inbox"] .mail-NestedList-Item-Info-Badge', // Yandex Mail Inbox folder badge
        '[data-key="box=inbox"] .mail-NestedList-Item-Info-Badge', // Yandex alternative
        '[data-title="Входящие"] .mail-NestedList-Item-Info-Badge' // Yandex title alternative
      ];
      
      for (const selector of unreadSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            foundSelector = true;
          }
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            if ((el as any).offsetParent === null && el.clientHeight === 0 && el.clientWidth === 0) continue;
            
            const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
            const num = parseInt(text.replace(/\D/g, ''), 10);
            if (!isNaN(num) && num > 0) {
              unreadCount = Math.max(unreadCount, num);
            }
          }
        } catch {}
      }
    }

    // Only send the unread count update if we actually got it from a valid source (title, found folder, or matched selector badge).
    // This prevents resetting counts to 0 when navigating, loading, or when the sidebar is collapsed.
    const shouldUpdate = hasValidSource || foundInbox || foundSelector;
    if (!shouldUpdate) {
      console.log('⚠️ Skipping unread count update: Inbox element not found and title did not have a count');
      return;
    }

    console.log(`📤 Final unread count detected: ${unreadCount}`);
    
    const accountId = (window as any).OWA_ACCOUNT_ID || (typeof window !== 'undefined' && window.name);
    try {
      if (accountId) {
        ipcRenderer.send('webview:unread-count', accountId, unreadCount);
      }
    } catch {}
    try { ipcRenderer.sendToHost('unread-count', { accountId, count: unreadCount }); } catch {}
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window && accountId) {
        window.parent.postMessage({
          type: 'webview-message',
          channel: 'unread-count',
          data: unreadCount,
          accountId
        }, '*');
      }
    } catch {}
  } catch (error) {
    console.warn('Failed to detect unread count:', error);
  }
}

let hasRequestedCredentials = false;
let savedCredentials: { username?: string, password?: string } | null = null;
let hasSubmittedUsername = false;
let hasSubmittedPassword = false;
let fillIntervalId: any = null;

// Helper to submit via selector lists or text matching
function attemptSubmit(type: 'username' | 'password'): boolean {
  const submitButtons = [
    '#passp\\:sign-in', 
    '#identifierNext', 
    '#passwordNext',
    '#signinbutton',
    '.signinbutton',
    '.signinButton',
    '#submitButton',
    '.submitButton',
    'button[data-test-id="next-button"]',
    'button[data-test-id="submit-button"]',
    'button[type="submit"]',
    'input[type="submit"]',
    '.passp-sign-in-button',
    '.login-btn',
    '#login-btn'
  ];
  
  // Try specific selectors first
  for (const selector of submitButtons) {
    const btn = document.querySelector(selector) as HTMLElement;
    if (btn && btn.offsetParent !== null) {
      btn.click();
      console.log(`✅ Auto-submitted ${type} step via selector: ${selector}`);
      return true;
    }
  }
  
  // Fallback: search for buttons or spans by common text labels
  const allBtns = document.querySelectorAll('button, [role="button"], input[type="button"], span');
  for (let i = 0; i < allBtns.length; i++) {
    const btn = allBtns[i] as HTMLElement;
    const text = (btn.textContent || '').trim().toLowerCase();
    const val = (btn as any).value ? String((btn as any).value).toLowerCase() : '';
    if (text === 'войти' || text === 'далее' || text === 'sign in' || text === 'log in' || text === 'next' || text === 'submit' ||
        val === 'войти' || val === 'далее' || val === 'sign in' || val === 'log in' || val === 'next') {
      if (btn.offsetParent !== null) {
        btn.click();
        console.log(`✅ Auto-submitted ${type} step via text match: ${text || val}`);
        return true;
      }
    }
  }
  return false;
}

// Enhanced password auto-fill for CAS, Yandex, Google, Mail.ru and Outlook login pages
function enhancedPasswordFill(): void {
  try {
    const isLoginPage = 
      (window.location.href.includes('cas.smartds.ru') ||
       window.location.href.includes('/cas/') ||
       window.location.href.includes('login') ||
       window.location.href.includes('auth') ||
       window.location.href.includes('signin') ||
       window.location.href.includes('passport') ||
       window.location.href.includes('accounts.google')) &&
      !window.location.href.includes('/mail/') &&
      !window.location.href.includes('mail.yandex.ru/lite') &&
      !window.location.href.includes('/u/0/') &&
      !window.location.href.includes('mail.google.com/mail');

    if (isLoginPage) {
      // 1. Request credentials once from host
      if (!hasRequestedCredentials) {
        hasRequestedCredentials = true;
        try {
          ipcRenderer.sendToHost('get-account-info');
        } catch {}
      }

      // 2. Periodic check for input fields or account choosers (since SPAs render dynamically)
      if (fillIntervalId) clearInterval(fillIntervalId);
      fillIntervalId = setInterval(() => {
        // Check for login errors to prevent infinite submission loops
        const currentBodyText = document.body ? document.body.textContent || '' : '';
        const hasLoginError = 
          currentBodyText.includes('Введено неправильное имя') ||
          currentBodyText.includes('неправильный пароль') ||
          currentBodyText.includes('неверный пароль') ||
          currentBodyText.includes('неверные данные') ||
          currentBodyText.includes('Incorrect username or password') ||
          currentBodyText.includes('The username or password you entered is incorrect') ||
          document.querySelector('#lnkLgErr') !== null ||
          document.querySelector('#signInError') !== null ||
          document.querySelector('.signInError') !== null ||
          document.querySelector('.error-message') !== null ||
          document.querySelector('[role="alert"]') !== null;

        if (!savedCredentials) return; // Wait until credentials are received

        const { password, username } = savedCredentials;
        const usernameLocal = username ? username.split('@')[0].toLowerCase() : '';

        let didChangeVal = false;

        // 0. Click account chooser item if visible
        const pageText = document.body.textContent || '';
        const isChooserPage = pageText.includes('Выберите аккаунт') || pageText.includes('Войти в другой аккаунт') || document.querySelector('.passp-account-list, [data-t="accounts-list"]');
        if (isChooserPage && usernameLocal) {
          const elements = Array.from(document.querySelectorAll('span, div, a, button, p'));
          for (const el of elements) {
            const text = (el.textContent || '').trim().toLowerCase();
            if (text === usernameLocal || text === `${usernameLocal}@yandex.ru` || text === `${usernameLocal}@yandex.com` || text === `${usernameLocal}@gmail.com`) {
              // Found the exact text element! Now find its closest clickable card/button or click it directly
              const clickable = el.closest('a, button, [role="button"], .passp-account-item, [class*="account-item"], [data-t="account-item"]') || el;
              if (clickable && clickable.offsetParent !== null) {
                if ((clickable as any).__hasBeenClicked) continue;
                (clickable as any).__hasBeenClicked = true;

                (clickable as HTMLElement).click();
                console.log('✅ Clicked account chooser via exact text match:', usernameLocal);
                if (fillIntervalId) {
                  clearInterval(fillIntervalId);
                  fillIntervalId = null;
                }
                return;
              }
            }
          }
        }

        // 1. Fill username
        if (username) {
          const usernameFields = document.querySelectorAll('input[type="email"], input[name*="user"], input[name*="login"], input[placeholder*="login"], input[id*="login"], #passp-field-login, #identifierId');
          usernameFields.forEach(field => {
            if (field instanceof HTMLInputElement && field.offsetParent !== null) { // visible
              const currentVal = field.value || '';
              // If the field is empty or contains an incorrect/old username, overwrite it
              if (!currentVal || (currentVal.toLowerCase() !== username.toLowerCase() && currentVal.toLowerCase() !== usernameLocal)) {
                // Ignore OTP/verification code fields
                const name = (field.name || '').toLowerCase();
                const id = (field.id || '').toLowerCase();
                const placeholder = (field.getAttribute('placeholder') || '').toLowerCase();
                const autocomplete = (field.getAttribute('autocomplete') || '').toLowerCase();
                
                const isOTP = 
                  name.includes('code') || name.includes('pin') || name.includes('otp') || name.includes('sms') || name.includes('token') || name.includes('confirm') ||
                  id.includes('code') || id.includes('pin') || id.includes('otp') || id.includes('sms') || id.includes('token') || id.includes('confirm') ||
                  placeholder.includes('код') || placeholder.includes('code') || placeholder.includes('pin') || placeholder.includes('confirm') ||
                  autocomplete.includes('one-time-code') ||
                  field.maxLength === 4 || field.maxLength === 6 || field.maxLength === 5 ||
                  field.className.toLowerCase().includes('code') || field.className.toLowerCase().includes('pin');
                  
                if (isOTP) return;

                field.value = username;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✅ Username auto-filled:', username);
                didChangeVal = true;
              }
            }
          });
        }

        // 2. Fill password
        if (password) {
          const passwordFields = document.querySelectorAll('input[type="password"]');
          passwordFields.forEach(field => {
            if (field instanceof HTMLInputElement && field.offsetParent !== null) { // visible
              if (!field.value || field.value !== password) {
                field.value = password;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✅ Password auto-filled');
                didChangeVal = true;
              }
            }
          });
        }

        // Stop auto-submit if error exists and we didn't just change the values
        if (hasLoginError && !didChangeVal) {
          console.log('⚠️ Login error with current credentials. Stopping auto-submit loop.');
          if (fillIntervalId) {
            clearInterval(fillIntervalId);
            fillIntervalId = null;
          }
          return;
        }

        // 3. Auto-submit username
        if (username) {
          const usernameFields = document.querySelectorAll('input[type="email"], input[name*="user"], input[name*="login"], input[placeholder*="login"], input[id*="login"], #passp-field-login, #identifierId');
          usernameFields.forEach(field => {
            if (field instanceof HTMLInputElement && field.offsetParent !== null) {
              if (field.value && field.value.toLowerCase().includes(usernameLocal)) {
                if (hasSubmittedUsername) return;
                hasSubmittedUsername = true;

                setTimeout(() => {
                  attemptSubmit('username');
                }, 800);
              }
            }
          });
        }

        // 4. Auto-submit password
        if (password) {
          const passwordFields = document.querySelectorAll('input[type="password"]');
          passwordFields.forEach(field => {
            if (field instanceof HTMLInputElement && field.offsetParent !== null) {
              if (field.value) {
                if (hasSubmittedPassword) return;
                hasSubmittedPassword = true;

                setTimeout(() => {
                  attemptSubmit('password');
                }, 800);
              }
            }
          });
        }
      }, 1000);

      // Stop interval after 45 seconds to save CPU
      setTimeout(() => {
        if (fillIntervalId) {
          clearInterval(fillIntervalId);
          fillIntervalId = null;
        }
      }, 45000);
    }
  } catch (error) {
    console.warn('Enhanced password fill failed:', error);
  }
}

ipcRenderer.on('password-fill-enhanced', (_event, data) => {
  savedCredentials = data || {};
  console.log('🔑 Credentials received/updated from host:', savedCredentials.username);
  
  // If we receive new credentials, reset the submission flags to attempt logging in again
  hasSubmittedUsername = false;
  hasSubmittedPassword = false;
  
  // Clear any existing interval before starting a new one
  if (fillIntervalId) {
    clearInterval(fillIntervalId);
    fillIntervalId = null;
  }
  
  // Restart autofill with new credentials
  enhancedPasswordFill();
});

// Suppress SSL error console messages (they still happen but don't spam the console)
const originalConsoleError = console.error;
console.error = function(...args) {
  // Filter out SSL handshake errors
  const message = args.join(' ');
  if (message.includes('ssl_client_socket_impl.cc') ||
      message.includes('handshake failed') ||
      message.includes('net_error -101')) {
    return; // Suppress SSL errors
  }
  // Pass through all other errors
  originalConsoleError.apply(console, args);
};

// Listen for webview messages from the renderer
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'webview-message') {
    // Forward the message to the parent window
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(event.data, '*');
    }
  }
});

// Inject ad blocking styles to clean up Yandex Mail interface and reduce memory/render CPU
function injectAdBlockerStyles(): void {
  try {
    const style = document.createElement('style');
    style.id = 'owa-ad-blocker-styles';
    style.textContent = `
      /* Hide Yandex Mail ads */
      .mail-Layout-Aside,
      .ns-view-right-column,
      .mail-Ads,
      .js-mail-ads,
      [class*="mail-Ads"],
      [class*="direct-layout"],
      div[class*="direct-"],
      div[class*="Direct-"],
      .mail-Layout-Main-header .direct-parent,
      .mail-Layout-Main-header [class*="direct-"],
      .mail-Layout-Main-header [class*="Direct-"],
      .mail-Layout-Aside-content {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }
      
      /* Adjust layout to occupy full width after removing ad columns */
      .mail-Layout-Content {
        margin-right: 0 !important;
      }
      .mail-Layout-Inner {
        margin-right: 0 !important;
      }
    `;
    document.documentElement.appendChild(style);
    console.log('✅ Ad blocking CSS injected');
  } catch (e) {
    console.warn('Failed to inject ad blocker CSS:', e);
  }
}

// Set up minimal monitoring
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ OWA DOM loaded');

  // Apply CPU optimization initially if active is false
  applyCpuOptimization(isTabActive);

  // Inject ad blocker CSS
  injectAdBlockerStyles();

  // Auto-fill password if available
  autoFillPassword();

  // Enhanced password fill for CAS pages
  enhancedPasswordFill();

  // --- Instant title-based unread detection via MutationObserver ---
  // OWA/Gmail/Yandex update the page title to "(N) Outlook" when new mail arrives.
  // Observing <title> is essentially free (fires only on actual changes).
  try {
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const titleObserver = new MutationObserver(() => {
        const title = document.title || '';
        const m = title.match(/\((\d+)\)/);
        if (m) {
          const count = parseInt(m[1], 10);
          if (!isNaN(count) && count >= 0) {
            const accountId = (window as any).OWA_ACCOUNT_ID || (typeof window !== 'undefined' && window.name);
            try { if (accountId) ipcRenderer.send('webview:unread-count', accountId, count); } catch {}
            try { ipcRenderer.sendToHost('unread-count', { accountId, count }); } catch {}
            try {
              if (typeof window !== 'undefined' && window.parent && window.parent !== window && accountId) {
                window.parent.postMessage({ type: 'webview-message', channel: 'unread-count', data: count, accountId }, '*');
              }
            } catch {}
            console.log(`⚡ Title observer detected unread count: ${count}`);
          }
        }
      });
      titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
      console.log('✅ Title MutationObserver installed for instant unread detection');
    }
  } catch (e) {
    console.warn('Failed to install title observer:', e);
  }

  // Fallback DOM-based check every 30s (in case title doesn't reflect unread count)
  setInterval(detectUnreadCount, 30000);

  // Initial check after 5 seconds
  setTimeout(detectUnreadCount, 5000);
});

// Forward keyboard shortcuts Cmd+Q and Cmd+W from webview to main process
const handleKeyEvent = (event: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
  
  if (isCmdOrCtrl && event.key.toLowerCase() === 'q') {
    event.preventDefault();
    ipcRenderer.send('app:quit-request');
  }
  
  if (isCmdOrCtrl && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    ipcRenderer.send('app:close-request');
  }
};

// Register on main window
window.addEventListener('keydown', handleKeyEvent);

// Recursively register on OWA iframes (e.g. email content document)
const registerOnIframe = (iframe: HTMLIFrameElement) => {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      // Remove first to prevent duplicate listeners
      doc.removeEventListener('keydown', handleKeyEvent);
      doc.addEventListener('keydown', handleKeyEvent);
    }
  } catch (e) {
    // Suppress cross-origin frame access errors if any (unlikely inside same-domain OWA)
  }
};

// Register on newly spawned iframes dynamically when they load (saves CPU compared to polling)
window.addEventListener('load', (event) => {
  if (event.target && (event.target as HTMLElement).tagName === 'IFRAME') {
    registerOnIframe(event.target as HTMLIFrameElement);
  }
}, true);

console.log('✅ Minimal preload script ready');
}
