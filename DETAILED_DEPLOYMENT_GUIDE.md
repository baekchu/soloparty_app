# 로고 적용 및 앱 배포 - 단계별 가이드

## 📸 1단계: 제공하신 이미지를 앱 아이콘으로 변환

### 이미지 준비 과정

제공하신 핑크색 하트+캘린더 이미지를 앱 아이콘으로 사용하려면:

1. **이미지 편집** (권장 도구):
   - Photoshop / Figma / Canva
   - 온라인: https://www.remove.bg/ (배경 제거)

2. **필요한 크기로 리사이즈**:
   ```
   - icon.png: 1024x1024px (정사각형, PNG)
   - adaptive-icon.png: 1024x1024px (Android용)
   - splash-icon.png: 1242x2436px (스플래시 화면)
   ```

3. **자동 변환 도구 사용** (가장 쉬운 방법):
   
   **방법 A: Icon.kitchen (추천)**
   - https://icon.kitchen/
   - 이미지 업로드
   - "Generate" 클릭
   - 모든 크기 자동 생성
   - 다운로드하여 `assets` 폴더에 복사

   **방법 B: AppIcon.co**
   - https://appicon.co/
   - 1024x1024px 이미지 업로드
   - iOS, Android 아이콘 자동 생성

---

## 🖼️ 2단계: Assets 폴더에 이미지 추가

```powershell
# 현재 프로젝트 디렉토리에서
cd e:\app\solodating_app\assets
```

파일 구조:
```
assets/
├── icon.png                 # 1024x1024px (앱 아이콘)
├── adaptive-icon.png        # 1024x1024px (Android 적응형)
├── splash-icon.png          # 1242x2436px (스플래시)
└── favicon.png              # 512x512px (웹용)
```

### 이미지 요구사항
- **형식**: PNG (투명 배경)
- **색상**: RGB
- **크기**: 정확히 지정된 픽셀
- **압축**: 최소화 (고품질 유지)

---

## ⚙️ 3단계: EAS (Expo Application Services) 설정

### EAS CLI 설치

```powershell
# 관리자 권한으로 PowerShell 실행
npm install -g eas-cli

# 설치 확인
eas --version
```

### Expo 계정 생성 및 로그인

```powershell
# 로그인 (브라우저 열림)
eas login

# 또는 회원가입
# https://expo.dev/signup
```

### 프로젝트 초기화

```powershell
cd e:\app\solodating_app

# EAS 프로젝트 설정
eas build:configure

# 질문에 답변:
# - Platform: "All" 선택
# - Generate eas.json: "Yes"
```

이 과정에서 **Project ID**가 생성됩니다.

---

## 🔨 4단계: 첫 빌드 실행

### Android APK 빌드 (테스트용)

```powershell
# 프리뷰 빌드 (APK - 직접 설치 가능)
eas build --platform android --profile preview

# 진행 과정:
# 1. 빌드 큐 대기 (5-20분)
# 2. 빌드 진행 (10-30분)
# 3. 다운로드 링크 생성
```

빌드가 완료되면:
```
✅ Build finished!
📦 Download: https://expo.dev/artifacts/eas/...
```

### APK 테스트

1. 다운로드 링크를 Android 기기에서 열기
2. APK 파일 다운로드
3. "알 수 없는 출처" 설치 허용
4. 앱 설치 및 테스트

---

## 📱 5단계: Google Play Store 배포

### Google Play Console 계정 생성

1. **등록**: https://play.google.com/console/signup
2. **비용**: $25 (일회성, 평생 사용)
3. **개발자 계정 생성** (약 30분 소요)

### 앱 생성

1. **"앱 만들기"** 클릭
2. **앱 세부정보**:
   ```
   앱 이름: Solo Party
   기본 언어: 한국어 (대한민국)
   앱 또는 게임: 앱
   무료 또는 유료: 무료
   ```

3. **개발자 정보**:
   - 이메일 주소
   - 외부 마케팅 (선택사항)

### 스토어 등록정보 작성

**스토어 설정 > 기본 스토어 등록정보**

1. **짧은 설명** (80자 제한):
   ```
   특별한 만남을 위한 일정 관리. 데이트 장소와 시간을 한눈에!
   ```

2. **전체 설명** (4000자 제한):
   ```
   Solo Party - 특별한 만남을 위한 스마트 일정 관리

   ✨ 주요 기능
   📅 직관적인 캘린더 인터페이스
   - 월간/주간 뷰로 일정 한눈에 파악
   - 날짜별 상세 이벤트 정보
   
   📍 인기 장소 자동 추천
   - Gist 기반 실시간 장소 데이터
   - 지역별 필터링 및 검색
   - 사용 빈도 기반 인기 순위
   
   🌓 다크모드 지원
   - 시간대별 자동 전환
   - 눈의 피로 감소
   
   🎨 아름다운 디자인
   - 핑크/퍼플 그라데이션 테마
   - 부드러운 애니메이션
   - 직관적인 UX
   
   💾 데이터 관리
   - 로컬 캐시 지원
   - 자동 동기화
   - 오프라인 모드
   
   Solo Party와 함께 특별한 만남을 계획하세요!
   ```

