import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, Notification, nativeTheme, session, globalShortcut } from 'electron';
import { join } from 'path';
import { accountStore } from './store';
import { AccountMeta, CustomNotificationOptions } from './types';

// Set application name for macOS menu bar and system notifications
app.name = 'OWA Accounts';
try {
  app.setAppUserModelId('com.owa.accounts');
} catch (e) {
  console.warn('Failed to set AppUserModelId:', e);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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
          
          let partitionName: string;
          if (domain.includes('smartds.ru') || domain.includes('company.com')) {
            partitionName = domain.includes('smartds.ru') ? 'persist:smartds-shared' : 'persist:company-shared';
          } else {
            partitionName = `persist:owa-${account.id}`;
          }
          
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
                workers.then((workerList: any) => {
                  console.log(`🔧 Found ${Object.keys(workerList).length} service workers for ${account.displayName}`);
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



// Initialize persistent sessions for better session management
function initializeSessions(): Promise<void> {
  return new Promise((resolve) => {
    // Configure default session to ignore SSL errors
    const defaultSession = session.defaultSession;
    defaultSession.setCertificateVerifyProc((request, callback) => {
      callback(0); // Accept all certificates
    });

    // Also disable SSL verification completely
    defaultSession.webRequest.onBeforeRequest((details, callback) => {
      // Allow all requests
      callback({ cancel: false });
    });
    
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
          
          let partitionName: string;
          if (domain.includes('smartds.ru') || domain.includes('company.com')) {
            partitionName = domain.includes('smartds.ru') ? 'persist:smartds-shared' : 'persist:company-shared';
          } else {
            partitionName = `persist:owa-${account.id}`;
          }
          
          console.log(`Setting up session for ${account.displayName} with partition: ${partitionName}`);
          
          // Initialize session with proper settings
          const ses = session.fromPartition(partitionName);
          
          // Ignore SSL errors for this session
          ses.setCertificateVerifyProc((request, callback) => {
            callback(0); // Accept all certificates
          });
          
          // Configure security settings
          ses.setPermissionRequestHandler((webContents, permission, callback) => {
            if (permission === 'notifications' || permission === 'media') {
              callback(true);
            } else {
              callback(false);
            }
          });
          
          // Set proper user agent for OWA compatibility
          // Set proper user agent for OWA and Google compatibility
          if (domain.includes('google.com') || domain.includes('gmail.com') || domain.includes('google')) {
            ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15');
          } else {
            ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
          }

          // Block ad and tracking network requests to save RAM and CPU
          const adPatterns = [
            'an.yandex.ru',
            'yandex.ru/ads',
            'direct.yandex',
            'pagead2.googlesyndication.com',
            'googleads.g.doubleclick.net',
            'pubads.g.doubleclick.net',
            'adservice.google',
            'mail.ru/ads',
            'mc.yandex.ru',
            'google-analytics.com'
          ];
          ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
            const shouldBlock = adPatterns.some(pattern => details.url.includes(pattern));
            if (shouldBlock) {
              callback({ cancel: true });
            } else {
              callback({});
            }
          });
          
          // Set additional browser-like headers
          ses.webRequest.onBeforeSendHeaders((details, callback) => {
            const isPublicMail = 
              domain.includes('google.com') || 
              domain.includes('yandex.ru') || 
              domain.includes('yandex.com') ||
              domain.includes('passport.yandex') ||
              domain.includes('mail.ru') || 
              domain.includes('live.com') || 
              domain.includes('outlook.com');

            if (!isPublicMail) {
              // Add essential browser-like headers only for custom Exchange OWA
              details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9,ru;q=0.8';
              details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
              details.requestHeaders['Cache-Control'] = 'max-age=0';
            }
            
            callback({ requestHeaders: details.requestHeaders });
          });
          
          // Configure enhanced cookie and session persistence
          let lastCookieFlush = 0;
          ses.cookies.on('changed', (event, cookie, cause, removed) => {
            if (removed) return;
            
            // Promote session cookies to persistent cookies to avoid sign-out on quit
            const isTargetDomain = 
              cookie.domain?.includes('yandex') || 
              cookie.domain?.includes('google') || 
              cookie.domain?.includes('mail.ru') || 
              cookie.domain?.includes('outlook') || 
              cookie.domain?.includes('live.com') ||
              cookie.domain?.includes('smartds.ru') ||
              cookie.domain?.includes('company.com');

            if (cookie.session && isTargetDomain) {
              const protocol = cookie.secure ? 'https:' : 'http:';
              const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
              const cookieUrl = `${protocol}//${cleanDomain}${cookie.path}`;
              
              const newCookie = {
                url: cookieUrl,
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                expirationDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
                sameSite: cookie.sameSite
              };
              
              // Use setTimeout to avoid infinite loop inside cookies.on('changed')
              setTimeout(() => {
                try {
                  ses.cookies.set(newCookie).catch(() => {});
                } catch {}
              }, 100);
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
            console.warn('Protocol registration failed (non-critical):', (error as Error).message);
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
                  console.log(`  - ${cookie.name}: ${cookie.value?.substring(0, 30)}... (expires: ${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : 'never'})`);
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
              
              resolveSession();
            }).catch((error) => {
              console.warn('Failed to check existing cookies:', error);
              resolveSession();
            });
            
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

const getIconPath = () => {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build/icon.png');
};

async function createWindow(): Promise<void> {
  const windowState = accountStore.getWindowState();
  const iconPath = getIconPath();
  
  mainWindow = new BrowserWindow({
    width: windowState?.width || 1280,
    height: windowState?.height || 800,
    x: windowState?.x,
    y: windowState?.y,
    title: 'OWA Accounts',
    icon: iconPath,
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

  // Dynamically set macOS Dock icon to display the correct app logo
  if (process.platform === 'darwin') {
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      app.dock.setIcon(dockIcon);
    } catch (err) {
      console.warn('Failed to set dock icon:', err);
    }
  }

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show window after loading
  mainWindow.show();

  // Setup theme handling
  const updateTheme = () => {
    if (mainWindow) {
      const isDark = nativeTheme.shouldUseDarkColors;
      mainWindow.webContents.send('theme-changed', isDark);
      // Propagate preferred dark/light color scheme to webviews
      nativeTheme.themeSource = isDark ? 'dark' : 'light';
    }
  };
  
  // Listen for theme changes
  nativeTheme.on('updated', updateTheme);
  
  // Send initial theme
  mainWindow.webContents.once('did-finish-load', () => {
    updateTheme();
  });

  // Handle window events (Hide instead of close on macOS)
  mainWindow.on('close', (event) => {
    const isMac = process.platform === 'darwin';
    if (!isQuitting && isMac) {
      event.preventDefault();
      mainWindow?.hide();
    } else {
      if (mainWindow) {
        const bounds = mainWindow.getBounds();
        accountStore.setWindowState({
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    if (process.platform === 'darwin') {
      globalShortcut.unregister('Command+Q');
      globalShortcut.unregister('Command+W');
    }
    mainWindow = null;
  });

  mainWindow.on('focus', () => {
    if (process.platform === 'darwin') {
      globalShortcut.register('Command+Q', () => {
        app.quit();
      });
      globalShortcut.register('Command+W', () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      });
    }
  });

  mainWindow.on('blur', () => {
    if (process.platform === 'darwin') {
      globalShortcut.unregister('Command+Q');
      globalShortcut.unregister('Command+W');
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
  // Use the generated tray template icon
  const iconPath = join(__dirname, '../../build/trayTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  
  // Make sure it is recognized as a template image on macOS to handle light/dark menu bar
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  
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
  const newAccount = accountStore.addAccount(account);
  updateTrayMenu();
  return newAccount;
});

ipcMain.handle('accounts:update', (_, accountId: string, updates: Partial<AccountMeta>) => {
  const updatedAccount = accountStore.updateAccount(accountId, updates);
  if (updatedAccount) {
    console.log(`✅ Account ${accountId} updated successfully`);
  } else {
    console.warn(`⚠️ Failed to update account ${accountId}`);
  }
  updateTrayMenu();
  return accountStore.getAccounts();
});

ipcMain.handle('accounts:remove', (_, accountId: string) => {
  const success = accountStore.deleteAccount(accountId);
  if (success) {
    console.log(`✅ Account ${accountId} removed successfully`);
  } else {
    console.warn(`⚠️ Failed to remove account ${accountId}`);
  }
  updateTrayMenu();
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
  try {
    if (Notification.isSupported()) {
      const isSilent = options.silent || options.sound === 'None';
      
      // Resolve absolute path to app icon.png for both development and production packaged builds
      const defaultIcon = app.isPackaged
        ? join(process.resourcesPath, 'icon.png')
        : join(app.getAppPath(), 'build/icon.png');

      const isMac = process.platform === 'darwin';
      const notification = new Notification({
        title: options.title || 'OWA Accounts',
        body: options.body,
        // On macOS, the OS automatically uses the Dock icon on the left.
        // Omit the icon parameter here to avoid showing a duplicate icon on the right side.
        icon: isMac ? undefined : (options.icon || defaultIcon),
        silent: isSilent,
        sound: isSilent ? undefined : (options.sound || 'Glass')
      });
      
      console.log(`🔔 Showing system notification: [${options.title}] - ${options.body} (sound: ${options.sound}, silent: ${isSilent})`);
      notification.show();
      
      notification.on('click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    } else {
      console.warn('⚠️ Notifications are not supported on this system');
    }
  } catch (err) {
    console.error('❌ Failed to show native notification:', err);
  }
});

ipcMain.handle('app:play-system-sound', (_, soundName: string) => {
  try {
    const { exec } = require('child_process');
    // Sanitize sound name to prevent any shell injection
    const safeSound = soundName.replace(/[^a-zA-Z0-9_-]/g, '');
    const soundPath = `/System/Library/Sounds/${safeSound}.aiff`;
    exec(`afplay "${soundPath}"`);
  } catch (e) {
    console.warn('Failed to play system sound:', e);
  }
});

ipcMain.handle('app:open-external', (_, url: string) => {
  shell.openExternal(url);
});

// Provide absolute path to the webview preload script (works in dev and prod)
ipcMain.handle('app:get-webview-preload-path', () => {
  // __dirname resolves to out/main in dev/prod builds
  // Preload bundle is emitted to out/preload/webview-preload.js
  return join(__dirname, '../preload/webview-preload.js');
});

ipcMain.handle('app:get-initial-theme', () => {
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.on('app:get-initial-theme-sync', (event) => {
  event.returnValue = nativeTheme.shouldUseDarkColors;
});

// Serve Dark Reader source to renderer for injection via executeJavaScript
let cachedDarkReaderSource: string | null = null;
ipcMain.handle('app:get-darkreader-source', () => {
  if (cachedDarkReaderSource) return cachedDarkReaderSource;
  try {
    const fs = require('fs');
    const possiblePaths = [
      join(__dirname, '../../node_modules/darkreader/darkreader.js'),
      join(__dirname, '../../../node_modules/darkreader/darkreader.js'),
      join(app.getAppPath(), 'node_modules/darkreader/darkreader.js'),
    ];
    for (const p of possiblePaths) {
      try {
        cachedDarkReaderSource = fs.readFileSync(p, 'utf-8');
        console.log(`📦 Dark Reader loaded from ${p} (${(cachedDarkReaderSource!.length / 1024).toFixed(0)} KB)`);
        return cachedDarkReaderSource;
      } catch {}
    }
    console.warn('⚠️ Could not find darkreader.js');
    return null;
  } catch (err) {
    console.warn('⚠️ Failed to read Dark Reader:', err);
    return null;
  }
});

function setAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as Electron.MenuItemConstructorOptions[]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Account',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.webContents.send('show-add-account');
            }
          }
        },
        {
          label: 'Refresh Active Account',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:refresh-account');
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ] as Electron.MenuItemConstructorOptions[]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }]
              }
            ] as Electron.MenuItemConstructorOptions[]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' }
            ])
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Application Window',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' }
            ] as Electron.MenuItemConstructorOptions[]
          : [{ role: 'close' } as Electron.MenuItemConstructorOptions[]])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle application events
app.whenReady().then(async () => {
  setAppMenu();
  // Ignore SSL errors to prevent handshake failures
  app.commandLine.appendSwitch('--ignore-ssl-errors');
  app.commandLine.appendSwitch('--ignore-certificate-errors');
  app.commandLine.appendSwitch('--allow-insecure-localhost');
  app.commandLine.appendSwitch('--disable-web-security');
  app.commandLine.appendSwitch('--ignore-ssl-errors-spki-list');
  app.commandLine.appendSwitch('--ignore-certificate-errors-spki-list');
  app.commandLine.appendSwitch('--ignore-ssl-errors-subject-alt-name-list');
  app.commandLine.appendSwitch('--ignore-certificate-errors-subject-alt-name-list');
  app.commandLine.appendSwitch('--disable-background-timer-throttling');
  app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('--disable-renderer-backgrounding');

  await initializeSessions();
  await createWindow();
  createTray();
});

// Unregister shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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

// Handle saving sessions asynchronously before quitting
app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;
    console.log('🔄 Saving all sessions before quit...');
    saveAllSessions().then(() => {
      console.log('✅ All sessions saved successfully');
      app.quit();
    }).catch((error) => {
      console.warn('⚠ Failed to save sessions before quit:', error);
      app.quit();
    });
  }
});

ipcMain.on('app:quit-request', () => {
  app.quit();
});

ipcMain.on('app:close-request', () => {
  if (mainWindow) {
    if (process.platform === 'darwin') {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  }
});

// Add webview communication handlers
ipcMain.on('webview:unread-count', (event, accountId: string, count: number) => {
  try {
    console.log(`↔️ ipc: webview:unread-count account=${accountId} count=${count}`);
  } catch {}
  if (mainWindow) {
    mainWindow.webContents.send('webview:unread-count', accountId, count);
  }
});

ipcMain.on('webview:unread-debug', (event, accountId: string, payload: any) => {
  try {
    console.log('🧪 unread-debug', accountId, JSON.stringify(payload));
  } catch {}
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
