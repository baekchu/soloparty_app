/**
 * ==================== 광고 시스템 (프로덕션 최적화 v2) ====================
 * 
 * 사용자 증가 시 즉시 활성화 가능한 광고 시스템
 * 
 * === 광고 유형 & 수익 구조 ===
 * 
 * 1. Rewarded Ad (보상형 광고) ⭐ 핵심 수익원
 *    - eCPM: $10-$20 (한국 기준)
 *    - 사용자 보상: 50P/회, 6시간당 최대 10회
 *    - 전략: 사용자가 자발적으로 시청 → 만족도 유지
 * 
 * 2. Interstitial Ad (전면 광고) - 2단계 수익원
 *    - eCPM: $5-$15
 *    - 빈도: 화면 전환 시 25% 확률, 최소 2분 간격
 *    - 전략: 피로감 최소화, 점진적 빈도 조절
 * 
 * 3. Banner Ad (배너 광고) - 안정적 기본 수익
 *    - eCPM: $0.50-$2
 *    - 위치: 하단 고정 배너
 *    - 전략: 항상 노출, 앱 경험 방해 최소화
 * 
 * 4. App Open Ad (앱 오픈 광고) - 보조 수익
 *    - eCPM: $10-$20
 *    - 빈도: 백그라운드 → 포그라운드 시 (30초+ 대기 후)
 * 
 * === 활성화 단계 ===
 * Phase 0: 광고 비활성화 (초기 - 사용자 기반 확보)
 * Phase 1: Banner 만 (사용자 1000명+)
 * Phase 2: Banner + Interstitial (사용자 5000명+)
 * Phase 3: 전체 활성화 (사용자 10000명+)
 * 
 * === 활성화 방법 ===
 * 1. npm install react-native-google-mobile-ads
 * 2. app.json plugins에 추가
 * 3. AD_CONFIG.disableAll = false, phase = 원하는 단계
 * 4. unitIds를 실제 AdMob 광고 단위 ID로 교체
 * 5. eas build --platform all --profile production
 * 
 * ========================================================================
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

// ==================== 광고 설정 (원격 제어 대비) ====================
export const AD_CONFIG = {
  /** true면 모든 광고 비활성화 (초기 단계) */
  disableAll: true,
  
  /** 개발 모드 여부 */
  testMode: __DEV__,
  
  /** 활성화 단계: 0=비활성, 1=배너만, 2=배너+전면, 3=전체 */
  phase: 0 as 0 | 1 | 2 | 3,
  
  // === 전면 광고 설정 ===
  interstitial: {
    /** 표시 확률 (0.0 ~ 1.0) */
    probability: 0.25,
    /** 최소 간격 (밀리초) - 2분 */
    minInterval: 120_000,
    /** 세션당 최대 횟수 */
    maxPerSession: 5,
    /** 앱 시작 후 첫 광고까지 대기 (밀리초) - 3분 */
    coldStartDelay: 180_000,
  },
  
  // === 보상형 광고 설정 ===
  rewarded: {
    /** 시청당 포인트 */
    pointsPerWatch: 50,
    /** 기간당 최대 시청 횟수 */
    maxPerPeriod: 10,
    /** 리셋 간격 (밀리초) - 6시간 */
    resetInterval: 6 * 60 * 60 * 1000,
    /** 최소 시청 간격 (밀리초) - 30초 */
    minInterval: 30_000,
  },
  
  // === 배너 광고 설정 ===
  banner: {
    /** 새로고침 간격 (초) */
    refreshInterval: 60,
    /** 위치 */
    position: 'bottom' as const,
  },
  
  // === 앱 오픈 광고 설정 ===
  appOpen: {
    /** 백그라운드 최소 대기 시간 (밀리초) - 30초 */
    minBackgroundTime: 30_000,
    /** 세션당 최대 횟수 */
    maxPerSession: 3,
  },
  
  // === 광고 단위 ID ===
  // 프로덕션 배포 전 실제 ID로 교체 필수
  unitIds: {
    banner: {
      android: __DEV__ ? 'ca-app-pub-3940256099942544/6300978111' : 'ca-app-pub-REAL/BANNER',
      ios: __DEV__ ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-REAL/BANNER',
    },
    interstitial: {
      android: __DEV__ ? 'ca-app-pub-3940256099942544/1033173712' : 'ca-app-pub-REAL/INTERSTITIAL',
      ios: __DEV__ ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-REAL/INTERSTITIAL',
    },
    rewarded: {
      android: __DEV__ ? 'ca-app-pub-3940256099942544/5224354917' : 'ca-app-pub-REAL/REWARDED',
      ios: __DEV__ ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-REAL/REWARDED',
    },
    appOpen: {
      android: __DEV__ ? 'ca-app-pub-3940256099942544/9257395921' : 'ca-app-pub-REAL/APP_OPEN',
      ios: __DEV__ ? 'ca-app-pub-3940256099942544/5575463023' : 'ca-app-pub-REAL/APP_OPEN',
    },
  },
};

