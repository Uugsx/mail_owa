import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface AppTheme {
  id: string;
  name: string;
  nameEn: string;
  isDark: boolean;
  preview: string;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarHeaderBorder: string;
  sidebarText: string;
  sidebarTextMuted: string;
  activeItemBg: string;
  activeItemText: string;
  activeItemShadow: string;
  topbarBg: string;
  topbarText: string;
  topbarBorder: string;
  hoverBg: string;
}

export const themes: AppTheme[] = [
  {
    id: 'system',
    name: 'Системная',
    nameEn: 'System',
    isDark: false,
    preview: 'bg-gradient-to-r from-slate-100 to-slate-900 border border-slate-405',
    sidebarBg: '',
    sidebarBorder: '',
    sidebarHeaderBorder: '',
    sidebarText: '',
    sidebarTextMuted: '',
    activeItemBg: '',
    activeItemText: '',
    activeItemShadow: '',
    topbarBg: '',
    topbarText: '',
    topbarBorder: '',
    hoverBg: ''
  },
  {
    id: 'classic-light',
    name: 'Классическая светлая',
    nameEn: 'Classic Light',
    isDark: false,
    preview: 'bg-[#F3F3F5] border border-[#E5E5E7]',
    sidebarBg: 'bg-[#F3F3F5]',
    sidebarBorder: 'border-[#E5E5E7]',
    sidebarHeaderBorder: 'border-[#E5E5E7]',
    sidebarText: 'text-slate-800',
    sidebarTextMuted: 'text-slate-500',
    activeItemBg: 'bg-[#007AFF]',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-sm',
    topbarBg: 'bg-white',
    topbarText: 'text-slate-800',
    topbarBorder: 'border-[#E5E5E7]',
    hoverBg: 'hover:bg-black/5'
  },
  {
    id: 'classic-dark',
    name: 'Классическая тёмная',
    nameEn: 'Classic Dark',
    isDark: true,
    preview: 'bg-[#1E1E1E] border border-[#2C2C2E]',
    sidebarBg: 'bg-[#1E1E1E]',
    sidebarBorder: 'border-[#2C2C2E]',
    sidebarHeaderBorder: 'border-[#2C2C2E]',
    sidebarText: 'text-gray-200',
    sidebarTextMuted: 'text-gray-400',
    activeItemBg: 'bg-[#007AFF]',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-sm',
    topbarBg: 'bg-[#1C1C1E]',
    topbarText: 'text-gray-200',
    topbarBorder: 'border-[#2C2C2E]',
    hoverBg: 'hover:bg-white/5'
  },
  {
    id: 'nordic-frost',
    name: 'Северный мороз',
    nameEn: 'Nordic Frost',
    isDark: true,
    preview: 'bg-slate-800 border border-cyan-600',
    sidebarBg: 'bg-gradient-to-b from-slate-900 via-slate-850 to-slate-900',
    sidebarBorder: 'border-cyan-950/80',
    sidebarHeaderBorder: 'border-cyan-900',
    sidebarText: 'text-slate-200',
    sidebarTextMuted: 'text-slate-400',
    activeItemBg: 'bg-gradient-to-r from-cyan-600 to-teal-600',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-cyan-500/25',
    topbarBg: 'bg-slate-900',
    topbarText: 'text-slate-200',
    topbarBorder: 'border-cyan-950/80',
    hoverBg: 'hover:bg-slate-800/60'
  },
  {
    id: 'emerald-forest',
    name: 'Изумрудный лес',
    nameEn: 'Emerald Forest',
    isDark: true,
    preview: 'bg-emerald-950 border border-emerald-600',
    sidebarBg: 'bg-gradient-to-b from-emerald-950 via-green-950 to-emerald-950',
    sidebarBorder: 'border-emerald-900/60',
    sidebarHeaderBorder: 'border-emerald-800',
    sidebarText: 'text-emerald-100',
    sidebarTextMuted: 'text-emerald-450',
    activeItemBg: 'bg-gradient-to-r from-emerald-600 to-teal-600',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-emerald-500/20',
    topbarBg: 'bg-emerald-950',
    topbarText: 'text-emerald-100',
    topbarBorder: 'border-emerald-900/60',
    hoverBg: 'hover:bg-emerald-900/40'
  },
  {
    id: 'sunset-glow',
    name: 'Закатный блеск',
    nameEn: 'Sunset Glow',
    isDark: true,
    preview: 'bg-gradient-to-r from-indigo-900 to-rose-900',
    sidebarBg: 'bg-gradient-to-b from-indigo-950 via-purple-950 to-rose-950/30',
    sidebarBorder: 'border-purple-900/40',
    sidebarHeaderBorder: 'border-purple-800',
    sidebarText: 'text-purple-100',
    sidebarTextMuted: 'text-purple-300',
    activeItemBg: 'bg-gradient-to-r from-rose-500 to-orange-500',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-rose-500/25',
    topbarBg: 'bg-indigo-950',
    topbarText: 'text-purple-100',
    topbarBorder: 'border-purple-900/40',
    hoverBg: 'hover:bg-purple-900/30'
  },
  {
    id: 'cyberpunk-neon',
    name: 'Киберпанк Неон',
    nameEn: 'Cyberpunk Neon',
    isDark: true,
    preview: 'bg-fuchsia-950 border border-pink-500',
    sidebarBg: 'bg-gradient-to-b from-fuchsia-950 via-purple-950 to-black',
    sidebarBorder: 'border-pink-500/30',
    sidebarHeaderBorder: 'border-pink-500/50',
    sidebarText: 'text-pink-100',
    sidebarTextMuted: 'text-fuchsia-400',
    activeItemBg: 'bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-pink-500/30',
    topbarBg: 'bg-fuchsia-950',
    topbarText: 'text-pink-100',
    topbarBorder: 'border-pink-500/30',
    hoverBg: 'hover:bg-pink-500/10'
  },
  {
    id: 'milky-way',
    name: 'Млечный путь',
    nameEn: 'Milky Way',
    isDark: true,
    preview: 'bg-violet-950 border border-violet-750',
    sidebarBg: 'bg-gradient-to-b from-slate-950 via-violet-950 to-slate-950',
    sidebarBorder: 'border-violet-900/40',
    sidebarHeaderBorder: 'border-violet-800',
    sidebarText: 'text-violet-100',
    sidebarTextMuted: 'text-violet-400',
    activeItemBg: 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-700',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-violet-500/20',
    topbarBg: 'bg-slate-950',
    topbarText: 'text-violet-100',
    topbarBorder: 'border-violet-900/40',
    hoverBg: 'hover:bg-violet-900/30'
  },
  {
    id: 'retro-terminal',
    name: 'Ретро Терминал',
    nameEn: 'Retro Terminal',
    isDark: true,
    preview: 'bg-black border border-green-500',
    sidebarBg: 'bg-black',
    sidebarBorder: 'border-green-900/60',
    sidebarHeaderBorder: 'border-green-800',
    sidebarText: 'text-green-500 font-mono',
    sidebarTextMuted: 'text-green-750 font-mono',
    activeItemBg: 'border border-green-500 bg-green-950/50',
    activeItemText: 'text-green-400 font-mono',
    activeItemShadow: 'shadow-green-500/10',
    topbarBg: 'bg-black',
    topbarText: 'text-green-500 font-mono',
    topbarBorder: 'border-green-900/60',
    hoverBg: 'hover:bg-green-950/30'
  },
  {
    id: 'sakura-blossom',
    name: 'Цветок сакуры',
    nameEn: 'Sakura Blossom',
    isDark: false,
    preview: 'bg-pink-100 border border-pink-300',
    sidebarBg: 'bg-gradient-to-b from-pink-50 via-rose-50 to-pink-100',
    sidebarBorder: 'border-pink-200',
    sidebarHeaderBorder: 'border-pink-250',
    sidebarText: 'text-rose-900',
    sidebarTextMuted: 'text-rose-500',
    activeItemBg: 'bg-gradient-to-r from-rose-450 to-pink-500',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-rose-400/20',
    topbarBg: 'bg-pink-50',
    topbarText: 'text-rose-900',
    topbarBorder: 'border-pink-200',
    hoverBg: 'hover:bg-rose-100/50'
  },
  {
    id: 'ocean-depth',
    name: 'Морская глубина',
    nameEn: 'Ocean Depth',
    isDark: true,
    preview: 'bg-sky-950 border border-sky-600',
    sidebarBg: 'bg-gradient-to-b from-sky-950 via-slate-900 to-sky-950',
    sidebarBorder: 'border-sky-900/50',
    sidebarHeaderBorder: 'border-sky-800',
    sidebarText: 'text-sky-100',
    sidebarTextMuted: 'text-sky-400',
    activeItemBg: 'bg-gradient-to-r from-sky-500 to-cyan-500',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-sky-500/25',
    topbarBg: 'bg-sky-950',
    topbarText: 'text-sky-100',
    topbarBorder: 'border-sky-900/50',
    hoverBg: 'hover:bg-sky-900/30'
  },
  {
    id: 'warm-sand',
    name: 'Теплый песок',
    nameEn: 'Warm Sand',
    isDark: false,
    preview: 'bg-amber-100 border border-amber-300',
    sidebarBg: 'bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100/85',
    sidebarBorder: 'border-amber-200/60',
    sidebarHeaderBorder: 'border-amber-300/60',
    sidebarText: 'text-amber-900',
    sidebarTextMuted: 'text-amber-600',
    activeItemBg: 'bg-gradient-to-r from-amber-600 to-orange-600',
    activeItemText: 'text-white',
    activeItemShadow: 'shadow-amber-600/20',
    topbarBg: 'bg-amber-50',
    topbarText: 'text-amber-900',
    topbarBorder: 'border-amber-200/60',
    hoverBg: 'hover:bg-amber-100/40'
  }
];

