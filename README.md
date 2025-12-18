# 이벤트 캘린더 앱

React Native와 Expo로 제작된 이벤트 캘린더 앱입니다.

## 기능

- 📅 **월간 캘린더 뷰**: 한눈에 이벤트가 있는 날짜 확인
- ➕ **이벤트 추가**: 제목, 시간, 장소, 설명 등 상세 정보 입력
- 📋 **이벤트 목록**: 모든 이벤트를 날짜순으로 정렬하여 표시
- 🗑️ **이벤트 삭제**: 불필요한 이벤트 간편하게 삭제
- 💾 **로컬 저장**: AsyncStorage를 사용한 데이터 영구 보관

## 시작하기

### 설치

```bash
npm install
```

### 실행

```bash
# 웹에서 실행
npm run web

# Android에서 실행
npm run android

# iOS에서 실행 (macOS 필요)
npm run ios
```

## 사용된 기술

- **React Native** - 크로스 플랫폼 모바일 앱 프레임워크
- **Expo** - React Native 개발 도구
- **React Navigation** - 화면 네비게이션
- **React Native Calendars** - 캘린더 UI 컴포넌트
- **AsyncStorage** - 로컬 데이터 저장
- **date-fns** - 날짜 포맷팅

## 프로젝트 구조

```
solodating_app/
├── App.js                          # 앱 진입점 및 네비게이션 설정
├── src/
│   ├── screens/
│   │   ├── CalendarScreen.js      # 캘린더 화면
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
