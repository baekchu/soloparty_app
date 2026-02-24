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

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog, encryptData, decryptData } from '../utils/secureStorage';

// ==================== 상수 정의 ====================
const STORAGE_KEY = '@coupons_data_v2';
const SECURE_BACKUP_KEY = 'sp_coupons_backup';
const POINTS_PER_COUPON = 50000;
const MAX_COUPONS = 100;
const MAX_HISTORY = 200;
const EXCHANGE_COOLDOWN_MS = 5000; // 교환 쿨다운 5초 (연타 방지)
const MAX_VERIFY_ATTEMPTS = 3;     // 인증 시도 제한 (3회로 강화 — 무차별 대입 방지)
const VERIFY_LOCKOUT_MS = 300000;  // 인증 실패 잠금 5분
const VERIFY_LOCKOUT_KEY = '@coupon_verify_lockout_v1';

// ==================== 타입 정의 ====================
export interface Coupon {
  id: string;
  type: 'free_event' | 'discount' | 'special';
  name: string;
  description: string;
  secretCode: string;   // 고유 비밀 코드 (입장권 인증용)
  createdAt: number;
  expiresAt: number; // 만료일 (생성 후 90일)
  usedAt?: number;
  isUsed: boolean;
  verifiedAt?: number; // 인증 시간
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
  const bytes = Crypto.getRandomBytes(8);
  const random = Array.from(bytes).map(b => b.toString(36)).join('').slice(0, 9);
  return `coupon_${timestamp}_${random}`;
};

const generateHistoryId = (): string => {
  const timestamp = Date.now().toString(36);
  const bytes = Crypto.getRandomBytes(4);
  const random = Array.from(bytes).map(b => b.toString(36)).join('').slice(0, 6);
  return `history_${timestamp}_${random}`;
};

/**
 * 고유 비밀 코드 생성 (12자리, 대문자+숫자)
 * 형식: XXXX-XXXX-XXXX (e.g. SP3K-A9MF-7QWR)
 * 충돌 확률: 30^12 = 5.3조+ 조합
 * 암호학적으로 안전한 랜덤 생성 (expo-crypto)
 */
const generateSecretCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외 (0/O, 1/I/L)
  // Crypto.getRandomBytes (sync) 사용 — Math.random() 대치
  let bytes: Uint8Array;
  try {
    bytes = Crypto.getRandomBytes(12);
  } catch (e) {
    secureLog.error('⚠️ Crypto.getRandomBytes 실패 — 쿠폰 발급 차단');
    throw new Error('안전한 비밀 코드를 생성할 수 없습니다.');
  }
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
};

// 쿠폰 만료일 계산 (90일 후)
const calculateExpiryDate = (): number => {
  const now = new Date();
  now.setDate(now.getDate() + 90);
  return now.getTime();
};

// ==================== 데이터 로드/저장 (암호화 + 이중 저장) ====================
const loadCouponsData = async (): Promise<CouponsData> => {
  try {
    // 1. AsyncStorage에서 로드 (암호화)
    let parsed: CouponsData | null = null;
    const encrypted = await safeGetItem(STORAGE_KEY);
    if (encrypted) {
      if (encrypted.length > 500000) {
        secureLog.warn('⚠️ 쿠폰 데이터 크기 초과');
        return getDefaultCouponsData();
      }
      try {
        const decrypted = await decryptData(encrypted);
        parsed = JSON.parse(decrypted);
      } catch {
        // 복호화 실패 → 데이터 무효화 (평문 폴백 금지 — 조작 방지)
        secureLog.warn('⚠️ 쿠폰 데이터 복호화 실패 — 초기화');
        parsed = null;
      }
    }

    // 2. AsyncStorage 실패 시 SecureStore 백업에서 복구
    if (!parsed) {
      try {
        const backupStr = await SecureStore.getItemAsync(SECURE_BACKUP_KEY);
        if (backupStr) {
          parsed = JSON.parse(backupStr);
          secureLog.info('🔄 쿠폰 SecureStore 백업에서 복구');
        }
      } catch { /* 백업 복구 실패 */ }
    }

    if (!parsed) return getDefaultCouponsData();

    // 보안: 타입 검증
    if (!Array.isArray(parsed.coupons) || !Array.isArray(parsed.history)) {
      return getDefaultCouponsData();
    }
    if (parsed.coupons.length > MAX_COUPONS * 2 || parsed.history.length > MAX_HISTORY * 2) {
      secureLog.warn('⚠️ 비정상적인 쿠폰/히스토리 수');
      return getDefaultCouponsData();
    }

    // 만료 처리 + 레거시 마이그레이션
    const now = Date.now();
    const expiredHistory: CouponHistory[] = [];
    const updatedCoupons = parsed.coupons
      .filter((coupon: any) => coupon && typeof coupon === 'object' && coupon.id)
      .slice(0, MAX_COUPONS)
      .map((coupon: Coupon) => {
        const withCode = coupon.secretCode ? coupon : { ...coupon, secretCode: generateSecretCode() };
        if (!withCode.isUsed && withCode.expiresAt < now) {
          // 만료 히스토리 기록
          expiredHistory.push({
            id: `exp_${withCode.id}_${now}`,
            action: 'expire' as const,
            couponId: withCode.id,
            couponName: withCode.name,
            timestamp: withCode.expiresAt,
          });
          return { ...withCode, isUsed: true, usedAt: withCode.expiresAt };
        }
        return withCode;
      });

    return {
      coupons: updatedCoupons,
      history: [...expiredHistory, ...parsed.history].slice(0, MAX_HISTORY),
      totalExchanged: typeof parsed.totalExchanged === 'number' ? Math.max(0, parsed.totalExchanged) : 0,
      totalUsed: typeof parsed.totalUsed === 'number' ? Math.max(0, parsed.totalUsed) : 0,
    };
  } catch {
    return getDefaultCouponsData();
  }
};

