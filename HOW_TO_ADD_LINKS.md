# GitHub Gist 링크 추가 방법

## 🚀 빠른 해결 방법

현재 앱에서 링크가 보이지 않는 이유는 GitHub Gist에 링크 데이터가 없기 때문입니다.

### 1. GitHub Gist 접속
```
https://gist.github.com/baekchu/f805cac22604ff764916280710db490e
```

### 2. Edit 버튼 클릭

### 3. gistfile1.txt 파일 내용을 아래와 같이 수정

```json
{
  "2025-01-15": [
    {
      "id": "1",
      "title": "React Native 컨퍼런스",
      "time": "오후 2시",
      "location": "코엑스",
      "description": "React Native 최신 트렌드를 배우는 컨퍼런스",
      "link": "https://reactnative.dev"
    }
  ],
  "2025-02-14": [
    {
      "id": "2",
      "title": "발렌타인데이 이벤트",
      "time": "오후 3시",
      "location": "명동",
      "description": "특별한 발렌타인데이 이벤트",
      "link": "https://www.google.com"
    }
  ],
  "2025-03-01": [
    {
      "id": "3",
      "title": "삼일절 기념 행사",
      "time": "오전 10시",
      "location": "광화문",
      "description": "독립기념일 행사"
    }
  ]
}
```

### 4. "Update gist" 버튼 클릭

### 5. 앱에서 확인
- 앱을 종료하고 다시 실행하거나
- 화면을 아래로 당겨서 새로고침

## 📝 중요사항

### 링크 필드 추가 규칙
- **선택 사항**: 링크가 없는 일정도 정상 작동
- **형식**: `"link": "https://example.com"`
- **위치**: 다른 필드들과 같은 레벨에 추가

### 예시 - 링크가 있는 일정
```json
{
  "id": "1",
  "title": "제목",
  "time": "시간",
  "location": "장소",
  "link": "https://example.com"
}
```

### 예시 - 링크가 없는 일정
```json
{
  "id": "2",
  "title": "제목",
  "time": "시간",
  "location": "장소"
}
```

## 🔍 디버깅 방법

앱을 실행하고 개발자 콘솔을 확인하세요:
```
콘솔에 "첫 번째 일정: [제목] 링크: [URL]" 형태로 출력됩니다.
- 링크가 undefined로 나오면 Gist에 링크 필드가 없는 것입니다.
- 링크가 URL로 나오면 정상이며, 🔗 버튼이 표시되어야 합니다.
```

## ⚡ 테스트용 간단한 데이터

바로 테스트해보고 싶다면 이 데이터를 Gist에 붙여넣으세요:

```json
{
  "2025-12-25": [
    {
      "id": "test1",
      "title": "크리스마스 파티",
      "time": "오후 6시",
      "location": "강남역",
      "link": "https://www.google.com"
    }
  ],
  "2026-01-01": [
    {
      "id": "test2",
      "title": "새해 이벤트",
      "time": "오전 12시",
      "location": "광화문",
      "link": "https://www.naver.com"
    }
  ]
}
```

저장 후 앱에서 확인하면 🔗 버튼이 보일 것입니다!
