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

## 쪽 범위·가사 언어 검증

V2-15는 업로드 요청의 `pageRange`와 `language`를 서버에서 검증하고, 정규화한 `{ sheets, language }`를 `metadata.json`에 저장한다. 큐에는 계속 `{ jobId }`만 넣으며 워커가 metadata를 다시 검증한다. [Audiveris 공식 CLI 문서](https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/)의 `-sheets` 목록 형식에 맞춰 선택 쪽을 각각의 argv로 전달하고, [공식 언어 문서](https://audiveris.github.io/audiveris/_pages/guides/main/languages/)의 복수 언어 표기대로 `kor+eng`를 언어 상수 값으로 전달한다. 현재 호스트에는 Audiveris 실행 파일이 없어 실제 5.10.2 프로세스의 인자 수신은 실행하지 못했고, argv 단위 테스트로 계약을 고정했다.

| 검사 | 결과 |
|---|---|
| 쪽 범위 구문·실제 쪽수·중복 제거·최대 20쪽 | 통과 — web 단위/API 테스트 |
| 21쪽 PDF의 1~20쪽 부분 선택 | 통과 — PDF·옵션 단위 테스트 |
| 언어 허용 목록 `eng`, `kor`, `kor+eng` | 통과 — web/worker 단위 테스트 |
| 구 metadata 기본값·잘못된 metadata 거부·재시도 보존 | 통과 — web/worker 단위 테스트 |
| 선택 쪽 진행 분모·복구 후보·ETA·메트릭 | 통과 — web/worker 단위 테스트 |
| 다중 파일에 같은 옵션 적용 | 통과 — 360px 모킹 브라우저에서 두 요청의 FormData 확인 |
| `cover.pdf` 2~3쪽 실제 무복구 변환 | 미실행 — Docker/Redis/Audiveris 없음; Playwright 시나리오만 추가 |

한국어 가사 비교에 필요한 사용 권리가 있는 `samples/real/` 악보가 현재 저장소에 없다. 따라서 수치를 추정하지 않고 다음 비교를 미실행으로 남긴다.

| 한국어 가사 악보 | `eng`의 `<lyric><text>` 수·앞 10개 | `kor+eng`의 `<lyric><text>` 수·앞 10개 | 판정 |
|---|---|---|---|
| 준비된 실제 악보 없음 | 미실행 | 미실행 | 실제 악보와 엔진 런타임 준비 후 비교 필요 |

## 확인이 필요한 마디 검증

V2-16의 완료 결과는 `suspectMeasures: [{ file, part, measure, reason: "DURATION_MISMATCH" }]`이며 작업 전체에서 최대 50개다. `measure`는 MusicXML의 표시 번호가 아니라 파일·파트 안에서 1부터 센 물리적 마디 순서다. 이 정보는 성공한 MXL에 덧붙이는 자동 점검 결과일 뿐이며 MXL 검증 성공을 실패로 바꾸지 않는다.

리듬 판정은 각 파트에서 `<divisions>`와 `<time>`을 상속하고, 분수 연산으로 일반 음표와 `<forward>`를 전진, `<backup>`을 후진시켜 시간 커서의 최대 도달 길이와 기대 박자 길이를 비교한다. `<chord/>`가 붙은 후속 음과 `<grace/>` 꾸밈음은 길이에 더하지 않는다. 첫 번째 물리적 마디, `implicit="yes"`, `non-controlling="yes"` 마디는 이후 상태를 위해 분석하지만 결과에서는 제외한다. 마디 중간 divisions 변경은 각 길이를 즉시 4분음표 단위로 정규화해 계속 판정한다. 박자·divisions가 없거나, 스태프별 `<time number="…">` 또는 마디 중간 박자 변경처럼 파트 전체 기대 길이를 확정할 수 없는 경우에는 오탐을 피하려고 건너뛴다. 이후 공통 박자가 나오면 판정을 재개한다.

Audiveris 로그의 `StackRhythm … S<n> MeasureStack#<m> no correct rhythm`에서 `S<n>`과 `MeasureStack#<m>`을 결과 MusicXML의 물리적 마디로 연결할 검증 자료가 없으므로, 현재 결과에는 MusicXML 길이 신호만 사용한다.

| 검사 자료·경로 | 기대값 | 확인 결과 |
|---|---|---|
| `normal-4-4.musicxml` 정상 4/4 두 마디 | 0건 | 통과 — worker 단위 테스트 |
| `missing-note-4-4.musicxml` 두 번째 마디 음표 누락 | `P1`의 물리적 2번 마디 1건 | 통과 — worker 단위 테스트 |
| 화음 후속 음·꾸밈음 | 길이 중복 없이 0건 | 통과 — worker 단위 테스트 |
| `backup` 다성부와 `forward` | 최대 시간 위치를 기준으로 0건 | 통과 — worker 단위 테스트 |
| 첫 물리적 마디·`implicit="yes"` 예외 | 두 예외는 제외, 뒤의 짧은 물리적 3번만 1건 | 통과 — worker 단위 테스트 |
| divisions·박자 상속, 가산·복합 박자 | 상속 뒤 짧은 물리적 6번만 1건 | 통과 — worker 단위 테스트 |
| 마디 중간 divisions 변경 | 완전한 마디는 0건, 짧은 마디는 1건 | 통과 — worker 단위 테스트 |
| `non-controlling="yes"` 예외 | partwise·timewise 모두 해당 마디는 제외하고 이후 박자 상태는 유지 | 통과 — worker 단위 테스트 |
| 스태프별 `<time number="…">` | 공통 박자가 다시 나올 때까지 보수적으로 판정 생략 | 통과 — worker 단위 테스트 |
| score-timewise 파트별 독립 상태 | `P1`의 물리적 2번만 1건 | 통과 — worker 단위 테스트 |
| 여러 결과 파일의 의심 항목 | 파일명을 붙여 자연 정렬 순서로 합치고 전체 50개에서 제한 | 통과 — worker 단위 테스트 |
| 완료 상태·SSE의 구 결과 호환 | 누락은 빈 배열, 잘못된 항목은 제거, 완료 상태만 노출 | 통과 — web 단위 테스트 |
| 완료 카드의 표시·마디 이동·강조 | 파일+마디 중복 제거, 파일 선택, 모바일 결과 탭, OSMD `CurrentArea` 이동·강조 | 통과 — 390px Playwright 모킹, 실제 OSMD 커서 크기·색·알파와 스크린샷 확인 |
| `simple.pdf` 계산 결과와 엔진 로그 비교 | 파일별 확인 필요 마디 수와 두 신호 비교 | 미실행 — Docker/Redis/Audiveris 및 대응 MXL 없음 |

현재 확인한 워커 테스트 결과는 63개 중 61개 통과, 실제 Audiveris MXL 픽스처 2개 TODO, 실패 0개다. 웹 단위 테스트는 75개 모두 통과했고, 전체 프로덕션 빌드·타입 검사와 Playwright 9개 시나리오 로드도 통과했다. 확인 필요 마디 전용 Playwright 시나리오 1개를 프로덕션 빌드에서 실행해 통과했으며, 성공 강조 뒤 범위 밖 마디를 눌러 이전 강조가 제거되는 것까지 확인했다. `simple.pdf`의 파일별 확인 필요 마디 수와 엔진 로그 비교값은 추정해서 채우지 않는다.

