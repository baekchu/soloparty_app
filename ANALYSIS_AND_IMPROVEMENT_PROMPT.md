# 솔로파티 앱 — 현재 코드 분석 및 개선 프롬프트

---

## 🔍 현재 코드 심층 분석 결과

### 총평: 보안·캐싱은 우수, 구조·UX에 심각한 병목

| 영역 | 점수 | 평가 |
|------|------|------|
| **보안** | 8/10 | HMAC, 암호화, SSRF 방지, XSS 필터링 — 우수 |
| **캐싱/성능** | 7/10 | 3단 캐시(메모리→디스크→네트워크), 메모이제이션 적극 활용 |
| **코드 구조** | 4/10 | CalendarScreen 1,400줄 모놀리스, 모듈 상태 패턴 비표준 |
| **UX/사용성** | 5/10 | 스켈레톤 있으나, 피드백·접근성·네비게이션 약함 |
| **테스트** | 0/10 | 테스트 코드 전무 |
| **에러 처리** | 6/10 | try-catch 있으나, 사용자 피드백 미흡 |

---

## 🔴 가장 큰 문제점 TOP 5

### 1. CalendarScreen 모놀리스 (1,400줄) — 유지보수 불가

**현황**: 한 파일에 캘린더 렌더링, 패널 애니메이션, PanResponder 제스처, 검색, 필터, 북마크 탭, 포인트 모달, 광고 모달, 알림 프롬프트가 전부 들어있음.

**문제**:
- 하나를 고치면 다른 것이 깨질 가능성 높음
- 새 개발자가 이해하는 데 반나절 이상 소요
- 컴포넌트 분리가 안 되어 부분 리렌더링 불가능 — 검색어 입력만 해도 캘린더 전체가 리렌더
- `useState`가 17개 이상 — 상태 추적이 사실상 불가능

**영향도**: ★★★★★ (앱 전체 안정성에 직결)

---

### 2. 모듈 레벨 싱글톤 상태 패턴 — React 생태계와 충돌

**현황**: `useBookmarks`, `usePoints`, `useCoupons`, `useReminders`, `useReviews` 모두 파일 최상단에 `let _bookmarks = []` 같은 모듈 변수를 두고, 수동 `_listeners` Set으로 구독 관리.

```typescript
// 현재 패턴 (모든 훅에서 반복)
let _bookmarks: BookmarkedEvent[] = [];
let _loaded = false;
let _toggleLocked = false;
let _loading = false;
let _loadRetryCount = 0;
const _listeners = new Set<(bookmarks: BookmarkedEvent[]) => void>();
```

**문제**:
- React DevTools에서 상태 추적 불가
- Hot Reload 시 상태가 리셋되지 않아 개발 중 버그 양산
- Stale closure 위험 — useCallback 내부에서 모듈 변수를 읽으면 최신 값이 아닐 수 있음
- 5개 훅 × 평균 200줄의 보일러플레이트 = 1,000줄의 중복 패턴
- 테스트 시 모듈 상태를 리셋할 방법이 없음

**영향도**: ★★★★☆ (데이터 무결성 위험)

---

### 3. 사용자 피드백 부재 — "앱이 멈춘 것 같다"

**현황**: 
- 북마크 토글 시 아무런 시각적/촉각적 피드백 없음
- GPS 위치 확인 20초 동안 취소 버튼 없음
- 네트워크 에러 시 콘솔 로그만 남기고 사용자에게 알리지 않음
- 쿠폰 사용/포인트 사용 성공 시 토스트 없음
- 공유 후 결과 피드백 없음

**문제**:
- 사용자가 터치가 인식됐는지 모름
- 로딩이 끝났는지 알 수 없는 상황 발생
- 오류가 발생해도 "아무 일도 안 일어남"으로 인식

**영향도**: ★★★★☆ (사용자 이탈의 주요 원인)

---

### 4. EventListScreen에 getItemLayout 미구현 — 스크롤 점프

**현황**: FlatList에 `removeClippedSubviews`, `maxToRenderPerBatch` 등은 설정했으나, **가장 임팩트가 큰 `getItemLayout`이 빠져있음**.

```typescript
// 현재 코드 — getItemLayout 없음
<FlatList
  data={allEvents}
  renderItem={renderEvent}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
  // ❌ getItemLayout 없음 → 스크롤 위치 계산에 매 아이템 측정 필요
/>
```

