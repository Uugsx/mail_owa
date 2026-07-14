import React, { useRef, useEffect, useState } from 'react';
import { AccountMeta } from '../../main/types';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from './ThemeProvider';

// Cache Dark Reader source code (loaded once from main process)
let darkReaderSourceCache: string | null = null;
let darkReaderLoading: Promise<string | null> | null = null;

async function getDarkReaderSource(): Promise<string | null> {
  if (darkReaderSourceCache) return darkReaderSourceCache;
  if (darkReaderLoading) return darkReaderLoading;
  darkReaderLoading = (async () => {
    try {
      const source = await window.electronAPI?.app?.getDarkReaderSource?.();
      if (source) {
        darkReaderSourceCache = source;
        console.log(`📦 Dark Reader source cached (${(source.length / 1024).toFixed(0)} KB)`);
      }
      return source || null;
    } catch (err) {
      console.warn('Failed to get Dark Reader source:', err);
      return null;
    }
  })();
  return darkReaderLoading;
}

// Dark Mode: inject Dark Reader into webview via executeJavaScript (bypasses CSP)
const applyDarkThemeToWebview = async (webview: Electron.WebviewTag, dark: boolean) => {
  try {
    if (dark) {
      const source = await getDarkReaderSource();
      if (!source) {
        console.warn('Dark Reader source not available');
        return;
      }
      // Step 1: Inject the library (346KB) - executeJavaScript runs in page context, bypassing CSP
      await webview.executeJavaScript(source).catch(() => {});
      // Step 2: Enable Dark Reader
      await webview.executeJavaScript(`
        if (typeof DarkReader !== 'undefined') {
          DarkReader.enable({ brightness: 100, contrast: 90, sepia: 10 });
          console.log('🌙 Dark Reader enabled via executeJavaScript');
        } else {
          console.warn('DarkReader not found after injection');
        }
      `).catch(() => {});
    } else {
      await webview.executeJavaScript(`
        if (typeof DarkReader !== 'undefined') {
          DarkReader.disable();
          console.log('☀️ Dark Reader disabled');
        }
      `).catch(() => {});
    }
  } catch (e) {
    console.warn('Failed to apply dark theme to webview:', e);
  }
};

interface WebviewPaneProps {
  account: AccountMeta;
  isActive: boolean;
}

