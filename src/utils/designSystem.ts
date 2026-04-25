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

  // 다크 테마 — Deep Violet: 보라/핑크 브랜드에 어울리는 깊은 다크
  dark: {
    background: '#0c0c16',      // 깊은 차콜 + 은은한 바이올렛
    surface: '#141422',         // 1단계 엘리베이션
    surfaceAlt: '#1e1e32',      // 2단계 (칩, 태그, 인풋)
    card: '#171728',            // 플로팅 카드
    border: '#2a2a44',          // 명확한 보더
    borderLight: '#1e1e30',     // 은은한 보더
    text: '#eaeaf2',            // 부드러운 오프화이트 (눈부심 ↓)
    textSecondary: '#8888a0',   // 균형잡힌 세컨더리
    textTertiary: '#5c5c74',    // 은은한 터셔리
    textInverse: '#0c0c16',
    overlay: 'rgba(0, 0, 0, 0.72)',
    divider: '#242440',
    switchTrack: '#32324c',
    danger: '#ff6b7a',
    dangerBg: 'rgba(255, 107, 122, 0.12)',
    sunday: '#ff6b7a',
    saturday: '#6b9fff',
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