**문제**:
- 수백 개 이벤트 시 스크롤 점프(jitter) 발생
- `scrollToIndex`를 사용할 수 없음
- `initialScrollIndex`를 사용할 수 없음
- FlatList가 모든 아이템 높이를 런타임에 측정해야 함

**영향도**: ★★★☆☆ (이벤트 많아질수록 심각해짐)

---

### 5. 테스트 코드 0% — 배포 리스크 극대

**현황**: 전체 코드베이스 ~35,000줄에 테스트 파일이 단 하나도 없음.

**문제**:
- 포인트 보안 서비스(4중 저장, HMAC, 암호화)의 정합성을 검증할 방법 없음
- 쿠폰 시스템(유효기간, 사용 처리)의 엣지 케이스 미검증
- 리팩토링 시 기존 동작 보장 불가
- 코드 변경 후 "돌려보기 전까지 모름"

**영향도**: ★★★★★ (장기적으로 가장 위험)

---

## 🟡 중간 문제점

### 6. AsyncStorage 의존 — 데이터 유실 위험
- 앱 삭제 시 모든 데이터(포인트, 쿠폰, 북마크) 소실
- 기기 변경 시 데이터 이전 불가
- SecureStore 백업이 있지만 같은 기기에서만 유효

### 7. 날짜 파싱 중복 구현
- `parseLocalDate`가 `sanitize.ts`, `useBookmarks.ts`, `storage.ts`에 각각 다른 버전으로 존재
- 타임존 처리가 파일마다 미묘하게 다름

### 8. 접근성(Accessibility) 전무
- `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` 없음
- 스크린 리더 사용 불가
- 색상 대비 미검증

### 9. 인라인 스타일과 StyleSheet 혼용
- CalendarScreen에서 인라인 스타일과 StyleSheet가 혼재
- 매 렌더마다 새 객체 생성 → GC 부담

### 10. 에러 바운더리 단일 레벨
- 앱 전체를 하나의 ErrorBoundary로 감싸지만
- 화면별 부분 복구가 불가능 (전체 앱이 에러 화면으로 전환)

---

## ✅ 잘 된 부분 (유지할 것)

1. **3단 캐시 아키텍처** — 메모리(5분) → 디스크(15분) → 네트워크. 탭 전환 시 즉시 표시
2. **데이터 변경 감지** — `isDataUnchanged()`로 스팟 체크, 동일 데이터면 참조 유지 → useMemo 재계산 방지
3. **보안 처리** — SSRF 방지(URL 화이트리스트), XSS 필터(sanitizeText), HMAC 무결성 검증
4. **EventListScreen** — memo, useCallback, keyExtractor 안정화, 모듈 캐시로 탭 전환 깜빡임 방지
5. **스켈레톤 로더** — 캐시 없을 때만 표시, 체감 속도 향상
6. **디자인 시스템** — Colors, Typography, Spacing, Radius, Shadows 통일

---

## 📋 개선 프롬프트 (AI에게 전달용)

아래 프롬프트를 AI 코딩 어시스턴트에게 전달하면, 단계별로 앱을 개선할 수 있습니다.

---

### 프롬프트 1: CalendarScreen 분리 (최우선)

```
솔로파티 앱의 CalendarScreen.tsx를 분석하고 다음과 같이 분리해줘.
현재 1,400줄 이상의 모놀리스 파일이야.

분리 대상:
1. src/components/calendar/PanelContent.tsx
   - 패널 내부 UI (전체일정/북마크 탭, 필터 칩, 이벤트 카드 목록)
   - props: events, bookmarks, selectedDate, panelTab, quickFilter, 
            debouncedSearch, isDark, onEventPress, onBookmarkToggle, 
            onPanelTabChange, onQuickFilterChange

2. src/components/calendar/PanelGesture.tsx
   - PanResponder 로직 (handleBar 드래그, 패널 확장/축소)
   - panelContentPanResponder (스크롤 상단에서 아래 드래그 시 닫기)
   - props: isPanelExpanded, onExpand, onCollapse, children

3. src/components/calendar/CalendarHeader.tsx
   - 상단 바 (년/월 표시, 지역 필터, 포인트 버튼)
   - props: currentYear, currentMonth, selectedRegion, points, 
            regions, onRegionChange, onPointsPress

4. src/components/calendar/QuickFilters.tsx
   - 빠른 필터 칩 (전체, 주말, 20대, 30대, 이번주, 소규모, 대규모)
   - props: quickFilter, onFilterChange

규칙:
- 기존 기능을 100% 유지할 것
- CalendarScreen은 상태 관리 + 조합(composition)만 담당
- 분리 후 CalendarScreen이 400줄 이내가 되도록
- 모든 분리된 컴포넌트는 React.memo로 래핑
- 타입은 별도 파일로 분리: src/components/calendar/types.ts
- 패널 애니메이션(translateY, spring)은 CalendarScreen에 유지 (PanelGesture에 ref 전달)
```

