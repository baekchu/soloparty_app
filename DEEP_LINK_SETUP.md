# 딥 링크 설정 가이드 (커스텀 스킴)

## 설정 완료 ✅

도메인 없이 커스텀 스킴만 사용하도록 설정했습니다.

## 현재 구성

### app.json 설정
- ✅ 커스텀 스킴 `soloparty://` 사용
- ✅ 도메인 불필요 (추가 비용 없음)
- ✅ 도메인 검사 실패 오류 해결

```json
"intentFilters": [
  {
    "action": "VIEW",
    "data": [
      {
        "scheme": "soloparty"
      }
    ],
    "category": ["BROWSABLE", "DEFAULT"]
  }
]
```


## 지원되는 링크 형식

앱이 다음 형식의 링크를 처리합니다:

### 커스텀 스킴
```
soloparty://event/EVENT_ID
```
- ✅ 추가 비용 없음 (도메인 불필요)
- ✅ 앱이 설치되어 있으면 바로 열림
- ⚠️ 앱이 설치되어 있어야만 작동
- ⚠️ 사용자에게 앱 선택 다이얼로그 표시될 수 있음

### 사용 예시
- 카카오톡, SMS에서: `soloparty://event/123`
- QR 코드: `soloparty://event/123`
- 푸시 알림: `soloparty://event/123`


## 앱에서 딥 링크 처리

App.tsx에서 링크 처리 예시:

```typescript
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // 초기 URL 처리 (앱이 닫혀있을 때 링크로 열림)
    Linking.getInitialURL().then(url => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // 앱이 열려 있을 때 URL 처리
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  const handleDeepLink = (url: string) => {
    console.log('Deep link received:', url);
    
    // soloparty://event/123
    const parsed = Linking.parse(url);
    
    if (parsed.path === 'event' && parsed.queryParams?.id) {
      // EventDetailScreen으로 이동
      navigation.navigate('EventDetail', { id: parsed.queryParams.id });
    }
  };
}
```

## 테스트 방법

### Android 테스트

#### 1. ADB로 테스트 (권장)
```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "soloparty://event/123" \
  com.soloparty.dating
```

#### 2. HTML 테스트 페이지
```html
<!DOCTYPE html>
<html>
<body>
  <h1>딥 링크 테스트</h1>
  <a href="soloparty://event/123">이벤트 123 열기</a>
  <br>
  <a href="soloparty://event/456">이벤트 456 열기</a>
</body>
</html>
```

### iOS 테스트

```bash
# 시뮬레이터
xcrun simctl openurl booted "soloparty://event/123"

# 실제 기기
# Safari에서 soloparty://event/123 입력
```

### 카카오톡/SMS에서 테스트

메시지에 다음과 같이 작성:
```
파티 보러가기: soloparty://event/123
```

## 문제 해결

### 링크를 클릭해도 앱이 열리지 않음

**원인**:
- 앱이 설치되어 있지 않음
- 앱이 백그라운드에서 강제 종료됨

**해결**:
1. 앱이 설치되어 있는지 확인
2. 앱을 한 번 실행한 후 다시 테스트
3. ADB 명령으로 직접 테스트

### "도메인 검사 실패" 경고가 표시됨

**답변**: 이 경고는 무시해도 됩니다.
- 커스텀 스킴만 사용하므로 도메인이 필요 없습니다
- 앱 기능에는 영향이 없습니다
- Google Play에 업로드 및 배포 가능합니다

## 나중에 도메인을 구매하면?

도메인(예: soloparty.app)을 구매하면 HTTPS 앱 링크를 추가할 수 있습니다:

1. **도메인 구매** (Namecheap, GoDaddy 등)
2. **웹 서버 설정** (Vercel, Netlify, AWS 등)
3. **assetlinks.json 배포**
4. **app.json에 HTTPS 앱 링크 추가**

자세한 내용은 필요할 때 문의하세요.

## 체크리스트

배포 전 확인사항:

- [x] app.json에서 커스텀 스킴 설정 완료
- [x] 불필요한 도메인 설정 제거
- [ ] App.tsx에서 딥 링크 처리 코드 구현
- [ ] ADB로 딥 링크 테스트
- [ ] EAS Build로 새 빌드 생성

## 참고 자료

- [Expo Linking 가이드](https://docs.expo.dev/guides/linking/)
- [Android Deep Links](https://developer.android.com/training/app-links/deep-linking)
