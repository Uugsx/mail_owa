import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, Notification, nativeTheme, session } from 'electron';
import { join } from 'path';
import { accountStore } from './store';
import { AccountMeta, CustomNotificationOptions } from './types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// SIMPLIFIED session initialization - NO PARTITIONS
function initializeSessions(): Promise<void> {
  return new Promise((resolve) => {
    console.log('🔧 SIMPLIFIED session initialization - using DEFAULT session only');
    
    // Just configure the default session to behave like a regular browser
    const defaultSession = session.defaultSession;
    
    // Set proper user agent
    defaultSession.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Allow all permissions (like a regular browser)
    defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true); // Allow everything like a normal browser
    });
    
    console.log('✅ SIMPLIFIED session initialization complete');
    resolve();
  });
}

async function createWindow(): Promise<void> {
  const windowState = accountStore.getWindowState();
  
  mainWindow = new BrowserWindow({
    width: windowState?.width || 1200,
    height: windowState?.height || 800,
    x: windowState?.x,
    y: windowState?.y,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/preload.js')
    }
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Save window state
  mainWindow.on('resize', () => {
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

  mainWindow.on('move', () => {
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
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../assets/icon.png'));
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('OWA Accounts');
}

// IPC Handlers
ipcMain.handle('accounts:get', () => {
  return accountStore.getAccounts();
});

ipcMain.handle('accounts:add', (_, account: Omit<AccountMeta, 'id' | 'createdAt'>) => {
  return accountStore.addAccount(account);
});

ipcMain.handle('accounts:remove', (_, id: string) => {
  accountStore.removeAccount(id);
});

ipcMain.handle('app:get-state', () => {
  return {
    accounts: accountStore.getAccounts(),
    lastActiveAccountId: accountStore.getLastActiveAccountId(),
    windowState: accountStore.getWindowState()
  };
});

ipcMain.handle('app:show-notification', (_, options: CustomNotificationOptions & { accountId: string }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: options.title || 'OWA Accounts',
      body: options.body,
      icon: options.icon || join(__dirname, '../../assets/icon.png'),
      silent: options.silent || false
    });
    
    notification.show();
  }
});

ipcMain.handle('app:open-external', (_, url: string) => {
  shell.openExternal(url);
});

// Handle application events
app.whenReady().then(async () => {
  await initializeSessions();
  await createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on('before-quit', () => {
  console.log('🔄 App is quitting - sessions will be handled by default browser behavior');
});




