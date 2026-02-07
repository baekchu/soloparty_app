/**
 * ==================== 인피드 광고 배너 ====================
 * 
 * 이벤트 리스트 사이에 삽입되는 Google AdMob 광고 배너
 * 
 * - react-native-google-mobile-ads 설치 시: 실제 AdMob 배너 표시
 * - 미설치 시: 구글 광고 스타일 플레이스홀더 표시
 * 
 * === 활성화 방법 ===
 * 1. npm install react-native-google-mobile-ads
 * 2. app.json에 react-native-google-mobile-ads 플러그인 추가
 * 3. 아래 USE_REAL_ADS = true로 변경
 * 4. eas build로 네이티브 빌드
 * 
 * ========================================================================
 */

import React, { memo, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { AD_CONFIG } from '../services/AdService';

// ==================== 설정 ====================
/** 
 * true = 실제 AdMob 배너 (react-native-google-mobile-ads 필요)
 * false = 플레이스홀더 광고 표시 
 */
const USE_REAL_ADS = false;

const BANNER_AD_UNIT_ID = Platform.select({
  android: __DEV__ ? 'ca-app-pub-3940256099942544/6300978111' : 'ca-app-pub-REAL/BANNER_INFEED',
  ios: __DEV__ ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-REAL/BANNER_INFEED',
}) ?? '';

// ==================== 플레이스홀더 광고 데이터 ====================
const PLACEHOLDER_ADS = [
  { title: "Google 광고", desc: "광고 · 여기에 광고가 표시됩니다", color: "#4285f4" },
  { title: "Google 광고", desc: "광고 · 맞춤 광고가 표시됩니다", color: "#34a853" },
  { title: "Google 광고", desc: "광고 · 관심사 기반 광고", color: "#ea4335" },
  { title: "Google 광고", desc: "광고 · Ads by Google", color: "#fbbc05" },
];

interface InFeedAdBannerProps {
  /** 위치 인덱스 (로테이션용) */
  index?: number;
  isDark?: boolean;
}

/** 
 * 이벤트 리스트 사이에 삽입되는 광고 배너
 * 3개 일정 후, 또는 일정이 없어도 표시 가능
 */
const InFeedAdBanner = memo(({ index = 0, isDark = false }: InFeedAdBannerProps) => {
  const [adError, setAdError] = useState(false);

  // 실제 AdMob 배너 (네이티브 빌드 후)
  if (USE_REAL_ADS && !AD_CONFIG.disableAll && !adError) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads');
      return (
        <View style={{
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 12,
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        }}>
          <BannerAd
            unitId={BANNER_AD_UNIT_ID}
            size={BannerAdSize.MEDIUM_RECTANGLE}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdFailedToLoad={() => setAdError(true)}
          />
        </View>
      );
    } catch {
      // SDK 미설치 → 폴백
    }
  }

  // 플레이스홀더 광고 (Google Ads 스타일)
  const ad = PLACEHOLDER_ADS[index % PLACEHOLDER_ADS.length];
  
  return (
    <View style={{
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.12)',
      borderRadius: 14,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      {/* 광고 컨텐츠 영역 */}
      <View style={{
        height: 100,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <View style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: ad.color,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 8,
          opacity: 0.8,
        }}>
          <Text style={{ fontSize: 20, color: '#fff', fontWeight: '900' }}>G</Text>
        </View>
        <Text style={{ 
          fontSize: 12, 
          color: 'rgba(255, 255, 255, 0.4)', 
          fontWeight: '500',
        }}>
          {ad.desc}
        </Text>
      </View>
      
      {/* 하단 AD 라벨 */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{
            paddingHorizontal: 5,
            paddingVertical: 1.5,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderRadius: 3,
          }}>
            <Text style={{ fontSize: 8, fontWeight: '800', color: 'rgba(255, 255, 255, 0.5)' }}>AD</Text>
          </View>
          <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', fontWeight: '500' }}>
            Google AdMob
          </Text>
        </View>
      </View>
    </View>
  );
});

InFeedAdBanner.displayName = 'InFeedAdBanner';

export default InFeedAdBanner;
