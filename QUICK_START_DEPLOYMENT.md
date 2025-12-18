# 🚀 Solo Party 앱 배포 - 빠른 시작 가이드

## ✅ 현재 상태
- ✅ 앱 이름: Solo Party
- ✅ 버전: 1.0.0
- ✅ app.json 설정 완료
- ✅ Assets 폴더 존재 (icon.png, adaptive-icon.png, splash-icon.png)

---

## 📋 즉시 실행 가능한 명령어

### 1️⃣ 로고 이미지 교체

제공하신 핑크 하트+캘린더 이미지를 다음 크기로 준비:

```
필요한 파일:
E:\app\solodating_app\assets\icon.png          (1024x1024px)
E:\app\solodating_app\assets\adaptive-icon.png (1024x1024px)
E:\app\solodating_app\assets\splash-icon.png   (1242x2436px)
```

**자동 변환 도구**:
1. https://icon.kitchen/ 접속
2. 이미지 업로드
3. "Generate" 클릭
4. 다운로드 후 assets 폴더에 복사

---

### 2️⃣ EAS CLI 설치 (첫 실행)

PowerShell 관리자 권한으로:

```powershell
npm install -g eas-cli
```

---

### 3️⃣ Expo 로그인

```powershell
eas login
```

계정이 없다면: https://expo.dev/signup

---

### 4️⃣ 프로젝트 초기화

```powershell
cd E:\app\solodating_app
eas build:configure
```

질문 답변:
- Platform: `All` (Enter)
- Generate eas.json: `Y` (Enter)

---

### 5️⃣ Android APK 빌드 (테스트용)

```powershell
eas build --platform android --profile preview
```

⏱️ 빌드 시간: 20-40분
📦 완료 후 다운로드 링크 제공

---

### 6️⃣ 앱 테스트

1. 빌드 완료 후 제공된 URL에서 APK 다운로드
2. Android 기기로 파일 전송
3. "알 수 없는 출처" 설치 허용
4. 앱 설치 및 테스트

---

## 🏪 Play Store 배포 (정식 출시)

### 준비물
- [ ] Google Play Console 계정 ($25 일회성)
- [ ] 스크린샷 5장 (1080x1920px ~ 1080x2400px)
- [ ] 앱 설명 (위 가이드 참고)
- [ ] 개인정보처리방침 URL
- [ ] 512x512px 아이콘
- [ ] 1024x500px 기능 그래픽

### 프로덕션 빌드

```powershell
eas build --platform android --profile production
```

.aab 파일이 생성됩니다 (Play Store 업로드용)

---

## 📸 스크린샷 캡처

### 방법 1: 실제 기기

```powershell
# 앱 실행
npx expo start

# Expo Go에서 QR 스캔 후
# 스크린샷 캡처 (전원 + 볼륨 다운)
```

### 방법 2: 에뮬레이터

```powershell
# Android Studio 에뮬레이터 실행
# Screenshot 버튼 클릭
```

캡처할 화면:
1. 캘린더 메인 (라이트 모드)
2. 캘린더 메인 (다크 모드)
3. 이벤트 상세
4. 장소 선택
5. 설정 화면

---

## 💰 비용 안내

| 항목 | 비용 | 필수 여부 |
|------|------|----------|
| Google Play Console | $25 (일회성) | 필수 (Android) |
| Apple Developer | $99/년 | 선택 (iOS) |
| EAS Build (무료) | $0 | 무료 (대기 시간 있음) |
| EAS Build (유료) | $29/월 | 선택 (빠른 빌드) |

---

## 🎯 추천 배포 순서

### 빠른 테스트 (오늘 가능)
```powershell
1. eas login
2. eas build:configure
3. eas build --platform android --profile preview
4. APK 다운로드 → 기기 설치 → 테스트
```

### 정식 출시 (1주일 소요)
```
Day 1-2: 
  - Play Console 계정 생성
  - 스크린샷 준비
  - 앱 설명 작성

Day 3-4:
  - 프로덕션 빌드
  - AAB 업로드
  - 스토어 정보 입력

Day 5-7:
  - Google 검토 대기
  - 승인 및 출시
```

---

## 🔗 중요 링크

**배포 관련**:
- EAS 빌드 상태: https://expo.dev/accounts/[username]/projects/solo-party-dating/builds
- Play Console: https://play.google.com/console
- Expo 문서: https://docs.expo.dev/build/introduction/

**디자인 도구**:
- 아이콘 생성: https://icon.kitchen/
- 스크린샷 프레임: https://screenshots.pro/
- 그래픽 디자인: https://www.canva.com/

**정책 생성**:
- 개인정보처리방침: https://www.privacypolicygenerator.info/

---

## ❓ 자주 묻는 질문

**Q: 빌드가 너무 오래 걸려요**
A: EAS 무료 플랜은 대기 시간이 있습니다. 유료 플랜($29/월) 고려하거나 대기하세요.

**Q: APK와 AAB 차이는?**
A: 
- APK: 직접 설치 가능 (테스트용)
- AAB: Play Store 전용 (정식 출시용)

**Q: iOS도 배포하려면?**
A: Apple Developer 계정 필요 ($99/년) + 동일한 EAS 빌드 프로세스

**Q: 앱 업데이트는 어떻게?**
A: 
1. app.json의 version/versionCode 증가
2. 새 빌드 실행
3. Play Console에 업로드

**Q: 로고가 제대로 안 보여요**
A: 
- 정확히 1024x1024px 확인
- PNG 형식 (투명 배경 제거)
- app.json 경로 확인

---

## 🆘 도움이 필요하면

1. **빌드 오류**: EAS 로그 확인 (`eas build:list`)
2. **Play Store 거부**: 정책 위반 내용 확인 후 수정
3. **기술 문제**: Expo Discord (https://chat.expo.dev/)

---

## ✨ 다음 단계

지금 바로 시작하세요:

```powershell
# 1. 로그인
eas login

# 2. 빌드 설정
eas build:configure

# 3. 첫 빌드!
eas build --platform android --profile preview
```

빌드가 완료되면 APK를 다운로드하여 테스트해보세요! 🎉

---

**문의사항이 있으면 언제든 질문해주세요!** 🚀
