import React, { useState } from 'react';
import { X, ArrowLeft, ChevronRight } from 'lucide-react';
import { AccountMeta } from '../../main/types';
import { useTheme } from './ThemeProvider';
import { useLanguage } from './LanguageProvider';

interface AddAccountModalProps {
  onAdd?: (account: Omit<AccountMeta, 'id' | 'createdAt'>) => void;
  onUpdate?: (account: Omit<AccountMeta, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  initialData?: AccountMeta;
}

interface MailPreset {
  id: string;
  name: string;
  loginUrl: string;
  icon: string;
  defaultColor: string;
}

const mailPresets: MailPreset[] = [
  { id: 'yandex', name: 'Яндекс.Почта', loginUrl: 'https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fmail.yandex.ru', icon: '🔴', defaultColor: 'bg-gradient-to-tr from-rose-500 to-orange-600' },
  { id: 'gmail', name: 'Gmail', loginUrl: 'https://accounts.google.com/ServiceLogin?service=mail', icon: '🟡', defaultColor: 'bg-gradient-to-tr from-blue-500 to-indigo-600' },
  { id: 'mailru', name: 'Mail.ru', loginUrl: 'https://account.mail.ru/login', icon: '🔵', defaultColor: 'bg-gradient-to-tr from-indigo-500 to-blue-600' },
  { id: 'outlook', name: 'Outlook / Hotmail', loginUrl: 'https://outlook.live.com/owa/?nlp=1', icon: 'Ⓜ️', defaultColor: 'bg-gradient-to-tr from-teal-400 to-cyan-600' },
  { id: 'custom', name: 'Exchange / Custom OWA', loginUrl: '', icon: '⚙️', defaultColor: 'bg-gradient-to-tr from-purple-500 to-pink-600' }
];

const AddAccountModal: React.FC<AddAccountModalProps> = ({ onAdd, onUpdate, onClose, initialData }) => {
  const { isDark } = useTheme();
  const { t, language } = useLanguage();
  
  const [selectedPreset, setSelectedPreset] = useState<MailPreset | null>(() => {
    if (initialData) {
      if (initialData.loginUrl.includes('yandex')) return mailPresets.find(p => p.id === 'yandex')!;
      if (initialData.loginUrl.includes('google') || initialData.loginUrl.includes('gmail')) return mailPresets.find(p => p.id === 'gmail')!;
      if (initialData.loginUrl.includes('mail.ru')) return mailPresets.find(p => p.id === 'mailru')!;
      if (initialData.loginUrl.includes('outlook') || initialData.loginUrl.includes('live.com')) return mailPresets.find(p => p.id === 'outlook')!;
      return mailPresets.find(p => p.id === 'custom')!;
    }
    return null;
  });

  const [formData, setFormData] = useState({
    displayName: initialData?.displayName || '',
    loginUrl: initialData?.loginUrl || '',
    username: initialData?.username || '',
    password: initialData?.password || '',
    color: initialData?.color || '',
    sound: initialData?.sound || 'Glass'
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const colors = [
    { name: 'Blue', value: 'bg-gradient-to-tr from-blue-500 to-indigo-600' },
    { name: 'Emerald', value: 'bg-gradient-to-tr from-emerald-400 to-teal-600' },
    { name: 'Purple', value: 'bg-gradient-to-tr from-purple-500 to-pink-600' },
    { name: 'Rose', value: 'bg-gradient-to-tr from-rose-500 to-orange-600' },
    { name: 'Amber', value: 'bg-gradient-to-tr from-amber-400 to-orange-500' },
    { name: 'Indigo', value: 'bg-gradient-to-tr from-indigo-500 to-blue-600' },
    { name: 'Pink', value: 'bg-gradient-to-tr from-pink-500 to-rose-500' },
    { name: 'Teal', value: 'bg-gradient-to-tr from-teal-400 to-cyan-600' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.displayName.trim() || !formData.loginUrl.trim()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const accountData = {
        displayName: formData.displayName.trim(),
        loginUrl: formData.loginUrl.trim(),
        username: formData.username.trim() || undefined,
        password: formData.password.trim() || undefined,
        color: formData.color || undefined,
        sound: formData.sound,
        unreadCount: 0
      };
      
      if (initialData && onUpdate) {
        await onUpdate(accountData);
      } else if (onAdd) {
        await onAdd(accountData);
      }
    } catch (error) {
      console.error('Failed to add account:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-fill display name from email username if display name is empty
      if (field === 'username' && value.includes('@')) {
        const localPart = value.split('@')[0];
        if (!prev.displayName || prev.displayName === prev.username.split('@')[0]) {
          updated.displayName = localPart;
        }
      }
      return updated;
    });
  };

  // 1. Preset Selection Screen
  if (!selectedPreset) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
        <div className={`p-6 max-w-md w-full mx-4 shadow-2xl border ${
          isDark 
            ? 'bg-gray-950/90 border-gray-850 text-gray-200' 
            : 'bg-white/95 border-slate-200 text-slate-800'
        } backdrop-blur-xl rounded-2xl`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              {language === 'ru' ? 'Выберите почтовый сервис' : 'Select Email Service'}
            </h2>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Preset list */}
          <div className="space-y-2">
            {mailPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  setSelectedPreset(preset);
                  setFormData(prev => ({
                    ...prev,
                    loginUrl: preset.loginUrl,
                    color: prev.color || preset.defaultColor
                  }));
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  isDark
                    ? 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900/70 text-gray-200'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50 text-slate-800 shadow-sm'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xl flex-shrink-0">{preset.icon}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{preset.name}</p>
                    <p className="text-xs opacity-65 truncate max-w-[220px]">
                      {preset.loginUrl || (language === 'ru' ? 'Ввод параметров сервера вручную' : 'Custom server setup')}
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="opacity-60" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 2. Details Form Screen
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className={`p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl border ${
        isDark 
          ? 'bg-gray-950/90 border-gray-850 text-gray-200' 
          : 'bg-white/95 border-slate-200 text-slate-800'
      } backdrop-blur-xl rounded-2xl`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            {!initialData && (
              <button
                onClick={() => setSelectedPreset(null)}
                className={`p-1 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title={language === 'ru' ? 'Назад к выбору' : 'Back to selection'}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold">
              {initialData ? t.editOwaAccount : (language === 'ru' ? `Добавить ${selectedPreset.name}` : `Add ${selectedPreset.name}`)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username / Email */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${
              isDark ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {language === 'ru' ? 'Email или имя пользователя' : 'Email or Username'}
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleChange('username', e.target.value)}
              placeholder="user@domain.ru"
              className={`w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-transparent ${
                isDark 
                  ? 'border-gray-800 bg-gray-950/40 text-gray-200 placeholder-gray-500 focus:bg-gray-950/80' 
                  : 'border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:bg-white'
              }`}
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${
              isDark ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {t.password}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder={language === 'ru' ? 'Введите пароль для автозаполнения' : 'Enter password for auto-fill'}
              className={`w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-transparent ${
                isDark
                  ? 'border-gray-800 bg-gray-950/40 text-gray-200 placeholder-gray-500 focus:bg-gray-950/80'
                  : 'border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:bg-white'
              }`}
            />
          </div>

          {/* Display Name */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${
              isDark ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {t.displayName}
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => handleChange('displayName', e.target.value)}
              placeholder={t.displayNamePlaceholder}
              className={`w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-transparent ${
                isDark 
                  ? 'border-gray-800 bg-gray-950/40 text-gray-200 placeholder-gray-500 focus:bg-gray-950/80' 
                  : 'border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:bg-white'
              }`}
              required
            />
          </div>

          {/* Notification Sound */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${
              isDark ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {language === 'ru' ? 'Звук уведомления' : 'Notification Sound'}
            </label>
            <select
              value={formData.sound}
              onChange={(e) => {
                const val = e.target.value;
                handleChange('sound', val);
                if (val !== 'None') {
                  try {
                    window.electronAPI.app.playSystemSound(val);
                  } catch {}
                }
              }}
              className={`w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-transparent ${
                isDark 
                  ? 'border-gray-800 bg-gray-950/40 text-gray-200 focus:bg-gray-950/80' 
                  : 'border-slate-200 bg-slate-50/50 text-slate-900 focus:bg-white'
              }`}
            >
              {[
                { id: 'None', name: 'Без звука (Silent)' },
                { id: 'Glass', name: 'Glass (Стекло)' },
                { id: 'Ping', name: 'Ping (Пинг)' },
                { id: 'Pop', name: 'Pop (Поп)' },
                { id: 'Tink', name: 'Tink (Тинк)' },
                { id: 'Sosumi', name: 'Sosumi (Сосуми)' },
                { id: 'Basso', name: 'Basso (Бассо)' },
                { id: 'Blow', name: 'Blow (Блоу)' },
                { id: 'Bottle', name: 'Bottle (Бутылка)' },
                { id: 'Frog', name: 'Frog (Лягушка)' },
                { id: 'Funk', name: 'Funk (Фанк)' },
                { id: 'Morse', name: 'Morse (Морзе)' },
                { id: 'Hero', name: 'Hero (Герой)' },
                { id: 'Submarine', name: 'Submarine (Субмарина)' },
                { id: 'Purr', name: 'Purr (Мурлыканье)' }
              ].map((opt) => (
                <option key={opt.id} value={opt.id} className={isDark ? 'bg-gray-950 text-gray-200' : 'bg-white text-slate-900'}>
                  {language === 'ru' ? opt.name : opt.id}
                </option>
              ))}
            </select>
          </div>

          {/* OWA URL (Visible for custom preset OR when advanced is toggled) */}
          {(selectedPreset.id === 'custom' || showAdvanced) && (
            <div>
              <label className={`block text-sm font-medium mb-1 ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {t.owaUrl}
              </label>
              <input
                type="url"
                value={formData.loginUrl}
                onChange={(e) => handleChange('loginUrl', e.target.value)}
                placeholder="https://mail.company.com/owa/"
                className={`w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-transparent ${
                  isDark 
                    ? 'border-gray-800 bg-gray-950/40 text-gray-200 placeholder-gray-505 focus:bg-gray-950/80' 
                    : 'border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 focus:bg-white'
                }`}
                required
              />
            </div>
          )}

          {/* Toggle Advanced URL for popular presets */}
          {selectedPreset.id !== 'custom' && (
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-blue-500 hover:text-blue-600 transition-colors font-medium"
            >
              {showAdvanced 
                ? (language === 'ru' ? 'Скрыть дополнительные настройки' : 'Hide advanced settings') 
                : (language === 'ru' ? 'Показать настройки адреса сервера' : 'Show server address settings')}
            </button>
          )}

          {/* Color Selection */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              isDark ? 'text-gray-300' : 'text-gray-700'
            }`}>
              {t.avatarColor}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => handleChange('color', color.value)}
                  className={`w-10 h-10 rounded-lg ${color.value} border-2 transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-95 ${
                    formData.color === color.value
                      ? isDark ? 'border-white scale-110' : 'border-slate-800 scale-110'
                      : isDark ? 'border-gray-800 hover:border-gray-700' : 'border-slate-200 hover:border-slate-350'
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {formData.displayName && (
            <div className={`p-3 rounded-lg border ${
              isDark ? 'bg-gray-950/40 border-gray-800' : 'bg-slate-50/50 border-slate-200/60'
            }`}>
              <p className={`text-xs font-semibold mb-2 ${
                isDark ? 'text-gray-400' : 'text-gray-600'
              }`}>{t.preview}</p>
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium shadow-sm ${
                    formData.color || 'bg-gradient-to-tr from-blue-500 to-indigo-600'
                  }`}
                >
                  {formData.displayName
                    .split(' ')
                    .map(word => word.charAt(0))
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${
                    isDark ? 'text-gray-255' : 'text-gray-900'
                  }`}>{formData.displayName}</div>
                  {formData.username && (
                    <div className={`text-xs ${
                      isDark ? 'text-gray-450' : 'text-gray-500'
                    }`}>{formData.username}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                isDark 
                  ? 'border border-gray-600 hover:bg-gray-700 text-gray-300' 
                  : 'border border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.displayName.trim() || !formData.loginUrl.trim()}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-indigo-500/20 text-sm font-medium"
            >
              {isSubmitting
                ? (initialData ? t.updating : t.adding)
                : (initialData ? t.updateAccount : t.addAccount)
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAccountModal;