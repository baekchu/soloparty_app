/**
 * 스켈레톤 로딩 컴포넌트
 * - 데이터 로딩 중 사용자에게 시각적 피드백 제공
 * - 더 나은 UX를 위한 로딩 상태 표시
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: any;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  width = '100%', 
  height = 20, 
  borderRadius = 4,
  style 
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: isDark ? '#1e1e32' : '#e5e7eb',
          opacity,
        },
        style,
      ]}
    />
  );
};

// 이벤트 카드 스켈레톤
export const EventCardSkeleton: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <View style={[styles.eventCardSkeleton, { backgroundColor: isDark ? '#141422' : '#ffffff' }]}>
      <View style={[styles.accent, { backgroundColor: isDark ? '#1e1e32' : '#e5e7eb' }]} />
      <View style={styles.content}>
        <Skeleton width={100} height={12} style={{ marginBottom: 8 }} />
        <Skeleton width="80%" height={18} style={{ marginBottom: 8 }} />
        <View style={styles.metaRow}>
          <Skeleton width={80} height={14} borderRadius={12} style={{ marginRight: 8 }} />
          <Skeleton width={100} height={14} borderRadius={12} />
        </View>
        <Skeleton width="100%" height={14} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
};

// 이벤트 리스트 스켈레톤
export const EventListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <EventCardSkeleton key={index} />
      ))}
    </View>
  );
};

// 캘린더 스켈레톤
export const CalendarSkeleton: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <View style={[styles.calendarSkeleton, { backgroundColor: isDark ? '#0c0c16' : '#fce7f3' }]}>
      <View style={styles.calendarHeader}>
        <Skeleton width={150} height={24} style={{ marginBottom: 16 }} />
      </View>
      <View style={styles.calendarGrid}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`day-${i}`} width={40} height={16} style={{ marginBottom: 12 }} />
        ))}
      </View>
      <View style={styles.calendarDates}>
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton 
            key={`date-${i}`} 
            width={36} 
            height={36} 
            borderRadius={18}
            style={{ margin: 4 }} 
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },
  eventCardSkeleton: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  accent: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listContainer: {
    paddingTop: 8,
    paddingBottom: 76,
  },
  calendarSkeleton: {
    padding: 16,
    borderRadius: 12,
    margin: 16,
  },
  calendarHeader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  calendarDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
});
