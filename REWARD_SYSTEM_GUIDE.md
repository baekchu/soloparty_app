# 💰 적립금 & 광고 시스템 구현 가이드

## 📋 개요

사용자가 광고를 보면 100원씩 적립되고, 모은 적립금으로 솔로파티 입장권을 무료/할인 가격에 교환할 수 있는 시스템입니다.

---

## 🎯 주요 기능

### 1️⃣ 보상형 동영상 광고
- 사용자가 버튼 클릭하여 광고 시청
- 광고 완료 시 100원 적립
- 30초 동영상 광고

### 2️⃣ 자동 전면 광고
- 앱 시작 5초 후 자동 표시
- 화면 전환 시 30% 확률로 표시
- 5분마다 최대 1회 표시 (빈도 제한)

### 3️⃣ 티켓 교환 시스템
- **무료 입장권**: 15,000원 (100% 할인)
- **50% 할인권**: 7,500원 (50% 할인)
- **30% 할인권**: 4,500원 (30% 할인)

### 4️⃣ 적립 내역 관리
- 적립/사용 내역 자동 저장
- 최근 50개 내역 보관
- AsyncStorage로 로컬 저장

---

## 🚀 설치 방법

### 1단계: 필요 패키지 설치

```powershell
# Google Mobile Ads SDK 설치
npm install react-native-google-mobile-ads

# Expo Dev Client 설치 (필수)
npx expo install expo-dev-client
```

### 2단계: app.json 설정

`app.json` 파일에 AdMob 플러그인 추가:

```json
{
  "expo": {
    "name": "solodating_app",
    "plugins": [
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-xxxxx~xxxxx",
          "iosAppId": "ca-app-pub-xxxxx~xxxxx"
        }
      ]
    ]
  }
}
```

### 3단계: AdMob 계정 설정

1. **AdMob 가입**: https://admob.google.com
2. **앱 추가**: 
   - Android 앱 추가
   - iOS 앱 추가
   - 각각 앱 ID 발급 (ca-app-pub-xxxxx~xxxxx)
3. **광고 단위 생성**:
   - **보상형 광고** (Rewarded Video)
   - **전면 광고** (Interstitial)
   - **배너 광고** (Banner) - 선택사항
4. 각 광고 단위 ID 복사

### 4단계: 광고 ID 설정

`src/services/AdService.tsx` 파일 수정:

```tsx
const REWARDED_AD_ID = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: 'ca-app-pub-xxxxx/1111111111', // 실제 iOS 보상형 광고 ID
      android: 'ca-app-pub-xxxxx/2222222222', // 실제 Android 보상형 광고 ID
    }) || TestIds.REWARDED;

const INTERSTITIAL_AD_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.select({
      ios: 'ca-app-pub-xxxxx/3333333333', // 실제 iOS 전면 광고 ID
      android: 'ca-app-pub-xxxxx/4444444444', // 실제 Android 전면 광고 ID
    }) || TestIds.INTERSTITIAL;
```

### 5단계: 네이티브 빌드

```powershell
# 네이티브 모듈 설정
npx expo prebuild --clean

# Android 빌드
npx expo run:android

# iOS 빌드 (macOS only)
npx expo run:ios
```

---

## ✅ 활성화 방법

### 1️⃣ App.tsx 주석 해제

```tsx
// import { RewardProvider } from "./src/contexts/RewardContext";
// import RewardScreen from "./src/screens/RewardScreen";

// 위 2줄 주석 해제 ▼
import { RewardProvider } from "./src/contexts/RewardContext";
import RewardScreen from "./src/screens/RewardScreen";
```

```tsx
// Provider 추가
export default function App() {
  return (
    <ThemeProvider>
      <RegionProvider>
        <RewardProvider>  {/* 추가 */}
          <AppContent />
        </RewardProvider>
      </RegionProvider>
    </ThemeProvider>
  );
}
```

```tsx
// Reward 화면 추가
<Stack.Screen
  name="Reward"
  component={RewardScreen}
  options={{
    presentation: "modal",
  }}
/>
```

### 2️⃣ CalendarScreen.tsx 주석 해제

import 부분 주석 해제:
```tsx
import { useReward } from '../contexts/RewardContext';
import { useRewardedAd, useInterstitialAd, useAppStartAd } from '../services/AdService';
```

Hook 사용 부분 주석 해제:
```tsx
const { balance, addReward } = useReward();
const { showAd: showRewardedAd, loaded: rewardedAdLoaded } = useRewardedAd((amount) => {
  addReward(amount, '광고 시청 보상');
});
const { showAdOnNavigation } = useInterstitialAd();
useAppStartAd();
```

