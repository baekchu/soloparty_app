/**
 * ==================== 적립금 시스템 ====================
 * 
 * 기능:
 *   - 광고 시청 시 50원 적립 (변경: 100원 → 50원)
 *   - 사용자별 데이터 분리 저장
 *   - 적립금으로 솔로파티 티켓 교환
 *   - 적립/사용 내역 관리
 *   - 티켓 사용 내역 추적
 * 
 * 사용 방법:
 *   1. App.tsx에서 <UserProvider> → <RewardProvider>로 감싸기
 *   2. 컴포넌트에서 const { balance, addReward, spendReward } = useReward();
 * 
 * ========================================================================
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useUser } from './UserContext';

interface RewardContextType {
  balance: number;
  rewardHistory: RewardHistory[];
  dailyAdCount: number;
  maxDailyAds: number;
  canWatchAd: boolean;
  addReward: (amount: number, reason: string) => Promise<void>;
  spendReward: (amount: number, purpose: string) => Promise<boolean>;
  resetDailyAdCount: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

interface RewardHistory {
  id: string;
  amount: number;
  type: 'earn' | 'spend';
  reason: string;
  date: string;
  userId: string;
  deviceInfo?: {
    brand: string | null;
    modelName: string | null;
  };
}

interface DailyAdLimit {
  date: string; // YYYY-MM-DD
  timestamp: number; // 마지막 리셋 시간 (Unix timestamp)
  count: number;
  userId: string;
}

const RewardContext = createContext<RewardContextType | undefined>(undefined);

export const RewardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [balance, setBalance] = useState(0);
  const [rewardHistory, setRewardHistory] = useState<RewardHistory[]>([]);
  const [dailyAdCount, setDailyAdCount] = useState(0);
  const maxDailyAds = 10;
  const { userId, isLoading: userLoading, getUserData } = useUser();

  // canWatchAd를 useMemo로 최적화
  const canWatchAd = useMemo(() => dailyAdCount < maxDailyAds, [dailyAdCount]);

  // 사용자별 데이터 로드
  useEffect(() => {
    if (userId && !userLoading) {
      loadRewardData();
    }
  }, [userId, userLoading]);

  // 사용자별 데이터 로드
  const loadRewardData = useCallback(async () => {
    if (!userId) return;

    try {
      // AsyncStorage 병렬 처리로 성능 향상
      const [savedBalance, savedHistory] = await Promise.all([
        AsyncStorage.getItem(`reward_balance_${userId}`),
        AsyncStorage.getItem(`reward_history_${userId}`)
      ]);
      
      if (savedBalance) {
        setBalance(parseInt(savedBalance));
      }
      if (savedHistory) {
        setRewardHistory(JSON.parse(savedHistory));
      }

      // 광고 시청 횟수 로드
      await loadDailyAdCount();
    } catch (error) {
      console.error('적립금 로드 실패:', error);
    }
  }, [userId]);

  // 6시간마다 광고 시청 횟수 로드
  const loadDailyAdCount = useCallback(async () => {
    if (!userId) return;

    try {
      const now = Date.now();
      const sixHoursInMs = 6 * 60 * 60 * 1000;
      const savedLimitStr = await AsyncStorage.getItem(`daily_ad_limit_${userId}`);
      
      if (savedLimitStr) {
        const savedLimit: DailyAdLimit = JSON.parse(savedLimitStr);
        const timeSinceReset = now - (savedLimit.timestamp || 0);
        
        if (timeSinceReset < sixHoursInMs) {
          setDailyAdCount(savedLimit.count);
        } else {
          await resetDailyAdCount(true);
        }
      } else {
        setDailyAdCount(0);
      }
    } catch (error) {
      console.error('광고 카운트 로드 실패:', error);
    }
  }, [userId]);

  // 6시간마다 광고 카운트 리셋
  const resetDailyAdCount = useCallback(async (sendNotification: boolean = false) => {
    if (!userId) return;

    try {
      const now = Date.now();
      const today = new Date().toISOString().split('T')[0];
      const newLimit: DailyAdLimit = {
        date: today,
        timestamp: now,
        count: 0,
        userId,
      };
      await AsyncStorage.setItem(`daily_ad_limit_${userId}`, JSON.stringify(newLimit));
      setDailyAdCount(0);

      if (sendNotification) {
        const { sendAdLimitResetNotification } = require('../services/NotificationService');
        await sendAdLimitResetNotification();
      }
    } catch (error) {
      console.error('광고 카운트 리셋 실패:', error);
    }
  }, [userId]);

  const addReward = useCallback(async (amount: number, reason: string) => {
    if (!userId) {
      Alert.alert('오류', '사용자 정보를 불러오는 중입니다.');
      return;
    }
    // 광고 시청 보상인 경우 일일 제한 체크
    if (reason.includes('광고')) {
      if (dailyAdCount >= maxDailyAds) {
        Alert.alert(
          '🚫 광고 시청 한도 초과',
          `6시간 동안 최대 ${maxDailyAds}개의 광고만 시청할 수 있습니다.\n6시간 후 다시 시도해주세요!`,
          [{ text: '확인' }]
        );
        return;
      }

      // 광고 시청 횟수 증가
      const now = Date.now();
      const today = new Date().toISOString().split('T')[0];
      const newCount = dailyAdCount + 1;
      
      // 기존 timestamp 유지 (새로 시작하는 경우에만 새 timestamp)
      const savedLimitStr = await AsyncStorage.getItem(`daily_ad_limit_${userId}`);
      let timestamp = now;
      if (savedLimitStr) {
        const savedLimit: DailyAdLimit = JSON.parse(savedLimitStr);
        timestamp = savedLimit.timestamp || now;
      }
      
      const newLimit: DailyAdLimit = {
        date: today,
        timestamp,
        count: newCount,
        userId,
      };
      await AsyncStorage.setItem(`daily_ad_limit_${userId}`, JSON.stringify(newLimit));
      setDailyAdCount(newCount);
    }
    try {
      const newBalance = balance + amount;
      const userData = await getUserData();
      
      const newHistory: RewardHistory = {
        id: Date.now().toString(),
        amount,
        type: 'earn',
        reason,
        date: new Date().toISOString(),
        userId,
        deviceInfo: userData?.deviceInfo ? {
          brand: userData.deviceInfo.brand,
          modelName: userData.deviceInfo.modelName,
        } : undefined,
      };

      setBalance(newBalance);
      const updatedHistory = [newHistory, ...rewardHistory].slice(0, 100);
      setRewardHistory(updatedHistory);

      // AsyncStorage 병렬 저장으로 성능 향상
      await Promise.all([
        AsyncStorage.setItem(`reward_balance_${userId}`, newBalance.toString()),
        AsyncStorage.setItem(`reward_history_${userId}`, JSON.stringify(updatedHistory)),
        saveToGlobalHistory(newHistory)
      ]);

      Alert.alert(
        '💰 적립 완료!',
        `${amount}원이 적립되었습니다!\n현재 잔액: ${newBalance.toLocaleString()}원`,
        [{ text: '확인' }]
      );
    } catch (error) {
      console.error('적립금 추가 실패:', error);
      Alert.alert('오류', '적립금 추가에 실패했습니다.');
    }
  }, [userId, balance, rewardHistory, dailyAdCount, maxDailyAds, getUserData]);

  const spendReward = useCallback(async (amount: number, purpose: string): Promise<boolean> => {
    if (!userId) {
      Alert.alert('오류', '사용자 정보를 불러오는 중입니다.');
      return false;
    }

    if (balance < amount) {
      Alert.alert(
        '잔액 부족',
        `현재 잔액: ${balance.toLocaleString()}원\n필요 금액: ${amount.toLocaleString()}원\n\n광고를 보고 적립금을 모아보세요!`,
        [{ text: '확인' }]
      );
      return false;
    }

    try {
      const newBalance = balance - amount;
      const userData = await getUserData();
      
      const newHistory: RewardHistory = {
        id: Date.now().toString(),
        amount: -amount,
        type: 'spend',
        reason: purpose,
        date: new Date().toISOString(),
        userId,
        deviceInfo: userData?.deviceInfo ? {
          brand: userData.deviceInfo.brand,
          modelName: userData.deviceInfo.modelName,
        } : undefined,
      };

      setBalance(newBalance);
      const updatedHistory = [newHistory, ...rewardHistory].slice(0, 100);
      setRewardHistory(updatedHistory);

      // AsyncStorage 병렬 저장 및 티켓 사용 내역 저장
      await Promise.all([
        AsyncStorage.setItem(`reward_balance_${userId}`, newBalance.toString()),
        AsyncStorage.setItem(`reward_history_${userId}`, JSON.stringify(updatedHistory)),
        saveToGlobalHistory(newHistory),
        saveTicketUsage({
          ticketName: purpose,
          amount,
          userId,
          deviceInfo: userData?.deviceInfo,
          usedAt: new Date().toISOString(),
        })
      ]);

      return true;
    } catch (error) {
      console.error('적립금 사용 실패:', error);
      Alert.alert('오류', '적립금 사용에 실패했습니다.');
      return false;
    }
  }, [userId, balance, rewardHistory, getUserData]);

  // 전체 내역에 기록 (관리용)
  const saveToGlobalHistory = async (history: RewardHistory) => {
    try {
      const globalHistoryStr = await AsyncStorage.getItem('global_reward_history');
      const globalHistory: RewardHistory[] = globalHistoryStr ? JSON.parse(globalHistoryStr) : [];
      globalHistory.unshift(history);
      // 최근 1000개만 보관
      await AsyncStorage.setItem('global_reward_history', JSON.stringify(globalHistory.slice(0, 1000)));
    } catch (error) {
      console.error('전체 내역 저장 실패:', error);
    }
  };

  // 티켓 사용 내역 저장
  const saveTicketUsage = async (ticketData: any) => {
    try {
      const ticketUsageStr = await AsyncStorage.getItem('ticket_usage_history');
      const ticketUsage: any[] = ticketUsageStr ? JSON.parse(ticketUsageStr) : [];
      ticketUsage.unshift(ticketData);
      await AsyncStorage.setItem('ticket_usage_history', JSON.stringify(ticketUsage.slice(0, 500)));
    } catch (error) {
      console.error('티켓 사용 내역 저장 실패:', error);
    }
  };

  const refreshBalance = useCallback(async () => {
    await loadRewardData();
  }, [loadRewardData]);

  // Context value를 useMemo로 최적화
  const contextValue = useMemo(
    () => ({
      balance,
      rewardHistory,
      dailyAdCount,
      maxDailyAds,
      canWatchAd,
      addReward,
      spendReward,
      resetDailyAdCount,
      refreshBalance,
    }),
    [balance, rewardHistory, dailyAdCount, maxDailyAds, canWatchAd, addReward, spendReward, resetDailyAdCount]
  );

  return (
    <RewardContext.Provider value={contextValue}>
      {children}
    </RewardContext.Provider>
  );
};

export const useReward = () => {
  const context = useContext(RewardContext);
  if (!context) {
    throw new Error('useReward must be used within RewardProvider');
  }
  return context;
};
