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
