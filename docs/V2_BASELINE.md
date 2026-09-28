# V2 기준선

측정일: 2026-09-28 (Asia/Seoul)

## 개발 환경

| 항목 | 값 | 확인 상태 |
|---|---|---|
| 운영체제 | Windows 10 Pro, 64비트 | 로컬 명령으로 확인 |
| CPU | Intel Core i7-1280P | 로컬 명령으로 확인 |
| 메모리 | 68,408,803,328 bytes (약 63.7 GiB) | 로컬 명령으로 확인 |
| Node.js | v24.18.0 | 로컬 명령으로 확인 |
| pnpm | 11.19.0 | 로컬 명령으로 확인 |
| Docker | CLI 없음 | `docker version` 실행 실패로 확인 |

이 설계서는 macOS + Docker Desktop을 기준으로 작성됐지만, 현재 작업 환경은 Windows이며 Docker CLI가 없다. 따라서 워커 이미지 빌드, Audiveris 실행, compose 기반 전 구간 및 브라우저 E2E 실측은 이 기준선에서는 `확인 불가`로 분리한다. 실행하지 않은 결과를 성공으로 기록하지 않는다.

## PDF 시험 자료

공개 악보 3개를 설계서의 Mutopia URL에서 내려받았고, `web/scripts/make-fixtures.mjs`로 합성 자료 3개를 생성했다. PDF는 `.gitignore` 규칙에 따라 커밋하지 않는다.

| 파일 | 쪽수 | 크기(bytes) | 출처/용도 |
|---|---:|---:|---|
| simple.pdf | 2 | 74,577 | Mutopia, 정상 변환 기준 |
| multi.pdf | 3 | 222,242 | Mutopia, 다쪽 기준 |
| gymno.pdf | 2 | 168,477 | Mutopia, 추가 공개 악보 |
| bad.pdf | 1 | 910 | 글자만 있는 비악보 PDF |
| cover.pdf | 3 | 68,929 | 글자 표지 1쪽 + simple 2쪽 |
| pages21.pdf | 21 | 759 | 서버의 20쪽 제한 검증 |

`pdfinfo`로 모든 파일이 비암호화 PDF이며 위 쪽수를 갖는지 확인했다. 생성한 `bad.pdf`, `cover.pdf`, `pages21.pdf`는 PNG로 렌더해 글자 배치, 표지 구성, 빈 21번째 쪽을 육안 확인했다.

## 엔진 기준선

Docker를 실행할 수 없어 이 PC에서 새 Audiveris 전체 로그나 소요 시간을 측정하지 못했다. `worker/test/fixtures/audiveris/`에는 `docs/IMPROVEMENT_V2.md` 부록 A·B의 외부 실측에서 검증된 핵심 줄만 참조 픽스처로 보존했다. 해당 폴더의 README가 출처와 한계를 명시한다.

| 항목 | 결과 |
|---|---|
| 워커 이미지 빌드 | 확인 불가 - Docker CLI 없음 |
| 스모크 테스트 | 확인 불가 - Docker CLI 없음 |
| simple/multi/bad/cover 실변환 | 확인 불가 - Docker CLI 없음 |
| 표지 자동 복구 실험 | 확인 불가 - Docker CLI 없음 |
| OCR 언어 `eng,kor` | 설계서의 기존 실측 로그에서 확인, 로컬 재확인 불가 |
| JVM `-Xmx` 적용 | 로컬 재확인 불가 |

## 후속 검증 원칙

- 순수 함수, 타입 검사, 빌드는 이 Windows 환경에서 실행한다.
- Docker가 필요한 완료 기준은 코드·구성 검증과 명령 출력까지만 수행하고 `런타임 미실행`으로 남긴다.
- Docker 환경을 사용할 수 있게 되면 이 문서의 `확인 불가` 항목을 실제 출력, 소요 시간, 결과 파일 크기로 교체한다.

## 전 구간 진단

### 로컬에서 실행한 확인

- `pnpm typecheck`: web·worker 모두 통과.
- `pnpm --filter @pdf-score-mxl/web build`: Next.js 16.2.10 production build 통과.
- 프로덕션 서버의 `/api/health`: `200 {"ok":true}`.
- Redis가 없는 상태의 `POST /api/jobs`: 본문 없는 HTTP 500을 반환했다. JSON 오류 계약이 깨지는 S7을 재현했다.
- Redis가 없는 상태의 존재하지 않는 작업 조회: 5초 동안 응답이 없어 curl timeout. HTTP 요청용 Redis 연결이 빨리 실패하지 않는 추가 운영 문제를 확인했다(`V2-NEW-1`, V2-9에서 수정).
- 기존 진행률 파서에 `Book reaching PAGE on sheets:[#1#2]`를 입력하자 즉시 `{pct:90,stage:"PAGE"}`. 이어서 `Systems:` 줄도 `STEMS`로 오인해 B1을 재현했다.

