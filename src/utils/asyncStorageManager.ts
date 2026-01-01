/**
 * AsyncStorage 전역 관리자
 * - 앱 시작 시 AsyncStorage 초기화 보장
 * - 모든 AsyncStorage 접근을 순차적으로 처리
 * - 크래시 방지
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

let isReady = false;
let initPromise: Promise<void> | null = null;

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
      console.log('🔧 AsyncStorage 초기화 시작...');
      
      // 1초 대기 (네이티브 모듈 완전 로드)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 테스트 쓰기/읽기
      await AsyncStorage.setItem('@storage_init_test', 'ok');
      const test = await AsyncStorage.getItem('@storage_init_test');
      
      if (test === 'ok') {
        await AsyncStorage.removeItem('@storage_init_test');
        isReady = true;
        console.log('✅ AsyncStorage 준비 완료');
      } else {
        throw new Error('AsyncStorage test failed');
      }
    } catch (error) {
      console.error('❌ AsyncStorage 초기화 실패:', error);
      // 2초 추가 대기 후 강제 진행
      await new Promise(resolve => setTimeout(resolve, 2000));
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
 * 안전한 getItem
 */
export const safeGetItem = async (key: string): Promise<string | null> => {
  await ensureReady();
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error(`AsyncStorage getItem 실패 [${key}]:`, error);
    return null;
  }
};

/**
 * 안전한 setItem
 */
export const safeSetItem = async (key: string, value: string): Promise<boolean> => {
  await ensureReady();
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`AsyncStorage setItem 실패 [${key}]:`, error);
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
    console.error(`AsyncStorage removeItem 실패 [${key}]:`, error);
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
    console.error('AsyncStorage multiGet 실패:', error);
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
    console.error('AsyncStorage multiSet 실패:', error);
    return false;
  }
};