// ==================== 보안: 광고 시청 검증 ====================
const AD_VERIFICATION_KEY = '@sp_ad_verify_v2';

interface AdVerificationRecord {
  token: string;
  type: 'rewarded' | 'interstitial' | 'appOpen';
  timestamp: number;
  verified: boolean;
}

/** 암호학적으로 안전한 광고 토큰 생성 */
const generateSecureAdToken = async (): Promise<string> => {
  try {
    const bytes = await Crypto.getRandomBytesAsync(16);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `ad_${Date.now()}_${hex}`;
  } catch {
    // Crypto.getRandomBytesAsync 실패 시 sync API 시도
    try {
      const bytes = Crypto.getRandomBytes(16);
      const hex = Array.from(bytes as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      return `ad_${Date.now()}_${hex}`;
    } catch {
      // 암호학적 난수 수단이 모두 실패한 궙극 폴백
      // Date.now() 연산만 사용 — 알려진 예측 가능한 패턴(높은 시카, 루프 곱) 제거
      const ts1 = Date.now().toString(36);
      const ts2 = Date.now().toString(16);
      return `ad_${ts1}_${ts2}`;
    }
  }
};

/** 광고 시청 기록 (조작 방지) */
class AdVerificationStore {
  private static records: AdVerificationRecord[] = [];
  private static readonly MAX_RECORDS = 50;
  
  static async record(type: AdVerificationRecord['type']): Promise<string> {
    const token = await generateSecureAdToken();
    
    this.records.unshift({ token, type, timestamp: Date.now(), verified: false });
    
    if (this.records.length > this.MAX_RECORDS) {
      this.records = this.records.slice(0, this.MAX_RECORDS);
    }
    
    this.persistAsync().catch(() => {});
    return token;
  }
  
  static verify(token: string): boolean {
    const record = this.records.find(r => r.token === token);
    if (!record || record.verified) return false;
    if (Date.now() - record.timestamp > 5 * 60 * 1000) return false;
    record.verified = true;
    return true;
  }
  
  /** 중복 시청 방지 */
  static isDuplicate(type: string, windowMs: number = 10_000): boolean {
    const now = Date.now();
    return this.records.some(r => r.type === type && now - r.timestamp < windowMs);
  }
  
  private static async persistAsync(): Promise<void> {
    try {
      await safeSetItem(AD_VERIFICATION_KEY, JSON.stringify(this.records.slice(0, 20)), false);
    } catch { /* 무시 */ }
  }
  
  static async loadFromStorage(): Promise<void> {
    try {
      const raw = await safeGetItem(AD_VERIFICATION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // 레코드 타입 검증: 손상된 데이터 필터링
          this.records = parsed
            .filter((r: unknown): r is AdVerificationRecord =>
              r !== null && typeof r === 'object' &&
              typeof (r as any).token === 'string' &&
              typeof (r as any).timestamp === 'number' &&
              typeof (r as any).verified === 'boolean' &&
              ['rewarded', 'interstitial', 'appOpen'].includes((r as any).type)
            )
            .slice(0, this.MAX_RECORDS);
        }
      }
    } catch { /* 무시 */ }
  }
}

// AdManager.initialize()에서 명시적으로 호출됨 (모듈 로드 시 실행하면 AsyncStorage 초기화 전에 실행될 수 있음)

// ==================== 세션 추적 ====================
class AdSessionTracker {
  static sessionStart = Date.now();
  static interstitialCount = 0;
  static appOpenCount = 0;
  static lastInterstitialTime = 0;
  static lastBackgroundTime = 0;
  
  static resetSession(): void {
    this.sessionStart = Date.now();
    this.interstitialCount = 0;
    this.appOpenCount = 0;
    this.lastInterstitialTime = 0;
  }
  
  static canShowInterstitial(): { allowed: boolean; reason?: string } {
    if (AD_CONFIG.disableAll || AD_CONFIG.phase < 2) {
      return { allowed: false, reason: '광고 비활성화' };
    }
    const now = Date.now();
    if (now - this.sessionStart < AD_CONFIG.interstitial.coldStartDelay) {
      return { allowed: false, reason: '앱 시작 대기' };
    }
    if (now - this.lastInterstitialTime < AD_CONFIG.interstitial.minInterval) {
      return { allowed: false, reason: '최소 간격' };
    }
    if (this.interstitialCount >= AD_CONFIG.interstitial.maxPerSession) {
      return { allowed: false, reason: '세션 초과' };
    }
    return { allowed: true };
  }
  
