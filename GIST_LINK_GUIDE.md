# GitHub Gist에 링크 필드가 포함된 일정 저장하기

## 📋 개요
이제 일정에 링크를 추가할 수 있습니다. 사용자는 일정 목록에서 링크 버튼(🔗)을 클릭하여 웹페이지로 이동할 수 있습니다.

## 🔧 GitHub Gist 설정 방법

### 1. Gist 파일 형식
GitHub Gist 파일(`gistfile1.txt`)에 다음과 같은 JSON 형식으로 데이터를 저장하세요:

```json
{
  "2025-01-15": [
    {
      "id": "1",
      "title": "React Native 컨퍼런스",
      "time": "오후 2시",
      "location": "코엑스",
      "description": "React Native 최신 트렌드를 배우는 컨퍼런스",
      "link": "https://reactnative.dev/docs/getting-started",
      "coordinates": {
        "latitude": 37.5126,
        "longitude": 127.0594
      }
    }
  ],
  "2025-02-14": [
    {
      "id": "2",
      "title": "발렌타인데이 이벤트",
      "time": "오후 3시",
      "location": "명동",
      "description": "특별한 발렌타인데이 이벤트",
      "link": "https://example.com/valentine-event"
    }
  ]
}
```

### 2. 필드 설명

#### 필수 필드
- `id`: 일정 고유 ID (문자열)
- `title`: 일정 제목 (최대 200자)

#### 선택 필드
- `time`: 시간 (예: "오후 2시")
- `location`: 장소 (예: "코엑스")
- `description`: 설명 (최대 1000자)
- **`link`**: 웹사이트 링크 (최대 500자) ⭐ **새로 추가됨**
- `coordinates`: GPS 좌표
  - `latitude`: 위도
  - `longitude`: 경도

### 3. 링크 사용 예시

```json
{
  "2025-03-15": [
    {
      "id": "3",
      "title": "개발자 밋업",
      "time": "오후 7시",
      "location": "판교",
      "link": "https://github.com"
    },
    {
      "id": "4",
      "title": "여행 계획",
      "time": "오전 10시",
      "location": "제주도",
      "link": "https://visitjeju.net/"
    }
  ]
}
```

## 📱 앱에서 사용하기

### 1. 링크가 있는 일정 확인
- 일정 목록에서 링크가 있는 일정은 오른쪽에 🔗 버튼이 표시됩니다.

### 2. 링크 열기
- 🔗 버튼을 클릭하면 기본 브라우저에서 링크가 열립니다.
- http:// 또는 https://가 없으면 자동으로 https://가 추가됩니다.

### 3. 관리자 기능 (암호: admin1234)
- 일정 추가 화면에서 🔗 링크 필드에 URL을 입력할 수 있습니다.
- 입력한 링크는 자동으로 GitHub Gist에 저장됩니다.

## 🔒 보안 및 검증

앱은 다음 사항을 자동으로 검증합니다:

1. **링크 유효성**: URL 형식 확인
2. **길이 제한**: 최대 500자
3. **XSS 방지**: 위험한 문자 필터링
4. **안전한 열기**: 유효한 URL만 브라우저에서 열림

## 📝 GitHub Gist 업데이트 방법

1. https://gist.github.com 에 접속
2. 기존 Gist 열기: `f805cac22604ff764916280710db490e`
3. `gistfile1.txt` 파일 편집
4. 링크 필드를 포함한 JSON 데이터 저장
5. "Update file" 클릭
6. 앱에서 새로고침하면 자동으로 반영됨 (1분 캐시)

## 🎯 링크 사용 팁

### 권장 링크 예시
- 행사 공식 웹사이트
- 티켓 구매 페이지
- 장소 정보 (네이버 지도, 구글 맵 등)
- 관련 문서나 가이드
- SNS 이벤트 페이지

### 주의사항
- 신뢰할 수 있는 링크만 추가하세요
- 단축 URL보다는 원본 URL 사용 권장
- HTTPS 링크 사용 권장

## 📂 샘플 데이터 파일
프로젝트 루트의 `GIST_EXAMPLE.json` 파일에서 링크가 포함된 샘플 데이터를 확인할 수 있습니다.
