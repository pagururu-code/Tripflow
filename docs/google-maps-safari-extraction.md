# Safari에서 Google Maps 저장목록을 TripFlow로 가져오기

## 결론

가장 현실적인 순서는 **현재 렌더링된 DOM → 스크롤하며 지연 렌더링된 DOM → 페이지 컨텍스트의 응답 관찰 → 제한된 전역 객체 검사**다. 확장은 접근성 역할과 `/maps/place/` 링크를 우선 사용하고, 나머지는 보조 수단으로 쓴다. 화면에서 목록 개수를 찾을 수 있으면 추출 개수와 일치할 때만 가져오기 버튼을 활성화한다.

## 우선순위별 조사

### 1. DOM 직접 추출 (권장)

저장목록에 렌더링된 장소 카드에는 일반적으로 개별 장소로 가는 `a[href*="/maps/place/"]`가 있다. 장소명은 `aria-label`, 카드 안의 heading, 마지막으로 URL path에서 얻을 수 있다. 목록은 가상화되어 화면에 보이는 일부만 DOM에 있을 수 있으므로 `[role="feed"]`를 아래로 스크롤하고 결과 수가 3회 연속 그대로일 때 멈춘다.

장점은 페이지 내부 데이터 형식을 해석하지 않고 사용자에게 실제 표시된 링크만 수집한다는 점이다. 단점은 Google의 A/B 테스트, 언어, 로그인 상태에 따라 마크업이 달라질 수 있고, 자동 스크롤이 현재 위치를 바꾼다는 점이다. 클래스명 `.Nv2PK`는 보조 selector일 뿐이며 핵심 selector로 의존하지 않는다.

### 2. JavaScript 전역 객체

content script는 페이지와 DOM은 공유하지만 JavaScript 전역 실행 환경은 분리되는 것이 일반적이므로, 페이지에 삽입한 `page-hook.js`가 전역을 읽고 `CustomEvent`로 결과를 전달한다. 알려진 후보인 `APP_INITIALIZATION_STATE`, `APP_OPTIONS`, `_pageData`만 제한적으로 검사한다. `window` 전체를 재귀 순회하면 getter 부작용, 순환 참조, 큰 객체 직렬화 때문에 페이지가 멈출 수 있어 하지 않는다.

전역 이름과 배열 위치는 비공개 구현 세부사항이다. 따라서 이 경로에서 URL을 발견해도 진단/보완 결과로 표시하며 DOM 결과보다 신뢰하지 않는다.

### 3. Network 응답 후킹

Web Extension API로 이미 완료된 응답 body를 다시 읽을 수는 없다. 대신 `document_start`에 페이지 컨텍스트 hook을 넣어 `fetch` 응답을 `clone()`하고 XHR의 `responseText`를 관찰한다. PoC는 Google Maps 관련 URL만, 20 MB 이하 body만 검사하며 원 응답은 변경하지 않는다.

hook 설치 전에 끝난 초기 요청은 놓칠 수 있고, CSP가 외부 extension script 삽입을 막거나 응답이 binary/stream 형식이면 읽지 못한다. 또한 비공개 RPC payload를 완전히 파싱하지 않고 명시적인 `/maps/place/` URL만 찾으므로 보조 수단이다. 서비스 운영용이라면 hook 실패를 정상 상태로 취급해야 한다.

### 4. iOS Safari Web Extension

Safari Web Extension은 HTML/CSS/JavaScript 기반 확장 기능을 Safari 앱 확장으로 패키징한다. Apple의 `safari-web-extension-converter`로 이 디렉터리를 Xcode 프로젝트로 변환한 뒤, iOS 앱 target과 Safari Web Extension target을 서명하고 실제 기기에서 활성화할 수 있다. 사용자는 iOS 설정의 Safari 확장 프로그램에서 확장을 켜고 `google.com` 접근을 허용해야 한다.

```bash
xcrun safari-web-extension-converter safari-extension \
  --project-location ./build/TripFlowMapsExtractor \
  --app-name TripFlowMapsExtractor \
  --bundle-identifier com.example.tripflow.maps-extractor
```

