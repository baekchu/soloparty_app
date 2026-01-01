/**
 * ==================== 광고 시스템 (AdMob) ====================
 * 
 * ⚠️ 현재 비활성화 상태 - 네이티브 설정 후 활성화 필요
 * 
 * 활성화 방법:
 * 1. AdMob 계정 생성: https://admob.google.com
 * 2. 앱 등록 및 광고 단위 ID 발급
 * 3. app.json에 플러그인 추가:
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
 * 4. npx expo prebuild
 * 5. 이 파일의 주석 해제
 * 
 * ========================================================================
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';

// ==================== 플레이스홀더 Hook ====================
// 네이티브 설정 전까지 크래시 없이 동작

export const useRewardedAd = (onRewardEarned: (amount: number) => void) => {
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

  const showInterstitialAd = useCallback(async () => {
    // 비활성화 상태
  }, []);

  const showAdOnNavigation = useCallback(async (_probability: number = 0.3) => {
    // 비활성화 상태
  }, []);

  return { showInterstitialAd, showAdOnNavigation, loaded };
};

export const useAppStartAd = () => {
  // 비활성화 상태
};
