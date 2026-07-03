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
