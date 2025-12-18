# Solo Dating App - 배포 가이드

## 📱 1단계: 앱 아이콘 및 스플래시 스크린 설정

### 아이콘 이미지 준비
제공하신 핑크색 하트+캘린더 이미지를 앱 아이콘으로 사용하겠습니다.

#### 필요한 이미지 크기:
- **앱 아이콘**: 1024x1024px (PNG, 투명 배경 제거)
- **적응형 아이콘 (Android)**: 1024x1024px
- **스플래시 스크린**: 1242x2436px 권장

### 자동 아이콘 생성 방법

1. **온라인 도구 사용** (추천):
   - https://icon.kitchen/ - Expo 전용 아이콘 생성기
   - https://easyappicon.com/ - 다양한 크기 자동 생성
   - https://appicon.co/ - iOS/Android 동시 생성

2. **이미지 준비**:
   ```
   solodating_app/
   └── assets/
       ├── icon.png (1024x1024px)
       ├── splash.png (1242x2436px)
       └── adaptive-icon.png (1024x1024px, Android용)
   ```

### Expo 설정 파일 수정

**app.json** 파일을 열고 다음과 같이 수정하세요:

```json
{
  "expo": {
    "name": "Solo Party",
    "slug": "solo-party-dating",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ec4899"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.soloparty",
      "buildNumber": "1.0.0",
      "icon": "./assets/icon.png"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.yourcompany.soloparty",
      "versionCode": 1,
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ]
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "YOUR_PROJECT_ID"
      }
    }
  }
}
```

---

## 📦 2단계: Expo Application Services (EAS) 설정

### EAS 설치 및 로그인

```powershell
# EAS CLI 설치
npm install -g eas-cli

# Expo 계정 로그인
eas login

# 프로젝트 초기화
cd e:\app\solodating_app
eas build:configure
```

### EAS 빌드 설정 파일 생성

**eas.json** 파일이 자동 생성됩니다. 다음과 같이 수정하세요:

```json
{
  "cli": {
    "version": ">= 5.2.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "resourceClass": "m1-medium"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "resourceClass": "m1-medium"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## 🤖 3단계: Android 빌드 및 배포

### APK 빌드 (테스트용)

```powershell
# APK 빌드 (직접 설치 가능)
eas build --platform android --profile preview

# 또는 프로덕션 빌드
eas build --platform android --profile production
```

빌드가 완료되면 **다운로드 링크**가 제공됩니다.

### Google Play Console 배포

1. **Google Play Console 접속**: https://play.google.com/console
2. **앱 만들기** 클릭
3. **앱 정보 입력**:
   - 앱 이름: Solo Party
   - 기본 언어: 한국어
   - 앱 또는 게임: 앱
   - 무료 또는 유료: 무료

4. **스토어 등록정보 작성**:
   ```
   짧은 설명 (80자):
   특별한 만남을 위한 일정 관리 앱. 데이트 장소와 시간을 한눈에!

   전체 설명 (4000자):
   Solo Party는 특별한 만남을 위한 스마트한 일정 관리 앱입니다.

   주요 기능:
   • 📅 직관적인 캘린더 뷰
   • 📍 인기 장소 자동 추천
   • 🌓 다크모드 지원
   • 🔄 실시간 데이터 동기화
   • 🎨 아름다운 UI/UX

   데이트 계획을 쉽고 편리하게 관리하세요!
   ```

5. **스크린샷 업로드** (필수):
   - 휴대전화: 최소 2개 (1080x1920px ~ 1080x2400px)
   - 7인치 태블릿: 선택사항
   - 10인치 태블릿: 선택사항

6. **그래픽 에셋**:
   - 고해상도 아이콘: 512x512px
   - 기능 그래픽: 1024x500px

7. **AAB 파일 업로드**:
   ```powershell
   # AAB 빌드 (Google Play용)
   eas build --platform android --profile production
   ```

8. **앱 콘텐츠 평가**:
   - 설문지 작성 (연령 등급 결정)

9. **개인정보처리방침 URL** (필수):
   - GitHub Pages 또는 Notion으로 작성

10. **검토 제출**:
    - 프로덕션 트랙에 릴리스 생성
    - 검토 제출 (2~3일 소요)

---

## 🍎 4단계: iOS 빌드 및 배포

### Apple Developer Program 가입 필요
- 연간 $99 (약 13만원)
- https://developer.apple.com/programs/

### iOS 빌드

```powershell
# iOS 빌드
eas build --platform ios --profile production
```

### App Store Connect 배포

1. **App Store Connect 접속**: https://appstoreconnect.apple.com
2. **새로운 앱 추가**
3. **앱 정보 입력**:
   - 번들 ID: com.yourcompany.soloparty
   - SKU: soloparty001

4. **앱 스토어 정보**:
   - 스크린샷 (필수):
     * 6.5" Display: 1284x2778px (3장 이상)
     * 5.5" Display: 1242x2208px
   - 미리보기 비디오 (선택)

5. **IPA 파일 업로드**:
   ```powershell
   # Transporter 앱 사용 또는
   eas submit --platform ios
   ```

6. **App Review 정보**:
   - 데모 계정 (필요 시)
   - 연락처 정보

7. **제출 및 검토** (1~3일 소요)

---

## 🚀 5단계: 빠른 테스트 배포 (추천)

### Expo Go를 통한 즉시 테스트

```powershell
# 개발 서버 시작
npx expo start

