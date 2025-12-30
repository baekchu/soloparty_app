/**
 * ==================== 반응형 레이아웃 유틸리티 ====================
 * 
 * 태블릿과 모바일에서 최적화된 레이아웃 제공
 * 
 * ========================================================================
 */

import { Dimensions, Platform } from 'react-native';

// 디바이스 타입 감지
export const isTablet = () => {
  const { width, height } = Dimensions.get('window');
  const aspectRatio = height / width;
  // 태블릿은 일반적으로 화면이 더 크고 비율이 다름
  return (
    (Platform.OS === 'ios' && Platform.isPad) ||
    (width >= 768 && aspectRatio < 1.6)
  );
};

// 반응형 너비 계산
export const getResponsiveWidth = (maxWidth: number = 600): number => {
  const { width } = Dimensions.get('window');
  if (isTablet()) {
    return Math.min(width * 0.7, maxWidth);
  }
  return width;
};

// 반응형 패딩 계산
export const getResponsivePadding = (mobilePadding: number = 20): number => {
  if (isTablet()) {
    return mobilePadding * 1.5;
  }
  return mobilePadding;
};

// 반응형 폰트 크기 계산
export const getResponsiveFontSize = (baseFontSize: number): number => {
  if (isTablet()) {
    return baseFontSize * 1.1;
  }
  return baseFontSize;
};

// 컨테이너 스타일 생성
export const getContainerStyle = (maxWidth: number = 800) => {
  if (isTablet()) {
    return {
      maxWidth,
      alignSelf: 'center' as const,
      width: '100%' as '100%',
    };
  }
  return {
    width: '100%' as '100%',
  };
};

// 그리드 컬럼 수 계산
export const getGridColumns = (mobileColumns: number = 1): number => {
  if (isTablet()) {
    return mobileColumns * 2;
  }
  return mobileColumns;
};
