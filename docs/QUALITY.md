# 품질 코퍼스 기준선

이 파일은 `cd worker && REDIS_URL=redis://localhost:6379 DATA_DIR=../data npm run corpus` 실행 결과로 갱신한다.

현재 Windows 로컬 환경에는 Docker CLI와 Redis/Audiveris 런타임이 없어 실측 변환을 실행하지 못했다. 2026-09-28에 공개 PDF와 합성 PDF의 구조, web/worker 타입 검사, Next production build까지 확인했다.

| 파일 | 쪽수 | 소요시간 | 결과 파일 수 | 검증 통과 | 비고(마디 수) |
|---|---:|---:|---:|---|---|
| simple.pdf | 2 | 미실행 | 미실행 | 미실행 | 공개 PDF 74,577 bytes; Docker 환경에서 35마디 기준 재확인 필요 |
| multi.pdf | 3 | 미실행 | 미실행 | 미실행 | 공개 PDF 222,242 bytes; Docker 환경에서 106마디 기준 재확인 필요 |
| gymno.pdf | 2 | 미실행 | 미실행 | 미실행 | 추가 공개 악보 168,477 bytes |
| bad.pdf | 1 | 미실행 | 0 예상 | 미실행 | 비악보 실패 경로 |
| cover.pdf | 3 | 미실행 | 1 예상 | 미실행 | 표지 1쪽 제외 후 simple과 같은 35마디 기준 |
| pages21.pdf | 21 | 해당 없음 | 해당 없음 | 해당 없음 | API가 TOO_MANY_PAGES로 거부해야 함 |

## 정적 기준선

| 검사 | 결과 |
|---|---|
| web TypeScript | 통과 |
| worker TypeScript | 통과 |
| Next.js production build | 통과 |
| PDF 쪽수·암호화 여부 | 6개 모두 기대값 일치, 비암호화 |
| Docker/Audiveris 실변환 | 미실행 - Docker CLI 없음 |

MXL 검증기는 정확한 `<measure>` 시작 태그만 세고 `measuresPerPart`를 함께 반환하도록 수정했다. 합성 partwise/timewise MXL 테스트는 통과했으며, 실제 Audiveris 결과의 simple 35마디·multi 106마디 검증은 결과 파일이 없어 테스트 TODO로 명시했다.

