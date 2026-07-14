import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import { AccountMeta, AppState } from './types';
import { session } from 'electron';

const schema = {
  accounts: {
    type: 'array',
    items: {
      type: 'object',
              properties: {
          id: { type: 'string' },
          displayName: { type: 'string' },
          loginUrl: { type: 'string' },
          username: { type: 'string' },
          password: { type: 'string' },
          color: { type: 'string' },
          createdAt: { type: 'string' },
          unreadCount: { type: 'number' }
        },
      required: ['id', 'displayName', 'loginUrl', 'createdAt']
    },
    default: []
  },
  lastActiveAccountId: {
    type: 'string'
  },
  windowState: {
    type: 'object',
    properties: {
      width: { type: 'number' },
      height: { type: 'number' },
      x: { type: 'number' },
      y: { type: 'number' }
    },
    default: {
      width: 1280,
      height: 800
    }
  }
} as const;

class AccountStore {
  private store: Store<AppState>;

  constructor() {
    this.store = new Store({
      schema: schema as any,
      defaults: {
        accounts: [],
        windowState: {
          width: 1280,
          height: 800
        }
      }
    }) as Store<AppState>;
  }

  getAccounts(): AccountMeta[] {
    return this.store.get('accounts', []);
  }

  addAccount(accountData: Omit<AccountMeta, 'id' | 'createdAt'>): AccountMeta {
    const account: AccountMeta = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      unreadCount: 0,
      ...accountData
    };

    const accounts = this.getAccounts();
    accounts.push(account);
    this.store.set('accounts', accounts);

    return account;
  }

  updateAccount(id: string, updates: Partial<AccountMeta>): AccountMeta | null {
    const accounts = this.getAccounts();
    const index = accounts.findIndex(acc => acc.id === id);
    
    if (index === -1) return null;

    accounts[index] = { ...accounts[index], ...updates };
    this.store.set('accounts', accounts);
    
    return accounts[index];
  }

  deleteAccount(id: string): boolean {
    const accounts = this.getAccounts();
    const index = accounts.findIndex(acc => acc.id === id);
    
    if (index === -1) return false;

    accounts.splice(index, 1);
    this.store.set('accounts', accounts);
    
    // Clear session data for this account
    this.clearAccountSession(id);
    
    // If this was the active account, clear it
    if (this.getLastActiveAccountId() === id) {
      this.setLastActiveAccountId(undefined);
    }

    return true;
  }

  getLastActiveAccountId(): string | undefined {
    return this.store.get('lastActiveAccountId');
  }

  setLastActiveAccountId(id: string | undefined): void {
    if (id) {
      this.store.set('lastActiveAccountId', id);
    } else {
      this.store.delete('lastActiveAccountId');
    }
  }

  getWindowState(): AppState['windowState'] {
    return this.store.get('windowState');
  }

  setWindowState(state: AppState['windowState']): void {
    this.store.set('windowState', state);
  }

  getState(): AppState {
    return {
      accounts: this.getAccounts(),
      lastActiveAccountId: this.getLastActiveAccountId(),
      windowState: this.getWindowState()
    };
  }

  private clearAccountSession(accountId: string): void {
    try {
      // Don't clear shared partitions as other accounts might be using them
      const partition = `persist:owa-${accountId}`;
      const ses = session.fromPartition(partition);
      
      // Clear all session data for individual partitions only
      ses.clearStorageData({
        storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
      }).catch(err => {
        console.error(`Failed to clear session data for account ${accountId}:`, err);
      });
      
      // Note: We don't clear shared partitions (like persist:smartds-shared) 
      // as they may be used by other accounts
    } catch (error) {
      console.error(`Error clearing session for account ${accountId}:`, error);
    }
  }

  getTotalUnreadCount(): number {
    return this.getAccounts().reduce((total, account) => {
      return total + (account.unreadCount || 0);
    }, 0);
  }
}

export const accountStore = new AccountStore();