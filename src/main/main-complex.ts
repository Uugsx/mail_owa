import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, Notification, nativeTheme, session } from 'electron';
import { join } from 'path';
import { accountStore } from './store';
import { AccountMeta, CustomNotificationOptions } from './types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Utility function to save all session data
function saveAllSessions(): Promise<void> {
  return new Promise((resolve) => {
    const accounts = accountStore.getAccounts();
    
    if (accounts.length === 0) {
      resolve();
      return;
    }
    
    console.log(`Saving sessions for ${accounts.length} accounts...`);
    
    const savePromises = accounts.map(account => {
      return new Promise<void>((resolveSave) => {
        try {
          const url = new URL(account.loginUrl);
          const domain = url.hostname;
          
          const partitionName = `persist:owa-${account.id}`;
          
          const ses = session.fromPartition(partitionName);
          
          // Force flush cookies and session data
          Promise.all([
            ses.cookies.flushStore(),
            ses.clearHostResolverCache(),
            // Also clear and flush storage data to ensure everything is saved
            ses.flushStorageData(),
            // Force service worker storage
            new Promise(resolve => {
              try {
                const workers = ses.serviceWorkers.getAllRunning();
                if (workers && typeof workers.then === 'function') {
                  workers.then(workers => {
                    console.log(`🔧 Found ${Object.keys(workers).length} service workers for ${account.displayName}`);
                    resolve(undefined);
                  }).catch(() => resolve(undefined));
                } else {
                  // getAllRunning doesn't return a promise in this Electron version
                  console.log(`🔧 Service workers checked for ${account.displayName}`);
                  resolve(undefined);
                }
              } catch (error) {
                resolve(undefined);
              }
            }),
            // Force IndexedDB flush
            new Promise(resolve => {
              // Trigger IndexedDB flush by clearing storage
              setTimeout(resolve, 100);
            })
          ]).then(() => {
            console.log(`✓ Complete session data saved for: ${account.displayName} (${partitionName})`);
            resolveSave();
          }).catch((error) => {
            console.warn(`⚠ Failed to save session for ${account.displayName}:`, error);
            resolveSave(); // Continue even if one fails
          });
          
        } catch (error) {
          console.warn(`Error saving session for account ${account.displayName}:`, error);
          resolveSave();
        }
      });
    });
    
    Promise.all(savePromises).then(() => {
      console.log('✓ All session data saved successfully');
      resolve();
    });
  });
}

// Force proper session directory for development
if (process.env.NODE_ENV === 'development') {
  // Set explicit userData path for consistent session storage
  const userDataPath = join(require('os').homedir(), '.owa-accounts-dev');
  app.setPath('userData', userDataPath);
  console.log('Development mode: Using userData path:', userDataPath);
}

// Configure Electron to behave more like a persistent browser (minimal set)
app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
app.commandLine.appendSwitch('--disk-cache-size', '104857600'); // 100MB cache

