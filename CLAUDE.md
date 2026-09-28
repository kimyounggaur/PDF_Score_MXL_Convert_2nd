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
  - Compose가 `docker-compose.override.yml`을 자동으로 합쳐 web 3000번과 localhost의 Redis 6379번을 개발용으로 연다.
- 운영: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
  - `-f`로 파일을 명시해 개발용 override를 합치지 않는다. 호스트에는 Caddy의 80/443만 공개한다.
- 웹만 로컬: `cd web && npm run dev`
  - `REDIS_URL=redis://localhost:6379`
  - `DATA_DIR=<저장소 루트>/data`
  - redis 포트 노출과 `./data` bind mount는 compose가 제공
- 워커 큐 테스트: `cd worker && REDIS_URL=redis://localhost:6379 DATA_DIR=../data npm run enqueue -- ../samples/simple.pdf`
- 워커 정리 작업 수동 실행: `cd worker && DATA_DIR=../data npm run cleanup`
- E2E 테스트: `cd web && RATE_LIMIT_DISABLED=1 npx playwright test`
- 품질 코퍼스: `cd worker && REDIS_URL=redis://localhost:6379 DATA_DIR=../data npm run corpus`
- 테스트: 각 STEP에서 추가

## 배포 보안

- Docker가 공개한 포트는 UFW 규칙을 우회할 수 있다. 운영 compose에 web 3000번과 Redis 6379번 포트를 추가하지 말고 Caddy 80/443만 공개한다.
- 운영 Next standalone은 `HOSTNAME=0.0.0.0`으로 바인딩한다. 그래야 컨테이너 내 `127.0.0.1:3000` 헬스체크와 Caddy 의존성이 정상 동작한다.
- Vercel 단독 배포는 지원하지 않는다. 이 서비스는 Redis 큐, 상주 Audiveris 워커, web/worker 공유 디스크와 장시간 작업이 모두 필요하다.

## 진행 규칙

- 매 STEP 시작: CLAUDE.md와 PROGRESS.md를 먼저 읽는다.
- 매 STEP 종료: 검증 증거 제시 -> PROGRESS.md 갱신 -> 커밋

## 실측으로 확인된 Audiveris 동작 (docs/IMPROVEMENT_V2.md 부록 A·B)

- 진행 로그: `INFO  [input#<쪽>]  StepMonitoring 98 | <단계>`. 1쪽짜리 문서는 `[input]`(쪽 번호 없음).
  진행률은 이 줄과 쪽 번호로만 계산한다. 다른 줄에 섞인 단어(PAGE, STEMS 등)로 판단하지 않는다.
- 전체 쪽수: `<N> sheets in <경로>` (1쪽이면 `1 sheet in`). 처리 대상 쪽: `Book reaching PAGE on sheets:[#1#2]`.
- 악보가 아닌 쪽: `No system found` → `Sheet input#<쪽> flagged as invalid.`
- invalid 쪽이 하나라도 있으면 전체 내보내기가 실패한다(5.10.2·5.11.0 동일):
  `Could not export since transcription did not complete successfully` → `Exit forced. Failure` → 종료코드 1, .mxl 없음.
- 복구: `-save`로 저장된 `out/input.omr`에서 정상 쪽만 다시 내보낸다:
  `Audiveris -batch -export -sheets 2 3 -- <out>/input.omr` → `out/input.mxl` (약 6초, -output과 관계없이 .omr 옆에 생성).
  그래서 `-save`는 유지한다.
- 성공: `Score input exported to <out>/input.mxl`, 종료코드 0. 종료코드는 참고용이고 판정은 결과 파일로 한다.
- MXL 안의 `<source>`와 `source-file`에 서버의 입력 파일 경로가 기록된다.
- OCR 언어 확인 줄: `Installed OCR languages: eng,kor`.
- JVM 옵션은 V2-7부터 `JAVA_TOOL_OPTIONS`로 준다 (로그 첫 줄 `Picked up JAVA_TOOL_OPTIONS`로 적용 확인).

## 품질 규칙 (2차 개선)

- "완료"는 증거(명령 출력 원문, 테스트 결과, 스크린샷)와 함께만 보고한다. 실행하지 못한 검증은 "미실행"으로 적는다.
- 버그를 고칠 때는 먼저 실패하는 테스트를 만들고, 고친 뒤 통과를 보여준다.
- 단위 테스트: Node 내장 테스트 러너 + tsx. worker에서 `node --import tsx --test "src/**/*.test.ts"`.
  web에 tsx가 필요하면 추가 전에 묻는다.
- 엔진 로그 시험 자료: `worker/test/fixtures/audiveris/*.log`. 진행률·판정 로직은 이 파일로 시험한다.
- 작업 브랜치는 `v2`. main 병합은 사용자 승인 후에만.
- samples/ 아래의 PDF(특히 실제 악보)는 커밋하지 않는다.
