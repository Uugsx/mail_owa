import React from 'react';
import { X, Check } from 'lucide-react';
import { useTheme, themes } from './ThemeProvider';
import { useLanguage } from './LanguageProvider';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { theme, setTheme, isDark } = useTheme();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl transition-all border ${
          isDark 
            ? 'bg-gray-950/95 border-gray-800 text-gray-100' 
            : 'bg-white/95 border-slate-200 text-slate-800'
        } backdrop-blur-md`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-850/20 mb-5">
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <span>⚙️</span>
            <span>{language === 'ru' ? 'Настройки приложения' : 'App Settings'}</span>
          </h2>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-gray-500/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6">
          {/* Language selection */}
          <div>
            <h3 className="text-sm font-semibold mb-2 opacity-80">
              {language === 'ru' ? 'Язык интерфейса' : 'Interface Language'}
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setLanguage('ru')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
                  language === 'ru'
                    ? 'border-blue-600 bg-blue-600/10 text-blue-600'
                    : 'border-transparent bg-gray-500/10 opacity-70 hover:opacity-100'
                }`}
              >
                Русский
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
                  language === 'en'
                    ? 'border-blue-600 bg-blue-600/10 text-blue-600'
                    : 'border-transparent bg-gray-500/10 opacity-70 hover:opacity-100'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Theme selection */}
          <div>
            <h3 className="text-sm font-semibold mb-3 opacity-80">
              {language === 'ru' ? 'Тема оформления' : 'Interface Theme'}
            </h3>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-left transition-all text-xs font-medium border ${
                    theme.id === t.id
                      ? isDark
                        ? 'border-indigo-500 bg-indigo-950/40 text-indigo-200 font-semibold'
                        : 'border-blue-600 bg-blue-50/60 text-blue-800 font-semibold'
                      : isDark
                      ? 'border-gray-800 bg-gray-900/20 hover:border-gray-700 hover:bg-gray-900/60'
                      : 'border-slate-200 bg-slate-50/20 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex-shrink-0 shadow-inner ${t.preview}`} />
                    <span className="truncate">{language === 'ru' ? t.name : t.nameEn}</span>
                  </div>
                  {theme.id === t.id && (
                    <Check size={14} className="text-blue-500 flex-shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-850/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-elegant hover:shadow-elegant-lg transition-all"
          >
            {language === 'ru' ? 'Готово' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
