# Vercel 배포 메모

이 저장소는 Vercel에 `web` Next.js 앱을 배포할 수 있도록 `vercel.json`을 포함한다.

주의: 전체 변환 서비스는 Vercel 단독으로 동작하지 않는다. Audiveris 변환은 Docker 기반 장시간 워커, Redis, 공유 `/data` 저장소가 필요하므로 `docker-compose`가 가능한 VPS 또는 별도 워커 인프라가 필요하다.

Vercel에서 가능한 범위:

- 메인 UI 렌더링
- Next.js API 라우트 빌드
- 외부 Redis/워커를 별도 제공할 경우 API 연결

Vercel 단독으로 불가능한 범위:

- Audiveris Docker 이미지 실행
- BullMQ 워커 상주 실행
- `/data` 공유 볼륨 기반 결과 파일 보관
- 20분짜리 변환 작업 처리

프로덕션 전체 기능 배포는 `docs/DEPLOY.md`의 VPS + Docker Compose 절차를 따른다.