# QR 코드 스캔하여 Expo Go 앱에서 테스트
```

### TestFlight (iOS) / Internal Testing (Android)

**Android 내부 테스트**:
```powershell
eas build --platform android --profile preview
```
- 생성된 APK를 직접 공유

**iOS TestFlight**:
```powershell
eas build --platform ios --profile preview
eas submit --platform ios
```
- TestFlight 앱에서 베타 테스터 초대

---

## 📋 체크리스트

### 배포 전 필수 사항
- [ ] 앱 아이콘 준비 (1024x1024px)
- [ ] 스플래시 스크린 준비
- [ ] app.json 설정 완료
- [ ] 버전 번호 설정 (1.0.0)
- [ ] 개인정보처리방침 URL
- [ ] 스크린샷 5장 이상
- [ ] 앱 설명 작성
- [ ] Google Play Console 계정 ($25 일회성)
- [ ] Apple Developer Program 계정 ($99/년)

### 선택 사항
- [ ] 앱 미리보기 비디오
- [ ] 다국어 지원
- [ ] 태블릿 최적화
- [ ] 앱 내 구매 (IAP)
- [ ] 광고 통합

---

## 🔧 문제 해결

### 빌드 오류 시

```powershell
# 캐시 삭제
npm cache clean --force
rm -rf node_modules
npm install

# Expo 재시작
npx expo start --clear
```

### 아이콘이 표시되지 않을 때
- 이미지 크기 확인 (정확히 1024x1024px)
- PNG 형식, 투명 배경 제거
- app.json 경로 확인

### 빌드 시간이 너무 오래 걸릴 때
- EAS 무료 플랜: 대기 시간 있음
- 유료 플랜 고려 ($29/월)

---

## 💰 비용 안내

### 필수 비용
- **Google Play Console**: $25 (일회성)
- **Apple Developer**: $99/년

### 선택 비용
- **EAS Build 유료 플랜**: $29/월 (빌드 속도 향상)
- **도메인**: ~$10/년 (개인정보처리방침용)

---

## 📞 추가 리소스

- **Expo 공식 문서**: https://docs.expo.dev/
- **EAS 빌드 가이드**: https://docs.expo.dev/build/setup/
- **Google Play 가이드**: https://support.google.com/googleplay/android-developer/
- **App Store 가이드**: https://developer.apple.com/app-store/submissions/

---

## 🎯 다음 단계

1. **assets 폴더에 이미지 추가**
2. **app.json 수정**
3. **EAS 빌드 실행**
4. **APK 테스트**
5. **스토어 제출**

배포 과정에서 문제가 생기면 언제든 질문해주세요! 🚀
