/**
 * 추가 성능 최적화 유틸리티
 * - 렌더링 최적화
 * - 메모리 최적화
 * - 네트워크 최적화
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * 컴포넌트 마운트 후 지연 실행
 * - 중요하지 않은 작업을 나중에 실행하여 초기 렌더링 속도 향상
 */
export const useDelayedEffect = (callback: () => void, delay: number = 100) => {
  useEffect(() => {
    const timeout = setTimeout(callback, delay);
    return () => clearTimeout(timeout);
  }, [callback, delay]);
};

/**
 * InteractionManager를 사용한 지연 실행
 * - 애니메이션 완료 후 작업 실행
 */
export const useAfterInteractions = (callback: () => void, deps: any[] = []) => {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(callback);
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

/**
 * 스크롤 성능 최적화를 위한 렌더링 제한
 * - 빠른 스크롤 중에는 일부 렌더링을 건너뜀
 */
export const useThrottledRender = (delay: number = 100) => {
  const lastRenderRef = useRef(Date.now());
  const shouldRender = useCallback(() => {
    const now = Date.now();
    if (now - lastRenderRef.current > delay) {
      lastRenderRef.current = now;
      return true;
    }
    return false;
  }, [delay]);

  return { shouldRender };
};

/**
 * 무한 스크롤 최적화
 * - 페이지네이션을 위한 헬퍼
 */
export const usePagination = <T>(items: T[], pageSize: number = 20) => {
  const pageRef = useRef(1);
  const displayItemsRef = useRef<T[]>([]);

  const loadMore = useCallback(() => {
    const start = 0;
    const end = pageRef.current * pageSize;
    displayItemsRef.current = items.slice(start, end);
    pageRef.current++;
  }, [items, pageSize]);

  const reset = useCallback(() => {
    pageRef.current = 1;
    loadMore();
  }, [loadMore]);

  return { displayItems: displayItemsRef.current, loadMore, reset };
};

/**
 * 비동기 작업 배치 처리
 * - 여러 비동기 작업을 그룹화하여 한 번에 실행
 */
export class BatchProcessor<T> {
  private queue: Array<() => Promise<T>> = [];
  private processing = false;
  private batchSize: number;
  private delay: number;

  constructor(batchSize: number = 10, delay: number = 100) {
    this.batchSize = batchSize;
    this.delay = delay;
  }

  add(task: () => Promise<T>) {
    this.queue.push(task);
    if (!this.processing) {
      this.process();
    }
  }

  private async process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const batch = this.queue.splice(0, this.batchSize);
    
    try {
      await Promise.all(batch.map(task => task()));
    } catch (error) {
      if (__DEV__) console.error('Batch processing error:', error);
    }

    // 다음 배치 처리 전 짧은 지연
    await new Promise(resolve => setTimeout(resolve, this.delay));
    this.process();
  }
}

/**
 * 메모리 사용량 모니터링 (개발 모드)
 */
export const useMemoryMonitor = (componentName: string, enabled: boolean = __DEV__) => {
  useEffect(() => {
    if (!enabled) return;

    const checkMemory = () => {
      // React Native에서는 메모리 API가 제한적
      // 추후 필요 시 네이티브 모듈로 구현
      if (__DEV__) {
        console.log(`[${componentName}] Memory check (native implementation required)`);
      }
    };

    checkMemory();
    return () => checkMemory();
  }, [componentName, enabled]);
};

/**
 * 안전한 setState (마운트 상태 확인)
 * - 언마운트된 컴포넌트의 setState 방지
 */
export const useSafeState = <T>(initialState: T): [T, (newState: T | ((prev: T) => T)) => void] => {
  const isMountedRef = useRef(true);
  const [state, setState] = useState<T>(initialState);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setSafeState = useCallback((newState: T | ((prev: T) => T)) => {
    if (isMountedRef.current) {
      setState(newState);
    }
  }, []);

  return [state, setSafeState];
};

/**
 * 네트워크 요청 디바운싱
 * - API 호출을 그룹화하여 중복 요청 방지
 */
export class RequestDebouncer {
  private pending: Map<string, Promise<any>> = new Map();

  async request<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // 이미 진행 중인 동일한 요청이 있으면 재사용
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  clear() {
    this.pending.clear();
  }
}

// 전역 인스턴스
export const globalRequestDebouncer = new RequestDebouncer();