  static recordInterstitial(): void {
    this.interstitialCount++;
    this.lastInterstitialTime = Date.now();
  }
  
  static canShowAppOpen(bgDuration: number): { allowed: boolean } {
    if (AD_CONFIG.disableAll || AD_CONFIG.phase < 3) return { allowed: false };
    if (bgDuration < AD_CONFIG.appOpen.minBackgroundTime) return { allowed: false };
    if (this.appOpenCount >= AD_CONFIG.appOpen.maxPerSession) return { allowed: false };
    return { allowed: true };
  }
  
  static recordAppOpen(): void { this.appOpenCount++; }
  static setBackgroundTime(): void { this.lastBackgroundTime = Date.now(); }
  static getBackgroundDuration(): number {
    return this.lastBackgroundTime === 0 ? 0 : Date.now() - this.lastBackgroundTime;
  }
}

// ==================== 광고 유닛 ID 헬퍼 ====================
export const getAdUnitId = (type: keyof typeof AD_CONFIG.unitIds): string => {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return AD_CONFIG.unitIds[type][platform];
};

// ==================== Hook: 보상형 광고 ====================
export const useRewardedAd = (onRewardEarned?: (amount: number) => void) => {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const adTokenRef = useRef<string | null>(null);

  const showAd = useCallback(async (): Promise<{ success: boolean; token: string | null }> => {
    if (AD_CONFIG.disableAll) {
      if (__DEV__) {
        Alert.alert(
          '💡 광고 시스템',
          '광고가 비활성화 상태입니다.\nAdService.tsx에서 AD_CONFIG.disableAll = false로 변경하세요.',
          [{ text: '확인' }]
        );
      }
      return { success: false, token: null };
    }
    
    if (AdVerificationStore.isDuplicate('rewarded', AD_CONFIG.rewarded.minInterval)) {
      return { success: false, token: null };
    }
    
    const token = await AdVerificationStore.record('rewarded');
    adTokenRef.current = token;
    
    // === 실제 광고 SDK 연동 시 이 주석을 해제하세요 ===
    // try {
    //   setLoading(true);
    //   const { RewardedAd, RewardedAdEventType } = require('react-native-google-mobile-ads');
    //   const ad = RewardedAd.createForAdRequest(getAdUnitId('rewarded'));
    //   
    //   return new Promise((resolve) => {
    //     ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
    //       const verified = AdVerificationStore.verify(token);
    //       if (verified) onRewardEarned?.(AD_CONFIG.rewarded.pointsPerWatch);
    //       resolve({ success: verified, token });
    //     });
    //     ad.addAdEventListener(RewardedAdEventType.CLOSED, () => {
    //       resolve({ success: false, token: null });
    //     });
    //     ad.load();
    //     ad.show();
    //   });
    // } catch { return { success: false, token: null }; }
    // finally { setLoading(false); }
    
    return { success: false, token };
  }, [onRewardEarned]);

  return { showAd, loaded, loading, adToken: adTokenRef.current };
};

// ==================== Hook: 전면 광고 ====================
export const useInterstitialAd = () => {
  const [loaded, setLoaded] = useState(false);

  const showAdOnNavigation = useCallback(async (): Promise<boolean> => {
    const check = AdSessionTracker.canShowInterstitial();
    if (!check.allowed) return false;
    
    if (Math.random() >= AD_CONFIG.interstitial.probability) return false;
    
    if (AdVerificationStore.isDuplicate('interstitial', AD_CONFIG.interstitial.minInterval)) {
      return false;
    }
    
    await AdVerificationStore.record('interstitial');
    AdSessionTracker.recordInterstitial();
    
    // === 실제 SDK 연동 시 주석 해제 ===
    // const { InterstitialAd, AdEventType } = require('react-native-google-mobile-ads');
    // const ad = InterstitialAd.createForAdRequest(getAdUnitId('interstitial'));
    // return new Promise(resolve => {
    //   ad.addAdEventListener(AdEventType.CLOSED, () => resolve(true));
    //   ad.addAdEventListener(AdEventType.ERROR, () => resolve(false));
    //   ad.load();
    //   ad.show();
    // });
    
    return false;
  }, []);

  const showInterstitialAd = useCallback(async (): Promise<boolean> => {
    const check = AdSessionTracker.canShowInterstitial();
    if (!check.allowed) return false;
    await AdVerificationStore.record('interstitial');
    AdSessionTracker.recordInterstitial();
    return false;
  }, []);

  return { showInterstitialAd, showAdOnNavigation, loaded };
};