이 명령과 iOS 빌드는 macOS/Xcode가 필요하다. 저장소의 manifest는 호환 폭이 넓은 Manifest V2 PoC다. 배포 전에는 대상 Safari/iOS 버전에 맞춰 Apple 문서의 지원 키와 App Store 정책을 다시 확인해야 한다.

## 사용 방법

1. Xcode에서 변환한 앱을 iPhone에 설치하고 확장을 활성화한다.
2. Safari에서 공유 가능한 Google Maps 저장목록을 열고 목록 패널이 보이게 한다.
3. Safari 도구 막대의 확장 메뉴에서 **TripFlow Maps List Extractor**를 연다.
4. HTTPS로 배포한 TripFlow 주소를 입력하고 **장소 찾기**를 누른다.
5. 자동 스크롤이 끝나 장소 개수를 확인한 뒤 **TripFlow 가져오기**를 누른다.
6. 확장이 `POST /api/import/browser`로 장소를 전송하면 서버가 Places API로 주소, 좌표, 영업시간, 장소 유형, 공식 Maps URI를 보강한다.
7. 새로 열린 TripFlow 탭이 활성 여행의 Inbox에 항목을 저장하고 추가/중복/실패 개수를 표시한다.

서버에는 기존과 동일하게 `GOOGLE_MAPS_API_KEY`가 필요하다. 확장은 최초 전송 시 설정한 TripFlow origin에 대한 접근 권한을 사용자에게 요청하며, 주소는 extension local storage에만 저장한다.

개인/비공개 목록은 현재 로그인된 Safari 세션의 화면에서만 읽는다. 추출 결과를 외부 서버로 자동 전송하지 않으며, 사용자가 복사를 눌렀을 때만 클립보드에 기록한다.

## 한계와 다음 단계

- Google Maps는 공식 Saved Lists export API를 제공하지 않으므로 이 방식은 UI 변경에 취약하다.
- 무한 스크롤 최대 120회, 응답당 20 MB, 응답에서 최대 200개 링크, 서버 요청당 최대 300개라는 안전 제한이 있다.
- iOS 메모리 압박과 background tab 중단을 고려해 한 번에 열린 목록 하나만 처리한다.
- 실기기 검증 시 공개/비공개 목록, 한국어/영어 UI, `google.com`/국가 도메인, 장소 1/50/200개 목록을 각각 확인한다.
- 제품화 시 TripFlow 앱의 명시적 import 화면으로 JSON을 붙여넣는 기능과, 스크롤 위치 복원 및 진행률/취소 UI를 추가한다.

## iPhone 실기기 출시 체크리스트

아래 표는 **실제 iPhone에서 모두 통과한 빌드만 출시 완료로 판정**하기 위한 체크리스트다. 이 저장소 작업 환경에는 macOS/Xcode, 코드 서명 인증서, iPhone 및 테스트용 전체 저장목록 URL이 없어 아직 실기기 통과로 표시하지 않는다.

- [ ] Safari에서 `https://www.google.com/maps/placelists/list/...` 저장목록 열림
- [ ] 확장 프로그램 실행 및 사이트 접근 권한 허용
- [ ] 목록 끝까지 자동 스크롤 후 원래 스크롤 위치 복원
- [ ] 화면의 저장 장소 개수와 추출 개수 일치
- [ ] `POST /api/import/browser` 성공 및 Places API 보강 확인
- [ ] TripFlow 탭이 열리고 활성 여행 Inbox 생성 확인
- [ ] 기존 Inbox와 중복인 장소 자동 제외 확인
- [ ] 추가/중복/실패 개수 UI 확인

## 참고 문서

- Apple, [Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- Apple, [Converting a web extension for Safari](https://developer.apple.com/documentation/safariservices/safari-web-extensions/converting-a-web-extension-for-safari)
- Apple, [Managing Safari web extension permissions](https://developer.apple.com/documentation/safariservices/safari-web-extensions/managing-safari-web-extension-permissions)
- MDN, [Content scripts](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- MDN, [`Response.clone()`](https://developer.mozilla.org/docs/Web/API/Response/clone)
