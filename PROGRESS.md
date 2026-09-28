# 진행 상황

- [x] STEP 0 - 프로젝트 부트스트랩 & CLAUDE.md
- [x] STEP 1 - Audiveris 변환 엔진 Docker화
- [x] STEP 2 - 변환 워커
- [x] STEP 3 - 웹 API
- [x] STEP 4 - 프론트엔드 업로드 UI
- [x] STEP 5 - 실시간 진행률(SSE)
- [x] STEP 6 - 악보 미리보기(OSMD)
- [x] STEP 7 - 보안·안정성 강화
- [x] STEP 8 - E2E 테스트 & 품질 코퍼스
- [x] STEP 9 - 배포 구성
- [ ] STEP 10 - 차별화 기능 백로그

> STEP 0~9는 코드 작성 완료 상태이며, 실제 실행 검증은 V2-1·V2-2에서 진행한다.

## 2차 개선 트랙

- [x] V2-0 - 준비: 작업 브랜치, 설계서 반입, 규칙 보강
- [ ] V2-1 - 워커 이미지·스모크 테스트·실측 로그
- [ ] V2-2 - 전 구간 기준선 진단
- [x] V2-3 - 쪽·단계 기반 진행률과 단위 테스트
- [x] V2-4 - 결과 판정·표지 자동 복구·엔진 로그
- [x] V2-5 - 서버와 일치하는 화면 상태
- [x] V2-6 - 신뢰 가능한 E2E와 정확한 마디 수
- [x] V2-7 - 재현 가능한 빌드
- [x] V2-8 - 운영 보안 설정
- [x] V2-9 - 관측·복구·작업 취소
- [ ] V2-10 - VPS 실서버 배포
- [x] V2-11 - 업로드·작업 카드 사용성
- [x] V2-12 - 미리보기·원본 나란히 보기
- [x] V2-13 - 악보 주제 디자인 개편
- [ ] V2-14 - Audiveris 5.11.0 비교
- [ ] V2-15 - 쪽 범위·가사 언어
- [x] V2-16 - 확인이 필요한 마디 표시

## 검증 메모

- STEP 1: Docker CLI가 현재 Windows 환경 PATH에 없어 로컬 빌드/스모크 테스트는 실행하지 못했다. `worker/Dockerfile`과 `worker/smoke-test.sh`는 설계서 요구사항대로 작성했다.
- STEP 2: Redis/worker compose와 BullMQ 워커 구현은 완료했다. Docker CLI가 없어 `docker compose up` 기반 실제 변환 검증은 실행하지 못했다.
- STEP 3: Next.js API 구현은 완료했다. Docker CLI와 Redis 런타임이 없어 curl 전체 사이클 검증은 실행하지 못했다.
- STEP 4: 업로드 UI와 폴링 기반 작업 카드를 구현했다. Docker/Redis가 없어 실제 업로드-변환 UI 회귀는 실행하지 못했고, Next 빌드로 정적 검증했다.
- STEP 5: SSE 엔드포인트와 EventSource 기반 상태 훅을 구현했다. Docker/Redis가 없어 curl -N 이벤트 스트림 실측은 실행하지 못했다.
- STEP 6: OSMD 기반 MXL 미리보기 컴포넌트를 구현했다. 실제 MXL 렌더 스크린샷은 Docker/Redis 부재로 실행하지 못했다.
- STEP 7: worker 격리, Redis 레이트리밋, 큐 심도 보호, 24시간 정리 작업, healthcheck를 구현했다. Docker CLI가 없어 격리/429/TTL 실측은 실행하지 못했다.
- STEP 8: MXL 검증 유틸, Playwright E2E, 품질 코퍼스 스크립트를 추가했다. Docker/Redis/Audiveris 런타임 부재로 E2E와 코퍼스 실측은 실행하지 못했다.
- STEP 9: production compose, Caddyfile, .env.example, DEPLOY.md를 추가했다. Docker CLI가 없어 로컬 프로덕션 리허설은 실행하지 못했다.

## 2차 개선 검증 메모

