import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

type ThemeMode = 'light' | 'dark' | 'system';

// ==================== 공통 테마 색상 시스템 ====================
// 모든 스크린에서 공유하는 UI 색상 (EventColorManager와는 별개 — 이벤트별 고유 색상은 EventColorManager 담당)
export const THEME_COLORS = {
  dark: {
    bg: '#0f172a',
    card: '#1e293b',
    text: '#f8fafc',
    subtext: '#94a3b8',
    border: '#334155',
    trackFalse: '#4b5563',
    accent: '#a78bfa',
    accentAlt: '#ec4899',
    muted: '#64748b',
    cardAlt: '#374151',
    overlay: 'rgba(255, 255, 255, 0.15)',
  },
  light: {
    bg: '#ffffff',
    card: '#f9fafb',
    text: '#0f172a',
    subtext: '#64748b',
    border: '#e5e7eb',
    trackFalse: '#d1d5db',
    accent: '#ec4899',
    accentAlt: '#a78bfa',
    muted: '#94a3b8',
    cardAlt: '#f1f5f9',
    overlay: 'rgba(0, 0, 0, 0.05)',
  },
} as const;

export type ThemeColors = {
  bg: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  trackFalse: string;
  accent: string;
  accentAlt: string;
  muted: string;
  cardAlt: string;
  overlay: string;
};

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const defaultThemeContext: ThemeContextType = {
  theme: 'light',
  themeMode: 'system',
  isDark: false,
  colors: THEME_COLORS.light,
  setThemeMode: () => {},
  toggleTheme: () => {},
};

const ThemeContext = createContext<ThemeContextType>(defaultThemeContext);

const THEME_KEY = '@theme_mode';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  
  const theme = themeMode === 'system' 
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : themeMode;

  useEffect(() => {
    let mounted = true;
    
    const loadThemeMode = async () => {
      try {
        const savedMode = await safeGetItem(THEME_KEY);
        if (savedMode && (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') && mounted) {
          setThemeModeState(savedMode as ThemeMode);
        }
      } catch (error) {
        // 테마 로드 실패는 무시 (기본값 사용)
      }
    };
    
    loadThemeMode().catch(() => {
      // 비동기 함수 실패도 무시
    });
    return () => { mounted = false; };
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    try {
      setThemeModeState(mode);
      await safeSetItem(THEME_KEY, mode);
    } catch (error) {
      // 테마 저장 실패는 무시
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const newMode = theme === 'dark' ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [theme, setThemeMode]);

  const isDark = theme === 'dark';
  const colors = THEME_COLORS[isDark ? 'dark' : 'light'];

  const contextValue = useMemo(
    () => ({
      theme,
      themeMode,
      isDark,
      colors,
      setThemeMode,
      toggleTheme
    }),
    [theme, themeMode, isDark, colors, setThemeMode, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  return context;
};
