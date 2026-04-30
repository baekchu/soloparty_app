# 솔로파티 앱 (Solo Party)

React Native / Expo SDK 54 기반의 솔로 파티 일정 관리 앱입니다.

---

## 빠른 시작

```bash
npm install
npx expo start
```

---

## 데이터 관리 (GitHub Gist)

### 1. 초기 설정

1. [GitHub Token 생성](https://github.com/settings/tokens) → `gist` 권한 체크
2. [Gist 생성](https://gist.github.com/) → 파일명 `events.json` → **Create secret gist**
3. `src/config/env.ts` 에 값 입력:

```typescript
GIST_RAW_URL: 'https://gist.githubusercontent.com/사용자명/GIST_ID/raw/events.json'
```

### 2. 이벤트 JSON 형식

```json
{
  "2026-01-24": [
    {
      "id": "2026-01-24-gangnam-party",
      "title": "🎉 금요일 게더링 파티",
      "time": "19:30",
      "venue": "게더링 라운지",
      "location": "강남",
      "region": "서울",
      "address": "서울시 강남구 역삼동 123-45",
      "description": "매주 금요일 직장인 미팅파티",
      "detailDescription": "상세 설명 (줄바꿈 \\n 사용)",
      "maleCapacity": 8,
      "femaleCapacity": 8,
      "price": 30000,
      "ageRange": "25-35",
      "organizer": "게더링팀",
      "contact": "카톡 @gathering",
      "link": "https://open.kakao.com/gathering",
      "tags": ["게더링", "금요일", "직장인"]
    }
  ]
}
```

**주요 필드 설명**
| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✅ | 고유값 (날짜-장소-이름 조합 권장) |
| `title` | ✅ | 이벤트 이름 |
| `time` | - | `HH:MM` 형식 |
| `region` | - | 지역 필터에 사용 (`서울`, `부산` 등) |
| `price` | - | 숫자 (원 단위), 0이면 무료로 표시 |
| `ageRange` | - | `"25-35"` 형식 |
| `link` | - | 신청 링크 (https:// 필수) |
| `subEvents` | - | 지점 배열 (아래 참고) |

**지점(subEvents) 사용 예시**
```json
{
  "id": "2026-01-25-multi-branch",
  "title": "전국 동시 파티",
  "subEvents": [
    { "id": "branch-seoul", "location": "강남", "venue": "강남점", "region": "서울", "link": "https://..." },
    { "id": "branch-busan", "location": "해운대", "venue": "부산점", "region": "부산", "link": "https://..." }
  ]
}
```

### 3. 매주 반복 이벤트 관리

VS Code에서 `Ctrl+H` (찾기/바꾸기)로 날짜만 교체:
```
2026-01-24  →  2026-01-31
2026-01-25  →  2026-02-01
2026-01-26  →  2026-02-02
```

---

## 배포 (EAS Build)

```bash
# 1. EAS CLI 설치
npm install -g eas-cli

# 2. 로그인
eas login

# 3. Android APK 빌드 (테스트용)
eas build --platform android --profile preview

# 4. 스토어 제출용 빌드
eas build --platform android --profile production
eas build --platform ios --profile production

# 5. 스토어 제출
eas submit --platform android
eas submit --platform ios
```

`eas.json` 프로필 참고: `preview` = APK, `production` = AAB/IPA

---

## 딥 링크

커스텀 스킴 `soloparty://` 사용 (도메인 불필요):

```
soloparty://event/EVENT_ID?date=2026-01-24
```

`app.json`에 이미 설정되어 있음. 추가 설정 불필요.

---

## 포인트 & 광고 시스템

현재 광고 코드는 주석 처리 상태 (스토어 심사용). 활성화 시:

```bash
npm install react-native-google-mobile-ads
npx expo prebuild --clean
```

`CalendarScreen.tsx` 내 `// const { showAd }` 주석 해제 후 AdMob 앱 ID를 `app.json`에 추가:
```json
"plugins": [
  ["react-native-google-mobile-ads", { "androidAppId": "ca-app-pub-xxx~xxx", "iosAppId": "ca-app-pub-xxx~xxx" }]
]
```

---

## 네이버 지도 연동 (선택)

장소 탭 지도 기능 사용 시 [네이버 클라우드 콘솔](https://www.ncloud.com/)에서 Maps API 키 발급 후 `src/config/env.ts`에 추가.

---

## 프로젝트 구조

```
src/
├── screens/          # 화면 (CalendarScreen, EventListScreen, ...)
├── components/       # 공통 컴포넌트
├── contexts/         # 전역 상태 (Theme, Region, User, Toast)
├── hooks/            # 커스텀 훅 (useBookmarks, usePoints, ...)
├── services/         # 서비스 (Ad, Notification, Points)
├── utils/            # 유틸 (storage, sanitize, secureStorage, ...)
├── config/env.ts     # 환경 변수 (Gist URL 등)
└── types/index.ts    # 타입 정의
```
│   │   ├── EventListScreen.js     # 이벤트 목록 화면
│   │   ├── AddEventScreen.js      # 이벤트 추가 화면
│   │   └── DayEventsScreen.js     # 특정 날짜의 이벤트 상세 화면
│   └── utils/
│       └── storage.js             # AsyncStorage 유틸리티
└── package.json
```

## 사용 방법

1. **캘린더에서 날짜 선택**: 이벤트가 있는 날짜는 점으로 표시됩니다
2. **이벤트 추가**: 하단의 "이벤트 추가" 버튼을 눌러 새 이벤트를 생성합니다
3. **이벤트 보기**: 캘린더에서 날짜를 탭하거나 목록 탭에서 모든 이벤트를 확인합니다
4. **이벤트 삭제**: 이벤트 상세 화면에서 삭제 버튼을 눌러 제거합니다