3. **앱 아이콘**:
   - 512x512px PNG 업로드
   - 32비트 PNG (투명 배경)

4. **기능 그래픽**:
   - 1024x500px JPG/PNG
   - Canva 템플릿 사용 추천

### 스크린샷 준비

**필수**: 휴대전화 스크린샷 (최소 2장, 최대 8장)

크기 요구사항:
- **세로**: 1080 x 1920px ~ 1080 x 2400px
- **가로**: 1920 x 1080px ~ 2400 x 1080px

캡처할 화면:
1. 캘린더 메인 화면 (다크/라이트 모드)
2. 이벤트 상세 화면
3. 장소 선택 화면
4. 설정 화면
5. 지역 필터링 화면

**스크린샷 캡처 방법**:

```powershell
# 개발 서버 시작
npx expo start

# Expo Go 앱에서 실행 후
# Android: 전원 + 볼륨 다운
# iOS: 전원 + 볼륨 업
```

또는 에뮬레이터 사용:
- Android Studio: Screenshot 아이콘
- Xcode Simulator: Cmd + S

### AAB 파일 빌드 및 업로드

```powershell
# Android App Bundle 빌드
eas build --platform android --profile production

# 빌드 완료 후 다운로드
# .aab 파일 저장
```

**업로드 순서**:
1. Play Console > 프로덕션 > 릴리스 만들기
2. "App Bundle 업로드" 클릭
3. .aab 파일 선택
4. 버전 이름: 1.0.0
5. 출시 노트 작성:
   ```
   🎉 Solo Party 첫 출시!
   
   주요 기능:
   • 캘린더 기반 일정 관리
   • 인기 장소 추천
   • 다크모드 지원
   • 직관적인 UI/UX
   
   앞으로 더 많은 기능이 추가될 예정입니다.
   피드백 환영합니다!
   ```

### 콘텐츠 등급

**앱 콘텐츠 > 콘텐츠 등급**:

1. 설문지 작성 (약 20개 질문)
2. 주요 질문:
   - 폭력성: 없음
   - 성적 콘텐츠: 없음
   - 약물: 없음
   - 도박: 없음

결과: **만 3세 이상** (예상)

### 개인정보처리방침

**필수**: URL 제공 필요

**간단한 방법 - GitHub Pages**:

1. GitHub 저장소 생성
2. `privacy-policy.md` 작성:

```markdown
# Solo Party 개인정보처리방침

최종 수정일: 2025년 12월 10일

## 1. 수집하는 정보
본 앱은 다음 정보를 수집합니다:
- 위치 정보 (선택사항, 장소 추천용)
- 로컬 저장 데이터 (일정, 설정)

## 2. 정보 사용 목적
- 개인화된 일정 관리 제공
- 앱 기능 개선

## 3. 정보 공유
사용자 정보를 제3자와 공유하지 않습니다.

## 4. 데이터 보안
로컬 저장 방식으로 높은 보안 수준 유지

## 5. 연락처
이메일: your-email@example.com
```

3. Settings > Pages > Deploy from main branch
4. URL 복사: `https://yourusername.github.io/solo-party-privacy`

### 타겟층 및 콘텐츠

1. **타겟층**: 만 18세 이상
2. **광고 ID**: 사용 안 함
3. **앱 액세스**: 모든 사용자

### 검토 제출

1. 모든 항목 완료 확인
2. "검토 제출" 클릭
3. 검토 기간: **2-7일**
4. 이메일로 결과 통보

---

## 🍎 6단계: iOS App Store 배포 (선택)

### Apple Developer Program 가입

1. https://developer.apple.com/programs/
2. 비용: **$99/년**
3. 개인/회사 선택

### iOS 빌드

```powershell
# iOS 빌드
eas build --platform ios --profile production

# Apple 자격증명 필요:
# - Apple ID
# - 2단계 인증
```

### App Store Connect

1. https://appstoreconnect.apple.com
2. "나의 앱" > "+" > "새로운 앱"
3. 앱 정보:
   ```
   플랫폼: iOS
   이름: Solo Party
   기본 언어: 한국어
   번들 ID: com.soloparty.dating
   SKU: SOLOPARTY001
   ```

### 앱 스토어 정보

**스크린샷** (필수):
- 6.5" Display: 1284x2778px (iPhone 14 Pro Max)
- 5.5" Display: 1242x2208px (iPhone 8 Plus)
- 최소 3장, 최대 10장

**앱 미리보기** (선택):
- 15-30초 비디오
- .mov 또는 .mp4