interface ThemeContextType {
  isDark: boolean;
  theme: AppTheme;
  setTheme: (themeId: string) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isSystemDark, setIsSystemDark] = useState<boolean>(() => {
    try {
      return window.electronAPI?.app?.getInitialThemeSync?.() || false;
    } catch {
      return false;
    }
  });

  const [themeId, setThemeId] = useState<string>(() => {
    // One-time migration: reset from previous default auto-saved 'classic-light' to 'system'
    const migrated = localStorage.getItem('theme-migrated-to-system-v2');
    if (!migrated) {
      localStorage.setItem('theme-migrated-to-system-v2', 'true');
      localStorage.setItem('selected-theme-id', 'system');
      return 'system';
    }

    return localStorage.getItem('selected-theme-id') || 'system';
  });

  const activeThemeRaw = themes.find(t => t.id === themeId) || themes[0];
  
  // Resolve system theme dynamically
  const activeTheme = themeId === 'system'
    ? {
        ...activeThemeRaw,
        isDark: isSystemDark,
        sidebarBg: isSystemDark ? 'bg-[#1E1E1E]' : 'bg-[#F3F3F5]',
        sidebarBorder: isSystemDark ? 'border-[#2C2C2E]' : 'border-[#E5E5E7]',
        sidebarHeaderBorder: isSystemDark ? 'border-[#2C2C2E]' : 'border-[#E5E5E7]',
        sidebarText: isSystemDark ? 'text-gray-200' : 'text-slate-800',
        sidebarTextMuted: isSystemDark ? 'text-gray-400' : 'text-slate-500',
        activeItemBg: 'bg-[#007AFF]',
        activeItemText: 'text-white',
        activeItemShadow: 'shadow-sm',
        topbarBg: isSystemDark ? 'bg-[#1C1C1E]' : 'bg-white',
        topbarText: isSystemDark ? 'text-gray-200' : 'text-slate-800',
        topbarBorder: isSystemDark ? 'border-[#2C2C2E]' : 'border-[#E5E5E7]',
        hoverBg: isSystemDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
      }
    : activeThemeRaw;

  useEffect(() => {
    if (activeTheme.isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('selected-theme-id', themeId);
  }, [activeTheme, themeId]);

  useEffect(() => {
    const handleThemeChange = (event: CustomEvent) => {
      const isDarkMode = event.detail;
      setIsSystemDark(isDarkMode);
    };

    window.addEventListener('theme-changed', handleThemeChange as EventListener);

    return () => {
      window.removeEventListener('theme-changed', handleThemeChange as EventListener);
    };
  }, []);

  const setTheme = (id: string) => {
    setThemeId(id);
  };

  const toggleTheme = () => {
    setThemeId(prev => {
      // Toggle toggles between classic light and classic dark
      const active = prev === 'system' ? (isSystemDark ? 'classic-dark' : 'classic-light') : prev;
      const isCurrentlyDark = active === 'classic-dark' || (themes.find(t => t.id === active)?.isDark ?? false);
      return isCurrentlyDark ? 'classic-light' : 'classic-dark';
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark: activeTheme.isDark, theme: activeTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};