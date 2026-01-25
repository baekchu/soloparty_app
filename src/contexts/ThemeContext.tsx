import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const defaultThemeContext: ThemeContextType = {
  theme: 'light',
  themeMode: 'system',
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

  const contextValue = useMemo(
    () => ({
      theme,
      themeMode,
      setThemeMode,
      toggleTheme
    }),
    [theme, themeMode, setThemeMode, toggleTheme]
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
