/**
 * ==================== 성능 최적화 유틸리티 ====================
 * 
 * 앱 전체에서 사용하는 성능 최적화 함수들
 * 
 * 포함된 기능:
 *   - 디바운스/스로틀 함수
 *   - 메모이제이션 헬퍼
 *   - 배치 업데이트 유틸리티
 *   - 캐싱 시스템
 * 
 * ========================================================================
 */

import { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

// ==================== 디바운스 훅 ====================
/**
 * 값의 변경을 지연시키는 훅
 * @param value 디바운스할 값
 * @param delay 지연 시간 (밀리초)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ==================== 디바운스 콜백 훅 ====================
/**
 * 콜백 함수를 디바운스하는 훅
 * @param callback 디바운스할 함수
 * @param delay 지연 시간 (밀리초)
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  
  // 콜백이 변경되면 ref 업데이트
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]) as T;

  // 클린업
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

// ==================== 스로틀 콜백 훅 ====================
/**
 * 콜백 함수를 스로틀하는 훅
 * @param callback 스로틀할 함수
 * @param delay 최소 간격 (밀리초)
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCallRef.current >= delay) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    }
  }, [delay]) as T;

  return throttledCallback;
}

// ==================== 지연 실행 훅 ====================
/**
 * 애니메이션 완료 후 실행되는 콜백
 * InteractionManager를 사용하여 UI 블로킹 방지
 */
export function useAfterInteractions(callback: () => void, dependencies: any[] = []) {
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(callback);
    return () => handle.cancel();
  }, dependencies);
}

// ==================== 이전 값 저장 훅 ====================
/**
 * 이전 렌더링의 값을 저장하는 훅
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

// ==================== 마운트 상태 추적 훅 ====================
/**
 * 컴포넌트 마운트 상태를 추적하는 훅
 * 비동기 작업에서 메모리 누수 방지
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  return useCallback(() => isMountedRef.current, []);
}

// ==================== 메모리 캐시 ====================
type CacheEntry<T> = {
  value: T;
  timestamp: number;
};

class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize: number = 100, ttl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // TTL 체크
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  set(key: string, value: T): void {
    // 최대 크기 초과 시 가장 오래된 항목 제거
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// 전역 캐시 인스턴스
export const eventCache = new MemoryCache<any>(200, 60 * 1000); // 1분 TTL
export const computationCache = new MemoryCache<any>(100, 30 * 1000); // 30초 TTL

// ==================== 배치 상태 업데이트 훅 ====================
/**
 * 여러 상태 업데이트를 배치로 처리하는 훅
 */
export function useBatchedUpdates() {
  const pendingUpdates = useRef<Array<() => void>>([]);
  const isProcessing = useRef(false);

  const scheduleUpdate = useCallback((update: () => void) => {
    pendingUpdates.current.push(update);
    
    if (!isProcessing.current) {
      isProcessing.current = true;
      
      requestAnimationFrame(() => {
        const updates = pendingUpdates.current;
        pendingUpdates.current = [];
        isProcessing.current = false;
        
        updates.forEach(fn => fn());
      });
    }
  }, []);

  return scheduleUpdate;
}

// ==================== 레이지 초기화 훅 ====================
/**
 * 컴포넌트 마운트 후 무거운 초기화를 지연 실행
 */
export function useLazyInit<T>(
  initializer: () => T,
  delay: number = 0
): T | null {
  const [value, setValue] = useState<T | null>(null);
  const initializerRef = useRef(initializer);
  
  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // InteractionManager 처리
      await new Promise<void>(resolve => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      
      if (!cancelled) {
        setValue(initializerRef.current());
      }
    };
    
    init();
    
    return () => {
      cancelled = true;
    };
  }, [delay]);
  
  return value;
}

// ==================== 렌더링 횟수 추적 (개발용) ====================
export function useRenderCount(componentName: string): number {
  const renderCount = useRef(0);
  renderCount.current += 1;
  
  if (__DEV__) {
    // 개발 모드에서만 로깅
    if (renderCount.current > 10) {
      console.warn(`⚠️ ${componentName} has rendered ${renderCount.current} times`);
    }
  }
  
  return renderCount.current;
}

// ==================== 안정적인 콜백 훅 ====================
/**
 * 항상 최신 콜백을 참조하지만 참조 자체는 안정적인 훅
 * 의존성 배열에서 함수를 제외할 때 유용
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }, []) as T;
}

// ==================== 깊은 비교 메모 훅 ====================
/**
 * 객체의 깊은 비교를 수행하는 메모 훅
 */
export function useDeepMemo<T>(factory: () => T, deps: any[]): T {
  const ref = useRef<{ deps: any[]; value: T } | null>(null);
  
  if (!ref.current || !deepEqual(ref.current.deps, deps)) {
    ref.current = { deps, value: factory() };
  }
  
  return ref.current.value;
}

// 깊은 비교 유틸리티
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}

// ==================== 타입 내보내기 ====================
export type { CacheEntry };