---

### 프롬프트 2: 모듈 상태 → Zustand 마이그레이션

```
솔로파티 앱에서 useBookmarks, usePoints, useCoupons, useReminders, useReviews 훅이
모듈 레벨 싱글톤 패턴(let _data = []; let _listeners = new Set())을 사용하고 있어.

이것을 Zustand로 마이그레이션해줘.

요구사항:
1. src/stores/bookmarkStore.ts — Zustand persist 미들웨어로 AsyncStorage 자동 저장
2. src/stores/pointsStore.ts — 기존 4중 저장(SecureStore×2 + AsyncStorage×2) 로직 유지
3. src/stores/couponStore.ts
4. src/stores/reminderStore.ts  
5. src/stores/reviewStore.ts

마이그레이션 규칙:
- 기존 훅(useBookmarks 등)은 Zustand 스토어의 래퍼로 유지 (호환성)
- 기존 데이터 마이그레이션 로직 보존 (레거시 키 → 새 키)
- AppState 백그라운드 저장 로직 보존
- HMAC 검증 로직 보존 (포인트)
- SecureStore 폴백 로직 보존 (북마크)
- Hot Reload 시 상태 리셋 문제 해결
- React DevTools에서 상태 추적 가능하도록

패키지 설치: npm install zustand

예시 구조:
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BookmarkStore {
  bookmarks: BookmarkedEvent[];
  isLoaded: boolean;
  toggleBookmark: (event: Event, date: string) => void;
  isBookmarked: (eventId: string, date: string) => boolean;
  load: () => Promise<void>;
}
```

---

### 프롬프트 3: 사용자 피드백 시스템 구축

```
솔로파티 앱에 토스트 알림 시스템과 햅틱 피드백을 추가해줘.

1. src/components/Toast.tsx — 토스트 컴포넌트
   - 타입: success(초록), error(빨강), info(파랑), warning(노랑)
   - 위치: 화면 하단 (탭바 위)
   - 애니메이션: 슬라이드 업 → 2초 대기 → 슬라이드 다운
   - useNativeDriver: true
   - 큐 시스템 (여러 토스트가 순서대로 표시)

2. src/contexts/ToastContext.tsx — 전역 토스트 프로바이더
   - showToast({ message, type, duration?, icon? })
   - App.tsx에 Provider 추가

3. src/utils/haptics.ts — 햅틱 피드백 유틸
   - expo-haptics 사용
   - hapticLight() — 북마크, 필터 선택
   - hapticMedium() — 공유, 쿠폰 사용
   - hapticSuccess() — 저장 완료
   - hapticError() — 에러 발생

적용 위치:
- 북마크 토글 → 토스트("찜 목록에 추가했어요" / "찜 목록에서 제거했어요") + hapticLight
- 포인트 적립 → 토스트("50P 적립되었어요!") + hapticSuccess
- 쿠폰 사용 → 토스트("쿠폰이 사용되었어요") + hapticMedium
- 이벤트 공유 → 토스트("공유 완료") + hapticLight
- 리마인더 설정 → 토스트("알림이 설정되었어요") + hapticLight
- 네트워크 에러 → 토스트("인터넷 연결을 확인해주세요") + hapticError
- 데이터 로드 실패 → 토스트("데이터를 불러올 수 없어요. 다시 시도해주세요")
- 클립보드 복사 → 토스트("복사되었어요") + hapticLight

현재 다크모드를 쓰고 있으니 토스트도 isDark에 맞게 스타일링해줘.
```

---

### 프롬프트 4: EventListScreen getItemLayout 및 UX 개선