// ==================== Hook: 배너 광고 ====================
export const useBannerAd = () => {
  const isEnabled = useMemo(() => !AD_CONFIG.disableAll && AD_CONFIG.phase >= 1, []);
  const [isVisible, setIsVisible] = useState(isEnabled);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);
  
  const showBanner = useCallback(() => { if (isEnabled) setIsVisible(true); }, [isEnabled]);
  const hideBanner = useCallback(() => setIsVisible(false), []);
  
  const onError = useCallback(() => {
    setIsVisible(false);
    // 30초 후 재시도 (타이머 누수 방지: ref로 관리)
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => { if (isEnabled) setIsVisible(true); }, 30_000);
  }, [isEnabled]);
  
  return {
    isVisible: isVisible && isEnabled,
    showBanner,
    hideBanner,
    onError,
    unitId: getAdUnitId('banner'),
    position: AD_CONFIG.banner.position,
  };
};

// ==================== Hook: 앱 오픈 광고 ====================
export const useAppOpenAd = () => {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        const bgDuration = AdSessionTracker.getBackgroundDuration();
        const check = AdSessionTracker.canShowAppOpen(bgDuration);
        
        if (check.allowed && !AdVerificationStore.isDuplicate('appOpen', 60_000)) {
          await AdVerificationStore.record('appOpen');
          AdSessionTracker.recordAppOpen();
          // === 실제 SDK 연동 시 주석 해제 ===
        }
      } else if (nextAppState.match(/inactive|background/)) {
        AdSessionTracker.setBackgroundTime();
      }
      appStateRef.current = nextAppState;
    });
    
    return () => subscription?.remove();
  }, []);
};

// ==================== Hook: 공유 후 스킵 가능 전면 광고 ====================
/**
 * 앱 공유 완료 후 15초 뒤 건너뛸 수 있는 동영상 전면 광고
 * - 15초 카운트다운 후 "건너뛰기" 버튼 활성화
 * - 공유 성공 시에만 표시
 */
export const useShareInterstitialAd = () => {
  const [isShowing, setIsShowing] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(15);
  const [canSkip, setCanSkip] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const showAfterShare = useCallback(async (): Promise<void> => {
    // 중복 차단 (10초 이내 재표시 방지)
    if (AdVerificationStore.isDuplicate('interstitial', 10_000)) return;
    await AdVerificationStore.record('interstitial');

    // 기존 카운트다운 인터벌 정리 (누수 방지)
    clearCountdown();
    
    setIsShowing(true);
    setSkipCountdown(15);
    setCanSkip(false);

    // 15초 카운트다운
    let remaining = 15;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSkipCountdown(remaining);
      if (remaining <= 0) {
        setCanSkip(true);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }
    }, 1000);

    // === 실제 SDK 연동 시 이 주석을 해제하세요 ===
    // try {
    //   const { InterstitialAd, AdEventType } = require('react-native-google-mobile-ads');
    //   const ad = InterstitialAd.createForAdRequest(getAdUnitId('interstitial'));
    //   ad.addAdEventListener(AdEventType.CLOSED, () => { dismiss(); });
    //   ad.load();
    //   ad.show();
    // } catch { /* SDK 미연동 시 자체 오버레이 사용 */ }
  }, [clearCountdown]);

  const dismiss = useCallback(() => {
    clearCountdown();
    setIsShowing(false);
    setSkipCountdown(15);
    setCanSkip(false);
  }, [clearCountdown]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => { clearCountdown(); };
  }, [clearCountdown]);

  return { isShowing, skipCountdown, canSkip, showAfterShare, dismiss };
};

// ==================== 광고 관리자 (글로벌) ====================
export class AdManager {
  private static initialized = false;
  
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await AdVerificationStore.loadFromStorage();
      AdSessionTracker.resetSession();
      this.initialized = true;
    } catch { /* 무시 */ }
  }
  
  /** 현재 Phase에서 사용 가능한 광고 유형 */
  static getAvailableAdTypes(): string[] {
    if (AD_CONFIG.disableAll) return [];
    const phases: Record<number, string[]> = {
      0: [], 1: ['banner'], 2: ['banner', 'interstitial'],
      3: ['banner', 'interstitial', 'rewarded', 'appOpen'],
    };
    return phases[AD_CONFIG.phase] || [];
  }
  
  /** 광고 Phase 원격 변경 */
  static setPhase(phase: 0 | 1 | 2 | 3): void {
    (AD_CONFIG as any).phase = phase;
    (AD_CONFIG as any).disableAll = phase === 0;
  }
  
  /** 광고 통계 */
  static getStats() {
    return {
      sessionDuration: Date.now() - AdSessionTracker.sessionStart,
      interstitialCount: AdSessionTracker.interstitialCount,
      isEnabled: !AD_CONFIG.disableAll,
      phase: AD_CONFIG.phase,
    };
  }
}
