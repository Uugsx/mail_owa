import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'ru';

interface Translations {
  // Sidebar
  accounts: string;
  search: string;
  addAccount: string;
  editAccount: string;
  deleteAccount: string;
  noAccounts: string;
  noMatches: string;
  deleteAccountConfirm: string;
  deleteAccountMessage: string;
  cancel: string;
  delete: string;
  
  // Add Account Modal
  addOwaAccount: string;
  editOwaAccount: string;
  displayName: string;
  displayNamePlaceholder: string;
  owaUrl: string;
  owaUrlDescription: string;
  smartdsInfo: string;
  companyInfo: string;
  username: string;
  usernameOptional: string;
  usernamePlaceholder: string;
  usernameDescription: string;
  avatarColor: string;
  preview: string;
  adding: string;
  updateAccount: string;
  updating: string;
  password: string;
  passwordDescription: string;

  // Topbar
  back: string;
  forward: string;
  refresh: string;
  switchToLightMode: string;
  switchToDarkMode: string;
  openInBrowser: string;
  
  // Welcome screen
  welcomeTitle: string;
  welcomeDescription: string;
  
  // Settings
  language: string;
  english: string;
  russian: string;
}

const translations: Record<Language, Translations> = {
  en: {
    // Sidebar
    accounts: 'Accounts',
    search: 'Search...',
    addAccount: 'Add Account',
    editAccount: 'Edit Account',
    deleteAccount: 'Delete Account',
    noAccounts: 'No accounts',
    noMatches: 'No matches',
    deleteAccountConfirm: 'Delete Account',
    deleteAccountMessage: 'Are you sure you want to delete this account? This will remove all stored session data.',
    cancel: 'Cancel',
    delete: 'Delete',
    
    // Add Account Modal
    addOwaAccount: 'Add Account',
    editOwaAccount: 'Edit Account',
    displayName: 'Display Name *',
    displayNamePlaceholder: 'e.g., Work Account',
    owaUrl: 'Login Page URL *',
    owaUrlDescription: 'The URL to the mail login page',
    smartdsInfo: 'ℹ️ SmartDS accounts will share authentication sessions for seamless access to shared mailboxes',
    companyInfo: 'ℹ️ Company accounts will share authentication sessions for seamless access to shared mailboxes',
    username: 'Username',
    usernameOptional: 'Username (Optional)',
    usernamePlaceholder: 'e.g., john.doe@company.com',
    usernameDescription: 'For display purposes only. Passwords are not stored.',
    avatarColor: 'Avatar Color',
    preview: 'Preview:',
    adding: 'Adding...',
    updateAccount: 'Update Account',
    updating: 'Updating...',
    password: 'Password (Optional)',
    passwordDescription: 'Password will be saved securely and used for automatic login',
    
    // Topbar
    back: 'Back',
    forward: 'Forward',
    refresh: 'Refresh',
    switchToLightMode: 'Switch to light mode',
    switchToDarkMode: 'Switch to dark mode',
    openInBrowser: 'Open in external browser',
    
    // Welcome screen
    welcomeTitle: 'Welcome to OWA Accounts',
    welcomeDescription: 'Add your first OWA account to get started',
    
    // Settings
    language: 'Language',
    english: 'English',
    russian: 'Русский',
  },
  ru: {
    // Sidebar
    accounts: 'Аккаунты',
    search: 'Поиск...',
    addAccount: 'Добавить аккаунт',
    editAccount: 'Редактировать аккаунт',
    deleteAccount: 'Удалить аккаунт',
    noAccounts: 'Нет аккаунтов',
    noMatches: 'Нет совпадений',
    deleteAccountConfirm: 'Удаление аккаунта',
    deleteAccountMessage: 'Вы уверены, что хотите удалить этот аккаунт? Это удалит все сохраненные данные сессии.',
    cancel: 'Отмена',
    delete: 'Удалить',
    
    // Add Account Modal
    addOwaAccount: 'Добавить аккаунт',
    editOwaAccount: 'Редактировать аккаунт',
    displayName: 'Отображаемое имя *',
    displayNamePlaceholder: 'напр., Рабочий аккаунт',
    owaUrl: 'Адрес страницы входа *',
    owaUrlDescription: 'URL-адрес страницы авторизации почты',
    smartdsInfo: 'ℹ️ Аккаунты SmartDS будут использовать общие сессии для беспрепятственного доступа к общим почтовым ящикам',
    companyInfo: 'ℹ️ Аккаунты одной компании будут использовать общие сессии для беспрепятственного доступа к общим почтовым ящикам',
    username: 'Имя пользователя',
    usernameOptional: 'Имя пользователя (необязательно)',
    usernamePlaceholder: 'напр., john.doe@company.com',
    usernameDescription: 'Только для отображения. Пароли не сохраняются.',
    avatarColor: 'Цвет аватара',
    preview: 'Предпросмотр:',
    adding: 'Добавление...',
    updateAccount: 'Обновить аккаунт',
    updating: 'Обновление...',
    password: 'Пароль (необязательно)',
    passwordDescription: 'Пароль будет сохранен в защищенном виде и использован для автоматического входа',
    
    // Topbar
    back: 'Назад',
    forward: 'Вперед',
    refresh: 'Обновить',
    switchToLightMode: 'Переключить на светлую тему',
    switchToDarkMode: 'Переключить на темную тему',
    openInBrowser: 'Открыть во внешнем браузере',
    
    // Welcome screen
    welcomeTitle: 'Добро пожаловать в OWA Аккаунты',
    welcomeDescription: 'Добавьте ваш первый OWA аккаунт для начала работы',
    
    // Settings
    language: 'Язык',
    english: 'English',
    russian: 'Русский',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('ru'); // Default to Russian

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};