/**
 * ==================== 광고 시스템 (AdMob) ====================
 * 
 * ⚠️ 이 파일은 주석 처리된 상태입니다 (앱에 영향 없음)
 * 
 * 활성화 전 필요 패키지 설치:
 *   npm install react-native-google-mobile-ads
 *   npx expo install expo-dev-client
 * 
 * 📝 참고: 패키지 미설치 시 import 오류는 정상입니다
 * 
 * app.json에 추가:
 *   {
 *     "expo": {
 *       "plugins": [
 *         [
 *           "react-native-google-mobile-ads",
 *           {
 *             "androidAppId": "ca-app-pub-xxxxx~xxxxx",
 *             "iosAppId": "ca-app-pub-xxxxx~xxxxx"
 *           }
 *         ]
 *       ]
 *     }
 *   }
 * 
 * 빌드 명령어:
 *   npx expo prebuild
 *   npx expo run:android (or run:ios)
 * 
 * AdMob 계정 설정:
 *   1. https://admob.google.com 가입
 *   2. 앱 추가 (앱 ID 발급)
 *   3. 광고 단위 생성:
 *      - 보상형 광고 (Rewarded)
 *      - 전면 광고 (Interstitial)
 *      - 배너 광고 (Banner)
 *   4. 아래 REWARDED_AD_ID, INTERSTITIAL_AD_ID에 실제 ID 입력
 * 
 * 사용 방법:
 *   1. CalendarScreen.tsx에서 import 주석 해제
 *   2. App.tsx에서 RewardProvider 주석 해제
 *   3. 테스트 후 __DEV__ 부분을 실제 ID로 교체
 * 
 * ========================================================================
 */

import React, { useEffect, useState, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import {
  RewardedAd,
  RewardedAdEventType,
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 광고 ID 설정 (실제 배포 시 변경 필요)
const REWARDED_AD_ID = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: 'ca-app-pub-xxxxx/xxxxx', // 실제 iOS 보상형 광고 ID
      android: 'ca-app-pub-xxxxx/xxxxx', // 실제 Android 보상형 광고 ID
    }) || TestIds.REWARDED;

const INTERSTITIAL_AD_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.select({
      ios: 'ca-app-pub-xxxxx/xxxxx', // 실제 iOS 전면 광고 ID
      android: 'ca-app-pub-xxxxx/xxxxx', // 실제 Android 전면 광고 ID
    }) || TestIds.INTERSTITIAL;

// 보상형 광고 인스턴스
const rewardedAd = RewardedAd.createForAdRequest(REWARDED_AD_ID, {
  requestNonPersonalizedAdsOnly: true,
});

// 전면 광고 인스턴스
const interstitialAd = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_ID, {
  requestNonPersonalizedAdsOnly: true,
});

interface AdFrequency {
  lastShown: number;
  count: number;
}

// 광고 빈도 체크
const canShowInterstitialAd = async (): Promise<boolean> => {
  try {
    const data = await AsyncStorage.getItem('adFrequency');
    if (!data) return true;

    const frequency: AdFrequency = JSON.parse(data);
    const now = Date.now();
    const timeDiff = now - frequency.lastShown;
    const minInterval = 5 * 60 * 1000; // 5분

    return timeDiff > minInterval;
  } catch {
    return true;
  }
};

const markAdShown = async () => {
  const data: AdFrequency = {
    lastShown: Date.now(),
    count: 0,
  };
  await AsyncStorage.setItem('adFrequency', JSON.stringify(data));
};

// ==================== 보상형 동영상 광고 Hook ====================
export const useRewardedAd = (onRewardEarned: (amount: number) => void) => {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 광고 로드 완료
    const unsubscribeLoaded = rewardedAd.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        setLoaded(true);
        setLoading(false);
        console.log('✅ 보상형 광고 로드 완료');
      }
    );

    // 보상 획득
    const unsubscribeEarned = rewardedAd.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward: any) => {
        console.log('🎁 보상 획득:', reward);
        onRewardEarned(50); // 50원 적립 (변경: 100원 → 50원)
        // 보상 획득 후 다음 광고 로드
        setLoaded(false);
        setTimeout(() => {
          rewardedAd.load();
        }, 1000);
      }
    );

    // 초기 로드
    setLoading(true);
    rewardedAd.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeEarned();
    };
  }, [onRewardEarned]);

  const showAd = () => {
    if (loaded) {
      rewardedAd.show();
    } else {
      Alert.alert('광고 준비 중', '잠시 후 다시 시도해주세요.');
      if (!loading) {
        setLoading(true);
        rewardedAd.load();
      }
    }
  };

  return { showAd, loaded, loading };
};

// ==================== 자동 전면 광고 Hook ====================
export const useInterstitialAd = () => {
  const [loaded, setLoaded] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // 광고 로드 완료
    const unsubscribeLoaded = interstitialAd.addAdEventListener(
      AdEventType.LOADED,
      () => {
        setLoaded(true);
        console.log('✅ 전면 광고 로드 완료');
      }
    );

    // 광고 로드 실패
    const unsubscribeError = interstitialAd.addAdEventListener(
      AdEventType.ERROR,
      (error: any) => {
        setLoaded(false);
        console.error('❌ 전면 광고 로드 실패:', error);
      }
    );

    // 광고 닫힘
    const unsubscribeClosed = interstitialAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        setLoaded(false);
        // 다음 광고 미리 로드
        setTimeout(() => {
          interstitialAd.load();
        }, 2000);
      }
    );

    // 앱 포그라운드 복귀 시 광고 표시
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // 백그라운드에서 포그라운드로 복귀
        const canShow = await canShowInterstitialAd();
        if (canShow && loaded) {
          setTimeout(() => {
            showInterstitialAd();
          }, 1000);
        }
      }
      appState.current = nextAppState;
    });

    // 초기 로드
    interstitialAd.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeError();
      unsubscribeClosed();
      subscription.remove();
    };
  }, []);

  const showInterstitialAd = async () => {
    const canShow = await canShowInterstitialAd();
    if (canShow && loaded) {
      interstitialAd.show();
      await markAdShown();
    }
  };

  // 화면 전환 시 확률적으로 광고 표시
  const showAdOnNavigation = async (probability: number = 0.3) => {
    if (Math.random() < probability) {
      await showInterstitialAd();
    }
  };

  return { showInterstitialAd, showAdOnNavigation, loaded };
};

// ==================== 앱 시작 시 전면 광고 ====================
export const useAppStartAd = () => {
  const { showInterstitialAd, loaded } = useInterstitialAd();

  useEffect(() => {
    // 앱 시작 5초 후 광고 표시
    const timer = setTimeout(() => {
      if (loaded) {
        showInterstitialAd();
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [loaded]);
};
