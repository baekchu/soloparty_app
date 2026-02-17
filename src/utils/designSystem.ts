/**
 * ==================== Solo Party 디자인 시스템 ====================
 * 앱 전체에서 사용하는 색상, 타이포그래피, 간격 등을 중앙 관리합니다.
 * 모든 화면에서 이 파일의 값을 참조하여 일관된 디자인을 유지합니다.
 */

// ==================== 색상 팔레트 ====================
export const Colors = {
  // 브랜드 색상
  primary: '#a78bfa',       // 보라 (메인 액센트)
  primaryLight: '#c4b5fd',
  primaryDark: '#7c3aed',
  secondary: '#ec4899',     // 핑크 (CTA, 하이라이트)
  secondaryLight: '#f472b6',
  accent: '#10b981',        // 그린 (성공, 확인)
  accentLight: '#34d399',

  // 라이트 테마
  light: {
    background: '#ffffff',
    surface: '#f8fafc',
    surfaceAlt: '#f1f5f9',
    card: '#ffffff',
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    text: '#0f172a',
    textSecondary: '#64748b',
    textTertiary: '#94a3b8',
    textInverse: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.5)',
    divider: '#e2e8f0',
    switchTrack: '#cbd5e1',
    danger: '#ef4444',
    dangerBg: '#fef2f2',
    sunday: '#ef4444',
    saturday: '#3b82f6',
  },

  // 다크 테마
  dark: {
    background: '#0f172a',
    surface: '#1e293b',
    surfaceAlt: '#334155',
    card: '#1e293b',
    border: '#334155',
    borderLight: '#1e293b',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textInverse: '#0f172a',
    overlay: 'rgba(0, 0, 0, 0.7)',
    divider: '#334155',
    switchTrack: '#4b5563',
    danger: '#f87171',
    dangerBg: 'rgba(239, 68, 68, 0.1)',
    sunday: '#f87171',
    saturday: '#60a5fa',
  },
} as const;

// 테마에 따른 색상 가져오기
export const getColors = (isDark: boolean) => isDark ? Colors.dark : Colors.light;

// ==================== 타이포그래피 ====================
export const Typography = {
  // 헤더
  h1: { fontSize: 28, fontWeight: '800' as const, lineHeight: 36 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },

  // 본문
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  bodySm: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmBold: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },

  // 캡션
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  captionBold: { fontSize: 12, fontWeight: '700' as const, lineHeight: 16 },
  tiny: { fontSize: 11, fontWeight: '400' as const, lineHeight: 14 },

  // 버튼
  button: { fontSize: 16, fontWeight: '600' as const },
  buttonSm: { fontSize: 14, fontWeight: '600' as const },
} as const;

// ==================== 간격 ====================
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ==================== 라운딩 ====================
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

// ==================== 그림자 ====================
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// ==================== 레이아웃 ====================
export const Layout = {
  screenPadding: Spacing.xl,
  cardPadding: Spacing.lg,
  sectionGap: Spacing.xl,
  headerHeight: 56,
  minTouchTarget: 44,
} as const;
