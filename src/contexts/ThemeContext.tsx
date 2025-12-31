import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

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
        // 네이티브 빌드를 위한 약간의 지연
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const savedMode = await AsyncStorage.getItem(THEME_KEY).catch(() => null);
        if (savedMode && (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') && mounted) {
          setThemeModeState(savedMode as ThemeMode);
        }
      } catch (error) {
        // 테마 로드 실패는 무시 (기본값 사용)
        console.log('테마 로드 실패 (무시)');
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
      await AsyncStorage.setItem(THEME_KEY, mode).catch(() => {
        // 저장 실패해도 상태는 업데이트됨
      });
    } catch (error) {
      console.log('테마 저장 실패 (무시):', error);
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
  if (context === undefined) {
    // 에러를 throw하는 대신 기본값 반환 (크래시 방지)
    console.log('useTheme: ThemeProvider 누락, 기본값 사용');
    return {
      theme: 'light',
      themeMode: 'system',
      setThemeMode: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
};