const WebviewPane: React.FC<WebviewPaneProps> = ({ account, isActive }) => {
  const { isDark } = useTheme();
  const [webviewEl, setWebviewEl] = useState<Electron.WebviewTag | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Generate partition name - use shared partition for same domain
  const getPartitionName = (account: AccountMeta): string => {
    try {
      const url = new URL(account.loginUrl);
      const domain = url.hostname;
      
      // For smartds.ru domain, use shared partition to allow session sharing
      if (domain.includes('smartds.ru')) {
        return 'persist:smartds-shared';
      }
      
      // For company.com domain, use shared partition to allow session sharing
      if (domain.includes('company.com')) {
        return 'persist:company-shared';
      }
      
      // For other domains, use isolated partitions
      return `persist:owa-${account.id}`;
    } catch {
      // Fallback to isolated partition if URL parsing fails
      return `persist:owa-${account.id}`;
    }
  };

  const partitionName = getPartitionName(account);
  const [preloadPath, setPreloadPath] = useState<string | undefined>(undefined);
  const lastAccountIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    // Resolve absolute preload path once
    let mounted = true;
    (async () => {
      try {
        const path = await window.electronAPI?.app?.getWebviewPreloadPath?.();
        if (mounted) setPreloadPath(path);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const webview = webviewEl;
    if (!webview) return;

    // Reset state only when the account ID actually changes
    if (lastAccountIdRef.current !== account.id) {
      lastAccountIdRef.current = account.id;
      setIsLoading(true);
      setHasError(false);
      setErrorMessage('');
    }

    // Event handlers
    const handleDOMReady = () => {
      console.log(`Webview DOM ready for account: ${account.displayName} with partition: ${partitionName}`);
      setIsLoading(false);
      try {
        // Inform preload about the account id explicitly via IPC in the guest
        webview.send?.('set-account-id', account.id);
      } catch {}

      // Inject dark theme if active
      applyDarkThemeToWebview(webview, isDark);
            // Execute initialization script to set OWA-specific flags and pass accountId
      webview.executeJavaScript(`
        try {
          // Set OWA persistent login flags
          if (window.localStorage) {
            window.localStorage.setItem('PrivateComputer', 'true');
            window.localStorage.setItem('IsOptimizedMarker', 'true');
            console.log('✅ OWA localStorage flags set');
          }
          
          // Make accountId available to the page as fallback
          window.OWA_ACCOUNT_ID = '${account.id}';
          console.log('✅ Account ID available to page: ${account.id}');
        } catch (e) {
          console.warn('OWA initialization script failed:', e);
        }
      `).catch((error) => {
        console.warn('Failed to execute OWA initialization script:', error);
      });
    };

    const handleDidStartLoading = () => {
      setIsLoading(true);
      setHasError(false);
    };

    const handleDidStopLoading = () => {
      setIsLoading(false);
    };

    const handleDidFailLoad = (event: any) => {
      console.error('Webview failed to load:', event);
      
      // Ignore certain errors that are not critical
      if (event.errorCode === -3 || // ERR_ABORTED
          event.errorCode === -102 || // ERR_CONNECTION_REFUSED (often recoverable)
          event.errorCode === -105) { // ERR_NAME_NOT_RESOLVED (temporary DNS issues)
        console.log('Ignoring non-critical error:', event.errorCode);
        return;
      }
      
      setIsLoading(false);
      setHasError(true);
      setErrorMessage(event.errorDescription || `Network error (${event.errorCode}). Please check your connection and try again.`);
    };

    const handleDidNavigate = (event: any) => {
      console.log(`Webview navigated to: ${event.url} for account: ${account.displayName}`);

      // Check if this is a CAS login page and try to auto-fill password
      if (event.url.includes('cas.smartds.ru') || event.url.includes('/cas/') || event.url.includes('login')) {
        console.log('🔐 Detected CAS/login page, attempting password auto-fill');

        // Wait a bit for the page to load, then try to fill password
        setTimeout(() => {
          if (account.password) {
            webview.executeJavaScript(`
              try {
                // Try to find password fields and fill them
                const passwordFields = document.querySelectorAll('input[type="password"]');
                const usernameFields = document.querySelectorAll('input[type="text"], input[name*="user"], input[name*="login"]');

                console.log('🔑 Found password fields:', passwordFields.length);
                console.log('👤 Found username fields:', usernameFields.length);

                // Fill password fields
                passwordFields.forEach(field => {
                  if (field instanceof HTMLInputElement) {
                    field.value = '${account.password}';
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('✅ Password auto-filled for CAS page');
                  }
                });

                // Try to fill username if available
                if (account.username) {
                  usernameFields.forEach(field => {
                    if (field instanceof HTMLInputElement && !field.value) {
                      field.value = '${account.username}';
                      field.dispatchEvent(new Event('input', { bubbles: true }));
                      field.dispatchEvent(new Event('change', { bubbles: true }));
                      console.log('✅ Username auto-filled for CAS page');
                    }
                  });
                }
              } catch (error) {
                console.warn('CAS auto-fill failed:', error);
              }
            `).catch((error) => {
              console.warn('Failed to execute CAS auto-fill script:', error);
            });
          }
        }, 2000); // Wait 2 seconds for page to fully load
      }
    };

    // Fallback: derive unread from window title like "(3) Outlook"
    const handlePageTitleUpdated = (event: any) => {
      try {
        const title: string = event.title || '';
        const match = title.match(/\((\d+)\)/);
        const count = match ? parseInt(match[1], 10) : 0;
        if (!isNaN(count)) {
          if (window.parent) {
            window.parent.postMessage({
              type: 'webview-message',
              channel: 'unread-count',
              data: count,
              accountId: account.id
            }, '*');
          }
        }
      } catch (e) {
        console.warn('Title-based unread parse failed:', e);
      }
    };

    const handleNewWindow = (event: any) => {
      try {
        // Prevent opening new windows and open links in the same webview
        event.preventDefault();

        // If it's a CAS link, open it in the current webview
        if (event.url && (event.url.includes('cas.smartds.ru') || event.url.includes('/cas/'))) {
          console.log('🔗 CAS link detected, opening in current webview:', event.url);
          webview.src = event.url;
        } else {
          // For other links, open in external browser
          window.electronAPI?.app?.openExternal?.(event.url);
        }
      } catch (error) {
        console.error('Error handling new window event:', error);
      }
    };

    // Handle refresh event
    const handleRefresh = (event: CustomEvent) => {
      try {
        if (event.detail === account.id && webview) {
          webview.reload();
        }
      } catch (error) {
        console.error('Failed to refresh webview:', error);
      }
    };

    // Attach event listeners
    try {
      // Bridge unread via ipc-message from preload (sendToHost)
      const ipcHandler = (e: any) => {
        try {
          if (e.channel === 'unread-count' && e.args && e.args[0]) {
            const payload = e.args[0] || {};
            const accountId = payload.accountId || account.id;
            const count = payload.count;
            if (window.parent && accountId) {
              window.parent.postMessage({
                type: 'webview-message',
                channel: 'unread-count',
                data: typeof count === 'number' ? count : parseInt(String(count) || '0', 10) || 0,
                accountId
              }, '*');
            }
          } else if (e.channel === 'get-account-info') {
            try {
              webview.send('password-fill-enhanced', {
                username: account.username,
                password: account.password
              });
            } catch {}
          }
        } catch (err) {
          console.warn('ipc-message bridge failed:', err);
        }
      };
      (webview as any).addEventListener('ipc-message', ipcHandler);

      const consoleHandler = (e: any) => {
        console.log(`[Webview ${account.displayName}] Console:`, e.message);
      };
      webview.addEventListener('console-message', consoleHandler);

      webview.addEventListener('dom-ready', handleDOMReady);
      webview.addEventListener('did-start-loading', handleDidStartLoading);
      webview.addEventListener('did-stop-loading', handleDidStopLoading);
      webview.addEventListener('did-fail-load', handleDidFailLoad);
      webview.addEventListener('did-navigate', handleDidNavigate);
      webview.addEventListener('page-title-updated', handlePageTitleUpdated as any);
      webview.addEventListener('new-window', handleNewWindow);
      
      // Add refresh event listener
      window.addEventListener('refresh-webview', handleRefresh as EventListener);
    } catch (error) {
      console.error('Failed to attach event listeners:', error);
    }

    return () => {
      try {
        // Clear polling timer if exists
        if ((webview as any).__pollTimer) {
          clearInterval((webview as any).__pollTimer);
        }

        // Cleanup event listeners
        if (webview) {
          try { webview.removeEventListener('console-message', consoleHandler); } catch {}
          webview.removeEventListener('dom-ready', handleDOMReady);
          webview.removeEventListener('did-start-loading', handleDidStartLoading);
          webview.removeEventListener('did-stop-loading', handleDidStopLoading);
          webview.removeEventListener('did-fail-load', handleDidFailLoad);
          webview.removeEventListener('did-navigate', handleDidNavigate);
          webview.removeEventListener('page-title-updated', handlePageTitleUpdated as any);
          webview.removeEventListener('new-window', handleNewWindow);
        }
        
        // Remove refresh event listener
        window.removeEventListener('refresh-webview', handleRefresh as EventListener);
      } catch (error) {
        console.error('Failed to remove event listeners:', error);
      }
    };
  }, [webviewEl, account.id, account.loginUrl, account.password, account.username, account.displayName, partitionName, preloadPath]);

  // Sync dark theme with the webview when theme state changes
  useEffect(() => {
    if (webviewEl) {
      applyDarkThemeToWebview(webviewEl, isDark);
    }
  }, [webviewEl, isDark]);

  const handleRetry = () => {
    try {
      if (webviewEl) {
        setHasError(false);
        setErrorMessage('');
        webviewEl.reload();
      }
    } catch (error) {
      console.error('Failed to retry webview load:', error);
    }
  };

  const handleOpenInExternalBrowser = async () => {
    // Open the OWA URL in the default browser
    if (account.loginUrl) {
      try {
        await window.electronAPI?.app?.openExternal?.(account.loginUrl);
        await window.electronAPI?.app?.showNotification?.({
          body: `Opened ${account.displayName} in external browser`,
          accountId: account.id
        });
      } catch (error) {
        console.error('Failed to open external browser:', error);
      }
    }
  };

  // Simple unread count detection for OWA
  function detectUnreadCount(): void {
    try {
      // Look for common OWA unread count indicators
      const unreadSelectors = [
        '[data-testid="unread-count"]',
        '.unread-count',
        '[aria-label*="unread"]',
        '.badge:not(.read)',
        '.count:not(.read)',
        '.ms-Icon--MessageFill:not(.is-read)',
        '[class*="unread"]',
        '[data-icon-name="MessageFill"]'
      ];
      
      let unreadCount = 0;
      
      for (const selector of unreadSelectors) {
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i] as HTMLElement;
          const text = element.textContent?.trim() || element.getAttribute('aria-label')?.trim() || '';
          
          // Extract numbers from the text
          const countMatch = text.match(/(\d+)/);
          if (countMatch) {
            const count = parseInt(countMatch[1], 10);
            if (!isNaN(count) && count > 0) {
              unreadCount = Math.max(unreadCount, count);
            }
          }
          
          // Special case for elements that just contain a number
          if (!countMatch && text && !isNaN(parseInt(text, 10))) {
            const count = parseInt(text, 10);
            if (count > 0) {
              unreadCount = Math.max(unreadCount, count);
            }
          }
        }
      }
      
      // Send unread count to main process with accountId
      if (typeof window !== 'undefined' && window.parent) {
        window.parent.postMessage({
          type: 'webview-message',
          channel: 'unread-count',
          data: unreadCount,
          accountId: account.id
        }, '*');
      }
    } catch (error) {
      console.warn('Failed to detect unread count:', error);
    }
  }

  if (hasError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Failed to Load
          </h2>
          <p className="text-gray-600 mb-4">
            {errorMessage}
          </p>
          <div className="space-y-2">
            <button
              onClick={handleRetry}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={handleOpenInExternalBrowser}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Open in Browser
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!preloadPath) {
    return (
      <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Initializing {account.displayName}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Loading {account.displayName}...</p>
          </div>
        </div>
      )}

      {/* Webview with proper partition and settings */}
      <webview
        ref={setWebviewEl}
        src={account.loginUrl}
        partition={partitionName}
        allowpopups={true}
        preload={preloadPath}
        autosize={false}
        nodeintegration={false}
        webpreferences="contextIsolation=true,sandbox=false,allowRunningInsecureContent=true,persistSession=true,enableRemoteModule=false,nativeWindowOpen=true,ignoreSSL=true,ignoreCertificateErrors=true,backgroundThrottling=false"
        useragent={account.loginUrl.includes('google') || account.loginUrl.includes('gmail')
          ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
          : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
        className="w-full h-full flex-1"
        data-account-id={account.id} // Add data attribute for easier selection
        name={account.id} // Pass account ID through name attribute to ensure reliable retrieval in preload
      />
    </div>
  );
};

export default WebviewPane;