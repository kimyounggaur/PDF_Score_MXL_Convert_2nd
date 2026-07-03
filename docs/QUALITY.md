# 품질 코퍼스 기준선

이 파일은 `cd worker && REDIS_URL=redis://localhost:6379 DATA_DIR=../data npm run corpus` 실행 결과로 갱신한다.

현재 로컬 환경에는 Docker CLI와 Redis/Audiveris 런타임이 없어 실측 변환을 실행하지 못했다.

| 파일 | 쪽수 | 소요시간 | 결과 파일 수 | 검증 통과 | 비고(마디 수) |
|---|---:|---:|---:|---|---|
| simple.pdf | 대기 | 대기 | 대기 | 대기 | Docker 환경에서 측정 필요 |
| multi.pdf | 대기 | 대기 | 대기 | 대기 | Docker 환경에서 측정 필요 |
| bad.pdf | 대기 | 대기 | 대기 | 대기 | 실패 경로 측정 필요 |

