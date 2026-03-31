/**
 * 데이터 살균 유틸리티 (보안)
 * 외부 Gist 데이터의 XSS, CSS Injection 방지
 */

/** 텍스트 살균: 제로 폭 문자 제거 + 길이 제한 */
export const sanitizeText = (text: string | undefined, maxLen = 500): string => {
  if (!text) return '';
  return String(text).replace(/[\u200B-\u200D\uFEFF]/g, '').slice(0, maxLen);
};

/** 색상 값 검증: #hex 또는 rgb/rgba만 허용 */
export const sanitizeColor = (color: string | undefined, fallback: string): string => {
  if (!color || typeof color !== 'string') return fallback;
  const trimmed = color.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+)?\s*\)$/.test(trimmed)) return trimmed;
  return fallback;
};

/** 날짜 문자열을 로컬 Date로 파싱 (UTC 해석 방지) + LRU 캐시 */
const _dateCache = new Map<string, Date>();
const DATE_CACHE_MAX = 400;

export const parseLocalDate = (dateStr: string): Date => {
  const cached = _dateCache.get(dateStr);
  if (cached) return new Date(cached.getTime()); // 변이 방지를 위해 복사

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y >= 1970 && y <= 2100 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const date = new Date(y, m, d);
      if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
        if (_dateCache.size >= DATE_CACHE_MAX) {
          // 가장 오래된 엔트리 삭제
          const firstKey = _dateCache.keys().next().value;
          if (firstKey !== undefined) _dateCache.delete(firstKey);
        }
        _dateCache.set(dateStr, date);
        return new Date(date.getTime());
      }
    }
  }
  if (__DEV__) {
    console.warn(`parseLocalDate: invalid date string "${dateStr}", falling back to today`);
  }
  return new Date();
};