```
솔로파티 앱의 EventListScreen.tsx에 다음 개선을 적용해줘.

1. getItemLayout 추가
   - 이벤트 카드의 예상 높이 측정 (현재 padding + content 기반)
   - 아이템 간 마진(Spacing.md = 12)도 오프셋에 포함

2. Empty State 개선
   - 현재: "등록된 이벤트가 없습니다" + "캘린더에서 이벤트를 확인해보세요"
   - 개선: 지역 필터가 적용된 상태인지 확인
     - 필터 있으면: "서울 지역에 등록된 이벤트가 없습니다" + [다른 지역 보기] 버튼
     - 필터 없으면: "아직 등록된 이벤트가 없어요" + [새로고침] 버튼
   - 일러스트 이모지 크기 키우기 (60 → 80)
   - 부드러운 페이드인 애니메이션

3. 에러 상태 추가
   - 데이터 로드 실패 시 에러 화면 표시
   - "오류가 발생했어요" + [다시 시도] 버튼
   - 현재는 catch에서 빈 배열만 설정하고 에러를 무시함

4. 리스트 헤더에 간단한 필터 칩 추가 (선택사항)
   - RegionContext의 selectedRegion 표시
   - 탭하면 필터 해제

현재 코드의 memo, useCallback, 모듈 캐시(_cachedEventList) 패턴은 유지할 것.
```

---

### 프롬프트 5: 접근성(Accessibility) 기본 적용

```
솔로파티 앱의 모든 터치 가능한 요소에 접근성 속성을 추가해줘.

대상 파일:
- EventListScreen.tsx의 EventCard
- CalendarScreen.tsx의 이벤트 카드, 필터 칩, 헤더 버튼
- EventDetailScreen.tsx의 모든 버튼 (북마크, 공유, 링크 열기, 리뷰)
- SettingsScreen.tsx의 모든 설정 항목
- HostProfileModal.tsx의 버튼들
- PointsModal.tsx의 버튼들

추가할 속성:
1. accessibilityLabel — 화면 읽기 프로그램이 읽을 텍스트
2. accessibilityRole — "button", "link", "tab", "header" 등
3. accessibilityHint — 터치 시 어떤 일이 일어나는지 설명
4. accessibilityState — { selected, disabled, checked } 상태

예시:
<TouchableOpacity
  accessible={true}
  accessibilityLabel={`${event.title}, ${event.date}`}
  accessibilityRole="button"
  accessibilityHint="이벤트 상세 정보를 확인합니다"
  onPress={handlePress}
>

- 북마크 버튼: accessibilityLabel="찜하기" / "찜 해제", accessibilityState={{ selected: isBookmarked }}
- 공유 버튼: accessibilityLabel="이벤트 공유", accessibilityHint="공유 메뉴를 엽니다"
- 필터 칩: accessibilityRole="tab", accessibilityState={{ selected: isActive }}
- 지역 변경: accessibilityLabel="지역 변경: 현재 서울", accessibilityRole="button"

한국어로 모든 라벨을 작성할 것.
```

---

### 프롬프트 6: 날짜 유틸 통합 및 중복 제거

```
솔로파티 앱에서 parseLocalDate 함수가 3곳에 중복 구현되어 있어.

중복 위치:
1. src/utils/sanitize.ts — parseLocalDate (메인)
2. src/hooks/useBookmarks.ts — parseLocalDate (로컬 복제)
3. src/utils/storage.ts에서도 날짜 파싱 로직 사용

해결:
1. src/utils/sanitize.ts의 parseLocalDate를 정규 소스(single source of truth)로 지정
2. useBookmarks.ts의 로컬 parseLocalDate 삭제 → sanitize.ts에서 import
3. 모든 파일에서 날짜 파싱은 반드시 sanitize.ts의 parseLocalDate 사용
4. 타입 안전성: parseLocalDate의 반환 타입을 Date | null에서 Date로 변경하고,
   null 케이스는 내부에서 throw하거나 fallback Date 반환

테스트 가능하도록 순수 함수로 유지할 것.
```

---

### 프롬프트 7: 핵심 로직 단위 테스트 추가

```
솔로파티 앱에 Jest 테스트를 추가해줘. 현재 테스트가 0개야.

설정:
1. jest.config.js 생성 (react-native 프리셋)
2. __tests__/ 폴더 구조 설정
3. @testing-library/react-native 설치

우선순위 테스트:

1. __tests__/utils/sanitize.test.ts
   - parseLocalDate: 정상 날짜, 잘못된 형식, null/undefined, 타임존 경계
   - sanitizeText: XSS 스크립트, 길이 초과, 빈 문자열
   - sanitizeColor: 유효한 색상, 무효한 색상, 기본값

2. __tests__/utils/storage.test.ts
   - safeJSONParse: 정상 JSON, 깨진 JSON, 크기 초과 (5MB), 빈 문자열
   - isAllowedUrl: 허용된 URL, 차단할 URL (javascript:, data:, ftp:)
   - isDataUnchanged: 동일 데이터, 다른 데이터, 빈 데이터

3. __tests__/hooks/useBookmarks.test.ts
   - 북마크 추가/제거
   - 최대 200개 제한 (MAX_BOOKMARKS)
   - 만료 처리 (90일 이후)
   - 레거시 데이터 마이그레이션

4. __tests__/services/PointsSecurityService.test.ts
   - HMAC 생성/검증
   - 암호화/복호화
   - 변조 감지
   - 복구 메커니즘

각 테스트는 AAA(Arrange-Act-Assert) 패턴으로 작성.
AsyncStorage와 SecureStore는 jest.mock으로 모킹.
```

