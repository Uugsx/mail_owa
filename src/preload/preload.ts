import { contextBridge, ipcRenderer } from 'electron';
import { PreloadAPI, AccountMeta, AppState, CustomNotificationOptions } from '../main/types';

// Expose the electron API to the renderer process
const electronAPI: PreloadAPI = {
  accounts: {
    get: () => ipcRenderer.invoke('accounts:get'),
    add: (account) => ipcRenderer.invoke('accounts:add', account),
    update: (id, updates) => ipcRenderer.invoke('accounts:update', id, updates),
    delete: (id) => ipcRenderer.invoke('accounts:remove', id),
    setActive: (id) => ipcRenderer.invoke('accounts:setActive', id),
  },
  webview: {
    onUnreadCount: (callback) => {
      const handler = (_: any, accountId: string, count: number) => callback(accountId, count);
      ipcRenderer.on('webview:unread-count', handler);
      return () => ipcRenderer.removeListener('webview:unread-count', handler);
    },
    onTitleChanged: (callback) => {
      const handler = (_: any, accountId: string, title: string) => callback(accountId, title);
      ipcRenderer.on('webview:title-changed', handler);
      return () => ipcRenderer.removeListener('webview:title-changed', handler);
    },
    sendUnreadCount: (count) => {
      // This will be called from webview-preload
      ipcRenderer.send('webview:unread-count', count);
    },
    sendNotification: (notification) => {
      // This will be called from webview-preload
      ipcRenderer.send('webview:notification', notification);
    },
  },
  app: {
    getState: () => ipcRenderer.invoke('app:get-state'),
    setBadge: (count) => ipcRenderer.invoke('app:set-badge', count),
    showNotification: (options) => ipcRenderer.invoke('app:show-notification', options),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    openOWAInWindow: (url, title, partitionName) => ipcRenderer.invoke('app:open-owa-in-window', url, title, partitionName),
    getWebviewPreloadPath: () => ipcRenderer.invoke('app:get-webview-preload-path'),
    getInitialTheme: () => ipcRenderer.invoke('app:get-initial-theme'),
    getInitialThemeSync: () => ipcRenderer.sendSync('app:get-initial-theme-sync'),
    getDarkReaderSource: () => ipcRenderer.invoke('app:get-darkreader-source'),
    playSystemSound: (soundName) => ipcRenderer.invoke('app:play-system-sound', soundName),
    clearSessionStorage: (accountId) => ipcRenderer.invoke('session:clear-storage', accountId),
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Listen for main process events
ipcRenderer.on('switch-account', (_, accountId: string) => {
  window.dispatchEvent(new CustomEvent('switch-account', { detail: accountId }));
});

ipcRenderer.on('show-add-account', () => {
  window.dispatchEvent(new CustomEvent('show-add-account'));
});

ipcRenderer.on('menu:refresh-account', () => {
  window.dispatchEvent(new CustomEvent('menu:refresh-account'));
});

ipcRenderer.on('theme-changed', (_, isDark: boolean) => {
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: isDark }));
});

// Handle webview messages from the renderer
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'webview-message') {
    const { channel, accountId, data } = event.data;
    
    switch (channel) {
      case 'unread-count':
        ipcRenderer.send('webview:unread-count', accountId, data);
        break;
      case 'title-changed':
        ipcRenderer.send('webview:title-changed', accountId, data);
        break;
      case 'notification':
        ipcRenderer.send('webview:notification', accountId, data);
        break;
      case 'get-account-info':
        // This is a request from webview to get account info
        // We don't need to send this to main process
        break;
    }
  }
});