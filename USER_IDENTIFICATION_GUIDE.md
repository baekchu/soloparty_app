# 사용자 식별 시스템 가이드

## 📌 주요 변경 사항

### 1️⃣ 적립금 변경
- **이전**: 광고 1회 시청 = 100원 적립
- **변경**: 광고 1회 시청 = **50원 적립**

### 2️⃣ 사용자 구분 시스템
서버 없이 디바이스 고유 ID로 사용자를 구분합니다.

## 🔧 설치 방법

```bash
# 1. expo-device 패키지 설치
npm install expo-device

# 2. App.tsx 업데이트 (아래 참고)

# 3. 네이티브 빌드 (필수)
npx expo prebuild --clean
npx expo run:android
```

## 📂 파일 구조

```
src/
├── contexts/
│   ├── UserContext.tsx        # 사용자 식별 시스템 (NEW!)
│   └── RewardContext.tsx      # 적립금 관리 (UPDATED - 50원으로 변경)
├── services/
│   └── AdService.tsx          # 광고 서비스 (UPDATED - 50원으로 변경)
└── screens/
    └── RewardScreen.tsx       # 적립금 화면 (UPDATED - 50원으로 변경)
```

## 🔐 사용자 식별 원리

### 1. 디바이스 고유 ID 생성
```typescript
// 최초 실행 시 UUID 생성
const userId = "a3f2b8c4-1234-4xyz-abcd-9876543210ef"

// AsyncStorage에 영구 저장
await AsyncStorage.setItem('userId', userId);
```

### 2. 디바이스 정보 수집
```typescript
deviceInfo: {
  brand: "Samsung",           // 제조사
  modelName: "Galaxy S21",    // 모델명
  osName: "Android",          // OS
  osVersion: "13"             // OS 버전
}
```

### 3. 사용자별 데이터 저장
```typescript
// 각 사용자별로 별도 저장
AsyncStorage.setItem(`reward_balance_${userId}`, "2500");
AsyncStorage.setItem(`reward_history_${userId}`, JSON.stringify([...]));
```

## 💾 데이터 저장 구조

### 1️⃣ 개인 데이터 (사용자별)
```typescript
// 사용자 정보
user_a3f2b8c4... = {
  userId: "a3f2b8c4-1234-4xyz-abcd-9876543210ef",
  deviceInfo: {...},
  createdAt: "2025-12-20T10:00:00Z",
  lastActiveAt: "2025-12-20T15:30:00Z"
}

// 적립금 잔액
reward_balance_a3f2b8c4... = "2500"

// 적립/사용 내역 (개인)
reward_history_a3f2b8c4... = [
  {
    id: "1734699600123",
    amount: 50,
    type: "earn",
    reason: "광고 시청 보상",
    date: "2025-12-20T15:30:00Z",
    userId: "a3f2b8c4...",
    deviceInfo: {...}
  },
  ...
]
```

### 2️⃣ 전체 데이터 (관리용)
```typescript
// 모든 사용자의 적립/사용 내역 (최근 1000개)
global_reward_history = [
  {
    userId: "a3f2b8c4...",
    amount: 50,
    type: "earn",
    deviceInfo: {...},
    date: "2025-12-20T15:30:00Z"
  },
  {
    userId: "b5d7e9f1...",
    amount: -50000,
    type: "spend",
    reason: "솔로파티 무료 입장권",
    deviceInfo: {...},
    date: "2025-12-20T15:28:00Z"
  },
  ...
]

// 티켓 사용 내역 (최근 500개)
ticket_usage_history = [
  {
    ticketName: "솔로파티 무료 입장권",
    amount: 50000,
    userId: "b5d7e9f1...",
    deviceInfo: {...},
    usedAt: "2025-12-20T15:28:00Z"
  },
  ...
]
```

## 🎯 사용 예시

### App.tsx 설정
```typescript
import { UserProvider } from "./src/contexts/UserContext";
import { RewardProvider } from "./src/contexts/RewardContext";

export default function App() {
  return (
    <ThemeProvider>
      <RegionProvider>
        <UserProvider>           {/* 1. 사용자 식별 먼저 */}
          <RewardProvider>       {/* 2. 적립금 시스템 */}
            <NavigationContainer>
              {/* 앱 화면들 */}
            </NavigationContainer>
          </RewardProvider>
        </UserProvider>
      </RegionProvider>
    </ThemeProvider>
  );
}
```

### 컴포넌트에서 사용
```typescript
import { useUser } from '@/contexts/UserContext';
import { useReward } from '@/contexts/RewardContext';

function MyComponent() {
  const { userId, getUserData } = useUser();
  const { balance, addReward } = useReward();

  // 사용자 정보 확인
  const checkUser = async () => {
    const userData = await getUserData();
    console.log('사용자 ID:', userId);
    console.log('디바이스:', userData?.deviceInfo.modelName);
  };

  // 광고 보상 (50원)
  const earnReward = () => {
    addReward(50, '광고 시청 보상');
  };

  return (
    <View>
      <Text>내 ID: {userId?.slice(0, 8)}...</Text>
      <Text>잔액: {balance}원</Text>
    </View>
  );
}
```

## 📊 데이터 추적 예시

