/**
 * 전역 토스트 알림 시스템
 * - 앱 어디서든 showToast()로 알림 표시
 * - 다크 모드 지원
 * - 큐 시스템 (여러 토스트 순서대로 표시)
 * - useNativeDriver 애니메이션
 */

import React, { createContext, useContext, useCallback, useRef, useState, useEffect, memo } from 'react';
import { View, Text, Animated, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { Colors } from '../utils/designSystem';

// ==================== 타입 ====================
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
  icon?: string;
}

interface ToastContextType {
  showToast: (config: ToastConfig) => void;
}

// ==================== Context ====================
const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Context 없이 사용 시 안전하게 무시 (테스트/스토리북 호환)
    return { showToast: () => {} };
  }
  return ctx;
};

// ==================== 토스트 색상 ====================
const TOAST_COLORS: Record<ToastType, { light: { bg: string; border: string; text: string }; dark: { bg: string; border: string; text: string } }> = {
  success: {
    light: { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
    dark: { bg: '#0c2a1a', border: '#14532d', text: '#6ee7b7' },
  },
  error: {
    light: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
    dark: { bg: '#2a0c10', border: '#7f1d1d', text: '#fca5a5' },
  },
  info: {
    light: { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb' },
    dark: { bg: '#0c1630', border: '#1e40af', text: '#93c5fd' },
  },
  warning: {
    light: { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
    dark: { bg: '#2c1c06', border: '#78350f', text: '#fcd34d' },
  },
};

const DEFAULT_ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};

// ==================== 토스트 렌더러 ====================
const ToastRenderer = memo(({ toast, onDone }: { toast: ToastConfig & { id: number }; onDone: () => void }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const type = toast.type || 'info';
  const duration = toast.duration || 2200;
  const icon = toast.icon || DEFAULT_ICONS[type];
  const colors = isDark ? TOAST_COLORS[type].dark : TOAST_COLORS[type].light;

  useEffect(() => {
    // 슬라이드 업
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // 자동 사라짐
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        toastStyles.container,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          bottom: insets.bottom + 80,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Text style={toastStyles.icon}>{icon}</Text>
      <Text style={[toastStyles.message, { color: colors.text }]} numberOfLines={2}>
        {toast.message}
      </Text>
    </Animated.View>
  );
});

// ==================== Provider ====================
let _idCounter = 0;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [current, setCurrent] = useState<(ToastConfig & { id: number }) | null>(null);
  const queueRef = useRef<(ToastConfig & { id: number })[]>([]);
  const isShowingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (isShowingRef.current || queueRef.current.length === 0) return;
    isShowingRef.current = true;
    const next = queueRef.current.shift()!;
    setCurrent(next);
  }, []);

  const showToast = useCallback((config: ToastConfig) => {
    const item = { ...config, id: ++_idCounter };
    queueRef.current.push(item);
    // 큐가 너무 길면 오래된 것 제거
    if (queueRef.current.length > 5) {
      queueRef.current = queueRef.current.slice(-3);
    }
    processQueue();
  }, [processQueue]);

  const handleDone = useCallback(() => {
    isShowingRef.current = false;
    setCurrent(null);
    // 다음 토스트가 있으면 약간의 딜레이 후 표시
    setTimeout(processQueue, 150);
  }, [processQueue]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {current && <ToastRenderer key={current.id} toast={current} onDone={handleDone} />}
    </ToastContext.Provider>
  );
};

// ==================== 스타일 ====================
const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  icon: {
    fontSize: 18,
    marginRight: 10,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
