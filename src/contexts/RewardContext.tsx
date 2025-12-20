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
  count: number;
  userId: string;
}

const RewardContext = createContext<RewardContextType | undefined>(undefined);

export const RewardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [balance, setBalance] = useState(0);
  const [rewardHistory, setRewardHistory] = useState<RewardHistory[]>([]);
  const [dailyAdCount, setDailyAdCount] = useState(0);
  const maxDailyAds = 10; // 하루 최대 10번
  const { userId, isLoading: userLoading, getUserData } = useUser();

  // 사용자별 데이터 로드
  useEffect(() => {
    if (userId && !userLoading) {
      loadRewardData();
    }
  }, [userId, userLoading]);

  const loadRewardData = async () => {
    if (!userId) return;

    try {
      const savedBalance = await AsyncStorage.getItem(`reward_balance_${userId}`);
      const savedHistory = await AsyncStorage.getItem(`reward_history_${userId}`);
      
      if (savedBalance) {
        setBalance(parseInt(savedBalance));
      }
      if (savedHistory) {
        setRewardHistory(JSON.parse(savedHistory));
      }

      // 일일 광고 시청 횟수 로드
      await loadDailyAdCount();
      
      console.log(`✅ 적립금 로드 (User: ${userId.slice(0, 8)}...): ${savedBalance || 0}원`);
    } catch (error) {
      console.error('적립금 로드 실패:', error);
    }
  };

  // 일일 광고 시청 횟수 로드
  const loadDailyAdCount = async () => {
    if (!userId) return;

    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const savedLimitStr = await AsyncStorage.getItem(`daily_ad_limit_${userId}`);
      
      if (savedLimitStr) {
        const savedLimit: DailyAdLimit = JSON.parse(savedLimitStr);
        
        if (savedLimit.date === today) {
          setDailyAdCount(savedLimit.count);
          console.log(`📊 오늘 광고 시청: ${savedLimit.count}/${maxDailyAds}`);
        } else {
          // 날짜가 바뀌면 카운트 리셋
          await resetDailyAdCount();
        }
      } else {
        setDailyAdCount(0);
      }
    } catch (error) {
      console.error('일일 광고 카운트 로드 실패:', error);
    }
  };

  // 일일 광고 카운트 리셋
  const resetDailyAdCount = useCallback(async () => {
    if (!userId) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const newLimit: DailyAdLimit = {
        date: today,
        count: 0,
        userId,
      };
      await AsyncStorage.setItem(`daily_ad_limit_${userId}`, JSON.stringify(newLimit));
      setDailyAdCount(0);
      console.log('🔄 일일 광고 카운트 리셋');
    } catch (error) {
      console.error('일일 광고 카운트 리셋 실패:', error);
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
          '🚫 일일 광고 시청 한도 초과',
          `하루에 최대 ${maxDailyAds}개의 광고만 시청할 수 있습니다.\n내일 다시 시도해주세요!`,
          [{ text: '확인' }]
        );
        return;
      }

      // 광고 시청 횟수 증가
      const today = new Date().toISOString().split('T')[0];
      const newCount = dailyAdCount + 1;
      const newLimit: DailyAdLimit = {
        date: today,
        count: newCount,
        userId,
      };
      await AsyncStorage.setItem(`daily_ad_limit_${userId}`, JSON.stringify(newLimit));
      setDailyAdCount(newCount);
      console.log(`📊 광고 시청 횟수: ${newCount}/${maxDailyAds}`);
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
      const updatedHistory = [newHistory, ...rewardHistory].slice(0, 100); // 최근 100개
      setRewardHistory(updatedHistory);

      await AsyncStorage.setItem(`reward_balance_${userId}`, newBalance.toString());
      await AsyncStorage.setItem(`reward_history_${userId}`, JSON.stringify(updatedHistory));

      // 전체 내역에도 기록 (관리용)
      await saveToGlobalHistory(newHistory);

      Alert.alert(
        '💰 적립 완료!',
        `${amount}원이 적립되었습니다!\n현재 잔액: ${newBalance.toLocaleString()}원`,
        [{ text: '확인' }]
      );
      
      console.log(`✅ 적립: ${amount}원 (User: ${userId.slice(0, 8)}..., Balance: ${newBalance}원)`);
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

      await AsyncStorage.setItem(`reward_balance_${userId}`, newBalance.toString());
      await AsyncStorage.setItem(`reward_history_${userId}`, JSON.stringify(updatedHistory));

      // 전체 내역에도 기록
      await saveToGlobalHistory(newHistory);

      // 티켓 사용 내역 저장
      await saveTicketUsage({
        ticketName: purpose,
        amount,
        userId,
        deviceInfo: userData?.deviceInfo,
        usedAt: new Date().toISOString(),
      });

      console.log(`✅ 사용: ${amount}원 (User: ${userId.slice(0, 8)}..., Balance: ${newBalance}원, Ticket: ${purpose})`);
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
      console.log('✅ 티켓 사용 내역 저장:', ticketData.ticketName);
    } catch (error) {
      console.error('티켓 사용 내역 저장 실패:', error);
    }
  };

  const refreshBalance = async () => {
    await loadRewardData();
  };

  // 광고 시청 가능 여부
  const canWatchAd = useMemo(() => dailyAdCount < maxDailyAds, [dailyAdCount, maxDailyAds]);

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
