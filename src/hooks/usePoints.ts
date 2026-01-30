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
import { Alert } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog, encryptData, decryptData } from '../utils/secureStorage';
import PointsSecurityService, { 
  SecurePointsData,
  Transaction,
} from '../services/PointsSecurityService';

// ==================== 상수 정의 ====================
const INITIAL_POINTS = 2500; // 가입 축하 포인트
const AD_REWARD_POINTS = 50; // 광고 1회 시청 보상
const MAX_ADS_PER_PERIOD = 10; // 기간당 최대 광고 수
const AD_RESET_PERIOD_MS = 6 * 60 * 60 * 1000; // 6시간 (밀리초)
const AD_LIMIT_STORAGE_KEY = '@soloparty_ad_limit_v3';

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
        // 이전 버전 데이터
      }
      
      const parsed: AdLimitData = JSON.parse(data);
      const now = Date.now();
      
      // 리셋 시간이 지났으면 초기화
      if (now >= parsed.resetTimestamp) {
        return {
          count: 0,
          resetTimestamp: now + AD_RESET_PERIOD_MS,
          lastWatchTimestamp: 0,
        };
      }
      
      return parsed;
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

  // 광고 시청 가능 여부
  const canWatchAd = useMemo(() => {
    const now = Date.now();
    const MIN_AD_INTERVAL_MS = 5000;
    return adCount < MAX_ADS_PER_PERIOD && (now - lastAdTimestamp) >= MIN_AD_INTERVAL_MS;
  }, [adCount, lastAdTimestamp]);
  
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
          // 신규 사용자 - 초기 데이터 생성
          pointsData = await PointsSecurityService.createInitialPointsData(INITIAL_POINTS);
          secureLog.info('🎉 신규 사용자 - 초기 포인트 생성');
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
    
    // 초기 검사 (10초 후)
    const initialCheck = setTimeout(runPeriodicSecurityCheck, 10000);
    
    // 주기적 검사 (5분마다)
    const interval = setInterval(runPeriodicSecurityCheck, 5 * 60 * 1000);
    
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
    if (!secureData || amount <= 0) return false;
    
    try {
      const newBalance = balance + amount;
      
      // 포인트 변동 검증
      if (!PointsSecurityService.validatePointChange(balance, newBalance, amount)) {
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
        ...secureData,
        balance: newBalance,
        total_earned: secureData.total_earned + amount,
      };
      
      const saved = await PointsSecurityService.saveSecurePointsData(newData);
      if (!saved) return false;
      
      if (isMountedRef.current) {
        setBalance(newBalance);
        setSecureData({ 
          ...newData, 
          integrity_hash: secureData.integrity_hash,
          updated_at: Date.now(),
        });
        setHistory(prev => [{
          id: tx.id,
          amount,
          reason,
          timestamp: tx.timestamp,
          tx_hash: tx.hash,
        }, ...prev.slice(0, 99)]);
      }
      
      return true;
    } catch {
      return false;
    }
  }, [balance, secureData]);

  // ==================== 광고 시청 보상 ====================
  const watchAdForPoints = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (!secureData) {
      return { success: false, message: '데이터 로드 중입니다.' };
    }
    
    try {
      const now = Date.now();
      
      // 1. 광고 시청 패턴 검증
      const validation = await PointsSecurityService.validateAdWatchPattern(lastAdTimestamp);
      if (!validation.allowed) {
        return {
          success: false,
          message: validation.reason || '잠시 후 다시 시도해주세요.',
        };
      }
      
      // 2. 리셋 시간 체크
      let currentAdCount = adCount;
      let currentResetTime = adResetTime;
      
      if (now >= adResetTime) {
        currentAdCount = 0;
        currentResetTime = now + AD_RESET_PERIOD_MS;
        setAdCount(0);
        setAdResetTime(currentResetTime);
      }
      
      // 3. 광고 제한 체크
      if (currentAdCount >= MAX_ADS_PER_PERIOD) {
        const hoursLeft = Math.ceil(timeUntilReset / (60 * 60 * 1000));
        const minutesLeft = Math.ceil((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));
        
        return {
          success: false,
          message: `🚫 광고 시청 한도 초과\n\n6시간당 최대 ${MAX_ADS_PER_PERIOD}개까지 시청 가능합니다.\n\n⏰ 리셋까지: ${hoursLeft > 0 ? `${hoursLeft}시간 ` : ''}${minutesLeft}분`,
        };
      }
      
      // 4. 포인트 계산
      const newBalance = balance + AD_REWARD_POINTS;
      
      // 5. 포인트 변동 검증
      if (!PointsSecurityService.validatePointChange(balance, newBalance, AD_REWARD_POINTS)) {
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
      const newAdCount = currentAdCount + 1;
      const newData: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'> = {
        ...secureData,
        balance: newBalance,
        total_earned: secureData.total_earned + AD_REWARD_POINTS,
        ad_watches_total: secureData.ad_watches_total + 1,
        ad_watches_today: secureData.ad_watches_today + 1,
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
      
      if (isMountedRef.current) {
        setBalance(newBalance);
        setSecureData({
          ...newData,
          integrity_hash: secureData.integrity_hash,
          updated_at: now,
        });
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
      
      return {
        success: true,
        message: `💰 ${AD_REWARD_POINTS}P 적립 완료!\n\n현재 잔액: ${newBalance.toLocaleString()}P\n남은 광고: ${remaining}개`,
      };
    } catch {
      return { success: false, message: '포인트 적립에 실패했습니다.' };
    }
  }, [balance, secureData, adCount, adResetTime, lastAdTimestamp, timeUntilReset]);

  // ==================== 포인트 사용 ====================
  const spendPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    if (!secureData || amount <= 0 || balance < amount) return false;
    
    try {
      const newBalance = balance - amount;
      
      // 트랜잭션 기록
      const tx = await PointsSecurityService.addTransaction('spend', -amount, newBalance, { reason });
      if (!tx) return false;
      
      // 새 데이터 저장
      const newData: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'> = {
        ...secureData,
        balance: newBalance,
        total_spent: secureData.total_spent + amount,
      };
      
      const saved = await PointsSecurityService.saveSecurePointsData(newData);
      if (!saved) return false;
      
      if (isMountedRef.current) {
        setBalance(newBalance);
        setSecureData({
          ...newData,
          integrity_hash: secureData.integrity_hash,
          updated_at: Date.now(),
        });
        setHistory(prev => [{
          id: tx.id,
          amount: -amount,
          reason,
          timestamp: tx.timestamp,
          tx_hash: tx.hash,
        }, ...prev.slice(0, 99)]);
      }
      
      return true;
    } catch {
      return false;
    }
  }, [balance, secureData]);

  // ==================== 광고 제한 리셋 (테스트용) ====================
  const resetAdLimit = useCallback(async (): Promise<void> => {
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
