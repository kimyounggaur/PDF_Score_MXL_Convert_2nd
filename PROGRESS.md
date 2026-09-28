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
- [ ] V2-4 - 결과 판정·표지 자동 복구·엔진 로그
- [ ] V2-5 - 서버와 일치하는 화면 상태
- [ ] V2-6 - 신뢰 가능한 E2E와 정확한 마디 수
- [ ] V2-7 - 재현 가능한 빌드
- [ ] V2-8 - 운영 보안 설정
- [ ] V2-9 - 관측·복구·작업 취소
- [ ] V2-10 - VPS 실서버 배포
- [ ] V2-11 - 업로드·작업 카드 사용성
- [ ] V2-12 - 미리보기·원본 나란히 보기
- [ ] V2-13 - 악보 주제 디자인 개편
- [ ] V2-14 - Audiveris 5.11.0 비교
- [ ] V2-15 - 쪽 범위·가사 언어
- [ ] V2-16 - 확인이 필요한 마디 표시

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
