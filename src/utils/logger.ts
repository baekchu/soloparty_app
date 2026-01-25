/**
 * ==================== 로깅 유틸리티 ====================
 * 
 * 개발 환경에서만 로그를 출력하여 프로덕션 성능 최적화
 * 
 * ========================================================================
 */

const isDevelopment = __DEV__;

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    // 에러는 항상 로그 (프로덕션에서도 중요)
    console.error(...args);
  },
  
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
};
