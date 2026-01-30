# 🚀 앱 성능 최적화 가이드

이 문서는 Solo Party 앱의 성능 최적화 현황과 추가 최적화 방법을 설명합니다.

---

## ✅ 적용된 최적화

### 1. 컴포넌트 최적화

#### EventListScreen
- `React.memo`로 EventCard 컴포넌트 메모이제이션
- `getItemLayout` 구현으로 FlatList 스크롤 성능 향상
- `keyExtractor` 안정화
- FlatList 성능 옵션 최적화:
  - `removeClippedSubviews={true}`
  - `maxToRenderPerBatch={15}`
  - `windowSize={7}`
  - `updateCellsBatchingPeriod={30}`

#### CalendarScreen
- `useMemo`/`useCallback` 적극 활용
- `InteractionManager.runAfterInteractions` 사용
- PanResponder 최적화
- 월별 높이 캐싱

#### MonthCalendar
- `React.memo` 래핑
- 날짜 계산 외부 함수화
- 필터링된 이벤트 메모이제이션

### 2. Context 최적화
- 모든 Context에 `useMemo` 적용
- `useCallback`으로 함수 안정화
- 불필요한 리렌더링 방지

### 3. 저장소 최적화

#### AsyncStorage Manager
- 배치 쓰기 지원 (100ms 내 쓰기 자동 배치)
- 초기화 시간 단축 (500ms → 300ms)
- `multiGet`/`multiSet` 적극 활용

#### 포인트 보안 서비스
- 4중 저장 시스템 (SecureStore x2 + AsyncStorage x2)
- 자동 복구 메커니즘
- 3회 재시도 로직

### 4. 번들 최적화

#### Metro Config
- `inlineRequires: true` - 지연 로딩
- 미니파이 설정 최적화
- 불필요한 파일 확장자 제외

---

## 🛠 성능 유틸리티 (`src/utils/performanceUtils.ts`)

### 사용 가능한 훅들

```typescript
// 디바운스
const debouncedSearch = useDebounce(searchTerm, 300);

// 디바운스 콜백
const debouncedSave = useDebouncedCallback(saveData, 500);

// 스로틀 콜백
const throttledScroll = useThrottledCallback(handleScroll, 100);

// 이전 값 추적
const prevValue = usePrevious(value);

// 마운트 상태 확인
const isMounted = useIsMounted();

// 안정적인 콜백
const stableCallback = useStableCallback(callback);

// 지연 초기화
const lazyData = useLazyInit(() => expensiveComputation(), 100);
```

### 메모리 캐시

```typescript
import { eventCache, computationCache } from '../utils/performanceUtils';

// 캐시 저장
eventCache.set('key', data);

// 캐시 조회
const cached = eventCache.get('key');
```

---

## 📊 성능 모니터링 (개발 모드)

```typescript
import { useRenderCount } from '../utils/performanceUtils';

function MyComponent() {
  const renderCount = useRenderCount('MyComponent');
  // 10회 초과 렌더링 시 콘솔 경고
}
```

---

## 🔧 추가 최적화 권장사항

### 1. 이미지 최적화
- WebP 형식 사용 권장
- 적절한 해상도 이미지 사용
- `expo-image` 라이브러리 고려

### 2. 네트워크 최적화
- 이미 구현된 3분 캐시 활용
- 오프라인 지원 고려

### 3. 애니메이션 최적화
- `useNativeDriver: true` 가능한 곳에 적용
- `Reanimated` 라이브러리 고려

### 4. 빌드 최적화
```bash
# 프로덕션 빌드 시
eas build --platform all --profile production
```

---

## 📈 성능 측정 방법

### React DevTools
```bash
npx react-devtools
```

### Flipper (네이티브 빌드)
- 네트워크 요청 모니터링
- 성능 프로파일링
- 레이아웃 인스펙터

### 콘솔 타이밍
```typescript
console.time('loadEvents');
await loadEvents();
console.timeEnd('loadEvents');
```

---

## 🎯 목표 성능 지표

| 지표 | 목표값 |
|------|--------|
| 앱 시작 시간 | < 2초 |
| 화면 전환 | < 300ms |
| FlatList 스크롤 | 60fps |
| 메모리 사용량 | < 150MB |

---

*마지막 업데이트: 2026년 1월 30일*
