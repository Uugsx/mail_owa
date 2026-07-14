import React, { useState, useEffect } from 'react';
import { AccountMeta } from '../main/types';
import Sidebar from './components/Sidebar';
import WebviewPane from './components/WebviewPane';
import AddAccountModal from './components/AddAccountModal';
import Topbar from './components/Topbar';
import { ThemeProvider, useTheme } from './components/ThemeProvider';

import { LanguageProvider, useLanguage } from './components/LanguageProvider';
import SettingsModal from './components/SettingsModal';

const AppContent: React.FC = () => {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<AccountMeta[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load accounts and state on mount
  useEffect(() => {
    loadAccounts();
    loadAppState();
  }, []);

  // Listen for events from main process
  useEffect(() => {
    const handleSwitchAccount = (event: CustomEvent) => {
      setActiveAccountId(event.detail);
    };

    const handleShowAddAccount = () => {
      setShowAddModal(true);
    };

    window.addEventListener('switch-account', handleSwitchAccount as EventListener);
    window.addEventListener('show-add-account', handleShowAddAccount);

    return () => {
      window.removeEventListener('switch-account', handleSwitchAccount as EventListener);
      window.removeEventListener('show-add-account', handleShowAddAccount);
    };
  }, []);

  // Set up webview event listeners
  useEffect(() => {
    if (!window.electronAPI?.webview) return;

    const unsubscribeUnread = window.electronAPI.webview.onUnreadCount?.(
      (accountId: string, count: number) => {
        setAccounts(prev => 
          prev.map(acc => 
            acc.id === accountId ? { ...acc, unreadCount: count } : acc
          )
        );
      }
    );

    const unsubscribeTitle = window.electronAPI.webview.onTitleChanged?.(
      (accountId: string, title: string) => {
        console.log(`Account ${accountId} title changed:`, title);
      }
    );

    return () => {
      try { (unsubscribeUnread as any)?.(); } catch {}
      try { (unsubscribeTitle as any)?.(); } catch {}
    };
  }, []);

  // Handle webview messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'webview-message') {
        console.log('📥 Received webview message:', event.data);
        
        // Get accountId from the message data
        let accountId = event.data.accountId;
        
        const { channel, data } = event.data;
        
        if (channel === 'unread-count') {
          // If accountId is not in the message data, we can't process this message
          if (!accountId) {
            console.warn('Received unread-count message without accountId');
            return;
          }
          
          const count = data || 0;
          console.log(`📊 Unread count for account ${accountId}: ${count}`);
          
          setAccounts(prev => {
            const currentAccount = prev.find(acc => acc.id === accountId);
            if (currentAccount) {
              const previousCount = currentAccount.unreadCount || 0;
              // If the count has increased, trigger macOS notification banner and custom sound
              if (count > previousCount) {
                const accountName = currentAccount.displayName || currentAccount.username;
                const diff = count - previousCount;
                const title = `Новое письмо (${accountName})`;
                const body = diff === 1 ? 'Получено новое входящее письмо' : `Получено ${diff} новых писем`;
                
                try {
                  const sound = currentAccount.sound || 'Glass';
                  
                  // 1. Play the custom mailbox sound natively in the background using afplay (100% reliable)
                  if (sound !== 'None') {
                    window.electronAPI.app.playSystemSound(sound);
                  }
                  
                  // 2. Trigger native macOS notification banner (set to silent to avoid double sound or OS conflicts)
                  window.electronAPI.app.showNotification({
                    title: title,
                    body: body,
                    silent: true // Custom sound is already played via afplay
                  });
                } catch (e) {
                  console.error('Failed to trigger native notification:', e);
                }
              }
            }
            return prev.map(acc => 
              acc.id === accountId ? { ...acc, unreadCount: count } : acc
            );
          });
        }
        else if (channel === 'unread-count-test') {
          // Handle test messages
          console.log('🧪 Test message received:', data);
        }
        else if (channel === 'title-changed') {
          console.log(`🏷️ Title changed for account:`, data);
        }
        else if (channel === 'notification') {
          console.log(`🔔 Notification for account:`, data);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadAccounts = async () => {
    try {
      const accountList = await window.electronAPI.accounts.get();
      // Ensure all accounts have an unreadCount property initialized to 0
      const accountsWithUnreadCount = accountList.map(account => ({
        ...account,
        unreadCount: account.unreadCount ?? 0
      }));
      setAccounts(accountsWithUnreadCount);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadAppState = async () => {
    try {
      const state = await window.electronAPI.app.getState();
      if (state.lastActiveAccountId && state.accounts.length > 0) {
        setActiveAccountId(state.lastActiveAccountId);
      } else if (state.accounts.length > 0) {
        setActiveAccountId(state.accounts[0].id);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load app state:', error);
      setIsLoading(false);
    }
  };

  const handleAddAccount = async (accountData: Omit<AccountMeta, 'id' | 'createdAt'>) => {
    try {
      const newAccount = await window.electronAPI.accounts.add(accountData);
      // Ensure unreadCount is initialized
      const accountWithUnreadCount = {
        ...newAccount,
        unreadCount: newAccount.unreadCount ?? 0
      };
      setAccounts(prev => [...prev, accountWithUnreadCount]);
      setActiveAccountId(newAccount.id);
      setShowAddModal(false);
    } catch (error) {
      console.error('Failed to add account:', error);
    }
  };

  const handleEditAccount = (account: AccountMeta) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleUpdateAccount = async (accountData: Omit<AccountMeta, 'id' | 'createdAt'>) => {
    if (!editingAccount) return;
    
    try {
      await window.electronAPI.accounts.update(editingAccount.id, accountData);
      setAccounts(prev => prev.map(acc => 
        acc.id === editingAccount.id 
          ? { ...acc, ...accountData, unreadCount: acc.unreadCount ?? 0 }
          : acc
      ));
      setShowEditModal(false);
      setEditingAccount(null);
    } catch (error) {
      console.error('Failed to update account:', error);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      console.log(`🗑️ Attempting to delete account: ${id}`);
      const result = await window.electronAPI.accounts.delete(id);
      console.log(`✅ Delete result:`, result);
      
      setAccounts(prev => prev.filter(acc => acc.id !== id));
      
      if (activeAccountId === id) {
        const remainingAccounts = accounts.filter(acc => acc.id !== id);
        setActiveAccountId(remainingAccounts.length > 0 ? remainingAccounts[0].id : null);
      }
      
      console.log(`✅ Account ${id} deleted successfully from UI`);
    } catch (error) {
      console.error('❌ Failed to delete account:', error);
    }
  };

  const handleSelectAccount = async (id: string) => {
    setActiveAccountId(id);
    try {
      await window.electronAPI.accounts.setActive(id);
    } catch (error) {
      console.error('Failed to set active account:', error);
    }
  };

  const handleRefreshAccount = () => {
    // Trigger refresh of active webview
    const event = new CustomEvent('refresh-webview', { detail: activeAccountId });
    window.dispatchEvent(event);
  };

  // Listen for refresh command from the application menu
  useEffect(() => {
    const handleMenuRefresh = () => {
      handleRefreshAccount();
    };
    window.addEventListener('menu:refresh-account', handleMenuRefresh);
    return () => {
      window.removeEventListener('menu:refresh-account', handleMenuRefresh);
    };
  }, [activeAccountId]);

  const activeAccount = accounts.find(acc => acc.id === activeAccountId);

  if (isLoading) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${
        isDark ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <div className={`${
          isDark ? 'text-gray-300' : 'text-gray-600'
        }`}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full flex flex-col transition-colors ${
      isDark ? 'bg-gray-900' : 'bg-white'
    }`}>
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSelectAccount={handleSelectAccount}
          onAddAccount={() => setShowAddModal(true)}
          onEditAccount={handleEditAccount}
          onDeleteAccount={handleDeleteAccount}
          onOpenSettings={() => setShowSettingsModal(true)}
        />
        
        {/* Content area with topbar */}
        <div className="flex-1 flex flex-col">
          {/* Top bar */}
          <Topbar 
            activeAccount={activeAccount}
            onRefresh={handleRefreshAccount}
          />
          
          {/* Webview area */}
          <div className="flex-1 relative" style={{ marginTop: '8px' }}>
            {accounts.map((account) => (
              <div
                key={account.id}
                className="absolute inset-0"
                style={activeAccountId === account.id
                  ? { zIndex: 10 }
                  : { zIndex: 0, width: '0px', height: '0px', opacity: 0, overflow: 'hidden', pointerEvents: 'none' }
                }
              >
                <WebviewPane account={account} isActive={activeAccountId === account.id} />
              </div>
            ))}
            
            {accounts.length === 0 && (
              <div className={`flex-1 flex items-center justify-center ${
                isDark ? 'bg-gray-800' : 'bg-gray-50'
              }`}>
                <div className="text-center">
                  <div className="text-2xl mb-4">📧</div>
                  <h2 className={`text-xl font-semibold mb-2 ${
                    isDark ? 'text-gray-200' : 'text-gray-700'
                  }`}>
                    {t.welcomeTitle}
                  </h2>
                  <p className={`mb-4 ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {t.welcomeDescription}
                  </p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-elegant"
                  >
                    {t.addAccount}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Add Account Modal */}
      {showAddModal && (
        <AddAccountModal
          onAdd={handleAddAccount}
          onClose={() => setShowAddModal(false)}
        />
      )}
      
      {/* Edit Account Modal */}
      {showEditModal && editingAccount && (
        <AddAccountModal
          onUpdate={handleUpdateAccount}
          onClose={() => {
            setShowEditModal(false);
            setEditingAccount(null);
          }}
          initialData={editingAccount}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </LanguageProvider>
  );
};

export default App;