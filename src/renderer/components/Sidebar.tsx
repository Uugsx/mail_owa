
import React, { useState } from 'react';
import { Plus, Search, Trash2, MoreVertical, Edit3, Settings } from 'lucide-react';
import { AccountMeta } from '../../main/types';
import { useTheme } from './ThemeProvider';
import { useLanguage } from './LanguageProvider';

interface SidebarProps {
  accounts: AccountMeta[];
  activeAccountId: string | null;
  onSelectAccount: (id: string) => void;
  onAddAccount: () => void;
  onEditAccount: (account: AccountMeta) => void;
  onDeleteAccount: (id: string) => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  accounts,
  activeAccountId,
  onSelectAccount,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onOpenSettings,
}) => {
  const { theme, isDark } = useTheme();
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const filteredAccounts = accounts.filter(account =>
    account.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getAccountInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const getAccountColor = (account: AccountMeta): string => {
    if (account.color) return account.color;
    
    // Generate color based on account name
    const colors = [
      'bg-gradient-to-tr from-blue-500 to-indigo-600',
      'bg-gradient-to-tr from-emerald-400 to-teal-600',
      'bg-gradient-to-tr from-purple-500 to-pink-600',
      'bg-gradient-to-tr from-rose-500 to-orange-600',
      'bg-gradient-to-tr from-amber-400 to-orange-500',
      'bg-gradient-to-tr from-indigo-500 to-blue-600',
      'bg-gradient-to-tr from-pink-500 to-rose-500',
      'bg-gradient-to-tr from-teal-400 to-cyan-600'
    ];
    
    const index = account.displayName.length % colors.length;
    return colors[index];
  };

  const handleDeleteClick = (accountId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setShowDeleteConfirm(accountId);
  };

  const handleEditClick = (account: AccountMeta, event: React.MouseEvent) => {
    event.stopPropagation();
    onEditAccount(account);
  };

  const confirmDelete = (accountId: string) => {
    onDeleteAccount(accountId);
    setShowDeleteConfirm(null);
  };

  return (
    <div className={`w-72 border-r flex flex-col transition-colors ${theme.sidebarBg} ${theme.sidebarBorder}`}>
      {/* Header */}
      <div className={`p-4 border-b transition-colors ${theme.sidebarBorder}`} style={{ paddingTop: '48px', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center justify-between mb-3">
          <h1 className={`text-lg font-semibold ${theme.sidebarText}`} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>{t.accounts}</h1>
          <button
            onClick={onAddAccount}
            className="p-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
            title={t.addAccount}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Plus size={16} />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Search size={14} className={`absolute left-3.5 top-1/2 transform -translate-y-1/2 opacity-60 ${theme.sidebarText}`} />
          <input
            type="text"
            placeholder={t.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg transition-all duration-200 focus:outline-none ${
              isDark 
                ? 'bg-white/5 border border-transparent text-gray-200 placeholder-gray-500 focus:bg-white/10' 
                : 'bg-black/5 border border-transparent text-slate-900 placeholder-slate-500 focus:bg-white focus:shadow-sm focus:border-slate-200/60'
            }`}
          />
        </div>
      </div>

      {/* Account List */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {filteredAccounts.length === 0 ? (
          <div className={`p-4 text-center text-sm ${theme.sidebarTextMuted}`}>
            {searchQuery ? t.noMatches : t.noAccounts}
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {filteredAccounts.map((account) => (
              <div
                key={account.id}
                className={`relative group py-2.5 px-3 rounded-xl cursor-pointer transition-all duration-150 select-none ${
                  activeAccountId === account.id
                    ? `${theme.activeItemBg} ${theme.activeItemText} ${theme.activeItemShadow}`
                    : `${theme.sidebarText} ${theme.hoverBg}`
                }`}
                onClick={() => onSelectAccount(account.id)}
              >
                <div className="flex items-center space-x-3">
                  {/* Avatar */}
                  <div className="relative">
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium shadow-sm ${
                        getAccountColor(account)
                      } ${
                        activeAccountId === account.id ? 'ring-2 ring-white ring-opacity-50' : ''
                      }`}
                    >
                      {getAccountInitials(account.displayName)}
                    </div>
                    {account.unreadCount !== undefined && account.unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] px-1 min-w-[16px] h-4 rounded-full flex items-center justify-center font-medium shadow-sm">
                        {account.unreadCount}
                      </span>
                    )}
                  </div>
                  
                  {/* Account Info */}
                  <div className="flex-1 min-w-0 pr-8 group-hover:pr-12 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-medium truncate ${
                        activeAccountId === account.id
                          ? theme.activeItemText
                          : theme.sidebarText
                      }`}>
                        {account.displayName}
                      </h3>
                    </div>
                    {account.username && (
                      <p className={`text-sm truncate mt-1 ${
                        activeAccountId === account.id 
                          ? 'opacity-85' 
                          : theme.sidebarTextMuted
                      }`}>
                        {account.username}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                  <button
                    onClick={(e) => handleEditClick(account, e)}
                    className={`p-1 rounded transition-colors ${
                      activeAccountId === account.id
                        ? 'hover:bg-white/20 text-white'
                        : isDark
                        ? 'hover:bg-blue-900/50 text-blue-400 hover:text-blue-300'
                        : 'hover:bg-blue-100 text-blue-600 hover:text-blue-700'
                    }`}
                    title={t.editAccount}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(account.id, e)}
                    className={`p-1 rounded transition-colors ${
                      activeAccountId === account.id
                        ? 'hover:bg-white/20 text-white'
                        : isDark
                        ? 'hover:bg-red-900/50 text-red-400 hover:text-red-300'
                        : 'hover:bg-red-100 text-red-600 hover:text-red-700'
                    }`}
                    title={t.deleteAccount}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Settings Panel */}
      <div className={`p-3 border-t transition-colors ${theme.sidebarBorder}`}>
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center justify-center space-x-2 py-1.5 px-4 rounded-xl transition-all duration-150 text-xs font-medium ${
            isDark
              ? 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
              : 'bg-black/5 text-slate-700 hover:bg-black/8 hover:text-slate-900'
          }`}
        >
          <Settings size={14} />
          <span>{language === 'ru' ? 'Настройки' : 'Settings'}</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-sm mx-4 shadow-elegant-lg ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h3 className={`text-lg font-semibold mb-2 ${
              isDark ? 'text-gray-200' : 'text-gray-900'
            }`}>{t.deleteAccountConfirm}</h3>
            <p className={`mb-4 ${
              isDark ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {t.deleteAccountMessage}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  isDark 
                    ? 'border border-gray-600 hover:bg-gray-700 text-gray-300' 
                    : 'border border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => confirmDelete(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-colors"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;