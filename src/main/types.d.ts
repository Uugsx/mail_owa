export interface AccountMeta {
  id: string;            // uuid
  displayName: string;   // "Work Account"
  loginUrl: string;      // "https://mail.company.com/owa/"
  username?: string;     // Optional username
  password?: string;     // зашифрованный пароль
  color?: string;        // для аватара
  createdAt: string;     // ISO
  unreadCount?: number;  // счетчик непрочитанных
  sound?: string;        // звук уведомления
}

export interface AppState {
  accounts: AccountMeta[];
  lastActiveAccountId?: string;
  windowState?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
}

export interface CustomNotificationOptions {
  title?: string;
  body?: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
  sound?: string;
}

export interface IpcChannels {
  // Account management
  'accounts:get': () => AccountMeta[];
  'accounts:add': (account: Omit<AccountMeta, 'id' | 'createdAt'>) => AccountMeta;
  'accounts:update': (id: string, updates: Partial<AccountMeta>) => void;
  'accounts:delete': (id: string) => void;
  'accounts:setActive': (id: string) => void;
  
  // Webview communication
  'webview:unread-count': (accountId: string, count: number) => void;
  'webview:title-changed': (accountId: string, title: string) => void;
  'webview:notification': (accountId: string, notification: CustomNotificationOptions) => void;
  
  // App state
  'app:get-state': () => AppState;
  'app:set-badge': (count: number) => void;
  'app:show-notification': (options: CustomNotificationOptions & { accountId: string }) => void;
}

export interface PreloadAPI {
  accounts: {
    get: () => Promise<AccountMeta[]>;
    add: (account: Omit<AccountMeta, 'id' | 'createdAt'>) => Promise<AccountMeta>;
    update: (id: string, updates: Partial<AccountMeta>) => Promise<void>;
    delete: (id: string) => Promise<void>;
    setActive: (id: string) => Promise<void>;
  };
  webview: {
    onUnreadCount: (callback: (accountId: string, count: number) => void) => void;
    onTitleChanged: (callback: (accountId: string, title: string) => void) => void;
    sendUnreadCount: (count: number) => void;
    sendNotification: (notification: CustomNotificationOptions) => void;
  };
  app: {
    getState: () => Promise<AppState>;
    setBadge: (count: number) => Promise<void>;
    showNotification: (options: CustomNotificationOptions & { accountId: string }) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    openOWAInWindow: (url: string, title: string, partitionName: string) => Promise<boolean>;
    getWebviewPreloadPath: () => Promise<string>;
    getInitialTheme: () => Promise<boolean>;
    getInitialThemeSync: () => boolean;
    playSystemSound: (soundName: string) => Promise<void>;
    clearSessionStorage: (accountId: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: PreloadAPI;
  }
}