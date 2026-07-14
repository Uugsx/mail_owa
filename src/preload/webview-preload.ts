/**
 * Minimal preload script for OWA webview
 */
import { ipcRenderer } from 'electron';

console.log('🔧 OWA webview preload script initialized');

// Bypass Page Visibility API throttling for background webviews (keeps Gmail socket alive in real-time)
try {
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: true
  });
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: true
  });
  console.log('✅ Page Visibility API bypassed to keep background sockets active');
} catch (e) {
  console.warn('Failed to bypass Page Visibility API:', e);
}

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
      if (typeof window !== 'undefined' && window.parent) {
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

    // 2. Fallback to scanning narrow elements if title did not yield count
    if (!hasValidSource) {
      // Query links, buttons, options and treeitems (excluding heavy generic divs/spans)
      const elements = Array.from(document.querySelectorAll('a, [role="treeitem"], [role="option"], button'));
      
      // Limit search to prevent hangs on huge pages
      const safeElements = elements.slice(0, 1000);
      
      for (const el of safeElements) {
        const text = (el.textContent || '').trim();
        const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
        
        // Normalize by removing digits, punctuation, and parentheses
        const cleanText = text.replace(/[\d,().\-_]/g, '').trim().toLowerCase();
        const cleanAria = aria.replace(/[\d,().\-_]/g, '').trim().toLowerCase();
        
        const isInboxText = cleanText === 'входящие' || cleanText === 'inbox';
        const isInboxAria = cleanAria === 'входящие' || cleanAria === 'inbox' || 
                            cleanAria.includes('входящие непрочитанные') || cleanAria.includes('inbox unread');
        
        if (isInboxText || isInboxAria) {
          foundInbox = true;
          // Look for any number inside the text or aria label
          const m = (text + ' ' + aria).match(/\d+/);
          if (m) {
            const num = parseInt(m[0], 10);
            if (!isNaN(num) && num > 0 && num < 10000) {
              unreadCount = Math.max(unreadCount, num);
            }
          }
          
          // Check sibling elements for a pure number badge
          let sibling = el.nextElementSibling;
          while (sibling) {
            const sibText = (sibling.textContent || '').trim();
            if (sibText && /^\d+$/.test(sibText)) {
              const num = parseInt(sibText, 10);
              if (!isNaN(num) && num > 0) {
                unreadCount = Math.max(unreadCount, num);
                break;
              }
            }
            sibling = sibling.nextElementSibling;
          }
        }
      }
    }

    // 3. Fallback to highly specific selectors
    let foundSelector = false;
    if (!hasValidSource && unreadCount === 0) {
      const unreadSelectors = [
        '[data-testid="unread-count"]',
        '.unread-count',
        '.mail-NestedList-Item-Info-Badge', // Yandex Mail folder badge
        '.bsU', // Gmail unread badge
        '.badge:not(.read)',
        '.count:not(.read)'
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
      if (typeof window !== 'undefined' && window.parent && accountId) {
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
      const fillInterval = setInterval(() => {
        if (!savedCredentials) return; // Wait until credentials are received

        const { password, username } = savedCredentials;
        const usernameLocal = username ? username.split('@')[0].toLowerCase() : '';

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
                clearInterval(fillInterval); // Stop interval on successful chooser click
                return;
              }
            }
          }
        }

        // 1. Fill username and submit
        if (username) {
          const usernameFields = document.querySelectorAll('input[type="email"], input[name*="user"], input[name*="login"], input[placeholder*="login"], input[id*="login"], #passp-field-login, #identifierId');
          usernameFields.forEach(field => {
            if (field instanceof HTMLInputElement && field.offsetParent !== null) { // visible
              // If the field is empty, fill it first
              if (!field.value) {
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
                console.log('✅ Username auto-filled');
              }

              // If the field has a value (either pre-filled or filled by us), auto-submit
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

        // 2. Fill password and submit
        if (password) {
          const passwordFields = document.querySelectorAll('input[type="password"]');
          passwordFields.forEach(field => {
            if (field instanceof HTMLInputElement && field.offsetParent !== null) { // visible
              if (!field.value) {
                field.value = password;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✅ Password auto-filled');
              }

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
      setTimeout(() => clearInterval(fillInterval), 45000);
    }
  } catch (error) {
    console.warn('Enhanced password fill failed:', error);
  }
}

// Listen for password and username from parent
ipcRenderer.on('password-fill-enhanced', (_event, data) => {
  savedCredentials = data || {};
  console.log('🔑 Credentials received from host');
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
    if (typeof window !== 'undefined' && window.parent) {
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

  // Inject ad blocker CSS
  injectAdBlockerStyles();

  // Auto-fill password if available
  autoFillPassword();

  // Enhanced password fill for CAS pages
  enhancedPasswordFill();

  // Check for unread count every 15 seconds
  setInterval(detectUnreadCount, 15000);

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