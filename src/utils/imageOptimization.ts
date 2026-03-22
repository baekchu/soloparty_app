/**
 * 이미지 최적화 설정
 * - Fast Image를 사용하여 이미지 로딩 성능 향상
 * - 메모리 캐싱 및 디스크 캐싱 지원
 */

// 추후 expo-image 또는 react-native-fast-image 도입 시 사용할 설정

export const IMAGE_CONFIG = {
  // 캐시 설정
  cache: {
    memory: true,
    disk: true,
    maxAge: 7 * 24 * 60 * 60, // 7일
  },
  
  // 리사이징 최적화
  resize: {
    mode: 'cover' as const,
    quality: 0.8, // 80% 품질 (파일 크기 vs 품질 균형)
  },
  
  // 우선순위
  priority: {
    high: 'high' as const,
    normal: 'normal' as const,
    low: 'low' as const,
  },
  
  // placeholder 설정
  placeholder: {
    blurRadius: 5,
    thumbSize: { width: 50, height: 50 },
  },
} as const;

// 이미지 URI 검증
export const isValidImageUri = (uri?: string): boolean => {
  if (!uri) return false;
  return /^(https?:\/\/).+\.(jpg|jpeg|png|gif|webp)$/i.test(uri);
};

// 썸네일 URL 생성 (CDN 지원 시)
export const getThumbnailUrl = (url: string, size: 'small' | 'medium' | 'large' = 'medium'): string => {
  // 추후 CDN 이미지 리사이징 파라미터 추가
  // 예: https://cdn.example.com/image.jpg?w=300&h=300&fit=cover
  return url;
};

// WebP 지원 확인
export const supportsWebP = (): boolean => {
  // React Native는 기본적으로 WebP 지원
  return true;
};