**설명**:
```
특별한 만남을 위한 스마트한 일정 관리 앱

Solo Party는 데이트와 모임을 쉽게 계획하고 관리할 수 있도록 도와줍니다.

주요 기능:
• 📅 깔끔한 캘린더 인터페이스
• 📍 인기 장소 자동 추천
• 🌓 다크모드 지원
• 🎨 세련된 핑크/퍼플 테마

지금 다운로드하고 특별한 순간을 계획하세요!
```

### 제출 및 심사

```powershell
# IPA 파일 업로드
eas submit --platform ios

# 또는 Transporter 앱 사용
```

심사 기간: **1-3일**

---

## 🚀 7단계: 빠른 배포 (내부 테스트)

### Expo Go로 즉시 공유

```powershell
# 개발 서버 시작
npx expo start

# QR 코드 생성됨
# 친구/테스터가 Expo Go 앱으로 스캔
```

### Internal Testing (Android)

1. Play Console > 테스트 > 비공개 테스트
2. 테스터 이메일 추가
3. APK 업로드
4. 테스터에게 링크 전송

### TestFlight (iOS)

1. App Store Connect > TestFlight
2. "외부 테스터" 추가
3. 베타 앱 정보 작성
4. 테스터 초대 (이메일)

---

## 📊 8단계: 배포 후 관리

### 사용자 피드백 수집

**Google Play**:
- 별점 및 리뷰 모니터링
- 답변 작성

**App Store**:
- 평점 확인
- 리뷰 대응

### 업데이트 배포

```powershell
# 버전 업데이트 (app.json)
# version: 1.0.0 → 1.1.0
# versionCode: 1 → 2 (Android)
# buildNumber: 1.0.0 → 1.1.0 (iOS)

# 새 빌드
eas build --platform all --profile production

# 스토어 업로드
```

### 분석 도구 통합 (선택)

```powershell
# Google Analytics
npm install @react-native-firebase/analytics

# Sentry (오류 추적)
npm install @sentry/react-native
```

---

## 💡 팁 및 모범 사례

### 앱 아이콘 디자인

- ✅ 단순하고 명확한 디자인
- ✅ 다양한 크기에서 인식 가능
- ✅ 브랜드 색상 일관성
- ❌ 작은 텍스트 사용 지양
- ❌ 투명 배경 (Android)

### 스토어 최적화 (ASO)

**키워드 선택**:
- 데이트 앱
- 일정 관리
- 만남 계획
- 캘린더
- 소개팅

**스크린샷 순서**:
1. 가장 인상적인 화면 첫 번째
2. 주요 기능 순서대로
3. 다크모드 변형

### 출시 체크리스트

- [ ] 앱 아이콘 적용 (1024x1024px)
- [ ] 스플래시 스크린 설정
- [ ] 앱 이름 및 설명 작성
- [ ] 스크린샷 5장 준비
- [ ] 개인정보처리방침 URL
- [ ] 콘텐츠 등급 완료
- [ ] 테스트 빌드 검증
- [ ] 버전 번호 확인
- [ ] 충돌/버그 해결

---

## 🆘 문제 해결

### "Build failed" 오류

```powershell
# 로그 확인
eas build:list

# 캐시 삭제 후 재시도
npx expo start --clear
npm cache clean --force
```

### 서명 오류 (Android)

```powershell
# 새 키스토어 생성
eas credentials

# "Set up new Android Keystore" 선택
```

### 앱 업로드 오류

- 버전 코드 증가 확인
- AAB/IPA 파일 크기 제한 (100MB)
- 패키지 이름 충돌 확인

---

## 📞 도움말 및 리소스

**공식 문서**:
- Expo: https://docs.expo.dev/
- EAS Build: https://docs.expo.dev/build/introduction/
- Google Play: https://support.google.com/googleplay/android-developer/
- App Store: https://developer.apple.com/app-store/

**커뮤니티**:
- Expo Discord: https://chat.expo.dev/
- Stack Overflow: [expo] 태그

**유용한 도구**:
- Icon Generator: https://icon.kitchen/
- Screenshot Frame: https://screenshots.pro/
- Privacy Policy Generator: https://www.privacypolicygenerator.info/

---

## 🎯 다음 작업 순서

1. ✅ **로고 이미지 준비** (1024x1024px PNG)
2. ✅ **assets 폴더에 복사**
3. ⬜ **EAS CLI 설치 및 로그인**
4. ⬜ **첫 빌드 실행** (Android APK)
5. ⬜ **APK 테스트**
6. ⬜ **Play Console 계정 생성**
7. ⬜ **스토어 등록정보 작성**
8. ⬜ **스크린샷 준비**
9. ⬜ **AAB 업로드**
10. ⬜ **검토 제출**

---

배포 과정에서 막히는 부분이 있으면 언제든 질문해주세요! 🚀
