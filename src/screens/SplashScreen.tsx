import React, { useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface SplashScreenProps {
  onLoadComplete: () => void;
}

export default function SplashScreen({ onLoadComplete }: SplashScreenProps) {
  const { theme } = useTheme();
  const isDark = useMemo(() => theme === 'dark', [theme]);

  useEffect(() => {
    // 2초 후 로딩 완료
    const timer = setTimeout(() => {
      onLoadComplete();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onLoadComplete]);

  return (
    <View style={[
      styles.container,
      { backgroundColor: isDark ? '#0f172a' : '#ffffff' }
    ]}>
      {/* 로고/아이콘 영역 */}
      <View style={styles.logoContainer}>
        <View style={[
          styles.logoCircle,
          { 
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255, 255, 255, 0.9)',
            borderWidth: 2,
            borderColor: isDark ? 'rgba(167, 139, 250, 0.2)' : 'rgba(236, 72, 153, 0.2)',
          }
        ]}>
          <Image
            source={require('../../assets/splash-icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={[
          styles.appName,
          { color: isDark ? '#f8fafc' : '#0f172a' }
        ]}>
          Solo Party
        </Text>
        <Text style={[
          styles.tagline,
          { color: isDark ? '#94a3b8' : '#64748b' }
        ]}>
          특별한 만남을 위한 일정
        </Text>
      </View>

      {/* 로딩 인디케이터 */}
      <View style={styles.loadingContainer}>
        <ActivityIndicator 
          size="large" 
          color={isDark ? '#a78bfa' : '#ec4899'} 
        />
        <Text style={[
          styles.loadingText,
          { color: isDark ? '#94a3b8' : '#64748b' }
        ]}>
          일정을 불러오는 중...
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: 100,
    height: 100,
  },
  logoEmoji: {
    fontSize: 60,
  },
  appName: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 80,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },
});
