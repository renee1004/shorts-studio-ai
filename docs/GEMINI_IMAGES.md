# Gemini 장면 이미지

기존 `GEMINI_API_KEY`를 서버에서 재사용합니다. 이미지 생성은 `APP_MODE=live`에서만 실행합니다.
`GEMINI_IMAGE_MODEL` 기본값은 `gemini-3.1-flash-lite-image`입니다. `.env.docker`에서 `gemini-3.1-flash-image` 또는 `gemini-2.5-flash-image`로 선택할 수 있습니다. 조사·대본·음성 모델은 변경하지 않습니다.

영상 상세 화면에서 연결 확인 → 한 장 먼저 만들기 → 미리보기 → 빈 장면 만들기 → 영상 다시 만들기 순으로 사용합니다. 연결 확인은 모델 정보만 조회하며 결제·할당량·실제 이미지 생성 성공을 보장하지 않습니다. 생성 버튼은 유료입니다. 기본 1K 출력 가격은 장당 $0.0336이며 입력 토큰과 재생성은 별도입니다. 가격은 2026-09-11 공식 표 기준입니다.

요청은 9:16 이미지 전용으로 전송하며 Google Search나 조사 기능을 호출하지 않습니다. 자동 재시도와 다른 모델로의 자동 전환은 없습니다. 장면별 DB 잠금으로 동시 요청을 막으며, 성공한 이미지는 공유 미디어 볼륨에 저장해 변환 실패 후에도 재사용합니다. 이미 올린 장면은 덮어쓰지 않습니다. 응답 전에 연결이 끊기면 과금·완료 여부를 알 수 없으므로 AI Studio 사용량을 확인한 뒤 수동으로 다시 시도해야 합니다.

`node scripts/check-gemini.mjs`는 실행 중인 Docker 웹 서버의 키 존재 여부, 모델별 조회 HTTP 상태, 최근 로그의 허용된 오류 필드만 출력합니다. 키와 원문은 출력하지 않으며 생성 요청을 하지 않습니다. `.env`가 아니라 실행 컨테이너에 전달된 `.env.docker` 설정을 검사합니다.

기존 `UNKNOWN`은 조사 응답에 결과 후보 또는 텍스트가 없고 종료 사유도 없을 때 나왔습니다. 해당 메시지만으로 인증/결제 문제를 확정할 수 없습니다. 기존 `videoGeneration()`은 Live 영상 생성을 명시적으로 거절했고 이미지 제공자는 없었습니다. 이번 변경은 이미지 제공자를 추가하며 Veo 동영상 생성은 켜지 않습니다.

공식 자료: https://ai.google.dev/api/generate-content , https://ai.google.dev/gemini-api/docs/image-generation , https://ai.google.dev/gemini-api/docs/pricing
