# 네이버 지도 API 연동 가이드

## 1. 네이버 클라우드 플랫폼 가입

1. https://www.ncloud.com/ 접속
2. 회원가입 및 로그인
3. 콘솔 → AI·NAVER API → Application 등록

## 2. API 키 발급

1. **Application 이름**: Solo Dating App
2. **서비스**: Maps (Web Dynamic Map, Geocoding)
3. **Web 서비스 URL**: http://localhost:8081 (개발용)

발급받은 키:
- **Client ID**: `YOUR_CLIENT_ID`
- **Client Secret**: `YOUR_CLIENT_SECRET` (Geocoding용)

## 3. 환경 변수 설정

`.env` 파일 생성:
```
NAVER_MAP_CLIENT_ID=YOUR_CLIENT_ID
NAVER_MAP_CLIENT_SECRET=YOUR_CLIENT_SECRET
```

## 4. React Native에서 사용

### 방법 1: WebView 사용 (추천)
```bash
npm install react-native-webview
```

HTML 파일에 네이버 지도 스크립트 포함:
```html
<script type="text/javascript" 
  src="https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=YOUR_CLIENT_ID">
</script>
```

### 방법 2: react-native-nmap (네이티브)
```bash
npm install react-native-nmap
npx pod-install (iOS만)
```

## 5. Geocoding API 사용

주소 → 좌표 변환:
```typescript
const response = await fetch(
  `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`,
  {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
      'X-NCP-APIGW-API-KEY': CLIENT_SECRET,
    }
  }
);
```

## 6. 참고 문서

- 네이버 지도 API: https://www.ncloud.com/product/applicationService/maps
- Geocoding API: https://api.ncloud-docs.com/docs/ai-naver-mapsgeocoding
- react-native-nmap: https://github.com/QuadFlask/react-native-naver-map

## 주의사항

- 무료 사용량: 월 100,000건
- 프로덕션 배포 시 서비스 URL 업데이트 필요
- API 키는 환경 변수로 관리 (절대 코드에 직접 넣지 말 것)