### 문제 목록 판정

| ID | 판정 | 근거 |
|---|---|---|
| B1 | 재현됨 | 실제 형식 로그 2줄을 현재 파서에 재생해 시작 즉시 90%, `Systems`→`STEMS` 확인 |
| B2 | 로컬 확인 불가 | Docker/Audiveris 없음. 설계서의 5.10.2·5.11.0 실측을 회귀 픽스처로 보존 |
| B3 | 코드로 확인 | `audiveris.ts`가 결과 파일 검사보다 `code !== 0`을 먼저 ENGINE_ERROR로 처리 |
| B4 | 로컬 확인 불가 | MXL 실생성 불가. 설계서 실측에 서버 경로 포함 기록 |
| B5 | 코드·기존 실측으로 확인 | `pdf.ts`가 암호화/권한 제한을 구분하지 않고 거부 |
| B6 | 코드로 확인 | 최근 500줄을 메모리에만 두고 `ConversionError.details`를 운영 로그 구조에 보존하지 않음 |
| S1 | 코드로 확인 | 기본 compose의 web 3000/redis 6379 포트가 prod merge에도 남음 |
| S2 | 코드로 확인 | production Dockerfile에 `HOSTNAME=0.0.0.0` 없음 |
| S3 | 코드로 확인 | `vercel.json`, `docs/VERCEL.md` 존재 |
| S4 | 수정 후 정적 확인 | V2-1에서 web/worker `.dockerignore` 추가. 이미지 빌드는 확인 불가 |
| S5 | 코드로 확인 | Dockerfile이 잠금 파일 없이 npm install, worker start 경로가 실제 dist 구조와 불일치 |
| S6 | 코드로 확인 | 레이트리밋이 INCR 뒤 EXPIRE를 별도 호출 |
| S7 | 재현됨 | Redis 중단 상태의 업로드가 JSON 없이 HTTP 500 |
| S8 | 코드로 확인 | 워커 healthcheck가 항상 `process.exit(0)` |
| S9 | 코드로 확인 | 업로드 전에 worker 수를 확인하지 않음 |
| U1 | 코드로 확인 | waiting 작업의 BullMQ progress 0을 정규화해 전송 |
| U2 | 코드로 확인 | SSE 장애 fallback GET이 한 번 실행된 뒤 반복되지 않음 |
| U3 | 코드로 확인 | localStorage 불러오기 전에 빈 `jobs` 저장 effect가 실행될 수 있음 |
| U4 | 코드로 확인 | REDUCTION, CUE_BEAMS, CURVES, LINKS 라벨 누락 |
| U5 | 코드로 확인 | 다운로드명이 원본명과 엔진 파일명을 이어 붙임 |
| U6 | 코드로 확인 | 만료/24시간 항목을 로컬 목록에서 정리하지 않음 |
| U7 | 코드로 확인 | 링크 안 버튼 구조, progressbar ARIA 없음 |
| U8 | 코드로 확인 | 업로드 전송률·대기 순번·예상 시간 없음 |
| U9 | 코드로 확인 | PDF 검증보다 정상 업로드 레이트리밋을 먼저 차감 |
| Q1 | 코드로 확인 | E2E의 전역 `완료`, 전역 `svg`, 두 실패 코드 허용 선택자가 거짓 통과 가능 |
| Q2 | 확인됨 | V2 시작 전 단위 테스트 스크립트와 테스트 파일 없음 |
| Q3 | 확인 불가 | Redis/Audiveris 부재로 품질 코퍼스 실행 불가 |
| Q4 | 코드로 확인 | `<measure\\b`가 `<measure-numbering>`의 하이픈 앞 word boundary에도 일치 |
| E1 | 코드로 확인 | Dockerfile은 5.10.2 고정. 비교 실행은 Docker 부재로 불가 |

### 새 문제

- `V2-NEW-1`: Redis 장애 시 일부 상태 조회가 5초 이상 멈춘다. 원인은 HTTP 요청 경로에서도 재시도를 오래 지속하는 연결 설정을 공유하기 때문이다. V2-9에서 요청용 연결은 짧은 실패 정책과 1초 제한을 적용한다.
- `V2-NEW-2`: `next start` 실행 시 standalone 설정에서는 `.next/standalone/server.js`를 직접 실행하라는 경고가 나온다. V2-7 Docker 산출물 경로 검증과 운영 명령 문서에 반영한다.

### 실행하지 못한 항목

개발 compose의 업로드→SSE→다운로드, 브라우저 스크린샷, 운영 compose/Caddy, E2E 7개, 품질 코퍼스는 Docker·Redis·Audiveris 부재로 실행하지 못했다. 기능 수정 후 순수 단위 테스트와 Next 빌드는 계속 수행하며, 실제 엔진 검증은 배포 전 필수 미검증 항목으로 남긴다.
