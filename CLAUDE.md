# 프로젝트: PDF 악보 -> MXL 변환 웹앱

## 스택 (버전 고정 - 임의 변경 금지)

- Next.js 16.2.x (App Router) / Tailwind CSS v4 / shadcn/ui / react-dropzone 14.x
- BullMQ 5.x + Redis 7 / Node.js 22 / TypeScript strict
- opensheetmusicdisplay 2.0.x / pdf-lib
- Audiveris 5.10.2 (Java 25, Docker 컨테이너 안에서만 실행)

## 절대 규칙

- 새 의존성을 추가하기 전에 반드시 사용자에게 물어본다. package.json에 이미 있는 것만 사용한다.
- Audiveris는 오직 child_process.spawn으로 별도 프로세스 실행 (AGPL - Java API를 같은 프로세스에 링크 금지)
- 변환 성공 판정은 종료코드가 아니라 out/*.mxl 파일 존재로 한다 (다악장이면 *.mvt1.mxl 등 여러 개 - 결과는 항상 파일 목록으로 다룬다)
- Tesseract 언어 파일은 github.com/tesseract-ocr/tessdata 의 legacy 포함본만 사용한다. tessdata_fast/best와 apt 패키지는 LSTM 전용이라 Audiveris에서 동작하지 않는다. TESSDATA_PREFIX 환경변수로 지정한다.
- 업로드 검증: %PDF- 매직바이트, <=30MB, <=20쪽(pdf-lib), 암호화 거부. 클라이언트 파일명은 신뢰하지 않는다 (저장은 서버 UUID로)
- 큐 페이로드에는 `{ jobId }`만 담는다. 파일 경로는 각 프로세스가 자기 DATA_DIR 환경변수로 계산한다: `<DATA_DIR>/jobs/<jobId>/` (컨테이너는 `/data`, 호스트 프로세스는 저장소의 `./data` - `./data`는 bind mount로 공유)
- 사용자 대면 문구는 전부 한국어

## 명령어

- 개발(전체): `docker compose up --build`
- 웹만 로컬: `cd web && npm run dev`
  - `REDIS_URL=redis://localhost:6379`
  - `DATA_DIR=<저장소 루트>/data`
  - redis 포트 노출과 `./data` bind mount는 compose가 제공
- 워커 큐 테스트: `cd worker && REDIS_URL=redis://localhost:6379 DATA_DIR=../data npm run enqueue -- ../samples/simple.pdf`
- 워커 정리 작업 수동 실행: `cd worker && DATA_DIR=../data npm run cleanup`
- E2E 테스트: `cd web && RATE_LIMIT_DISABLED=1 npx playwright test`
- 품질 코퍼스: `cd worker && REDIS_URL=redis://localhost:6379 DATA_DIR=../data npm run corpus`
- 테스트: 각 STEP에서 추가

## 진행 규칙

- 매 STEP 시작: CLAUDE.md와 PROGRESS.md를 먼저 읽는다.
- 매 STEP 종료: 검증 증거 제시 -> PROGRESS.md 갱신 -> 커밋
