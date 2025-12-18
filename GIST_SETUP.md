# GitHub Private Gist + Token 설정 가이드

## 1. GitHub Personal Access Token 생성

1. GitHub 로그인 후 https://github.com/settings/tokens 접속
2. "Generate new token" → "Generate new token (classic)" 클릭
3. 설정:
   - Note: `Solo Dating App` (토큰 이름)
   - Expiration: `No expiration` (또는 원하는 기간)
   - Scopes: **`gist`** 체크 ✅ (Gist 읽기/쓰기 권한)
4. 하단 "Generate token" 클릭
5. **생성된 토큰 즉시 복사** (다시 볼 수 없음!)
   - 예: `ghp_1234567890abcdefghijklmnopqrstuvwxyz`

## 2. GitHub Private Gist 생성

1. https://gist.github.com/ 접속
2. "New gist" 클릭
3. 파일명: `events.json`
4. 내용: 프로젝트 폴더의 `events.json` 파일 내용 복사 붙여넣기
5. **"Create secret gist"** 클릭 (Public 아님!)

## 3. Gist ID 가져오기

생성된 Gist의 URL에서 ID 복사:
- URL 형식: `https://gist.github.com/username/abc123def456...`
- **Gist ID**: `abc123def456...` 부분

## 4. 앱에 설정

`src/utils/storage.ts` 파일 수정:

```typescript
const GIST_ID = 'abc123def456...'; // 3단계에서 복사한 Gist ID
const GITHUB_TOKEN = 'ghp_1234567890...'; // 1단계에서 복사한 Token
const GIST_FILENAME = 'events.json';
```

## 5. 일정 업데이트 방법

### 방법 1: 앱에서 직접 수정 (자동 업데이트)
- 앱 내에서 관리자로 로그인 후 일정 추가/삭제
- **GitHub Gist에 자동으로 저장됨**

### 방법 2: GitHub에서 수동 수정
1. GitHub Gist 페이지 접속
2. "Edit" 버튼 클릭
3. JSON 내용 수정
4. "Update secret gist" 클릭
5. 앱은 5분 후 자동으로 새 일정 가져옴

## JSON 형식 예시

```json
{
  "2025-12-02": [
    {
      "id": "1",
      "title": "파티 이름 🎉",
      "time": "19:00",
      "description": "장소 설명"
    }
  ]
}
```

## 장점

- ✅ 완전 무료
- ✅ **Private Gist** - URL 모르는 사람은 접근 불가
- ✅ **앱에서 직접 일정 수정 가능** (자동 저장)
- ✅ GitHub에서도 수동 수정 가능
- ✅ 실시간 업데이트 (5분 캐시)
- ✅ 버전 관리 자동
- ✅ 백엔드 서버 불필요

## 주의사항

⚠️ **중요**: GitHub Token은 절대 다른 사람과 공유하지 마세요!
- Token이 노출되면 누구나 내 Gist 수정 가능
- 앱을 배포할 경우 Token을 환경 변수로 관리 권장

## Token 보안 강화 (선택사항)

배포 시 Token을 코드에 직접 넣지 않고 환경 변수로 관리:

1. `.env` 파일 생성:
```
GITHUB_TOKEN=ghp_1234567890...
GIST_ID=abc123def456...
```

2. `react-native-dotenv` 설치:
```bash
npm install react-native-dotenv
```

3. `storage.ts`에서 사용:
```typescript
import { GITHUB_TOKEN, GIST_ID } from '@env';
```
