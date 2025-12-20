# 🚀 빠른 시작 가이드

## 현재 상태: 준비 완료 ✅

광고 시스템이 모두 구현되었지만, **주석 처리**되어 있어 앱에 영향을 주지 않습니다.

---

## 📦 구현된 기능

### ✅ 완료된 파일
- `src/contexts/RewardContext.tsx` - 적립금 관리
- `src/services/AdService.tsx` - 광고 로직
- `src/screens/RewardScreen.tsx` - 적립금 화면
- `src/types/index.ts` - 타입 정의 업데이트
- `App.tsx` - 주석 처리된 설정 포함
- `CalendarScreen.tsx` - 주석 처리된 UI 포함

### 🎯 주요 기능
1. **보상형 광고** (30초 시청 → 100원 적립)
2. **전면 광고** (앱 시작/화면 전환 시)
3. **티켓 교환** (무료/50%/30% 할인권)
4. **적립 내역** (최근 50개 저장)

---

## ⚡ 활성화 방법 (3단계)

### 1️⃣ 패키지 설치

```powershell
npm install react-native-google-mobile-ads
npx expo install expo-dev-client
```

### 2️⃣ 주석 해제

**App.tsx** (3곳):
```tsx
// 1. Import 주석 해제
import { RewardProvider } from "./src/contexts/RewardContext";
import RewardScreen from "./src/screens/RewardScreen";

// 2. Provider 추가
<RewardProvider>
  <AppContent />
</RewardProvider>

// 3. 화면 등록
<Stack.Screen name="Reward" component={RewardScreen} />
```

**CalendarScreen.tsx** (3곳):
```tsx
// 1. Import 주석 해제
import { useReward } from '../contexts/RewardContext';
import { useRewardedAd, useInterstitialAd, useAppStartAd } from '../services/AdService';

// 2. Hooks 주석 해제
const { balance, addReward } = useReward();
const { showAd: showRewardedAd } = useRewardedAd(...);
useAppStartAd();

// 3. 헤더 버튼 주석 해제
<TouchableOpacity onPress={() => navigation.navigate('Reward')}>
  💰 {balance}원
</TouchableOpacity>
```

### 3️⃣ 네이티브 빌드

```powershell
npx expo prebuild
npx expo run:android
```

---

## 📋 체크리스트

### 개발 단계 (테스트 광고)
- [ ] 패키지 설치
- [ ] 주석 해제
- [ ] 네이티브 빌드
- [ ] 앱 실행 확인
- [ ] 광고 시청 테스트
- [ ] 적립금 확인
- [ ] 티켓 교환 테스트

### 프로덕션 단계 (실제 광고)
- [ ] AdMob 계정 생성
- [ ] 앱 등록 (앱 ID 발급)
- [ ] 광고 단위 생성 (보상형, 전면)
- [ ] `app.json`에 앱 ID 추가
- [ ] `AdService.tsx`에 광고 ID 추가
- [ ] 심사 승인 대기 (1-2주)
- [ ] 프로덕션 빌드 & 배포

---

## 🎨 UI 미리보기

### 캘린더 화면
```
┌─────────────────────────────┐
│ 2025  [오늘] 💰 0원  ☰      │ ← 적립금 버튼 추가
└─────────────────────────────┘
```

### 적립금 화면
```
┌─────────────────────────────┐
│     내 적립금                │
│     0원                      │
│  광고를 보고 적립금을 모아    │
│  무료 입장하세요!            │
└─────────────────────────────┘
┌─────────────────────────────┐
│ 🎬 광고 보고 100원 받기      │ ← 클릭 시 광고 재생
└─────────────────────────────┘

티켓 교환하기:
┌─────────────────────────────┐
│ 100% OFF 솔로파티 무료 입장권│
│ 15,000원                     │
└─────────────────────────────┘
```

---

## 💰 비즈니스 모델

### 사용자 입장
- 광고 150회 시청 (약 75분) → 무료 입장권 획득
- 광고 75회 시청 (약 37분) → 50% 할인권 획득
- **무료로 솔로파티 참여 가능!** 🎉

### 개발자 입장
- 10,000 DAU × 50% 시청률 → 월 $2,400 수익
- 사용자는 만족 (무료 입장)
- 개발자는 수익 (광고 수입)
- **Win-Win!** 🚀

---

## 📖 상세 가이드

자세한 내용은 `REWARD_SYSTEM_GUIDE.md` 참고:
- AdMob 계정 설정 방법
- 광고 ID 발급 과정
- 빈도 조절 방법
- 보상 금액 변경
- 문제 해결 팁

---

## ⚠️ 중요 사항

1. **테스트 모드**: 개발 중에는 자동으로 테스트 광고 표시
2. **Expo Go 불가**: 네이티브 빌드 필수 (Dev Client 사용)
3. **심사 필요**: 실제 광고 사용 전 AdMob 승인 필요
4. **빈도 제한**: 5분당 최대 1회 전면 광고 (사용자 경험 보호)

---

## 🎉 준비 완료!

모든 코드가 준비되었습니다. 원하실 때 언제든지 주석을 해제하고 활성화하세요! 🚀

질문이 있으시면 `REWARD_SYSTEM_GUIDE.md`를 참고하거나 문의해주세요.