---

### 프롬프트 8: 화면별 에러 바운더리 적용

```
현재 앱 전체를 하나의 ErrorBoundary로 감싸고 있어.
한 화면에서 에러가 나면 앱 전체가 에러 화면으로 바뀜.

개선:
1. src/components/ScreenErrorBoundary.tsx 생성
   - 개별 화면을 감싸는 경량 에러 바운더리
   - "이 화면에서 오류가 발생했어요" + [다시 시도] 버튼
   - 다시 시도 시 해당 화면만 리마운트
   - 다른 탭으로 이동은 항상 가능

2. App.tsx에서 각 Screen을 ScreenErrorBoundary로 래핑
   <Stack.Screen name="EventDetail">
     {(props) => (
       <ScreenErrorBoundary screenName="이벤트 상세">
         <EventDetailScreen {...props} />
       </ScreenErrorBoundary>
     )}
   </Stack.Screen>

3. 기존 전체 ErrorBoundary는 최후의 방어선으로 유지

- ErrorBoundary는 함수형 컴포넌트로 만들 수 없으므로 class 컴포넌트 사용
- componentDidCatch에서 에러 로깅 (secureLog 사용)
- 다크모드 지원
```

---

## 🚀 실행 우선순위

```
[Week 1] 즉시 개선 (사용자 직접 체감)
├── 프롬프트 3: 토스트 + 햅틱 피드백 시스템 (UX 즉시 개선)
├── 프롬프트 4: EventListScreen getItemLayout + 에러 상태
└── 프롬프트 6: 날짜 유틸 중복 제거 (버그 예방)

[Week 2] 구조 개선 (유지보수성)
├── 프롬프트 1: CalendarScreen 분리 (1,400줄 → 400줄)
└── 프롬프트 8: 화면별 에러 바운더리

[Week 3] 아키텍처 업그레이드
├── 프롬프트 2: Zustand 마이그레이션
└── 프롬프트 5: 접근성

[Week 4] 안전망 구축
└── 프롬프트 7: 단위 테스트 추가
```

---

## 💡 추가 권장 사항

### GPS 위치 확인 — 취소 버튼 추가
```
현재 GPS 확인이 20초 타임아웃 동안 취소할 방법이 없어.
LocationPickerScreen에서 위치 확인 중일 때:
- "위치를 확인하고 있어요..." + 로딩 스피너
- [취소] 버튼 추가
- 취소 시 이전 화면으로 돌아가기
```

### 네트워크 상태 감지
```
앱에 네트워크 상태 배너를 추가해줘.
- 오프라인 시 화면 상단에 "오프라인 모드" 배너 표시
- 다시 연결되면 "연결됨" 토스트 후 자동으로 데이터 새로고침
- expo-network 또는 @react-native-community/netinfo 사용
```

### EventDetailScreen 공유 URL 개선
```
현재 공유 시 앱 스토어 링크만 전달됨.
개선: 이벤트 제목 + 날짜 + 장소를 텍스트로 포함
"[솔로파티] 강남 소개팅 파티\n📅 2026년 4월 25일(토)\n📍 강남역 카페\n\n앱에서 자세히 보기: {store_link}"
```

---

## 📊 개선 후 예상 효과

| 개선 항목 | 기대 효과 |
|-----------|-----------|
| 토스트 + 햅틱 | 사용자 만족도 ↑ 40%, "앱이 반응한다"는 인식 |
| CalendarScreen 분리 | 버그 수정 시간 ↓ 60%, 부분 리렌더 가능 |
| Zustand 마이그레이션 | DevTools 디버깅 가능, stale closure 버그 제거 |
| getItemLayout | 이벤트 100개+ 시 스크롤 성능 2배 향상 |
| 에러 바운더리 분리 | 한 화면 에러가 앱 전체 장애로 이어지지 않음 |
| 단위 테스트 | 리팩토링/기능 추가 시 안전망 확보 |
| 접근성 | 스크린 리더 사용자 접근 가능, 앱스토어 리뷰 향상 |