- V2-1: 공개 PDF 3개를 내려받고 합성 PDF 3개를 생성해 `pdfinfo`와 PNG 렌더로 검증했다. web/worker `.dockerignore`, 재현 가능한 fixture 생성 스크립트, 설계서 실측 로그 기반 참조 픽스처를 추가했다. 현재 Windows 환경에는 Docker CLI가 없어 워커 이미지 빌드·스모크 테스트·Audiveris 로컬 재실측은 미실행이며 `docs/V2_BASELINE.md`에 한계를 기록했다.
- V2-2: 진행률 90% 고정과 Redis 장애 시 비JSON 500/상태 조회 timeout을 로컬에서 재현했다. 나머지 문제는 코드 근거와 런타임 확인 불가를 구분해 `docs/V2_BASELINE.md`에 전수 기록했다. Docker가 필요한 전체 흐름·운영 리허설·E2E·코퍼스는 미실행이다.
- V2-3: 엄격한 `StepMonitoring` 파서, 대상 쪽 기준 진행률, invalid 쪽 기록, 7바이트 청크 경계, stdout/stderr 독립 버퍼, 500ms 진행률 병합을 구현했다. 단위 테스트 8개, web/worker 타입 검사, Next production build가 통과했다. 참조 로그 재생에서 1쪽 종료 48%, 2쪽 LOAD 50%, 내보내기 전 93%로 확인했다. Docker SSE 실변환과 카드 스크린샷은 미실행이다.
- V2-4: 결과 파일·검증 우선 판정기, `.omr` 정상 쪽 1회 자동 복구, 전체 제한시간 공유, 스트리밍 `engine.log`, 30줄 실패 꼬리, OOM/NO_OUTPUT 분류, 제외 쪽 경고와 구조화 로그를 구현했다. 워커 단위 테스트 18개와 전체 타입 검사·워커 빌드가 통과했다. Docker가 없어 bad/cover/simple 실변환과 복구 마디 수 비교는 미실행이다.
- V2-5: HMR에서도 하나만 유지되는 QueueEvents 허브, 초기/활성/진행/완료/실패 SSE 계약, 15초 대기 순번 갱신, 20초 무응답 뒤 5초 반복 폴링, 만료 카드, localStorage hydration 보호·24시간/30개 정리를 구현했다. 정상 업로드 제한은 검증 뒤에만 원자적으로 차감하고 검증 실패는 별도 30회 한도로 분리했다. web 단위 테스트 13개, 전체 타입 검사, Next build가 통과했다. Redis·Docker가 없어 실제 SSE 원문·오프라인 복구·레이트리밋 통합 실측은 미실행이다.
- V2-6: `<measure(?=[\\s>])`만 집계하고 파트별 마디 수를 반환하도록 MXL 검증을 고쳤으며, 합성 MXL 단위 테스트로 `measure-numbering` 제외를 확인했다. E2E는 카드 범위의 엄격한 test ID, 실제 OSMD `.vf-notehead`, 정확한 오류 코드로 A~G 7개를 정의했다. 워커 22개 통과·2개 실MXL TODO, 웹 13개 통과, 전체 타입 검사, Playwright 7개 로드가 통과했다. Docker 부재로 실제 7개 E2E 실행과 버그 되돌림 실험은 미실행이다.
- V2-7: Docker 빌드 컨텍스트를 저장소 루트로 통일하고 pnpm 11.7.0의 frozen lockfile·workspace filter 설치, 모노레포 standalone 실행 경로(`web/server.js`), Audiveris 버전 ARG·OCI 라벨, Gradle BuildKit 캐시, `JAVA_TOOL_OPTIONS=-Xmx4g`, 올바른 워커 시작 경로를 적용했다. 로컬 frozen 설치, 워커 단위 테스트 22개 통과·2개 TODO, 웹 단위 테스트 13개 통과, 전체 타입 검사·빌드, standalone `/api/health` 200 응답을 확인했다. Docker CLI가 없어 이미지 빌드·크기, Gradle 캐시 시간, 이미지 내부 버전, Audiveris 스모크와 JVM `Picked up JAVA_TOOL_OPTIONS` 로그는 미실행이다.
- V2-8: 개발용 web/Redis 호스트 포트를 `docker-compose.override.yml`로 분리하고, 운영 Next standalone에 `HOSTNAME=0.0.0.0`을 지정했다. Caddy에 nosniff·Referrer-Policy·SAMEORIGIN·Server 제거를 적용했고 HSTS는 localhost가 아닌 요청에만 추가했다. 레이트리미트는 V2-5의 Redis MULTI(`INCR` + `EXPIRE NX`)와 순수 함수 테스트가 이미 요구를 충족함을 재확인했다. Vercel 설정·문서를 제거하고 VPS 전용 배포 경계를 문서화했다. 현재 환경에 Docker CLI가 없어 compose 합병 출력, 운영 헬스체크/Caddy, 헤더, 포트 차단, 6회 업로드 429 통합 검증은 미실행이다.
- V2-9: 1초 제한의 부분 응답 `/api/status`, Redis·워커·저장 공간별 JSON 장애 코드, 서비스 상태 배너와 동적 엔진 버전, Redis 성공 기반 워커 heartbeat, TTL 취소 키와 BullMQ AbortSignal을 통한 실행 중 프로세스 그룹 종료, 대기 작업의 안전한 제거, Job Scheduler 기반 유지보수를 구현했다. 웹 단위 테스트 21개, 워커 테스트 32개 통과·2개 TODO, 전체 타입 검사와 빌드가 통과했다. Redis가 없는 로컬 standalone에서 상태 API의 부분 200, 업로드·상태·파일·취소 API의 JSON 503, SSE의 복구 가능 `failed` 이벤트 원문을 확인했다. Docker CLI가 없어 worker 중단/복구 통합 시나리오, 90초 unhealthy 전환, 실제 Audiveris 프로세스 종료, 스케줄러 단일성의 컨테이너 검증은 미실행이다.
- V2-10: V2 운영 구조(override 분리, `HOSTNAME`, 부분 응답 상태 API, Redis 기반 worker heartbeat)를 반영해 Ubuntu 24.04 설치부터 방화벽, 저장소·`.env`, 운영 Compose, HTTPS·내부 포트 차단·`simple.pdf` 전체 흐름 검증, 갱신, 로그, 장애 확인 순서, 디스크, 백업과 비파괴 코드 롤백까지 `docs/DEPLOY.md` 런북을 완성했다. VPS·도메인·SSH 자격정보가 제공되지 않아 main 병합/push와 외부 배포·검증은 실행하지 않았으며, 실제 완료 기준을 충족하지 않아 V2-10 체크박스는 미완료로 유지한다.
- V2-11: XHR 전송률·전송 중 취소, 최대 5개 순차 업로드와 구체적인 거부 사유, 원본 쪽수·크기·경과 시간·대기 순번, 최근 완료 20건의 쪽당 처리 시간에 기반한 ETA(표본 3건 이상), 실패 원인별 안내와 원본 재사용 재시도, 한글 원본명 기반 다운로드 이름, 전역 24시간 삭제 안내와 진행 막대 접근성을 구현했다. 재시도 작업 ID는 원본 UUID에서 결정적으로 만들고 작업 폴더를 원자적으로 선점해 응답 유실·새로고침·동시 요청에도 중복·파일 경합이 생기지 않게 했고, `.mvtN`의 실제 번호로 다악장 파일명을 정하며, 완료가 확정된 작업만 ETA 표본에 기록한다. 웹 단위 테스트 47개, 워커 테스트 39개 통과·실엔진 픽스처 2개 TODO, 전체 타입 검사·빌드, Playwright E2E 7개 로드가 통과했다. 네트워크를 제한한 브라우저에서 2개 파일 중 첫 파일의 실제 XHR 1% 진행률과 취소 버튼을 캡처했고, API 모킹 390px 화면에서는 가로 넘침 없이 실패·대기·ETA 카드가 정상 렌더됨을 확인했다. 선택 항목인 MXL 내부 서버 경로 재작성은 실제 Audiveris MXL과 OSMD 회귀를 검증할 수 없는 환경에서 ZIP 손상 위험이 더 커 적용하지 않았다. Docker·Redis·Audiveris가 없어 실제 다중 업로드 완료 흐름, 브라우저 다운로드 파일명, 변환 기반 E2E는 미실행이다.
- V2-12: 작업 존재를 확인한 뒤 원본을 `inline` PDF·UTF-8 파일명·`nosniff`·`SAMEORIGIN`·비공개 캐시로 제공하는 `/api/jobs/:id/source`, 검증된 결과별 총/파트별 마디 요약, OSMD 50~200% 줌·전체 화면, 1024px 이상 원본/결과 2열과 원본 쪽 이동, 모바일 탭과 새 탭 원본 링크를 새 의존성 없이 구현했다. 웹 단위 테스트 52개, 워커 테스트 40개 통과·실엔진 픽스처 2개 TODO, 순차 타입 검사·빌드, Playwright E2E 7개 로드가 통과했다. 모킹 브라우저에서 실제 MusicXML 음표 렌더, 50%·125%·200% 줌, 전체 화면 진입·종료, `#page=1`→`#page=2`, 다악장 실패 시 이전 렌더 제거, 로딩 중 선택한 최신 줌 적용, 1440px/390px 무가로넘침을 확인했다. 헤드리스 Chromium의 내장 PDF 플러그인은 캡처에 내용을 그리지 않아 iframe URL·응답과 모바일 새 탭 링크로 원본 연결을 검증했으며, Docker 기반 실변환 E2E는 미실행이다.
- V2-13: `docs/DESIGN_V2.md`에서 교정대와 리허설 콘솔 두 방향을 비교하고, 사용자의 단계별 질문 생략 요청에 따라 원본 대 결과 검수에 더 집중하는 교정대 안을 자체 승인했다. IBM Plex Sans KR, 종이·잉크·오선·교정색 팔레트, 평평한 괘선 구조와 접근 가능한 5선 진행률을 적용했으며 기존 기능·문구·테스트 ID를 유지했다. 360px/1440px의 빈 화면·변환 중·완료·실패 8개 상태를 브라우저로 캡처했고 모두 가로 넘침·런타임 오류가 없었다. 44×44px 이상 조작 영역, 모바일 탭 방향키 순환, 보이는 3px 키보드 초점, `prefers-reduced-motion`, 파일 입력 이름, 긴 파일명 줄바꿈과 주요 색 조합 5.40:1 이상의 대비를 확인했다. 웹 단위 테스트 52개, 워커 테스트 40개 통과·실엔진 픽스처 2개 TODO, 전체 빌드·타입 검사, Playwright E2E 7개 로드가 통과했다.
- V2-14: 공식 5.11.0 릴리스와 두 태그의 빌드 설정을 확인해 Java 최소 버전은 모두 25, Gradle Wrapper는 9.1.0에서 9.4.1로 바뀐 사실과 불완전 스캔 내보내기·다중 쪽 병렬 처리 수정 등을 `docs/QUALITY.md`에 기록했다. 현재 환경에는 Docker·Redis·Audiveris 런타임이 없고 `samples/real/`의 실제 악보 5개도 없어 요구된 파일별 2회 비교와 실제 5.11.0 로그 회귀를 실행할 수 없다. 단회 실패 시간은 비교 근거에서 제외하고 기본 엔진 5.10.2 유지·업그레이드 보류를 자체 결정했으며, 비교표가 실측값으로 채워질 때까지 완료 체크는 하지 않는다.
- V2-15: 전체/직접 쪽 범위와 영어·한국어·혼합 가사 언어 UI, 엄격한 multipart·범위 검증, `metadata.options` 저장과 구 metadata 호환, 재시도 옵션 보존, 선택 쪽 기반 ETA·진행률·복구·메트릭, Audiveris `-sheets`·언어 argv를 새 의존성 없이 구현했다. 웹 테스트 66개와 워커 테스트 49개가 통과했고 실엔진 픽스처 2개는 기존대로 TODO이며, 전체 타입 검사·프로덕션 빌드와 Playwright E2E 8개 로드가 통과했다. 360px 모킹 브라우저에서 기본값(all/eng), 직접 입력 `2-5, 7`, `kor+eng`, 가로 넘침 없음, 44px 라벨·입력·선택 컨트롤과 두 파일에 동일한 FormData가 적용됨을 확인했다. Docker·Redis·Audiveris가 없어 `cover.pdf` 2~3쪽의 실제 무복구 완료는 미실행이고, `samples/real/`에 한국어 가사 악보가 없어 eng 대 kor+eng 가사 비교도 미실행이므로 완료 체크는 유지하지 않는다.
- V2-16: 성공한 MXL에서 파트별 음표·`forward`·`backup`의 최대 시간 위치를 상속된 divisions·박자와 비교하고 화음 후속 음·꾸밈음, 첫 물리적 마디·`implicit="yes"`·`non-controlling="yes"`를 예외 처리하는 보수적 리듬 점검을 구현했다. 중간 divisions 변경은 정확한 분수로 계속 계산하고 스태프별·중간 박자처럼 확정할 수 없는 경우만 판정을 생략한다. 결과 계약은 작업 전체 최대 50개의 `{ file, part, measure, reason: "DURATION_MISMATCH" }`이며 `measure`는 1부터 센 물리적 마디 순서다. 워커 테스트는 63개 중 61개 통과·실엔진 2개 TODO·실패 0개, 웹 단위 테스트는 75개 모두 통과했고 전체 프로덕션 빌드·타입 검사와 Playwright 9개 시나리오 로드도 통과했다. 390px Playwright 모킹에서 파일+마디 중복 제거, 모바일 결과 탭 전환, OSMD 물리적 2번 마디 이동, `CurrentArea`의 실제 크기·장밋빛 픽셀·알파, 실패 시 이전 강조 제거와 스크린샷을 확인해 완료 기준을 충족했다. 엔진 로그의 `MeasureStack`과 실제 마디 대응 및 `simple.pdf` 비교는 Docker/Redis/Audiveris와 대응 MXL이 없어 적용·실행하지 않았다.