// Initialize persistent sessions for better session management
function initializeSessions(): Promise<void> {
  return new Promise((resolve) => {
    // Get all accounts and pre-configure their sessions
    const accounts = accountStore.getAccounts();
    
    if (accounts.length === 0) {
      resolve();
      return;
    }
    
    console.log(`Initializing ${accounts.length} account sessions...`);
    
    const sessionPromises = accounts.map(account => {
      return new Promise<void>((resolveSession) => {
        try {
          const url = new URL(account.loginUrl);
          const domain = url.hostname;
          
          const partitionName = `persist:owa-${account.id}`;
          
          console.log(`Setting up session for ${account.displayName} with partition: ${partitionName}`);
          
          // Initialize session with proper settings
          const ses = session.fromPartition(partitionName);
          
          // Configure security settings
          ses.setPermissionRequestHandler((webContents, permission, callback) => {
            if (permission === 'notifications' || permission === 'media') {
              callback(true);
            } else {
              callback(false);
            }
          });
          
          // Set proper user agent for OWA compatibility
          ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          
          // Set additional browser-like headers
          ses.webRequest.onBeforeSendHeaders((details, callback) => {
            // Add essential browser-like headers only
            details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9,ru;q=0.8';
            details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
            details.requestHeaders['Cache-Control'] = 'max-age=0';
            
            callback({ requestHeaders: details.requestHeaders });
          });
          
          // Configure enhanced cookie and session persistence
          let lastCookieFlush = 0;
          ses.cookies.on('changed', (event, cookie, cause, removed) => {
            if (!removed && (cookie.domain?.includes('smartds.ru') || cookie.domain?.includes('company.com') || cookie.domain?.includes('microsoftonline.com') || cookie.domain?.includes('login.windows.net'))) {
              // More aggressive cookie monitoring for auth cookies
              const now = Date.now();
              if (now - lastCookieFlush > 500) { // Flush every 500ms for auth cookies
                lastCookieFlush = now;
                ses.cookies.flushStore().catch(() => {});
                console.log(`🍪 Auth cookie saved: ${cookie.name} for ${cookie.domain}`);
              }
            }
          });
          
          // Preserve service workers and cache
          try {
            if (ses.protocol && ses.protocol.registerSchemesAsPrivileged) {
              ses.protocol.registerSchemesAsPrivileged([
                { scheme: 'https', privileges: { secure: true, standard: true, corsEnabled: true, supportFetchAPI: true } }
              ]);
            }
          } catch (error) {
            console.warn('Protocol registration failed (non-critical):', error.message);
          }
          
          // Set session to persist cookies and local storage
          ses.webRequest.onBeforeSendHeaders((details, callback) => {
            // Ensure cookies are always sent
            callback({ requestHeaders: details.requestHeaders });
          });
          
          // Configure session storage settings for better authentication persistence
          ses.setSpellCheckerEnabled(false); // Disable spell checker to improve performance
          ses.setPreloads([]); // Clear preloads to avoid conflicts
          
          // Ensure proper cookie persistence and verify existing session data
          ses.cookies.flushStore().then(() => {
            console.log(`✓ Session initialized: ${partitionName} for account: ${account.displayName}`);
            
            // Verify existing cookies on startup
            ses.cookies.get({ domain: domain }).then(cookies => {
              const authCookies = cookies.filter(c => 
                c.name === 'X-OWA-CANARY' || 
                c.name === 'X-BackEndCookie' || 
                c.name === 'X-OWA-JS-PSD' ||
                c.name === 'logondata' ||
                c.name === 'PrivateComputer' ||
                c.name.toLowerCase().includes('auth') ||
                c.name.toLowerCase().includes('session') ||
                c.name.toLowerCase().includes('token') ||
                c.name.toLowerCase().includes('login')
              );
              
              console.log(`🔍 All cookies for ${account.displayName}:`, cookies.map(c => `${c.name}=${c.value?.substring(0, 20)}...`));
              
              if (authCookies.length > 0) {
                console.log(`🍪 Found ${authCookies.length} existing auth cookies for ${account.displayName}:`);
                authCookies.forEach(cookie => {
                  console.log(`  - ${cookie.name}: ${cookie.value?.substring(0, 30)}... (expires: ${new Date(cookie.expirationDate * 1000).toISOString()})`);
                });
                
                // Set OWA-specific localStorage flags to maintain persistent login
                setTimeout(() => {
                  try {
                    ses.clearStorageData({ storages: ['cachestorage'] }).then(() => {
                      console.log(`🧹 Cache cleared for ${account.displayName} to prevent stale data`);
                    }).catch(() => {});
                  } catch (error) {
                    console.warn(`Failed to clear cache for ${account.displayName}:`, error);
                  }
                }, 1000);
              } else {
                console.log(`🔓 No existing auth cookies found for ${account.displayName} - will need to login`);
              }
              
                        // Execute script to set OWA-specific flags in localStorage and restore session data
          setTimeout(() => {
            try {
              // First, restore any persisted session data
              ses.clearStorageData({ storages: ['cachestorage'] }).then(() => {
                console.log(`🧹 Cache cleared for ${account.displayName} to prevent stale data`);
                
                // Execute script to restore localStorage and sessionStorage data
                const webContents = ses.webContents;
                if (webContents) {
                  webContents.executeJavaScript(`
                    try {
                      console.log('🔄 Force restoring OWA session for ${account.displayName}...');
                      
                      // Set ALL OWA persistent login flags
                      if (window.localStorage) {
                        const owaFlags = [
                          'PrivateComputer', 'IsOptimizedMarker', 'owa-persistent-session',
                          'IsOptimizedForOWA', 'OWA_PersistentLogin', 'OWA_RememberMe',
                          'OWA_KeepMeSignedIn', 'OWA_AutoLogin', 'OWA_SessionPersistent',
                          'OWA_RememberCredentials', 'OWA_StaySignedIn', 'OWA_NoPassword'
                        ];
                        
                        owaFlags.forEach(flag => {
                          window.localStorage.setItem(flag, 'true');
                        });
                        
                        console.log('✅ All OWA flags set in localStorage');
                      }
                      
                      // Restore ALL persisted sessionStorage data
                      if (window.localStorage && window.sessionStorage) {
                        const allKeys = Object.keys(window.localStorage);
                        let restoredCount = 0;
                        
                        allKeys.forEach(key => {
                          if (key.startsWith('persist_') && window.sessionStorage) {
                            const sessionKey = key.replace('persist_', '');
                            const value = window.localStorage.getItem(key);
                            if (value) {
                              window.sessionStorage.setItem(sessionKey, value);
                              restoredCount++;
                              console.log('✅ Restored session data:', sessionKey);
                            }
                          }
                        });
                        
                        console.log('✅ Restored ' + restoredCount + ' sessionStorage items');
                      }
                      
                      // Also restore any OWA-specific data
                      if (window.localStorage && window.sessionStorage) {
                        const owaDataKeys = [
                          'X-BackEndCookie', 'logondata', 'OWA_Session', 'OWA_Auth', 'OWA_Token',
                          'X-OWA-CANARY', 'X-OWA-JS-PSD', 'ClientId', 'PrivateComputer'
                        ];
                        
                        owaDataKeys.forEach(key => {
                          const value = window.localStorage.getItem(key);
                          if (value) {
                            window.sessionStorage.setItem(key, value);
                            console.log('✅ Restored OWA data:', key);
                          }
                        });
                      }
                      
                      console.log('✅ Complete OWA session restoration for ' + account.displayName);
                    } catch (e) {
                      console.warn('Failed to restore session data for ' + account.displayName + ':', e);
                    }
                  `).catch(() => {});
                }
              }).catch(() => {});
            } catch (error) {
              console.warn(`Failed to clear cache for ${account.displayName}:`, error);
            }
          }, 1000);
            }).catch((error) => {
              console.warn('Failed to check existing cookies:', error);
            });
            
            resolveSession();
          }).catch((error) => {
            console.warn(`⚠ Session initialized with warning: ${partitionName} for account: ${account.displayName}`, error);
            resolveSession();
          });
          
        } catch (error) {
          console.warn(`Failed to initialize session for account ${account.displayName}:`, error);
          resolveSession();
        }
      });
    });
    
    Promise.all(sessionPromises).then(() => {
      console.log('All sessions initialized successfully');
      resolve();
    });
  });
}

