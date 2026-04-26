/**
 * EventColorManager — 이벤트별 고유 색상 생성기
 *
 * 설계 원칙:
 * - HSL 색공간으로 hash → 고유 색상 직접 생성 (팔레트 인덱스 방식 탈피)
 *   → 이벤트마다 수학적으로 고유한 색상, 충돌 없음
 * - 라이트 모드: 채도 40-60%, 밝기 83-92% (파스텔) → 어두운 텍스트 가독성
 * - 다크 모드:  채도 58-76%, 밝기 24-38% (딥컬러) → 흰 텍스트 가독성 (WCAG AA)
 * - 브랜드 고정 색상: BRAND_COLORS에 명시적 정의
 * - 결정론적 생성이므로 AsyncStorage 캐시 불필요 → 초기화 오버헤드 제거
 */

import { secureLog } from './secureStorage';

// ── HSL → Hex 변환 (순수 함수, 모듈 레벨) ──────────────────────────
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, v)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── FNV-1a 해시 (균등 분포 + 빠름) ────────────────────────────────
function fnvHash(str: string): number {
  let h = 0x811c9dc5;
  const len = Math.min(str.length, 64);
  for (let i = 0; i < len; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

// ── EventColorManager ────────────────────────────────────────────
class EventColorManager {
  /**
   * 브랜드 고유 색상 테이블 [라이트, 다크]
   * 추가: 이 객체에 한 줄만 추가하면 됩니다.
   *
   * 라이트 기준: 채도 40-50%, 밝기 85-90% (파스텔)
   * 다크 기준:  채도 60-70%, 밝기 28-36% (딥)
   */
  private static readonly BRAND_COLORS: Readonly<Record<string, readonly [string, string]>> = {
    '게더링하우스': ['#ede0ff', '#4a3878'] as const, // 연한 라벤더 / 헤이즘드 퍼플
    '채도하우스':   ['#ddf0fc', '#1a5c78'] as const, // 연한 스카이  / 헤이즘드 네이비
    '채도':         ['#ddf0fc', '#1a5c78'] as const,
    '솔로몬파티':   ['#fce8d8', '#7a4820'] as const, // 연한 피치    / 헤이즘드 앤버
    '솔로몬':       ['#fce8d8', '#7a4820'] as const,
    '효스타임':     ['#fde0ec', '#7a2050'] as const, // 연한 로즈    / 헤이즘드 마루아라
    '효스':         ['#fde0ec', '#7a2050'] as const,
  };

  // 해시 캐시 (동일 문자열 재계산 방지)
  private static hashCache = new Map<string, number>();

  private static getHash(str: string): number {
    const cached = this.hashCache.get(str);
    if (cached !== undefined) return cached;
    const h = fnvHash(str);
    this.hashCache.set(str, h);
    // 캐시 크기 제한 (2000개)
    if (this.hashCache.size > 2000) {
      const firstKey = this.hashCache.keys().next().value;
      if (firstKey !== undefined) this.hashCache.delete(firstKey);
    }
    return h;
  }

  /**
   * hash → HSL 고유 색상 생성
   *
   * 색상(hue): hash % 360  → 0-359° 전 범위 균등 분포
   * 채도/밝기: hash의 다른 비트에서 추출 → hue와 독립적으로 변화
   *
   * 라이트 모드: 파스텔 (s:40-60%, l:83-92%) → 어두운 텍스트 (#1e293b) 적합
   * 다크  모드: 딥 컬러 (s:58-76%, l:24-38%) → 흰색 텍스트 (#ffffff) 적합
   */
  private static generateColor(hash: number, isDark: boolean): string {
    const hue = hash % 360;
    // 다른 비트 영역에서 채도/밝기용 엔트로피 추출 (hue와 독립)
    const e1 = (hash >>> 8) & 0xff;
    const e2 = (hash >>> 16) & 0xff;

    if (isDark) {
      // 다크모드: 온화된 컴된 톤 — 채도 중상, 밝기 낙들하게
      const sat = 38 + (e1 % 22); // 38–59%
      const lig = 28 + (e2 % 12); // 28–39%
      return hslToHex(hue, sat, lig);
    } else {
      // 라이트모드: 체도 낙고 밝기 높음 → 더 연한 파스텔
      const sat = 28 + (e1 % 21); // 28–48%
      const lig = 88 + (e2 % 8);  // 88–95%
      return hslToHex(hue, sat, lig);
    }
  }

  // ── 하위 호환성 메서드 ────────────────────────────────────────────
  /** 결정론적 생성이므로 실제 초기화 불필요. 하위 호환용. */
  static async initialize(): Promise<void> {
    // no-op: AsyncStorage 의존성 제거 (색상이 결정론적으로 생성됨)
  }

  /** 색상 캐시 초기화 (설정 화면 등에서 호출) */
  static async clearColorMap(): Promise<void> {
    this.hashCache.clear();
    secureLog.info('🎨 색상 캐시 초기화');
  }

  /**
   * 이벤트 색상 반환
   *
   * 우선순위:
   * 1. 브랜드 색상 (groupId/title에 브랜드명 포함 시)
   * 2. groupId 기반 고유 색상 (같은 그룹은 항상 동일 색상)
   * 3. 정규화된 제목 기반 색상 ("게더링하우스 (강남)점" → "게더링하우스")
   * 4. eventId 기반 고유 색상
   *
   * _dateString, _allEvents, _dayEvents, _currentIndex: 미사용 (하위 호환용)
   */
  private static normalizeTitle(title: string): string {
    // "게더링하우스 (강남)점", "(강남점)" 등 괄호 및 이후 문자 제거 → 공통 접두사 추출
    return title.replace(/\s*[\(（【\[][^\)）】\]]*[\)）】\]].*$/, '').trim() || title.trim();
  }

  static getColorForEvent(
    eventId: string,
    eventTitle: string,
    _dateString: string,
    _allEvents: unknown,
    _dayEvents: unknown,
    _currentIndex: number,
    isDark = false,
    groupId?: string,
  ): string {
    // ① 브랜드 고유 색상 확인
    const searchTarget = (groupId || eventTitle || '').toLowerCase();
    for (const [keyword, [light, dark]] of Object.entries(this.BRAND_COLORS)) {
      if (searchTarget.includes(keyword.toLowerCase())) {
        return isDark ? dark : light;
      }
    }

    // ② 이벤트 고유 색상: groupId → 정규화된 제목(괄호 패턴 제거) → eventId 순
    const normalizedTitle = this.normalizeTitle(eventTitle || '');
    const colorKey = (groupId?.trim() || normalizedTitle || eventId || 'unknown');
    const hash = this.getHash(colorKey);
    return this.generateColor(hash, isDark);
  }
}

export default EventColorManager;
