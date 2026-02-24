/**
 * ==================== 포인트 & 광고 관리 훅 (보안 강화 v3) ====================
 * 
 * 기능:
 *   - 포인트 적립/사용 관리
 *   - 광고 시청 시 50P 적립
 *   - 6시간당 최대 10개 광고 시청 제한
 *   - 서버 없이 안전한 데이터 관리
 * 
 * 보안:
 *   - SecureStore + AsyncStorage 이중 저장
 *   - 트랜잭션 체인 (블록체인 방식)
 *   - 기기 바인딩
 *   - 이상 탐지 시스템
 *   - 백업/복원 기능
 * 
 * ========================================================================
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog, encryptData, decryptData } from '../utils/secureStorage';
import PointsSecurityService, { 
  SecurePointsData,
} from '../services/PointsSecurityService';
import PointsAutoSyncService from '../services/PointsAutoSyncService';

// ==================== 상수 정의 ====================
const INITIAL_POINTS = 2500; // 가입 축하 포인트
const AD_REWARD_POINTS = 50; // 광고 1회 시청 보상
const MAX_ADS_PER_PERIOD = 10; // 기간당 최대 광고 수
const AD_RESET_PERIOD_MS = 6 * 60 * 60 * 1000; // 6시간 (밀리초)
const AD_LIMIT_STORAGE_KEY = '@soloparty_ad_limit_v3';

// ==================== 인스턴스 간 상태 동기화 ====================
// 다중 usePoints() 인스턴스 간 balance/adCount 등이 동기화되도록 리스너 패턴
type PointsListener = () => void;
const _pointsListeners = new Set<PointsListener>();
const _notifyPointsListeners = () => { _pointsListeners.forEach(fn => fn()); };
// 모듈 레벨 공유 mutex (인스턴스별 별도 mutex 방지)
let _pointsMutexLocked = false;
// AutoSync 참조 카운터 (첫 인스턴스 시작, 마지막 인스턴스 중지)
let _syncRefCount = 0;

// ==================== 타입 정의 ====================
interface PointHistory {
  id: string;
  amount: number;
  reason: string;
  timestamp: number;
  tx_hash?: string; // 트랜잭션 해시 연결
}

interface AdLimitData {
  count: number;
  resetTimestamp: number;
  lastWatchTimestamp: number;
}

// ==================== 광고 제한 데이터 관리 ====================
const loadAdLimitData = async (): Promise<AdLimitData> => {
  try {
    const encrypted = await safeGetItem(AD_LIMIT_STORAGE_KEY);
    if (encrypted) {
      let data = encrypted;
      try {
        data = await decryptData(encrypted);
      } catch {
        // 복호화 실패 시 데이터 무효화 (평문 우회 공격 방지)
        secureLog.warn('⚠️ 광고 제한 데이터 복호화 실패 - 초기화');
        return {
          count: 0,
          resetTimestamp: Date.now() + AD_RESET_PERIOD_MS,
          lastWatchTimestamp: 0,
        };
      }
      
      // 보안: decryptData는 실패 시 throw 대신 빈 문자열을 반환할 수 있음
      if (!data) {
        secureLog.warn('⚠️ 광고 제한 데이터 복호화 결과 비어있음 - 초기화');
        return {
          count: 0,
          resetTimestamp: Date.now() + AD_RESET_PERIOD_MS,
          lastWatchTimestamp: 0,
        };
      }
      
      const parsed: AdLimitData = JSON.parse(data);
      const now = Date.now();
      
      // 보안: 필드 타입/범위 검증 (조작된 데이터 방지)
      const count = typeof parsed.count === 'number' && Number.isFinite(parsed.count)
        ? Math.max(0, Math.min(Math.floor(parsed.count), MAX_ADS_PER_PERIOD))
        : 0;
      const resetTimestamp = typeof parsed.resetTimestamp === 'number' && Number.isFinite(parsed.resetTimestamp)
        ? parsed.resetTimestamp
        : now + AD_RESET_PERIOD_MS;
      const lastWatchTimestamp = typeof parsed.lastWatchTimestamp === 'number' && Number.isFinite(parsed.lastWatchTimestamp)
        ? Math.max(0, Math.min(parsed.lastWatchTimestamp, now))
        : 0;
      
      // resetTimestamp가 비정상적으로 먼 미래인 경우 방지 (최대 2배 리셋 기간)
      const safeResetTimestamp = resetTimestamp > now + AD_RESET_PERIOD_MS * 2
        ? now + AD_RESET_PERIOD_MS
        : resetTimestamp;
      
      // 리셋 시간이 지났으면 초기화
      if (now >= safeResetTimestamp) {
        return {
          count: 0,
          resetTimestamp: now + AD_RESET_PERIOD_MS,
          lastWatchTimestamp: 0,
        };
      }
      
      return {
        count,
        resetTimestamp: safeResetTimestamp,
        lastWatchTimestamp,
      };
    }
  } catch {
    // 로드 실패
  }
  
  return {
    count: 0,
    resetTimestamp: Date.now() + AD_RESET_PERIOD_MS,
    lastWatchTimestamp: 0,
  };
};

const saveAdLimitData = async (data: AdLimitData): Promise<void> => {
  try {
    const encrypted = await encryptData(JSON.stringify(data));
    await safeSetItem(AD_LIMIT_STORAGE_KEY, encrypted);
  } catch {
    // 저장 실패는 무시
  }
};

// ==================== 메인 훅 ====================
export const usePoints = () => {
  // 포인트 상태
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<PointHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [secureData, setSecureData] = useState<SecurePointsData | null>(null);
  
  // 광고 관련 상태
  const [adCount, setAdCount] = useState(0);
  const [adResetTime, setAdResetTime] = useState(0);
  const [lastAdTimestamp, setLastAdTimestamp] = useState(0);
  
  // 보안 상태
  const [deviceId, setDeviceId] = useState<string>('');
  const [isSecure, setIsSecure] = useState(true);
  
  const isMountedRef = useRef(true);
  const securityCheckRef = useRef(false);
  
  // stale closure 방지를 위한 최신 상태 ref
  const balanceRef = useRef(balance);
  const secureDataRef = useRef(secureData);
  
  // 광고 상태 ref (watchAdForPoints stale closure 방지)
  const adCountRef = useRef(adCount);
  const adResetTimeRef = useRef(adResetTime);
  const lastAdTimestampRef = useRef(lastAdTimestamp);
  
  // ref를 항상 최신 상태로 동기화 (단일 effect로 통합 — 렌더 사이클 절약)
  useEffect(() => {
    balanceRef.current = balance;
    secureDataRef.current = secureData;
    adCountRef.current = adCount;
    adResetTimeRef.current = adResetTime;
    lastAdTimestampRef.current = lastAdTimestamp;
  }, [balance, secureData, adCount, adResetTime, lastAdTimestamp]);

  // 포인트 조작 mutex (모듈 레벨 공유 — 다중 인스턴스 동시 실행 방지)
  const withPointsLock = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (_pointsMutexLocked) return null;
    _pointsMutexLocked = true;
    try {
      return await fn();
    } finally {
      _pointsMutexLocked = false;
    }
  }, []);

  // 다중 인스턴스 동기화: 다른 인스턴스의 상태 변경 수신
  useEffect(() => {
    const listener: PointsListener = async () => {
      if (!isMountedRef.current) return;
      try {
        // 스토리지에서 최신 상태 다시 로드
        const freshData = await PointsSecurityService.loadSecurePointsData();
        if (freshData && isMountedRef.current) {
          setBalance(freshData.balance);
          setSecureData(freshData);
        }
        const freshAdLimit = await loadAdLimitData();
        if (isMountedRef.current) {
          setAdCount(freshAdLimit.count);
          setAdResetTime(freshAdLimit.resetTimestamp);
          setLastAdTimestamp(freshAdLimit.lastWatchTimestamp);
        }
      } catch { /* 무시 */ }
    };
    _pointsListeners.add(listener);
    return () => { _pointsListeners.delete(listener); };
  }, []);

  // 광고 간격 체크를 위한 tick (5초 간격 자동 갱신)
  const [adIntervalTick, setAdIntervalTick] = useState(0);
  
  useEffect(() => {
    // lastAdTimestamp 변경 후 MIN_AD_INTERVAL_MS 뒤에 canWatchAd 재평가
    if (lastAdTimestamp > 0) {
      const timer = setTimeout(() => {
        setAdIntervalTick(t => t + 1);
      }, 5500); // 5.5초 (5초 간격 + 여유)
      return () => clearTimeout(timer);
    }
  }, [lastAdTimestamp]);

  // 광고 시청 가능 여부
  const canWatchAd = useMemo(() => {
    const now = Date.now();
    const MIN_AD_INTERVAL_MS = 5000;
    return adCount < MAX_ADS_PER_PERIOD && (now - lastAdTimestamp) >= MIN_AD_INTERVAL_MS;
  }, [adCount, lastAdTimestamp, adIntervalTick]);
  
  // 남은 광고 수
  const remainingAds = useMemo(() => Math.max(0, MAX_ADS_PER_PERIOD - adCount), [adCount]);
  
  // 리셋까지 남은 시간 (밀리초)
  const timeUntilReset = useMemo(() => {
    const now = Date.now();
    return Math.max(0, adResetTime - now);
  }, [adResetTime]);

  // ==================== 초기 로드 ====================
  useEffect(() => {
    isMountedRef.current = true;
    
    const initializeData = async () => {
      try {
        // 1. 기기 ID 로드
        const id = await PointsSecurityService.getDeviceId();
        if (isMountedRef.current) setDeviceId(id);
        
        // 2. 포인트 데이터 로드
        let pointsData = await PointsSecurityService.loadSecurePointsData();
        
        if (!pointsData) {
          // 자동 복원 시도 (앱 재설치 등)
          const restoredBalance = await PointsAutoSyncService.tryAutoRestore();
          if (restoredBalance !== null && restoredBalance > 0) {
            // 복원된 잔액으로 데이터 재생성
            pointsData = await PointsSecurityService.createInitialPointsData(restoredBalance);
            secureLog.info('🔄 자동 복원 성공');
          } else {
            // 신규 사용자 - 초기 데이터 생성
            pointsData = await PointsSecurityService.createInitialPointsData(INITIAL_POINTS);
            secureLog.info('🎉 신규 사용자 - 초기 포인트 생성');
          }
        }
        
        // 3. 광고 제한 데이터 로드
        const adLimitData = await loadAdLimitData();
        
        // 4. 일일 광고 리셋 확인
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (pointsData.updated_at < today.getTime()) {
          // 새 날이 시작됨 - 일일 통계 리셋
          pointsData = await PointsSecurityService.resetDailyStats(pointsData);
        }
        
        // 5. 트랜잭션 체인 검증
        const verifyResult = await PointsSecurityService.verifyTransactionChain();
        if (!verifyResult.valid) {
          secureLog.warn('⚠️ 트랜잭션 체인 검증 실패');
          if (isMountedRef.current) setIsSecure(false);
        }
        
        if (isMountedRef.current) {
          setBalance(pointsData.balance);
          setSecureData(pointsData);
          setAdCount(adLimitData.count);
          setAdResetTime(adLimitData.resetTimestamp);
          setLastAdTimestamp(adLimitData.lastWatchTimestamp);
          setIsLoading(false);
          
          // 히스토리는 별도로 구성 (간략화된 버전)
          setHistory([{
            id: 'summary',
            amount: pointsData.total_earned,
            reason: '📊 총 적립 포인트',
            timestamp: pointsData.updated_at,
          }]);
        }
      } catch (error) {
        secureLog.error('데이터 초기화 실패');
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };
    
    initializeData();
    
    return () => { isMountedRef.current = false; };
  }, []);

  // ==================== 보안 검사 (주기적) ====================
  useEffect(() => {
    if (isLoading || securityCheckRef.current) return;
    
    const runPeriodicSecurityCheck = async () => {
      securityCheckRef.current = true;
      
      const result = await PointsSecurityService.runSecurityCheck();
      
      if (!result.is_valid && isMountedRef.current) {
        setIsSecure(false);
        secureLog.warn('⚠️ 보안 검사 실패:', result.issues.join(', '));
        
        // 복구된 데이터가 있으면 적용
        if (result.recovered_data) {
          setBalance(result.recovered_data.balance);
          setSecureData(result.recovered_data);
        }
      }
      
      securityCheckRef.current = false;
    };
    
    // 초기 검사 (15초 후)
    const initialCheck = setTimeout(runPeriodicSecurityCheck, 15000);
    
    // 주기적 검사 (10분마다 — 성능 최적화)
    const interval = setInterval(runPeriodicSecurityCheck, 10 * 60 * 1000);
    
    return () => {
      clearTimeout(initialCheck);
      clearInterval(interval);
    };
  }, [isLoading]);

  // ==================== 광고 리셋 시간 체크 ====================
  useEffect(() => {
    const checkReset = () => {
      const now = Date.now();
      if (now >= adResetTime && adCount > 0) {
        const newResetTime = now + AD_RESET_PERIOD_MS;
        setAdCount(0);
        setAdResetTime(newResetTime);
        saveAdLimitData({ 
          count: 0, 
          resetTimestamp: newResetTime,
          lastWatchTimestamp: 0,
        });
      }
    };
    
    const interval = setInterval(checkReset, 60000);
    return () => clearInterval(interval);
  }, [adResetTime, adCount]);

  // ==================== 포인트 추가 ====================
  const addPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    const result = await withPointsLock(async () => {
      const currentBalance = balanceRef.current;
      const currentSecureData = secureDataRef.current;
      if (!currentSecureData || amount <= 0) return false;
      
      try {
        const newBalance = currentBalance + amount;
        
        // 포인트 변동 검증
        if (!PointsSecurityService.validatePointChange(currentBalance, newBalance, amount)) {
          secureLog.warn('⚠️ 포인트 변동 검증 실패');
          return false;
        }
        
        // 트랜잭션 기록
        const tx = await PointsSecurityService.addTransaction('earn', amount, newBalance, { reason });
        if (!tx) {
          return false;
        }
        
        // 새 데이터 저장
        const newData: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'> = {
          ...currentSecureData,
          balance: newBalance,
          total_earned: currentSecureData.total_earned + amount,
        };
        
        const saved = await PointsSecurityService.saveSecurePointsData(newData);
        if (!saved) return false;
        
        // 저장 후 최신 데이터 로드 (무결성 해시 동기화)
        const freshData = await PointsSecurityService.loadSecurePointsData();
        
        if (isMountedRef.current) {
          setBalance(newBalance);
          if (freshData) setSecureData(freshData);
          setHistory(prev => [{
            id: tx.id,
            amount,
            reason,
            timestamp: tx.timestamp,
            tx_hash: tx.hash,
          }, ...prev.slice(0, 99)]);
        }
        
        // 다른 usePoints 인스턴스에 상태 변경 알림
        _notifyPointsListeners();
        return true;
      } catch {
        return false;
      }
    });
    return result ?? false;
  }, []); // ref + mutex 사용으로 deps 불필요

  // ==================== 광고 시청 보상 ====================
  const watchAdForPoints = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    const result = await withPointsLock(async () => {
      const currentSecureData = secureDataRef.current;
      if (!currentSecureData) {
        return { success: false, message: '데이터 로드 중입니다.' };
      }
      
      try {
        const now = Date.now();
        
        // 1. 광고 시청 패턴 검증 (ref 기반)
        const validation = await PointsSecurityService.validateAdWatchPattern(lastAdTimestampRef.current);
        if (!validation.allowed) {
          return {
            success: false,
            message: validation.reason || '잠시 후 다시 시도해주세요.',
          };
        }
        
        // 2. 리셋 시간 체크 (ref 기반)
        let currentAdCount = adCountRef.current;
        let currentResetTime = adResetTimeRef.current;
        
        if (now >= currentResetTime) {
          currentAdCount = 0;
          currentResetTime = now + AD_RESET_PERIOD_MS;
          setAdCount(0);
          setAdResetTime(currentResetTime);
        }
        
        // 3. 광고 제한 체크
        if (currentAdCount >= MAX_ADS_PER_PERIOD) {
          const remaining = Math.max(0, currentResetTime - now);
          const hoursLeft = Math.floor(remaining / (60 * 60 * 1000));
          const minutesLeft = Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000));
          
          return {
            success: false,
            message: `🚫 광고 시청 한도 초과\n\n6시간당 최대 ${MAX_ADS_PER_PERIOD}개까지 시청 가능합니다.\n\n⏰ 리셋까지: ${hoursLeft > 0 ? `${hoursLeft}시간 ` : ''}${minutesLeft}분`,
          };
        }
        
        // 4. 포인트 계산
        const currentBalance = balanceRef.current;
        const newBalance = currentBalance + AD_REWARD_POINTS;
        
        // 5. 포인트 변동 검증
        if (!PointsSecurityService.validatePointChange(currentBalance, newBalance, AD_REWARD_POINTS)) {
          return { success: false, message: '포인트 처리 중 오류가 발생했습니다.' };
        }
        
        // 6. 트랜잭션 기록
        const tx = await PointsSecurityService.addTransaction('ad_watch', AD_REWARD_POINTS, newBalance, {
          ad_index: currentAdCount + 1,
          reset_time: currentResetTime,
        });
        
        if (!tx) {
          return { success: false, message: '트랜잭션 기록 실패' };
        }
        
        // 7. 광고 시청 기록
        await PointsSecurityService.recordAdWatch(AD_REWARD_POINTS, tx.hash);
        
        // 8. 새 데이터 저장
        const latestSecureData = secureDataRef.current ?? currentSecureData;
        const newAdCount = currentAdCount + 1;
        const newData: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'> = {
          ...latestSecureData,
          balance: newBalance,
          total_earned: latestSecureData.total_earned + AD_REWARD_POINTS,
          ad_watches_total: latestSecureData.ad_watches_total + 1,
          ad_watches_today: latestSecureData.ad_watches_today + 1,
          last_ad_timestamp: now,
        };
        
        await Promise.all([
          PointsSecurityService.saveSecurePointsData(newData),
          saveAdLimitData({
            count: newAdCount,
            resetTimestamp: currentResetTime,
            lastWatchTimestamp: now,
          }),
        ]);
        
        // 저장 후 최신 데이터 로드 (무결성 해시 동기화)
        const freshData = await PointsSecurityService.loadSecurePointsData();
        
        if (isMountedRef.current) {
          setBalance(newBalance);
          if (freshData) setSecureData(freshData);
          setAdCount(newAdCount);
          setAdResetTime(currentResetTime);
          setLastAdTimestamp(now);
          setHistory(prev => [{
            id: tx.id,
            amount: AD_REWARD_POINTS,
            reason: '📺 광고 시청 보상',
            timestamp: now,
            tx_hash: tx.hash,
          }, ...prev.slice(0, 99)]);
        }
        
        const remaining = MAX_ADS_PER_PERIOD - newAdCount;
        
        // 다른 usePoints 인스턴스에 상태 변경 알림
        _notifyPointsListeners();
        return {
          success: true,
          message: `💰 ${AD_REWARD_POINTS}P 적립 완료!\n\n현재 잔액: ${newBalance.toLocaleString()}P\n남은 광고: ${remaining}개`,
        };
      } catch {
        return { success: false, message: '포인트 적립에 실패했습니다.' };
      }
    });
    return result ?? { success: false, message: '이미 처리 중입니다. 잠시 후 다시 시도해주세요.' };
  }, []); // ref + mutex 사용으로 모든 state deps 제거

  // ==================== 포인트 사용 ====================
  const spendPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    const result = await withPointsLock(async () => {
      const currentBalance = balanceRef.current;
      const currentSecureData = secureDataRef.current;
      if (!currentSecureData || amount <= 0 || currentBalance < amount) return false;
      
      try {
        const newBalance = currentBalance - amount;
        
        // 트랜잭션 기록
        const tx = await PointsSecurityService.addTransaction('spend', -amount, newBalance, { reason });
        if (!tx) return false;
        
        // 새 데이터 저장
        const newData: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'> = {
          ...currentSecureData,
          balance: newBalance,
          total_spent: currentSecureData.total_spent + amount,
        };
      
        const saved = await PointsSecurityService.saveSecurePointsData(newData);
        if (!saved) return false;
        
        // 저장 후 최신 데이터 로드 (무결성 해시 동기화)
        const freshData = await PointsSecurityService.loadSecurePointsData();
        
        if (isMountedRef.current) {
          setBalance(newBalance);
          if (freshData) setSecureData(freshData);
          setHistory(prev => [{
            id: tx.id,
            amount: -amount,
            reason,
            timestamp: tx.timestamp,
            tx_hash: tx.hash,
          }, ...prev.slice(0, 99)]);
        }
        
        // 다른 usePoints 인스턴스에 상태 변경 알림
        _notifyPointsListeners();
        return true;
      } catch {
        return false;
      }
    });
    return result ?? false;
  }, []); // ref + mutex 사용으로 deps 불필요

  // ==================== 포인트 자동 동기화 ====================
  // 포인트 변경 시 자동 백업
  useEffect(() => {
    if (!isLoading && balance > 0) {
      PointsAutoSyncService.autoBackup().catch(() => {});
    }
  }, [balance, isLoading]);

  // 앱 시작 시 자동 동기화 시작 + AppState 백그라운드 저장
  // 참조 카운터 패턴: 첫 인스턴스만 시작, 마지막 인스턴스만 중지
  useEffect(() => {
    _syncRefCount++;
    if (_syncRefCount === 1) {
      PointsAutoSyncService.startAutoSync();
    }

    // AppState: 앱이 백그라운드로 갈 때 즉시 백업
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        PointsAutoSyncService.autoBackup().catch(() => {});
      }
    });

    return () => {
      _syncRefCount--;
      if (_syncRefCount <= 0) {
        _syncRefCount = 0;
        PointsAutoSyncService.stopAutoSync();
      }
      appStateSub.remove();
    };
  }, []);

  // ==================== 광고 제한 리셋 (DEV 전용) ====================
  const resetAdLimit = useCallback(async (): Promise<void> => {
    if (!__DEV__) return; // 프로덕션에서는 절대 실행 불가
    
    const now = Date.now();
    const newResetTime = now + AD_RESET_PERIOD_MS;
    
    await saveAdLimitData({ 
      count: 0, 
      resetTimestamp: newResetTime,
      lastWatchTimestamp: 0,
    });
    
    if (isMountedRef.current) {
      setAdCount(0);
      setAdResetTime(newResetTime);
      setLastAdTimestamp(0);
    }
  }, []);

  // ==================== 보안 상태 확인 ====================
  const checkSecurity = useCallback(async (): Promise<{
    isValid: boolean;
    issues: string[];
  }> => {
    const result = await PointsSecurityService.runSecurityCheck();
    return {
      isValid: result.is_valid,
      issues: result.issues,
    };
  }, []);

  return {
    // 포인트 상태
    balance,
    history,
    isLoading,
    
    // 광고 상태
    adCount,
    remainingAds,
    canWatchAd,
    timeUntilReset,
    adResetTime,
    maxAds: MAX_ADS_PER_PERIOD,
    adRewardPoints: AD_REWARD_POINTS,
    
    // 보안 상태
    deviceId,
    isSecure,
    totalEarned: secureData?.total_earned ?? 0,
    totalSpent: secureData?.total_spent ?? 0,
    totalAdWatches: secureData?.ad_watches_total ?? 0,
    
    // 기본 함수
    addPoints,
    spendPoints,
    watchAdForPoints,
    resetAdLimit,
    
    // 보안 검사
    checkSecurity,
  };
};

export default usePoints;