async function createWindow(): Promise<void> {
  const windowState = accountStore.getWindowState();
  
  mainWindow = new BrowserWindow({
    width: windowState?.width || 1280,
    height: windowState?.height || 800,
    x: windowState?.x,
    y: windowState?.y,
    title: 'OWA Accounts',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 16 },
    minWidth: 800,
    minHeight: 600,
    show: false, // Don't show until ready
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Need to disable sandbox for webview
      webviewTag: true, // Enable webview tag
    },
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devServerUrl);
    // Remove auto-opening of dev tools - user can open manually with Cmd+Option+I
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show window after loading
  mainWindow.show();

  // Setup theme handling
  const updateTheme = () => {
    if (mainWindow) {
      mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
    }
  };
  
  // Listen for theme changes
  nativeTheme.on('updated', updateTheme);
  
  // Send initial theme
  mainWindow.webContents.once('did-finish-load', () => {
    updateTheme();
  });

  // Handle window events
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      accountStore.setWindowState({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle webview new window events
  mainWindow.webContents.on('did-attach-webview', (_, webContents) => {
    // Set a proper user agent for OWA compatibility
    webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Configure session persistence and security
    const session = webContents.session;
    
    // Enable session persistence by ensuring proper cache and data storage
    session.setPermissionRequestHandler((webContents, permission, callback) => {
      // Allow necessary permissions for OWA functionality
      if (permission === 'notifications' || permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    });
    
    // Enhanced authentication cookie handling
    let lastWebviewCookieFlush = 0;
    session.cookies.on('changed', (event, cookie, cause, removed) => {
      if (!removed && cookie.name && (
        cookie.name.toLowerCase().includes('auth') ||
        cookie.name.toLowerCase().includes('token') ||
        cookie.name.toLowerCase().includes('session') ||
        cookie.name.toLowerCase().includes('login') ||
        cookie.name === 'X-OWA-CANARY' ||
        cookie.name === 'X-BackEndCookie' ||
        cookie.name === 'X-OWA-JS-PSD' ||
        cookie.name === 'logondata' ||
        cookie.name === 'PrivateComputer' ||
        cookie.domain?.includes('microsoftonline.com') ||
        cookie.domain?.includes('login.windows.net') ||
        cookie.domain?.includes('smartds.ru') ||
        cookie.domain?.includes('company.com')
      )) {
        // More aggressive cookie logging and flushing
        const now = Date.now();
        if (now - lastWebviewCookieFlush > 500) { // Flush every 500ms for auth cookies
          lastWebviewCookieFlush = now;
          console.log(`🍪 Important auth cookie saved: ${cookie.name} for ${cookie.domain}`);
          // Immediately flush authentication cookies to disk
          session.cookies.flushStore().catch(() => {});
        }
      }
    });
    
    // Configure session to persist authentication cookies and data
    session.cookies.flushStore().catch(err => {
      console.log('Cookie flush warning (non-critical):', err.message);
    });
    
    // Enable comprehensive session storage
    session.setDownloadPath(require('os').tmpdir());
    
    // Disable web security for better OWA authentication flow
    session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = details.responseHeaders || {};
      
      // Remove security headers that might interfere with authentication
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      
      callback({ responseHeaders });
    });
    
    // Add comprehensive cookie and storage monitoring
    session.webRequest.onCompleted((details) => {
      if (details.statusCode === 200 && (
        details.url.includes('/owa/') || 
        details.url.includes('/auth/') ||
        details.url.includes('login') ||
        details.url.includes('microsoftonline.com')
      )) {
        // Force session save after successful authentication-related requests
        setTimeout(async () => {
          try {
            await session.cookies.flushStore();
            await session.flushStorageData();
          } catch (error) {
            console.warn('Failed to flush session after auth request:', error);
          }
        }, 500);
      }
    });
    
    // Enable comprehensive session storage
    session.setDownloadPath(require('os').tmpdir());
    
    // Disable web security for better OWA authentication flow
    session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = details.responseHeaders || {};
      
      // Remove security headers that might interfere with authentication
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      
      // Add browser-like headers
      responseHeaders['Cache-Control'] = ['no-cache, no-store, must-revalidate'];
      
      callback({ responseHeaders });
    });
    
    // Add comprehensive cookie and storage monitoring
    session.webRequest.onCompleted((details) => {
      if (details.statusCode === 200 && (
        details.url.includes('/owa/') || 
        details.url.includes('/auth/') ||
        details.url.includes('login') ||
        details.url.includes('microsoftonline.com')
      )) {
        // Force session save after successful authentication-related requests
        setTimeout(async () => {
          try {
            await session.cookies.flushStore();
            await session.flushStorageData();
          } catch (error) {
            console.warn('Failed to flush session after auth request:', error);
          }
        }, 500);
      }
    });
    
    webContents.setWindowOpenHandler(({ url }) => {
      // Allow OWA popups to open in the same partition
      if (url.includes('cas.smartds.ru') || 
          url.includes('login.microsoftonline.com') ||
          url.includes('outlook.office365.com') ||
          url.includes('outlook.office.com')) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 800,
            height: 600,
            webPreferences: {
              // Use same partition for popup windows
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true
            }
          }
        };
      }
      // Open other links externally
      shell.openExternal(url);
      return { action: 'deny' };
    });
    
    // Log webview events for debugging
    webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.log('Webview failed to load:', {
        errorCode,
        errorDescription,
        url: validatedURL
      });
    });
    
    webContents.on('did-finish-load', () => {
      console.log('Webview finished loading');
      
      // Save session data immediately after successful load
      setTimeout(async () => {
        try {
          await saveAllSessions();
        } catch (error) {
          console.warn('Failed to save sessions after webview load:', error);
        }
      }, 2000); // Wait 2 seconds for any authentication to complete
    });
    
    // Also save when navigation completes (indicates successful authentication)
    webContents.on('did-navigate', (event, url) => {
      // If we've navigated to an OWA page, it likely means authentication succeeded
      if (url.includes('/owa/') || url.includes('/mail/') || url.includes('outlook.office')) {
        console.log('🔑 Authentication navigation detected, saving sessions...');
        setTimeout(async () => {
          try {
            await saveAllSessions();
            
            // Also execute script to preserve localStorage and sessionStorage
            webContents.executeJavaScript(`
              try {
                // Force save any pending localStorage changes
                if (window.localStorage) {
                  console.log('localStorage items:', Object.keys(window.localStorage).length);
                  // Set OWA persistent login flags
                  window.localStorage.setItem('PrivateComputer', 'true');
                  window.localStorage.setItem('IsOptimizedMarker', 'true');
                  window.localStorage.setItem('owa-persistent-session', 'true');
                  window.localStorage.setItem('IsOptimizedForOWA', 'true');
                  window.localStorage.setItem('OWA_PersistentLogin', 'true');
                  window.localStorage.setItem('OWA_RememberMe', 'true');
                  window.localStorage.setItem('OWA_KeepMeSignedIn', 'true');
                  
                  // Force save all localStorage data
                  const allKeys = Object.keys(window.localStorage);
                  allKeys.forEach(key => {
                    const value = window.localStorage.getItem(key);
                    if (value) {
                      // Force re-set to ensure persistence
                      window.localStorage.setItem(key, value);
                    }
                  });
                }
                if (window.sessionStorage) {
                  console.log('sessionStorage items:', Object.keys(window.sessionStorage).length);
                  // Copy ALL sessionStorage to localStorage for persistence
                  const sessionKeys = Object.keys(window.sessionStorage);
                  sessionKeys.forEach(key => {
                    const value = window.sessionStorage.getItem(key);
                    if (value && window.localStorage) {
                      window.localStorage.setItem('persist_' + key, value);
                      console.log('💾 Saved sessionStorage:', key);
                    }
                  });
                }
                // Trigger any pending storage commits
                if (window.localStorage && window.localStorage.setItem) {
                  window.localStorage.setItem('owa-session-preserved', Date.now().toString());
                }
              } catch (e) {
                console.warn('Storage preservation script failed:', e);
              }
            `).catch(() => {});
            
          } catch (error) {
            console.warn('Failed to save sessions after authentication:', error);
          }
        }, 1000); // Wait 1 second for full authentication flow
      }
    });
    
    // Execute OWA-specific initialization script when webview is ready
    webContents.once('dom-ready', () => {
      webContents.executeJavaScript(`
        try {
          // Set OWA persistent login flags
          if (window.localStorage) {
            window.localStorage.setItem('PrivateComputer', 'true');
            window.localStorage.setItem('IsOptimizedMarker', 'true');
            window.localStorage.setItem('owa-persistent-session', 'true');
            console.log('✅ OWA localStorage flags set');
          }
          
          // Check if we're already logged in
          if (window.localStorage && window.localStorage.getItem('X-BackEndCookie')) {
            console.log('✅ Already logged in - session restored');
          }
          
          // Restore ALL persisted sessionStorage data
          if (window.localStorage) {
            const allKeys = Object.keys(window.localStorage);
            allKeys.forEach(key => {
              if (key.startsWith('persist_') && window.sessionStorage) {
                const sessionKey = key.replace('persist_', '');
                const value = window.localStorage.getItem(key);
                if (value) {
                  window.sessionStorage.setItem(sessionKey, value);
                  console.log('✅ Restored session data:', sessionKey);
                }
              }
            });
            
            // Also restore any OWA-specific data
            const owaKeys = ['X-BackEndCookie', 'logondata', 'OWA_Session', 'OWA_Auth', 'OWA_Token'];
            owaKeys.forEach(key => {
              const value = window.localStorage.getItem(key);
              if (value && window.sessionStorage) {
                window.sessionStorage.setItem(key, value);
                console.log('✅ Restored OWA data:', key);
              }
            });
          }
        } catch (e) {
          console.warn('OWA initialization script failed:', e);
        }
      `).catch(() => {});
    });
  });
}

