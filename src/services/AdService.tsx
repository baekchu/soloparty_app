/**
 * ==================== 광고 시스템 (AdMob) ====================
 * 
 * ⚠️ 현재 비활성화 상태 - 네이티브 설정 후 활성화 필요
 * 
 * === 광고 유형 ===
 * 1. Rewarded Ad (보상형 광고) ⭐ 권장 - 최고 단가
 *    - 특징: 전체 시청 필수 (건너뛰기 불가)
 *    - eCPM: $10-$20 (업계 최고 단가)
 *    - 예상 수익/회: ₩15-75 (한국 기준, $0.01-$0.05)
 *    - 사용자 보상: 50P/회 (6시간당 최대 10회)
 *    - 위치: 포인트 화면
 * 
 * 2. Banner Ad (배너 광고)
 *    - eCPM: $0.50-$2
 *    - 예상 수익/천회 노출: ₩750-3,000
 *    - 위치: 화면 하단 (슬롯 준비됨)
 * 
 * 3. Interstitial Ad (전면 광고)
 *    - eCPM: $5-$15
 *    - 예상 수익/회: ₩7.5-22.5 ($0.005-$0.015)
 *    - 위치: 화면 전환 시 (30% 확률)
 * 
 * 4. App Open Ad (앱 시작 광고)
 *    - eCPM: $10-$20
 *    - 위치: 앱 시작 시
 * 
 * === 수익 최적화 전략 ===
 * - 보상형 광고 우선: 사용자가 자발적으로 시청하며 단가가 가장 높음
 * - 6시간당 10개 제한: 과도한 시청 방지 + 광고주 품질 유지
 * - 광고 간 간격: 최소 1분 이상 (사용자 경험 유지)
 * 
 * === 활성화 방법 ===
 * 
 * 1. AdMob 계정 생성: https://admob.google.com
 * 
 * 2. 앱 등록 및 광고 단위 ID 발급:
 *    - Android 앱 등록 → 앱 ID 발급
 *    - iOS 앱 등록 → 앱 ID 발급
 *    - 각 광고 유형별 단위 ID 발급
 * 
 * 3. 패키지 설치:
 *    npm install react-native-google-mobile-ads
 * 
 * 4. app.json에 플러그인 추가:
 *    {
 *      "expo": {
 *        "plugins": [
 *          [
 *            "react-native-google-mobile-ads",
 *            {
 *              "androidAppId": "ca-app-pub-xxxxx~xxxxx",
 *              "iosAppId": "ca-app-pub-xxxxx~xxxxx"
 *            }
 *          ]
 *        ]
 *      }
 *    }
 * 
 * 5. 네이티브 빌드 생성:
 *    npx expo prebuild
 *    eas build --platform android --profile production
 * 
 * 6. 이 파일의 주석 해제 및 CalendarScreen의 AD_CONFIG.showBanner = true 설정
 * 
 * === 권장 광고 전략 ===
 * - 출시 후 1-2개월: 광고 없이 사용자 기반 확보
 * - 이후: Banner Ad만 추가 (사용자 경험 유지)
 * - 사용자 증가 시: Interstitial Ad 추가 (화면 전환 30% 확률)
 * - 선택적: Rewarded Ad (포인트 시스템과 연동)
 * 
 * === 테스트 광고 ID (개발용) ===
 * Banner: ca-app-pub-3940256099942544/6300978111
 * Interstitial: ca-app-pub-3940256099942544/1033173712
 * Rewarded: ca-app-pub-3940256099942544/5224354917
 * 
 * ========================================================================
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';

// ==================== 광고 설정 상수 ====================
const AD_CONFIG = {
  // 테스트 모드 (개발 중 true, 배포 시 false)
  testMode: __DEV__,
  
  // 전면 광고 확률 (0.0 ~ 1.0)
  interstitialProbability: 0.3,
  
  // 광고 간 최소 간격 (밀리초)
  minAdInterval: 60000, // 1분
  
  // 광고 단위 ID (배포 전 실제 ID로 교체)
  bannerId: {
    android: 'ca-app-pub-3940256099942544/6300978111',
    ios: 'ca-app-pub-3940256099942544/2934735716',
  },
  interstitialId: {
    android: 'ca-app-pub-3940256099942544/1033173712',
    ios: 'ca-app-pub-3940256099942544/4411468910',
  },
  rewardedId: {
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios: 'ca-app-pub-3940256099942544/1712485313',
  },
};

// ==================== 플레이스홀더 Hook ====================
// 네이티브 설정 전까지 크래시 없이 동작

export const useRewardedAd = (onRewardEarned?: (amount: number) => void) => {
  const [loaded] = useState(false);
  const [loading] = useState(false);

  const showAd = useCallback(() => {
    Alert.alert(
      '광고 준비 중',
      '광고 시스템이 아직 설정되지 않았습니다.\n개발 중인 기능입니다.',
      [{ text: '확인' }]
    );
  }, []);

  return { showAd, loaded, loading };
};

export const useInterstitialAd = () => {
  const [loaded] = useState(false);
  const lastAdTimeRef = useRef<number>(0);

  const showInterstitialAd = useCallback(async () => {
    // 비활성화 상태 - 네이티브 빌드 후 활성화
  }, []);

  const showAdOnNavigation = useCallback(async (probability: number = AD_CONFIG.interstitialProbability) => {
    // 광고 간격 확인
    const now = Date.now();
    if (now - lastAdTimeRef.current < AD_CONFIG.minAdInterval) {
      return;
    }
    
    // 확률 기반 표시
    if (Math.random() < probability) {
      lastAdTimeRef.current = now;
      // 비활성화 상태
    }
  }, []);

  return { showInterstitialAd, showAdOnNavigation, loaded };
};

export const useBannerAd = () => {
  // 배너 광고 상태 관리
  const [isVisible, setIsVisible] = useState(false);
  
  const showBanner = useCallback(() => setIsVisible(true), []);
  const hideBanner = useCallback(() => setIsVisible(false), []);
  
  return { isVisible, showBanner, hideBanner };
};

export const useAppStartAd = () => {
  // 앱 시작 광고 (백그라운드에서 포그라운드로 전환 시)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // 앱이 포그라운드로 전환됨 - 광고 표시 가능 시점
        // 네이티브 빌드 후 활성화
      }
      appStateRef.current = nextAppState;
    });
    
    return () => subscription?.remove();
  }, []);
};

// ==================== 광고 유틸리티 ====================
export const getAdUnitId = (type: 'banner' | 'interstitial' | 'rewarded', platform: 'android' | 'ios'): string => {
  const ids = {
    banner: AD_CONFIG.bannerId,
    interstitial: AD_CONFIG.interstitialId,
    rewarded: AD_CONFIG.rewardedId,
  };
  return ids[type][platform];
};
