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

## Audiveris 5.11.0 비교 게이트

2026-09-28 현재 [Audiveris 5.11.0 공식 릴리스](https://github.com/Audiveris/audiveris/releases/tag/5.11.0)는 2026-07-11에 공개됐으며, 불완전한 스캔의 일괄 내보내기를 중단시키던 오류와 여러 장 악보의 병렬 처리 오류 수정, 오선 인식 개선 등을 포함한다. 다만 공식 릴리스 설명만으로 이 저장소의 악보에서 정확도나 처리 속도가 개선된다고 판단할 수는 없다.

두 버전의 최소 Java 요구사항은 모두 25로 동일하다([5.10.2 설정](https://raw.githubusercontent.com/Audiveris/audiveris/5.10.2/gradle.properties), [5.11.0 설정](https://raw.githubusercontent.com/Audiveris/audiveris/5.11.0/gradle.properties)). Gradle Wrapper는 [5.10.2의 9.1.0](https://raw.githubusercontent.com/Audiveris/audiveris/5.10.2/gradle/wrapper/gradle-wrapper.properties)에서 [5.11.0의 9.4.1](https://raw.githubusercontent.com/Audiveris/audiveris/5.11.0/gradle/wrapper/gradle-wrapper.properties)로 변경됐다. 현재 워커 Dockerfile은 Java 25와 버전별 Gradle Wrapper를 사용하는 구조지만, Docker CLI가 없어 어느 버전의 이미지도 이 환경에서 빌드해 확인하지 못했다.

또한 이 환경에는 Redis/Audiveris 런타임이 없고, 사용자 소유의 실제 악보를 둘 `samples/real/` 폴더와 요구된 실제 악보 5개 이상도 없다. 따라서 아래 비교 결과는 추정값으로 채우지 않고 모두 미실행으로 둔다.

| 비교 항목 | 5.10.2 | 5.11.0 |
|---|---|---|
| 버전별 워커 이미지 빌드 | 미실행 | 미실행 |
| `samples/` 전체 파일별 2회 변환 | 미실행 | 미실행 |
| `samples/real/` 전체 파일별 2회 변환 | 미실행 | 미실행 |
| 종료·결과 코드와 평균 소요 시간 | 미실행 | 미실행 |
| 파트별 마디 수와 `validateMxl` | 미실행 | 미실행 |
| invalid 쪽과 자동 복구 결과 | 미실행 | 미실행 |
| 제목·가사 텍스트 보존 | 미실행 | 미실행 |
| 실제 로그 기반 진행률·판정 회귀 | 미실행 | 미실행 |

설계 조사 부록에 있는 `cover.pdf`의 5.10.2 70.3초와 5.11.0 58.6초는 각각 한 번 실행한 실패 사례다. 같은 파일을 정상 완료한 반복 측정이 아니므로 두 버전의 속도 비교나 업그레이드 근거로 사용하지 않는다.

**현재 결정: 기본 엔진은 5.10.2로 유지하고 5.11.0 업그레이드는 보류한다.** Docker를 사용할 수 있는 환경과 사용 권리가 있는 실제 악보 5개 이상을 준비한 뒤, 같은 조건에서 파일마다 두 번씩 변환하고 실제 5.11.0 로그로 진행률·판정 테스트까지 통과해야 이 게이트를 다시 판단한다.