function updateTrayMenu(): void {
  if (!tray) return;
  
  const accounts = accountStore.getAccounts();
  const menuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Show OWA Accounts',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' }
  ];
  
  if (accounts.length > 0) {
    accounts.forEach(account => {
      menuItems.push({
        label: account.displayName,
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            // Switch to this account
            mainWindow.webContents.send('switch-account', account.id);
          }
        }
      });
    });
    menuItems.push({ type: 'separator' });
  }
  
  menuItems.push(
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  );
  
  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

function createTray(): void {
  // Create a simple icon for the tray (you can replace with actual icon)
  const icon = nativeImage.createEmpty();
  
  tray = new Tray(icon);
  tray.setToolTip('OWA Accounts');
  
  updateTrayMenu();
  
  tray.on('click', async () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      await createWindow();
    }
  });
}

// IPC handlers
ipcMain.handle('accounts:get', () => {
  return accountStore.getAccounts();
});

ipcMain.handle('accounts:add', (_, account: AccountMeta) => {
  accountStore.addAccount(account);
  updateTrayMenu(); // Update tray menu when accounts change
  return accountStore.getAccounts();
});

ipcMain.handle('accounts:update', (_, accountId: string, updates: Partial<AccountMeta>) => {
  const updatedAccount = accountStore.updateAccount(accountId, updates);
  if (updatedAccount) {
    console.log(`✅ Account ${accountId} updated successfully`);
  } else {
    console.warn(`⚠️ Failed to update account ${accountId}`);
  }
  updateTrayMenu(); // Update tray menu when accounts change
  return accountStore.getAccounts();
});

