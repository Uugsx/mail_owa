import React, { useState } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import { AccountMeta } from '../../main/types';
import { useTheme } from './ThemeProvider';
import { useLanguage } from './LanguageProvider';

interface TopbarProps {
  activeAccount?: AccountMeta;
  onRefresh: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ activeAccount, onRefresh }) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const handleBack = () => {
    try {
      if (activeAccount) {
        const webview = document.querySelector(`webview[data-account-id="${activeAccount.id}"]`) as Electron.WebviewTag;
        if (webview && webview.canGoBack && webview.canGoBack()) {
          webview.goBack();
        }
      } else {
        const webview = document.querySelector('webview') as Electron.WebviewTag;
        if (webview && webview.canGoBack && webview.canGoBack()) {
          webview.goBack();
        }
      }
    } catch (error) {
      console.error('Failed to navigate back:', error);
    }
  };

  const handleForward = () => {
    try {
      if (activeAccount) {
        const webview = document.querySelector(`webview[data-account-id="${activeAccount.id}"]`) as Electron.WebviewTag;
        if (webview && webview.canGoForward && webview.canGoForward()) {
          webview.goForward();
        }
      } else {
        const webview = document.querySelector('webview') as Electron.WebviewTag;
        if (webview && webview.canGoForward && webview.canGoForward()) {
          webview.goForward();
        }
      }
    } catch (error) {
      console.error('Failed to navigate forward:', error);
    }
  };

  const handleRefresh = () => {
    if (!activeAccount) return;
    
    try {
      setIsRefreshing(true);
      onRefresh();
      
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to refresh:', error);
      setIsRefreshing(false);
    }
  };

  const getAccountColor = (account: AccountMeta): string => {
    if (account.color) return account.color;
    
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

  return (
    <div 
      className={`h-12 flex items-center transition-colors border-b ${theme.topbarBg} ${theme.topbarBorder} ${theme.topbarText} backdrop-blur-md`} 
      style={{ paddingLeft: '0px', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left draggable area */}
      <div className="w-2" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}></div>
      
      {/* Navigation buttons - left side */}
      <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleBack}
          className={`p-1.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ${
            isDark 
              ? 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-400 hover:text-white border border-gray-800/50' 
              : 'hover:bg-slate-100 bg-slate-50/50 text-slate-600 hover:text-slate-800 border border-slate-200/60'
          }`}
          title={t.back}
          disabled={!activeAccount}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={handleForward}
          className={`p-1.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ${
            isDark 
              ? 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-400 hover:text-white border border-gray-800/50' 
              : 'hover:bg-slate-100 bg-slate-50/50 text-slate-600 hover:text-slate-800 border border-slate-200/60'
          }`}
          title={t.forward}
          disabled={!activeAccount}
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={handleRefresh}
          className={`p-1.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 relative ${
            isRefreshing ? 'animate-spin' : 'hover:rotate-180'
          } ${
            isDark 
              ? 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-400 hover:text-white border border-gray-800/50' 
              : 'hover:bg-slate-100 bg-slate-50/50 text-slate-600 hover:text-slate-800 border border-slate-200/60'
          }`}
          title={t.refresh}
          disabled={!activeAccount || isRefreshing}
        >
          <RefreshCw size={14} className="transition-transform duration-300" />
        </button>
      </div>

      {/* Account info - center */}
      {activeAccount && (
        <div className="flex-1 flex items-center justify-center space-x-3">
          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-sm ${getAccountColor(activeAccount)}`}>
            {activeAccount.displayName
              .split(' ')
              .map(word => word.charAt(0))
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <span className={`text-sm font-medium truncate ${theme.topbarText}`}>
            {activeAccount.displayName}
          </span>
          {activeAccount.unreadCount !== undefined && activeAccount.unreadCount > 0 && (
            <span className="bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full font-medium shadow-sm">
              {activeAccount.unreadCount}
            </span>
          )}
        </div>
      )}
      
      {/* Settings buttons - right side */}
      <div className="flex items-center space-x-1 pr-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Theme toggle button (Sun/Moon only, toggles classic light/dark) */}
        <button
          onClick={toggleTheme}
          className={`p-1.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ${
            isDark 
              ? 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-400 hover:text-white border border-gray-800/50' 
              : 'hover:bg-slate-100 bg-slate-50/50 text-slate-600 hover:text-slate-800 border border-slate-200/60'
          }`}
          title={isDark ? t.switchToLightMode : t.switchToDarkMode}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        
        {/* Language toggle button */}
        <button
          onClick={() => setLanguage(language === 'ru' ? 'en' : 'ru')}
          className={`px-2 py-1.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 text-xs font-medium ${
            isDark 
              ? 'hover:bg-gray-800/80 bg-gray-900/50 text-gray-400 hover:text-white border border-gray-800/50' 
              : 'hover:bg-slate-100 bg-slate-50/50 text-slate-600 hover:text-slate-800 border border-slate-200/60'
          }`}
          title={language === 'ru' ? 'Переключить на английский' : 'Switch to Russian'}
        >
          {language === 'ru' ? 'EN' : 'RU'}
        </button>
      </div>
      
      {/* Right draggable area */}
      <div className="w-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}></div>
    </div>
  );
};

export default Topbar;