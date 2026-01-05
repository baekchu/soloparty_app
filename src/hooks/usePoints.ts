/**
 * ==================== 포인트 & 광고 관리 훅 ====================
 * 
 * 기능:
 *   - 포인트 적립/사용 관리
 *   - 광고 시청 시 50P 적립
 *   - 6시간당 최대 10개 광고 시청 제한
 *   - 앱 삭제 전까지 데이터 유지 (AsyncStorage)
 * 
 * ========================================================================
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

// ==================== 상수 정의 ====================
const STORAGE_KEYS = {
  POINTS_DATA: '@points_data',
  AD_LIMIT: '@ad_limit_data',
} as const;

const INITIAL_POINTS = 2500; // 가입 축하 포인트
const AD_REWARD_POINTS = 50; // 광고 1회 시청 보상
const MAX_ADS_PER_PERIOD = 10; // 기간당 최대 광고 수
const AD_RESET_PERIOD_MS = 6 * 60 * 60 * 1000; // 6시간 (밀리초)

// ==================== 타입 정의 ====================
interface PointHistory {
  id: string;
  amount: number;
  reason: string;
  timestamp: number;
}

interface PointsData {
  balance: number;
  history: PointHistory[];
}

interface AdLimitData {
  count: number;
  resetTimestamp: number; // 다음 리셋 시간
}

// ==================== 유틸리티 함수 ====================
const generateId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

// ==================== 데이터 로드/저장 ====================
const loadPointsData = async (): Promise<PointsData> => {
  try {
    const data = await safeGetItem(STORAGE_KEYS.POINTS_DATA);
    if (data) {
      const parsed = JSON.parse(data);
      if (typeof parsed.balance === 'number' && Array.isArray(parsed.history)) {
        return parsed;
      }
    }
  } catch {
    // 로드 실패 시 기본값
  }
  
  // 기본값: 초기 포인트
  return {
    balance: INITIAL_POINTS,
    history: [{
      id: generateId('init'),
      amount: INITIAL_POINTS,
      reason: '🎉 가입 축하 포인트',
      timestamp: Date.now()
    }]
  };
};

const savePointsData = async (data: PointsData): Promise<void> => {
  try {
    await safeSetItem(STORAGE_KEYS.POINTS_DATA, JSON.stringify(data));
  } catch {
    // 저장 실패는 무시
  }
};

const loadAdLimitData = async (): Promise<AdLimitData> => {
  try {
    const data = await safeGetItem(STORAGE_KEYS.AD_LIMIT);
    if (data) {
      const parsed: AdLimitData = JSON.parse(data);
      const now = Date.now();
      
      // 리셋 시간이 지났으면 초기화
      if (now >= parsed.resetTimestamp) {
        return {
          count: 0,
          resetTimestamp: now + AD_RESET_PERIOD_MS,
        };
      }
      return parsed;
    }
  } catch {
    // 로드 실패 시 기본값
  }
  
  return {
    count: 0,
    resetTimestamp: Date.now() + AD_RESET_PERIOD_MS,
  };
};

const saveAdLimitData = async (data: AdLimitData): Promise<void> => {
  try {
    await safeSetItem(STORAGE_KEYS.AD_LIMIT, JSON.stringify(data));
  } catch {
    // 저장 실패는 무시
  }
};

// ==================== 메인 훅 ====================
export const usePoints = () => {
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<PointHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 광고 관련 상태
  const [adCount, setAdCount] = useState(0);
  const [adResetTime, setAdResetTime] = useState(0);
  
  const isMountedRef = useRef(true);

  // 광고 시청 가능 여부
  const canWatchAd = useMemo(() => adCount < MAX_ADS_PER_PERIOD, [adCount]);
  
  // 남은 광고 수
  const remainingAds = useMemo(() => Math.max(0, MAX_ADS_PER_PERIOD - adCount), [adCount]);
  
  // 리셋까지 남은 시간 (밀리초)
  const timeUntilReset = useMemo(() => {
    const now = Date.now();
    return Math.max(0, adResetTime - now);
  }, [adResetTime]);

  // 초기 로드
  useEffect(() => {
    isMountedRef.current = true;
    
    const loadData = async () => {
      const [pointsData, adLimitData] = await Promise.all([
        loadPointsData(),
        loadAdLimitData(),
      ]);
      
      if (isMountedRef.current) {
        setBalance(pointsData.balance);
        setHistory(pointsData.history);
        setAdCount(adLimitData.count);
        setAdResetTime(adLimitData.resetTimestamp);
        setIsLoading(false);
      }
    };
    
    loadData();
    
    return () => { isMountedRef.current = false; };
  }, []);

  // 광고 리셋 시간 체크 (1분마다)
  useEffect(() => {
    const checkReset = () => {
      const now = Date.now();
      if (now >= adResetTime && adCount > 0) {
        const newResetTime = now + AD_RESET_PERIOD_MS;
        setAdCount(0);
        setAdResetTime(newResetTime);
        saveAdLimitData({ count: 0, resetTimestamp: newResetTime });
      }
    };
    
    const interval = setInterval(checkReset, 60000); // 1분마다 체크
    return () => clearInterval(interval);
  }, [adResetTime, adCount]);

  // 포인트 추가 (일반)
  const addPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    try {
      if (amount <= 0) return false;
      
      const newBalance = balance + amount;
      const newHistory = [
        {
          id: generateId('add'),
          amount,
          reason,
          timestamp: Date.now()
        },
        ...history.slice(0, 99) // 최대 100개 보관
      ];
      
      await savePointsData({ balance: newBalance, history: newHistory });
      
      if (isMountedRef.current) {
        setBalance(newBalance);
        setHistory(newHistory);
      }
      
      return true;
    } catch {
      return false;
    }
  }, [balance, history]);

  // 광고 시청 보상 (6시간 제한 적용)
  const watchAdForPoints = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const now = Date.now();
      
      // 리셋 시간 체크
      let currentAdCount = adCount;
      let currentResetTime = adResetTime;
      
      if (now >= adResetTime) {
        currentAdCount = 0;
        currentResetTime = now + AD_RESET_PERIOD_MS;
        setAdCount(0);
        setAdResetTime(currentResetTime);
      }
      
      // 광고 제한 체크
      if (currentAdCount >= MAX_ADS_PER_PERIOD) {
        const hoursLeft = Math.ceil(timeUntilReset / (60 * 60 * 1000));
        const minutesLeft = Math.ceil((timeUntilReset % (60 * 60 * 1000)) / (60 * 1000));
        
        return {
          success: false,
          message: `🚫 광고 시청 한도 초과\n\n6시간당 최대 ${MAX_ADS_PER_PERIOD}개까지 시청 가능합니다.\n\n⏰ 리셋까지: ${hoursLeft > 0 ? `${hoursLeft}시간 ` : ''}${minutesLeft}분`,
        };
      }
      
      // 포인트 적립
      const newBalance = balance + AD_REWARD_POINTS;
      const newHistory = [
        {
          id: generateId('ad'),
          amount: AD_REWARD_POINTS,
          reason: '📺 광고 시청 보상',
          timestamp: now
        },
        ...history.slice(0, 99)
      ];
      
      // 광고 카운트 증가
      const newAdCount = currentAdCount + 1;
      
      // 저장
      await Promise.all([
        savePointsData({ balance: newBalance, history: newHistory }),
        saveAdLimitData({ count: newAdCount, resetTimestamp: currentResetTime }),
      ]);
      
      if (isMountedRef.current) {
        setBalance(newBalance);
        setHistory(newHistory);
        setAdCount(newAdCount);
        setAdResetTime(currentResetTime);
      }
      
      const remaining = MAX_ADS_PER_PERIOD - newAdCount;
      
      return {
        success: true,
        message: `💰 ${AD_REWARD_POINTS}P 적립 완료!\n\n현재 잔액: ${newBalance.toLocaleString()}P\n남은 광고: ${remaining}개`,
      };
    } catch {
      return {
        success: false,
        message: '포인트 적립에 실패했습니다. 다시 시도해주세요.',
      };
    }
  }, [balance, history, adCount, adResetTime, timeUntilReset]);

  // 포인트 사용
  const spendPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    try {
      if (amount <= 0 || balance < amount) return false;
      
      const newBalance = balance - amount;
      const newHistory = [
        {
          id: generateId('spend'),
          amount: -amount,
          reason,
          timestamp: Date.now()
        },
        ...history.slice(0, 99)
      ];
      
      await savePointsData({ balance: newBalance, history: newHistory });
      
      if (isMountedRef.current) {
        setBalance(newBalance);
        setHistory(newHistory);
      }
      
      return true;
    } catch {
      return false;
    }
  }, [balance, history]);

  // 수동 리셋 (테스트/관리용)
  const resetAdLimit = useCallback(async (): Promise<void> => {
    const now = Date.now();
    const newResetTime = now + AD_RESET_PERIOD_MS;
    
    await saveAdLimitData({ count: 0, resetTimestamp: newResetTime });
    
    if (isMountedRef.current) {
      setAdCount(0);
      setAdResetTime(newResetTime);
    }
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
    
    // 함수
    addPoints,
    spendPoints,
    watchAdForPoints,
    resetAdLimit,
  };
};

export default usePoints;