### 1. 특정 사용자의 활동 확인
```typescript
const userId = "a3f2b8c4-1234-4xyz-abcd-9876543210ef";

// 해당 사용자의 잔액
const balance = await AsyncStorage.getItem(`reward_balance_${userId}`);

// 해당 사용자의 내역
const history = await AsyncStorage.getItem(`reward_history_${userId}`);
console.log(JSON.parse(history));
```

### 2. 전체 통계 확인
```typescript
// 모든 사용자의 활동 내역
const globalHistory = await AsyncStorage.getItem('global_reward_history');
const histories = JSON.parse(globalHistory);

// 사용자별 합계 계산
const userStats = histories.reduce((acc, h) => {
  if (!acc[h.userId]) {
    acc[h.userId] = { earned: 0, spent: 0 };
  }
  if (h.type === 'earn') acc[h.userId].earned += h.amount;
  if (h.type === 'spend') acc[h.userId].spent += Math.abs(h.amount);
  return acc;
}, {});

console.log('사용자별 통계:', userStats);
// {
//   "a3f2b8c4...": { earned: 5000, spent: 50000 },
//   "b5d7e9f1...": { earned: 2500, spent: 25000 },
// }
```

### 3. 티켓 사용 통계
```typescript
const ticketUsage = await AsyncStorage.getItem('ticket_usage_history');
const tickets = JSON.parse(ticketUsage);

// 티켓 종류별 사용 횟수
const ticketCounts = tickets.reduce((acc, t) => {
  acc[t.ticketName] = (acc[t.ticketName] || 0) + 1;
  return acc;
}, {});

console.log('티켓 사용 통계:', ticketCounts);
// {
//   "솔로파티 무료 입장권": 5,
//   "솔로파티 50% 할인권": 12,
//   "솔로파티 30% 할인권": 8
// }
```

## 🔍 로그 확인

앱 실행 시 콘솔에서 다음 로그를 볼 수 있습니다:

```
✅ 새 사용자 생성: a3f2b8c4-1234-4xyz-abcd-9876543210ef
✅ 적립금 로드 (User: a3f2b8c4...): 2500원
✅ 적립: 50원 (User: a3f2b8c4..., Balance: 2550원)
✅ 사용: 50000원 (User: a3f2b8c4..., Balance: 0원, Ticket: 솔로파티 무료 입장권)
✅ 티켓 사용 내역 저장: 솔로파티 무료 입장권
```

## 💰 새로운 적립 구조

### 무료 입장권까지 필요한 광고 시청 횟수
```
50,000원 / 50원 = 1,000회

광고 1회 = 30초
1,000회 × 30초 = 30,000초 = 500분 = 8.3시간
```

### 티켓 옵션
| 티켓 | 가격 | 필요 광고 수 | 소요 시간 |
|------|------|-------------|----------|
| 무료 입장권 (100%) | 50,000원 | 1,000회 | 8.3시간 |
| 50% 할인권 | 25,000원 | 500회 | 4.2시간 |
| 30% 할인권 | 15,000원 | 300회 | 2.5시간 |

## 🚀 활성화 방법

### 1. App.tsx 주석 해제
```typescript
// 주석 제거
import { UserProvider } from "./src/contexts/UserContext";
import { RewardProvider } from "./src/contexts/RewardContext";
import RewardScreen from "./src/screens/RewardScreen";

// Provider 래핑
<UserProvider>
  <RewardProvider>
    {/* 앱 내용 */}
  </RewardProvider>
</UserProvider>

// Screen 추가
<Stack.Screen name="Reward" component={RewardScreen} />
```

### 2. CalendarScreen.tsx 주석 해제
```typescript
// 주석 제거
import { useReward } from "@/contexts/RewardContext";
import { useRewardedAd } from "@/services/AdService";

// 적립금 버튼 활성화
<TouchableOpacity onPress={() => navigation.navigate('Reward')}>
  <Text>💰 {balance.toLocaleString()}원</Text>
</TouchableOpacity>
```

### 3. 네이티브 빌드 실행
```bash
npx expo prebuild --clean
npx expo run:android
```

## ⚠️ 주의사항

1. **디바이스 ID는 앱 재설치 시 변경됨**
   - 앱 삭제 후 재설치하면 새 userId 생성
   - 향후 서버 연동 시 복원 가능하도록 설계됨

2. **AsyncStorage 용량 제한**
   - Android: 6MB
   - iOS: 무제한 (but 실용적으로는 10MB 이하 권장)
   - 현재 설정: 개인 내역 100개 + 전체 내역 1000개 + 티켓 내역 500개

3. **데이터 백업 없음**
   - 현재는 로컬 저장만 지원
   - 향후 Firebase/Supabase 연동으로 클라우드 백업 가능

## 🔮 향후 확장 가능성

### 서버 연동 시
```typescript
// 로그인 후 서버와 동기화
const syncWithServer = async (userId: string) => {
  const localHistory = await AsyncStorage.getItem(`reward_history_${userId}`);
  
  // 서버로 전송
  await fetch('https://api.example.com/sync', {
    method: 'POST',
    body: JSON.stringify({ userId, history: localHistory })
  });
  
  // 서버에서 다운로드
  const serverData = await fetch(`https://api.example.com/user/${userId}`);
  await AsyncStorage.setItem(`reward_balance_${userId}`, serverData.balance);
};
```

---

**완료!** 이제 사용자를 구분하고 누가 얼마를 사용했는지 추적할 수 있습니다! 🎉