헤더의 적립금 버튼 주석 해제:
```tsx
<TouchableOpacity
  activeOpacity={0.7}
  onPress={() => navigation.navigate('Reward')}
  style={{
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: isDark ? '#10b981' : '#34d399',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  }}
>
  <Text style={{ fontSize: 16 }}>💰</Text>
  <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
    {balance.toLocaleString()}원
  </Text>
</TouchableOpacity>
```

---

## 📁 파일 구조

```
src/
├── contexts/
│   └── RewardContext.tsx          # 적립금 상태 관리
├── services/
│   └── AdService.tsx              # 광고 로직 (보상형, 전면)
├── screens/
│   └── RewardScreen.tsx           # 적립금 & 티켓 교환 화면
└── types/
    └── index.ts                   # TypeScript 타입 정의
```

---

## 🧪 테스트 방법

### 개발 모드 테스트

개발 중에는 자동으로 **테스트 광고**가 표시됩니다 (`TestIds` 사용):
- 실제 수익 없음
- 즉시 표시 가능
- 심사 없이 테스트 가능

### 프로덕션 배포 전

1. **광고 ID 교체**: `AdService.tsx`의 `__DEV__` 부분을 실제 ID로 변경
2. **앱 심사**: AdMob에서 앱 승인 (1-2주 소요)
3. **빌드**: `eas build`로 프로덕션 빌드
4. **배포**: App Store / Play Store 업로드

---

## 💡 최적화 팁

### 광고 빈도 조절

`AdService.tsx`에서 광고 표시 간격 조정:

```tsx
const minInterval = 5 * 60 * 1000; // 5분 → 원하는 시간으로 변경
```

### 보상 금액 조정

`AdService.tsx`에서 보상 금액 변경:

```tsx
onRewardEarned(100); // 100원 → 원하는 금액으로 변경
```

### 티켓 가격 조정

`RewardScreen.tsx`에서 티켓 옵션 수정:

```tsx
const ticketOptions: TicketOption[] = [
  {
    id: '1',
    name: '솔로파티 무료 입장권',
    price: 15000,  // 필요 적립금
    originalPrice: 15000,
    discount: 100,
    description: '솔로파티 1회 무료 입장 (15,000원 상당)',
  },
  // ... 추가 옵션
];
```

---

## 📊 예상 수익

### 기본 가정
- DAU (일간 활성 사용자): 10,000명
- 광고 시청률: 50%
- 보상형 광고 단가: $10 eCPM
- 전면 광고 단가: $3 eCPM

### 월간 예상 수익

| 광고 유형 | 일간 노출 | 월간 노출 | eCPM | 월 수익 |
|----------|---------|---------|------|---------|
| 보상형 | 5,000 | 150,000 | $10 | $1,500 |
| 전면 | 10,000 | 300,000 | $3 | $900 |
| **합계** | | | | **$2,400** |

> 실제 수익은 지역, 사용자층, 앱 카테고리에 따라 크게 달라질 수 있습니다.

---

## ⚠️ 주의사항

### 1. 정책 준수
- **클릭 유도 금지**: "여기를 클릭하세요" 등 문구 사용 불가
- **보상 명확화**: 사용자에게 보상 내용을 명확히 표시
- **테스트 광고**: 프로덕션에서 테스트 ID 사용 금지

### 2. 사용자 경험
- **빈도 제한**: 너무 자주 광고를 표시하지 않기 (5분 간격 권장)
- **선택권 보장**: 보상형 광고는 사용자가 선택
- **타이밍**: 사용자 액션 중간에 끼어들지 않기

### 3. 기술적 제약
- **Expo Go 불가**: 네이티브 모듈이므로 Dev Client 필수
- **네이티브 빌드**: `expo prebuild` 후 빌드 필요
- **iOS 심사**: 광고 포함 시 App Store 심사 엄격

---

## 🐛 문제 해결

### 광고가 표시되지 않음

1. **개발 모드 확인**: `__DEV__`가 true인지 확인
2. **네이티브 빌드**: `npx expo prebuild --clean` 재실행
3. **광고 ID**: AdMob에서 광고 단위가 활성화되었는지 확인
4. **로그 확인**: Metro 로그에서 광고 로드 상태 확인

### 빌드 오류

```powershell
# 캐시 삭제
rm -rf node_modules
npm install

# 네이티브 폴더 재생성
npx expo prebuild --clean

# 다시 빌드
npx expo run:android
```

### "광고 준비 중" 계속 표시

- 네트워크 연결 확인
- AdMob 계정 상태 확인 (정지되지 않았는지)
- 광고 단위 ID가 올바른지 확인

---

## 📞 지원

문제가 발생하면:
1. Metro 로그 확인
2. AdMob 대시보드 확인
3. [Google Mobile Ads 문서](https://docs.page/invertase/react-native-google-mobile-ads) 참고

---

## 🎉 완료!

모든 설정이 완료되었습니다! 이제 사용자들이 광고를 보고 적립금을 모아 솔로파티에 무료로 참여할 수 있습니다. 🚀
