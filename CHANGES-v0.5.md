# TripFlow v0.5 변경 내역

## 수정된 파일
- `app/page.tsx`: Inbox에 `가져오기` 버튼과 가져오기 모달 연결
- `app/globals.css`: 가져오기 화면 스타일 추가
- `lib/types.ts`: Inbox 항목의 가져오기 출처 필드 추가

## 새 파일
- `components/GoogleMapsImport.tsx`: Google Maps 저장목록 링크 입력, 결과 확인, 중복 제외, Inbox 일괄 추가 UI
- `app/api/import/google-maps/route.ts`: 공유 링크 열기, 장소 후보 추출, Google Places 정보 보완 API

## 건드리지 않은 주요 기능
- 예약 이미지 OCR
- 항공편 조회
- 일정 수정/삭제
- Day Title
- 타임라인과 빈 시간 표시
- 여행 생성 및 설정
