/**
 * 포인트 관리 훅 (최적화 버전)
 * - 간소화된 저장 방식
 * - 기본 검증만 유지
 * - 성능 최적화
 */

import { useState, useEffect, useCallback } from 'react';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

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

const STORAGE_KEY = '@points_data';
const INITIAL_POINTS = 2500;

const loadPoints = async (): Promise<PointsData> => {
  try {
    const data = await safeGetItem(STORAGE_KEY);
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
      id: `init_${Date.now()}`,
      amount: INITIAL_POINTS,
      reason: '가입 축하 포인트',
      timestamp: Date.now()
    }]
  };
};

const savePoints = async (data: PointsData): Promise<void> => {
  try {
    await safeSetItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장 실패는 무시
  }
};

export const usePoints = () => {
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<PointHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 초기 로드
  useEffect(() => {
    let mounted = true;
    
    loadPoints().then(data => {
      if (mounted) {
        setBalance(data.balance);
        setHistory(data.history);
        setIsLoading(false);
      }
    });
    
    return () => { mounted = false; };
  }, []);

  // 포인트 추가
  const addPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    try {
      if (amount <= 0) return false;
      
      const newBalance = balance + amount;
      const newHistory = [
        {
          id: `add_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          amount,
          reason,
          timestamp: Date.now()
        },
        ...history.slice(0, 99) // 최대 100개 보관
      ];
      
      await savePoints({ balance: newBalance, history: newHistory });
      
      setBalance(newBalance);
      setHistory(newHistory);
      
      return true;
    } catch {
      return false;
    }
  }, [balance, history]);

  // 포인트 사용
  const spendPoints = useCallback(async (amount: number, reason: string): Promise<boolean> => {
    try {
      if (amount <= 0 || balance < amount) return false;
      
      const newBalance = balance - amount;
      const newHistory = [
        {
          id: `spend_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          amount: -amount,
          reason,
          timestamp: Date.now()
        },
        ...history.slice(0, 99)
      ];
      
      await savePoints({ balance: newBalance, history: newHistory });
      
      setBalance(newBalance);
      setHistory(newHistory);
      
      return true;
    } catch {
      return false;
    }
  }, [balance, history]);

  return {
    balance,
    history,
    isLoading,
    addPoints,
    spendPoints
  };
};
