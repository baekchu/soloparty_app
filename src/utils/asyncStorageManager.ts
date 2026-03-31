/**
 * AsyncStorage 전역 관리자 (성능 최적화 버전)
 * - 앱 시작 시 AsyncStorage 초기화 보장
 * - 모든 AsyncStorage 접근을 순차적으로 처리
 * - 배치 작업 지원으로 성능 향상
 * - 크래시 방지
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { secureLog } from './secureStorage';

let isReady = false;
let initPromise: Promise<void> | null = null;

// 배치 쓰기 큐 (Map으로 동일 키 O(1) 병합)
let writeQueue = new Map<string, string>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_BATCH_DELAY = 50; // 50ms 내의 쓰기는 배치로 처리
const MAX_QUEUE_SIZE = 50; // 배치 큐 최대 크기 (메모리 폭탄 방지)

// 앱 백그라운드 진입 시 대기 중인 쓰기 즉시 플러시 (데이터 손실 방지)
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'background' || state === 'inactive') {
    if (writeQueue.size > 0) {
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      flushWriteQueue().catch(() => {});
    }
  }
});

/**
 * AsyncStorage 초기화 (앱 시작 시 한 번만 호출)
 */
export const initAsyncStorage = async (): Promise<void> => {
  if (isReady) return;
  
  if (initPromise) {
    await initPromise;
    return;
  }
  
  initPromise = (async () => {
    try {
      secureLog.info('🔧 AsyncStorage 초기화 시작...');
      
      // 타임아웃 보호: SQLite 손상 시 영구 대기 방지 (5초)
      const initTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AsyncStorage init timeout')), 5000)
      );
      
      await Promise.race([
        (async () => {
          // 테스트 쓰기/읽기 (불필요한 100ms 대기 제거)
          await AsyncStorage.setItem('@storage_init_test', 'ok');
          const test = await AsyncStorage.getItem('@storage_init_test');
          
          if (test === 'ok') {
            await AsyncStorage.removeItem('@storage_init_test');
            isReady = true;
            secureLog.info('✅ AsyncStorage 준비 완료');
          } else {
            throw new Error('AsyncStorage test failed');
          }
        })(),
        initTimeout,
      ]);
    } catch (error) {
      secureLog.error('❌ AsyncStorage 초기화 실패');
      // 강제 진행 (대기 없이)
      isReady = true;
    }
  })();
  
  await initPromise;
};

/**
 * AsyncStorage 준비 대기
 */
const ensureReady = async (): Promise<void> => {
  if (!isReady) {
    await initAsyncStorage();
  }
};

/**
 * 배치 쓰기 실행
 */
const flushWriteQueue = async (): Promise<void> => {
  if (writeQueue.size === 0) return;
  
  const itemsToWrite = Array.from(writeQueue.entries());
  writeQueue = new Map();
  writeTimer = null;
  
  try {
    if (itemsToWrite.length === 1) {
      await AsyncStorage.setItem(itemsToWrite[0][0], itemsToWrite[0][1]);
    } else {
      await AsyncStorage.multiSet(itemsToWrite);
    }
  } catch (error) {
    secureLog.error('AsyncStorage 배치 쓰기 실패');
    // 개별 쓰기로 폴백
    for (const [key, value] of itemsToWrite) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        // 개별 아이템 실패는 무시
      }
    }
  }
};

/**
 * 안전한 getItem
 */
export const safeGetItem = async (key: string): Promise<string | null> => {
  await ensureReady();
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    secureLog.error('AsyncStorage getItem 실패');
    return null;
  }
};

/**
 * 안전한 setItem (배치 지원)
 * @param immediate true면 즉시 저장, false면 배치 처리 (기본: 배치)
 */
export const safeSetItem = async (key: string, value: string, immediate: boolean = false): Promise<boolean> => {
  await ensureReady();
  
  try {
    if (immediate) {
      await AsyncStorage.setItem(key, value);
      return true;
    }
    
    // 배치 처리 (Map으로 동일 키 O(1) 병합)
    writeQueue.set(key, value);
    
    if (writeQueue.size >= MAX_QUEUE_SIZE) {
      // 큐가 가득 차면 즉시 플러시
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      await flushWriteQueue();
    } else if (!writeTimer) {
      writeTimer = setTimeout(flushWriteQueue, WRITE_BATCH_DELAY);
    }
    
    return true;
  } catch (error) {
    secureLog.error('AsyncStorage setItem 실패');
    return false;
  }
};

/**
 * 안전한 removeItem
 */
export const safeRemoveItem = async (key: string): Promise<boolean> => {
  await ensureReady();
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error) {
    secureLog.error('AsyncStorage removeItem 실패');
    return false;
  }
};

/**
 * 안전한 multiGet
 */
export const safeMultiGet = async (keys: string[]): Promise<readonly [string, string | null][]> => {
  await ensureReady();
  try {
    return await AsyncStorage.multiGet(keys);
  } catch (error) {
    secureLog.error('AsyncStorage multiGet 실패');
    return keys.map(k => [k, null] as [string, string | null]);
  }
};

/**
 * 안전한 multiSet
 */
export const safeMultiSet = async (keyValuePairs: [string, string][]): Promise<boolean> => {
  await ensureReady();
  try {
    await AsyncStorage.multiSet(keyValuePairs);
    return true;
  } catch (error) {
    secureLog.error('AsyncStorage multiSet 실패');
    return false;
  }
};

/**
 * 안전한 multiRemove
 */
export const safeMultiRemove = async (keys: string[]): Promise<boolean> => {
  await ensureReady();
  try {
    await AsyncStorage.multiRemove(keys);
    return true;
  } catch (error) {
    secureLog.error('AsyncStorage multiRemove 실패');
    return false;
  }
};

/**
 * 모든 키 가져오기
 */
export const safeGetAllKeys = async (): Promise<readonly string[]> => {
  await ensureReady();
  try {
    return await AsyncStorage.getAllKeys();
  } catch (error) {
    secureLog.error('AsyncStorage getAllKeys 실패');
    return [];
  }
};

/**
 * 배치 쓰기 강제 실행 (앱 종료 시 등)
 */
export const flushPendingWrites = async (): Promise<void> => {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }
  await flushWriteQueue();
};

