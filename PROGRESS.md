# 진행 상황

- [x] STEP 0 - 프로젝트 부트스트랩 & CLAUDE.md
- [x] STEP 1 - Audiveris 변환 엔진 Docker화
- [x] STEP 2 - 변환 워커
- [x] STEP 3 - 웹 API
- [x] STEP 4 - 프론트엔드 업로드 UI
- [x] STEP 5 - 실시간 진행률(SSE)
- [ ] STEP 6 - 악보 미리보기(OSMD)
- [ ] STEP 7 - 보안·안정성 강화
- [ ] STEP 8 - E2E 테스트 & 품질 코퍼스
- [ ] STEP 9 - 배포 구성
- [ ] STEP 10 - 차별화 기능 백로그

## 검증 메모

- STEP 1: Docker CLI가 현재 Windows 환경 PATH에 없어 로컬 빌드/스모크 테스트는 실행하지 못했다. `worker/Dockerfile`과 `worker/smoke-test.sh`는 설계서 요구사항대로 작성했다.
- STEP 2: Redis/worker compose와 BullMQ 워커 구현은 완료했다. Docker CLI가 없어 `docker compose up` 기반 실제 변환 검증은 실행하지 못했다.
- STEP 3: Next.js API 구현은 완료했다. Docker CLI와 Redis 런타임이 없어 curl 전체 사이클 검증은 실행하지 못했다.
- STEP 4: 업로드 UI와 폴링 기반 작업 카드를 구현했다. Docker/Redis가 없어 실제 업로드-변환 UI 회귀는 실행하지 못했고, Next 빌드로 정적 검증했다.
- STEP 5: SSE 엔드포인트와 EventSource 기반 상태 훅을 구현했다. Docker/Redis가 없어 curl -N 이벤트 스트림 실측은 실행하지 못했다.
