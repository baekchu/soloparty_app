/**
 * ==================== 쿠폰 관리 훅 ====================
 * 
 * 기능:
 *   - 50,000 포인트 = 1 쿠폰 교환
 *   - 쿠폰 목록 관리
 *   - 쿠폰 사용 처리
 *   - 앱 삭제 전까지 데이터 유지 (AsyncStorage)
 * 
 * ========================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

// ==================== 상수 정의 ====================
const STORAGE_KEY = '@coupons_data';
const POINTS_PER_COUPON = 50000; // 쿠폰 1개당 필요 포인트
const MAX_COUPONS = 100; // 최대 보유 쿠폰 수
const MAX_HISTORY = 200; // 최대 히스토리 보관 수

// ==================== 타입 정의 ====================
export interface Coupon {
  id: string;
  type: 'free_event' | 'discount' | 'special';
  name: string;
  description: string;
  createdAt: number;
  expiresAt: number; // 만료일 (생성 후 90일)
  usedAt?: number;
  isUsed: boolean;
}

export interface CouponHistory {
  id: string;
  action: 'exchange' | 'use' | 'expire';
  couponId: string;
  couponName: string;
  pointsSpent?: number;
  timestamp: number;
}

interface CouponsData {
  coupons: Coupon[];
  history: CouponHistory[];
  totalExchanged: number; // 총 교환한 쿠폰 수
  totalUsed: number; // 총 사용한 쿠폰 수
}

// ==================== 쿠폰 타입 정보 ====================
const COUPON_TYPES = {
  free_event: {
    name: '무료 이벤트 참가권',
    description: '원하는 Solo Party 이벤트에 무료로 참가할 수 있습니다.',
  },
  discount: {
    name: '50% 할인 쿠폰',
    description: '이벤트 참가비 50% 할인을 받을 수 있습니다.',
  },
  special: {
    name: '스페셜 쿠폰',
    description: '특별한 혜택이 담긴 프리미엄 쿠폰입니다.',
  },
};

// ==================== 유틸리티 함수 ====================
const generateCouponId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 9);
  return `coupon_${timestamp}_${random}`;
};

const generateHistoryId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `history_${timestamp}_${random}`;
};

// 쿠폰 만료일 계산 (90일 후)
const calculateExpiryDate = (): number => {
  const now = new Date();
  now.setDate(now.getDate() + 90);
  return now.getTime();
};

// ==================== 데이터 로드/저장 ====================
const loadCouponsData = async (): Promise<CouponsData> => {
  try {
    const data = await safeGetItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.coupons) && Array.isArray(parsed.history)) {
        // 만료된 쿠폰 자동 처리
        const now = Date.now();
        const updatedCoupons = parsed.coupons.map((coupon: Coupon) => {
          if (!coupon.isUsed && coupon.expiresAt < now) {
            return { ...coupon, isUsed: true }; // 만료 처리
          }
          return coupon;
        });
        
        return {
          ...parsed,
          coupons: updatedCoupons,
        };
      }
    }
  } catch {
    // 로드 실패 시 기본값
  }
  
  return {
    coupons: [],
    history: [],
    totalExchanged: 0,
    totalUsed: 0,
  };
};

const saveCouponsData = async (data: CouponsData): Promise<boolean> => {
  try {
    await safeSetItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};

// ==================== 메인 훅 ====================
export const useCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [history, setHistory] = useState<CouponHistory[]>([]);
  const [totalExchanged, setTotalExchanged] = useState(0);
  const [totalUsed, setTotalUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  // 초기 로드
  useEffect(() => {
    isMountedRef.current = true;
    
    loadCouponsData().then(data => {
      if (isMountedRef.current) {
        setCoupons(data.coupons);
        setHistory(data.history);
        setTotalExchanged(data.totalExchanged);
        setTotalUsed(data.totalUsed);
        setIsLoading(false);
      }
    });
    
    return () => { isMountedRef.current = false; };
  }, []);

  // 사용 가능한 쿠폰 수
  const availableCoupons = coupons.filter(c => !c.isUsed && c.expiresAt > Date.now());

  // 포인트로 쿠폰 교환
  const exchangePointsForCoupon = useCallback(async (
    currentBalance: number,
    spendPoints: (amount: number, reason: string) => Promise<boolean>,
    couponType: 'free_event' | 'discount' | 'special' = 'free_event'
  ): Promise<{ success: boolean; coupon?: Coupon; message: string }> => {
    try {
      // 포인트 검증
      if (currentBalance < POINTS_PER_COUPON) {
        return {
          success: false,
          message: `포인트가 부족합니다. (필요: ${POINTS_PER_COUPON.toLocaleString()}P, 보유: ${currentBalance.toLocaleString()}P)`,
        };
      }

      // 최대 쿠폰 수 검증
      if (availableCoupons.length >= MAX_COUPONS) {
        return {
          success: false,
          message: `최대 ${MAX_COUPONS}개의 쿠폰만 보유할 수 있습니다.`,
        };
      }

      // 포인트 차감
      const pointsDeducted = await spendPoints(POINTS_PER_COUPON, '쿠폰 교환');
      if (!pointsDeducted) {
        return {
          success: false,
          message: '포인트 차감에 실패했습니다. 다시 시도해주세요.',
        };
      }

      // 새 쿠폰 생성
      const couponInfo = COUPON_TYPES[couponType];
      const newCoupon: Coupon = {
        id: generateCouponId(),
        type: couponType,
        name: couponInfo.name,
        description: couponInfo.description,
        createdAt: Date.now(),
        expiresAt: calculateExpiryDate(),
        isUsed: false,
      };

      // 히스토리 기록
      const newHistoryItem: CouponHistory = {
        id: generateHistoryId(),
        action: 'exchange',
        couponId: newCoupon.id,
        couponName: newCoupon.name,
        pointsSpent: POINTS_PER_COUPON,
        timestamp: Date.now(),
      };

      // 상태 업데이트
      const newCoupons = [newCoupon, ...coupons].slice(0, MAX_COUPONS * 2); // 사용한 쿠폰 포함
      const newHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY);
      const newTotalExchanged = totalExchanged + 1;

      await saveCouponsData({
        coupons: newCoupons,
        history: newHistory,
        totalExchanged: newTotalExchanged,
        totalUsed,
      });

      if (isMountedRef.current) {
        setCoupons(newCoupons);
        setHistory(newHistory);
        setTotalExchanged(newTotalExchanged);
      }

      return {
        success: true,
        coupon: newCoupon,
        message: `🎉 ${newCoupon.name}을(를) 획득했습니다!`,
      };
    } catch (error) {
      return {
        success: false,
        message: '쿠폰 교환 중 오류가 발생했습니다.',
      };
    }
  }, [coupons, history, totalExchanged, totalUsed, availableCoupons.length]);

  // 쿠폰 사용
  const useCoupon = useCallback(async (couponId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const couponIndex = coupons.findIndex(c => c.id === couponId);
      
      if (couponIndex === -1) {
        return { success: false, message: '쿠폰을 찾을 수 없습니다.' };
      }

      const coupon = coupons[couponIndex];

      if (coupon.isUsed) {
        return { success: false, message: '이미 사용된 쿠폰입니다.' };
      }

      if (coupon.expiresAt < Date.now()) {
        return { success: false, message: '만료된 쿠폰입니다.' };
      }

      // 쿠폰 사용 처리
      const updatedCoupon: Coupon = {
        ...coupon,
        isUsed: true,
        usedAt: Date.now(),
      };

      // 히스토리 기록
      const newHistoryItem: CouponHistory = {
        id: generateHistoryId(),
        action: 'use',
        couponId: coupon.id,
        couponName: coupon.name,
        timestamp: Date.now(),
      };

      // 상태 업데이트
      const newCoupons = [...coupons];
      newCoupons[couponIndex] = updatedCoupon;
      const newHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY);
      const newTotalUsed = totalUsed + 1;

      await saveCouponsData({
        coupons: newCoupons,
        history: newHistory,
        totalExchanged,
        totalUsed: newTotalUsed,
      });

      if (isMountedRef.current) {
        setCoupons(newCoupons);
        setHistory(newHistory);
        setTotalUsed(newTotalUsed);
      }

      return {
        success: true,
        message: `✅ ${coupon.name}이(가) 사용되었습니다!`,
      };
    } catch (error) {
      return {
        success: false,
        message: '쿠폰 사용 중 오류가 발생했습니다.',
      };
    }
  }, [coupons, history, totalExchanged, totalUsed]);

  // 쿠폰 교환 가능 여부 확인
  const canExchange = useCallback((currentBalance: number): boolean => {
    return currentBalance >= POINTS_PER_COUPON && availableCoupons.length < MAX_COUPONS;
  }, [availableCoupons.length]);

  // 쿠폰 교환까지 필요한 포인트
  const pointsNeededForCoupon = useCallback((currentBalance: number): number => {
    return Math.max(0, POINTS_PER_COUPON - currentBalance);
  }, []);

  return {
    // 상태
    coupons,
    availableCoupons,
    history,
    totalExchanged,
    totalUsed,
    isLoading,
    
    // 상수
    POINTS_PER_COUPON,
    
    // 함수
    exchangePointsForCoupon,
    useCoupon,
    canExchange,
    pointsNeededForCoupon,
  };
};

export default useCoupons;
