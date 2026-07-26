# TripFlow iPhone PWA

아이폰 Safari에서 홈 화면에 설치해 쓰는 여행 일정 웹앱입니다.

## 포함 기능
- 여러 여행 생성/전환
- 날짜별 타임라인
- 항공편 편명+날짜 조회
- Google Places 장소 검색
- 장소를 일정 또는 Inbox에 저장
- 하루 빈 시간 자동 계산
- 빈 시간에 들어가는 Inbox 후보 추천
- Google 지도 열기
- iPhone 홈 화면 설치(PWA)
- 오프라인 기본 화면 캐시
- Safari 로컬 자동 저장

## 1. 로컬 실행
```bash
npm install
cp .env.example .env.local
npm run dev
```
브라우저에서 http://localhost:3000 을 엽니다.

## 2. API 키
`.env.local`에 입력합니다.
```env
GOOGLE_MAPS_API_KEY=...
AVIATIONSTACK_API_KEY=...
```
Google Cloud에서는 Places API (New)를 활성화하세요. 항공편 API 요금제에 따라 미래/실시간 조회가 제한될 수 있습니다.

## 3. 아이폰에서 사용
가장 쉬운 방법은 Vercel에 배포하는 것입니다.
```bash
npm i -g vercel
vercel
vercel --prod
```
생성된 HTTPS 주소를 아이폰 Safari로 열고 `공유 → 홈 화면에 추가`를 누릅니다.

GitHub는 필수가 아닙니다. 위 명령으로 폴더를 직접 Vercel에 올릴 수 있습니다.

## 4. 저장 방식
현재 앱은 즉시 사용할 수 있도록 Safari localStorage에 저장합니다. Safari 데이터 삭제/기기 교체에 대비한 클라우드 동기화용 Supabase 스키마는 `supabase/schema.sql`에 포함돼 있습니다. Supabase Auth UI와 동기화 코드는 다음 확장 단계로 분리했습니다. API 키를 코드에 직접 넣지 마세요.

## 5. 주의
- 실제 지도 자체를 앱 안에 렌더링하기보다 장소 목록에서 Google Maps로 여는 안전한 기본 구조입니다.
- 이동시간은 현재 기본 예상 20분입니다. Routes API 자동 재계산은 서버 호출 비용과 교통수단별 제약 때문에 별도 확장 지점으로 남겨두었습니다.


## v1.1 예약 이미지 분석

항공권, 기차표, 버스표, 호텔 예약, 입장권 스크린샷을 업로드하면 AI가 날짜·시간·구간·좌석 등을 구조화합니다. 분석 결과는 사용자가 수정한 뒤 일정에 추가됩니다.

Vercel 환경변수에 아래 값을 추가하고 다시 배포하세요.

```env
OPENAI_API_KEY=sk-...
OPENAI_VISION_MODEL=gpt-4.1-mini
```

API 키는 GitHub에 커밋하지 마세요. 이미지 분석은 OpenAI API 사용량에 따라 비용이 발생할 수 있습니다.