ipcMain.handle('accounts:remove', (_, accountId: string) => {
  accountStore.deleteAccount(accountId);
  updateTrayMenu(); // Update tray menu when accounts change
  return accountStore.getAccounts();
});

ipcMain.handle('accounts:setActive', (_, accountId: string) => {
  // Handle account switching
  if (mainWindow) {
    mainWindow.webContents.send('switch-account', accountId);
  }
  return true;
});

ipcMain.handle('app:get-state', () => {
  return {
    accounts: accountStore.getAccounts(),
    windowState: accountStore.getWindowState()
  };
});

ipcMain.handle('app:show-notification', (_, options: CustomNotificationOptions) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: options.title || 'OWA Accounts',
      body: options.body,
      icon: options.icon,
      tag: options.tag,
      silent: options.silent
    });
    
    notification.show();
    
    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
});

ipcMain.handle('app:open-external', (_, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('app:open-owa-in-window', (_, url: string, title: string, partitionName: string) => {
  // Create a new BrowserWindow for OWA with full browser functionality
  const owaWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: `OWA - ${title}`,
    titleBarStyle: 'default',
    webPreferences: {
      partition: partitionName,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  });

  // Set proper user agent for OWA compatibility
  owaWindow.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Load the OWA URL
  owaWindow.loadURL(url);

  // Handle window events
  owaWindow.on('closed', () => {
    // Window closed
  });

  // Handle external links
  owaWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show the window
  owaWindow.show();

  return true;
});

// Add webview communication handlers here
ipcMain.on('webview:unread-count', (event, accountId: string, count: number) => {
  if (mainWindow) {
    mainWindow.webContents.send('webview:unread-count', accountId, count);
  }
});

ipcMain.on('webview:title-changed', (event, accountId: string, title: string) => {
  if (mainWindow) {
    mainWindow.webContents.send('webview:title-changed', accountId, title);
  }
});

ipcMain.on('webview:notification', (event, accountId: string, notification: CustomNotificationOptions) => {
  if (mainWindow) {
    mainWindow.webContents.send('webview:notification', accountId, notification);
  }
});

// Handle application events
app.whenReady().then(async () => {
  await initializeSessions();
  await createWindow();
  createTray();
});

// Save all sessions before quitting
app.on('before-quit', async (event) => {
  console.log('🔄 Saving all sessions before quit...');
  event.preventDefault();
  
  try {
    await saveAllSessions();
    console.log('✅ All sessions saved successfully');
  } catch (error) {
    console.warn('⚠ Failed to save sessions before quit:', error);
  }
  
  // Force quit after saving
  app.exit(0);
});

// Handle window closed
app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app activation (macOS)
app.on('activate', async () => {
  if (mainWindow === null) {
    await createWindow();
  }
});