// 기본 쿠폰 데이터 생성
const getDefaultCouponsData = (): CouponsData => ({
  coupons: [],
  history: [],
  totalExchanged: 0,
  totalUsed: 0,
});

const saveCouponsData = async (data: CouponsData): Promise<boolean> => {
  try {
    const json = JSON.stringify(data);
    // 1. AsyncStorage에 암호화 저장
    const encrypted = await encryptData(json);
    await safeSetItem(STORAGE_KEY, encrypted);

    // 2. SecureStore에 백업 (필수 데이터만 — 2KB 제한 대응)
    try {
      const essentialBackup = JSON.stringify({
        coupons: data.coupons
          .filter(c => !c.isUsed) // 미사용 쿠폰만 백업
          .slice(0, 10) // 최대 10개
          .map(c => ({ id: c.id, secretCode: c.secretCode, isUsed: c.isUsed, expiresAt: c.expiresAt, type: c.type, name: c.name, createdAt: c.createdAt })),
        totalExchanged: data.totalExchanged,
        totalUsed: data.totalUsed,
      });
      // SecureStore 2KB 제한 검증
      if (essentialBackup.length <= 2000) {
        await SecureStore.setItemAsync(SECURE_BACKUP_KEY, essentialBackup);
      } else {
        // 너무 크면 최소 메타데이터만 저장
        const metaBackup = JSON.stringify({
          totalExchanged: data.totalExchanged,
          totalUsed: data.totalUsed,
          couponCount: data.coupons.filter(c => !c.isUsed).length,
        });
        await SecureStore.setItemAsync(SECURE_BACKUP_KEY, metaBackup);
      }
    } catch { /* SecureStore 백업 실패 무시 */ }

    // 3. 읽기 검증
    const verify = await safeGetItem(STORAGE_KEY);
    if (!verify) {
      secureLog.warn('⚠️ 쿠폰 저장 검증 실패');
      return false;
    }
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
  const couponsRef = useRef(coupons);
  couponsRef.current = coupons;
  const historyRef = useRef(history);
  historyRef.current = history;
  const totalExchangedRef = useRef(totalExchanged);
  totalExchangedRef.current = totalExchanged;
  const totalUsedRef = useRef(totalUsed);
  totalUsedRef.current = totalUsed;
  const lastExchangeTimeRef = useRef(0);
  const verifyAttemptsRef = useRef(0);
  const verifyLockoutUntilRef = useRef(0);
  const couponMutexRef = useRef(false);

  // lockout 상태 영속화 헬퍼
  const saveLockoutState = useCallback(async () => {
    try {
      await safeSetItem(VERIFY_LOCKOUT_KEY, JSON.stringify({
        attempts: verifyAttemptsRef.current,
        lockoutUntil: verifyLockoutUntilRef.current,
      }));
    } catch { /* 저장 실패 무시 */ }
  }, []);

  // 초기 로드 + AppState 백그라운드 저장
  useEffect(() => {
    isMountedRef.current = true;
    
    // lockout 상태 복원 (화면 전환 시 우회 방지)
    safeGetItem(VERIFY_LOCKOUT_KEY).then(stored => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.lockoutUntil > Date.now()) {
            verifyAttemptsRef.current = parsed.attempts || 0;
            verifyLockoutUntilRef.current = parsed.lockoutUntil;
          } else {
            verifyAttemptsRef.current = parsed.attempts || 0;
          }
        } catch { /* 파싱 실패 무시 */ }
      }
    }).catch(() => {});

    loadCouponsData().then(data => {
      if (isMountedRef.current) {
        setCoupons(data.coupons);
        setHistory(data.history);
        setTotalExchanged(data.totalExchanged);
        setTotalUsed(data.totalUsed);
        setIsLoading(false);
      }
    });

    // AppState: 앱이 백그라운드로 갈 때 즉시 저장 (모든 데이터 포함)
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (couponsRef.current.length > 0 || historyRef.current.length > 0) {
          saveCouponsData({
            coupons: couponsRef.current,
            history: historyRef.current,
            totalExchanged: totalExchangedRef.current,
            totalUsed: totalUsedRef.current,
          }).catch(() => {});
        }
      }
    });
    
    return () => {
      isMountedRef.current = false;
      appStateSub.remove();
    };
  }, []);

  // 사용 가능한 쿠폰 수 (useMemo로 최적화)
  const availableCoupons = useMemo(
    () => coupons.filter(c => !c.isUsed && c.expiresAt > Date.now()),
    [coupons]
  );

  // 포인트로 쿠폰 교환 (쿨다운 적용)
  const exchangePointsForCoupon = useCallback(async (
    currentBalance: number,
    spendPoints: (amount: number, reason: string) => Promise<boolean>,
    couponType: 'free_event' | 'discount' | 'special' = 'free_event',
    addPoints?: (amount: number, reason: string) => Promise<boolean>,
  ): Promise<{ success: boolean; coupon?: Coupon; message: string }> => {
    // 동시 실행 방지 뮤텍스
    if (couponMutexRef.current) {
      return { success: false, message: '처리 중입니다. 잠시 후 다시 시도해주세요.' };
    }
    couponMutexRef.current = true;
    try {
      // 쿨다운 검증 (연타 방지)
      const now = Date.now();
      const elapsed = now - lastExchangeTimeRef.current;
      if (elapsed < EXCHANGE_COOLDOWN_MS) {
        const waitSec = Math.ceil((EXCHANGE_COOLDOWN_MS - elapsed) / 1000);
        return {
          success: false,
          message: `잠시 후 다시 시도해주세요. (${waitSec}초)`,
        };
      }
      lastExchangeTimeRef.current = now;

      // 포인트 검증
      if (currentBalance < POINTS_PER_COUPON) {
        return {
          success: false,
          message: `포인트가 부족합니다. (필요: ${POINTS_PER_COUPON.toLocaleString()}P, 보유: ${currentBalance.toLocaleString()}P)`,
        };
      }

      // 최대 쿠폰 수 검증 (ref 기반으로 stale closure 방지)
      const currentAvailableCount = couponsRef.current.filter(
        c => !c.isUsed && c.expiresAt > Date.now()
      ).length;
      if (currentAvailableCount >= MAX_COUPONS) {
        return {
          success: false,
          message: `최대 ${MAX_COUPONS}개의 쿠폰만 보유할 수 있습니다.`,
        };
      }

      // 새 쿠폰 생성 (포인트 차감 전에 먼저 준비)
      const couponInfo = COUPON_TYPES[couponType];
      const secretCode = generateSecretCode();
      const newCoupon: Coupon = {
        id: generateCouponId(),
        type: couponType,
        name: couponInfo.name,
        description: couponInfo.description,
        secretCode,
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

      // ref 기반 최신 상태로 업데이트 (stale closure 방지)
      const currentCoupons = couponsRef.current;
      const currentHistory = historyRef.current;
      const currentTotalExchanged = totalExchangedRef.current;
      const currentTotalUsed = totalUsedRef.current;

      // 포인트 먼저 차감 (실패 시 쿠폰 발급 없음 → 데이터 불일치 방지)
      const pointsDeducted = await spendPoints(POINTS_PER_COUPON, '쿠폰 교환');
      if (!pointsDeducted) {
        return {
          success: false,
          message: '포인트 차감에 실패했습니다. 다시 시도해주세요.',
        };
      }

      // 포인트 차감 성공 후 쿠폰 데이터 저장
      const newCoupons = [newCoupon, ...currentCoupons].slice(0, MAX_COUPONS * 2);
      const newHistory = [newHistoryItem, ...currentHistory].slice(0, MAX_HISTORY);
      const newTotalExchanged = currentTotalExchanged + 1;

      const couponSaved = await saveCouponsData({
        coupons: newCoupons,
        history: newHistory,
        totalExchanged: newTotalExchanged,
        totalUsed: currentTotalUsed,
      });

      if (!couponSaved) {
        // 쿠폰 저장 실패 — 포인트 환불 시도
        if (addPoints) {
          const refunded = await addPoints(POINTS_PER_COUPON, '쿠폰 교환 실패 환불');
          if (refunded) {
            return {
              success: false,
              message: '쿠폰 저장에 실패했습니다. 포인트가 환불되었습니다.',
            };
          }
        }
        return {
          success: false,
          message: '쿠폰 저장에 실패했습니다. 포인트가 차감되었으니 문의해 주세요.',
        };
      }

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
    } finally {
      couponMutexRef.current = false;
    }
  }, []); // ref 기반으로 최신 상태 접근 → state deps 불필요

  // 쿠폰 사용
  const useCoupon = useCallback(async (couponId: string): Promise<{ success: boolean; message: string }> => {
    // 동시 실행 방지 뮤텍스
    if (couponMutexRef.current) {
      return { success: false, message: '처리 중입니다. 잠시 후 다시 시도해주세요.' };
    }
    couponMutexRef.current = true;
    try {
      // ref 기반으로 최신 상태 접근 (stale closure 방지)
      const currentCoupons = couponsRef.current;
      const currentHistory = historyRef.current;
      const currentTotalUsed = totalUsedRef.current;
      const currentTotalExchanged = totalExchangedRef.current;
      
      const couponIndex = currentCoupons.findIndex(c => c.id === couponId);
      
      if (couponIndex === -1) {
        return { success: false, message: '쿠폰을 찾을 수 없습니다.' };
      }

      const coupon = currentCoupons[couponIndex];

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
      const newCoupons = [...currentCoupons];
      newCoupons[couponIndex] = updatedCoupon;
      const newHistory = [newHistoryItem, ...currentHistory].slice(0, MAX_HISTORY);
      const newTotalUsed = currentTotalUsed + 1;

      await saveCouponsData({
        coupons: newCoupons,
        history: newHistory,
        totalExchanged: currentTotalExchanged,
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
    } finally {
      couponMutexRef.current = false;
    }
  }, []); // ref 기반으로 최신 상태 접근 → state deps 불필요

  // 쿠폰 교환 가능 여부 확인
  const canExchange = useCallback((currentBalance: number): boolean => {
    return currentBalance >= POINTS_PER_COUPON && availableCoupons.length < MAX_COUPONS;
  }, [availableCoupons.length]);

  // 쿠폰 교환까지 필요한 포인트
  const pointsNeededForCoupon = useCallback((currentBalance: number): number => {
    return Math.max(0, POINTS_PER_COUPON - currentBalance);
  }, []);

  // ==================== 비밀 코드로 쿠폰 인증 ====================
  /**
   * 입력한 비밀 코드를 검증하고 쿠폰을 사용 처리
   * @param code 사용자가 입력한 코드 (XXXX-XXXX-XXXX)
   * @returns 인증 결과
   */
  const verifyCouponByCode = useCallback(async (
    code: string
  ): Promise<{ success: boolean; coupon?: Coupon; message: string }> => {
    // 동시 실행 방지 뮤텍스
    if (couponMutexRef.current) {
      return { success: false, message: '처리 중입니다. 잠시 후 다시 시도해주세요.' };
    }
    couponMutexRef.current = true;
    try {
      // 무차별 대입 방지: 잠금 확인
      const now = Date.now();
      
      // lockout 시간이 지났으면 시도 횟수 초기화 (BUG FIX)
      if (verifyLockoutUntilRef.current > 0 && verifyLockoutUntilRef.current <= now) {
        verifyAttemptsRef.current = 0;
        verifyLockoutUntilRef.current = 0;
        saveLockoutState(); // 영속화
      }
      
      if (verifyLockoutUntilRef.current > now) {
        const remainMin = Math.ceil((verifyLockoutUntilRef.current - now) / 60000);
        return {
          success: false,
          message: `인증 시도 횟수를 초과했습니다.\n${remainMin}분 후 다시 시도해주세요.`,
        };
      }

      // ref 기반으로 최신 상태 접근 (stale closure 방지)
      const currentCoupons = couponsRef.current;
      const currentHistory = historyRef.current;
      const currentTotalUsed = totalUsedRef.current;
      const currentTotalExchanged = totalExchangedRef.current;

      // 코드 정규화 (대문자, 공백 제거)
      const normalized = code.trim().toUpperCase().replace(/\s+/g, '');

      if (normalized.length < 10) {
        return { success: false, message: '코드를 정확히 입력해주세요. (XXXX-XXXX-XXXX)' };
      }

      // 쿠폰 찾기 (하이픈 제거 + 상수 시간 비교로 타이밍 공격 방지)
      const codeNoHyphens = normalized.replace(/-/g, '');
      const constantTimeCompare = (a: string, b: string): boolean => {
        const maxLen = Math.max(a.length, b.length);
        let result = a.length ^ b.length;
        for (let i = 0; i < maxLen; i++) {
          const charA = i < a.length ? a.charCodeAt(i) : 0;
          const charB = i < b.length ? b.charCodeAt(i) : 0;
          result |= charA ^ charB;
        }
        return result === 0;
      };
      const found = currentCoupons.find(c => {
        const stored = (c.secretCode || '').replace(/-/g, '').toUpperCase();
        return constantTimeCompare(stored, codeNoHyphens);
      });

      if (!found) {
        // 실패 횟수 추적
        verifyAttemptsRef.current += 1;
        if (verifyAttemptsRef.current >= MAX_VERIFY_ATTEMPTS) {
          verifyLockoutUntilRef.current = Date.now() + VERIFY_LOCKOUT_MS;
          verifyAttemptsRef.current = 0;
          saveLockoutState(); // 영속화
          return {
            success: false,
            message: `인증 시도 ${MAX_VERIFY_ATTEMPTS}회 초과!\n5분간 인증이 잠깁니다.`,
          };
        }
        saveLockoutState(); // 영속화
        const remaining = MAX_VERIFY_ATTEMPTS - verifyAttemptsRef.current;
        return {
          success: false,
          message: `❌ 유효하지 않은 코드입니다. (남은 시도: ${remaining}회)`,
        };
      }

      if (found.isUsed) {
        return { success: false, message: '이미 사용된 쿠폰입니다.' };
      }

      if (found.expiresAt < Date.now()) {
        return { success: false, message: '만료된 쿠폰입니다.' };
      }

      // 인증 성공 → 시도 횟수 초기화 + 영속화
      verifyAttemptsRef.current = 0;
      saveLockoutState();

      // 쿠폰 사용 처리 + 인증 시간 기록
      const couponIndex = currentCoupons.findIndex(c => c.id === found.id);
      const verifiedCoupon: Coupon = {
        ...found,
        isUsed: true,
        usedAt: Date.now(),
        verifiedAt: Date.now(),
      };

      const newHistoryItem: CouponHistory = {
        id: generateHistoryId(),
        action: 'use',
        couponId: found.id,
        couponName: found.name,
        timestamp: Date.now(),
      };

      const newCoupons = [...currentCoupons];
      newCoupons[couponIndex] = verifiedCoupon;
      const newHistory = [newHistoryItem, ...currentHistory].slice(0, MAX_HISTORY);
      const newTotalUsed = currentTotalUsed + 1;

      await saveCouponsData({
        coupons: newCoupons,
        history: newHistory,
        totalExchanged: currentTotalExchanged,
        totalUsed: newTotalUsed,
      });

      if (isMountedRef.current) {
        setCoupons(newCoupons);
        setHistory(newHistory);
        setTotalUsed(newTotalUsed);
      }

      return {
        success: true,
        coupon: verifiedCoupon,
        message: `✅ 입장권 인증 완료!\n${found.name}`,
      };
    } catch {
      return { success: false, message: '인증 중 오류가 발생했습니다.' };
    } finally {
      couponMutexRef.current = false;
    }
  }, [saveLockoutState]); // ref 기반으로 최신 상태 접근 → state deps 불필요

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
    verifyCouponByCode,
    canExchange,
    pointsNeededForCoupon,
  };
};

export default useCoupons;
