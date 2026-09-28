# 🎼 PDF 악보 → MXL 변환 웹앱 — 2차 개선 바이브코딩 프롬프트 설계서

> **대상 저장소**: `kimyounggaur/PDF_Score_MXL_Convert_2nd` (main 브랜치, 커밋 `64a2254` 기준)
> **성격**: 저장소의 `바이브코딩_프롬프트_설계서.md`(STEP 0~10)의 후속편입니다. 이미 작성된 코드를 **실제로 돌려 보고 → 확인된 문제부터 고치고 → 출시 가능한 수준으로 다듬는** 단계별 복붙 프롬프트 모음입니다.
> **도구**: Claude Code 기준 (다른 코딩 에이전트에서도 대부분 그대로 쓸 수 있음)
> **작성일**: 2026-09-27
> **근거**: 저장소 전체 파일 정독, web·worker 타입 검사, **공식 Audiveris 5.10.2·5.11.0 패키지로 공개 악보 PDF를 직접 변환**한 실측, 앱의 진행률 코드·결과 검증 코드·업로드 검증 코드를 실제 로그·결과 파일·PDF로 실행한 결과

---

## 0. 먼저 읽어 주세요

### 0.1 한눈에 보는 결론

- 코드는 STEP 0~9까지 모두 작성돼 있지만, `PROGRESS.md`의 검증 메모를 보면 **한 번도 실제로 실행된 적이 없습니다.** (Docker가 없는 Windows 환경에서 코드만 작성됨)
- 실제로 돌려 보니 **변환 엔진은 잘 동작합니다.** 바흐 프렐류드 1번 35마디, 엘리제를 위하여 106마디를 인식했고, 제목 글자 인식(OCR)도 됐습니다.
- 가장 큰 문제 세 가지:
  1. **표지·해설 쪽이 1쪽이라도 섞이면 전체 변환이 실패합니다.** 엔진 자체의 동작이며 5.11.0도 같습니다. 앱은 이것을 "엔진 오류"로 안내합니다. 실제 악보 PDF 대부분에 표지가 있어 가장 치명적입니다. 다행히 엔진이 저장해 둔 작업 파일(`.omr`)에서 정상 쪽만 다시 내보내면 **약 6초 만에 복구**되는 것을 확인했습니다. → V2-4
  2. **진행률이 시작 2초 만에 90%가 되어 끝까지 멈춥니다.** 20쪽 악보라면 10분 넘게 멈춘 것처럼 보입니다. → V2-3
  3. **운영 배포 시 HTTPS 서버가 뜨지 못할 가능성이 높고**, 3000번 포트가 방화벽을 우회해 외부에 열립니다. → V2-8
- 진행 순서: **맥에서 실제로 돌려 기준선 확인 → 확인된 버그 수정 → 출시 전 보강 → 실서버 배포 → 사용성 → 차별화**

### 0.2 진행 규칙 (반드시 지켜 주세요)

1. **한 번에 한 STEP만** 붙여넣습니다. 여러 STEP을 한꺼번에 주면 품질이 크게 떨어집니다.
2. 프롬프트를 붙여넣기 전에 **plan 모드**로 바꿉니다. Claude Code에서 `Shift+Tab`을 누를 때마다 모드가 바뀌니(Manual → acceptEdits → plan …), 화면의 모드 표시가 **plan**이 될 때까지 누르세요. 계획을 읽어 보고 맞으면 승인합니다.
3. STEP이 끝나면 **✅ 완료 기준을 직접 확인**합니다. "완료했습니다"라는 말이 아니라 **증거**(명령 출력 원문, 테스트 결과, 스크린샷)를 보세요. 모든 프롬프트에 증거 요구가 들어 있습니다.
4. 완료 기준 통과 → 커밋 확인 → `/clear` 입력 → 다음 STEP. `/clear`는 새 세션을 시작하는 명령이고, 이전 대화는 지워지지 않고 보존됩니다. 커밋이 되돌아갈 지점입니다.
5. 같은 문제로 **두 번 연속 수정에 실패**하면 그 세션을 버리세요. `/clear` 후, 그동안 알게 된 원인을 프롬프트 맨 앞에 붙여 다시 시작하는 편이 거의 항상 빠릅니다.
6. 계획에 없는 라이브러리를 추가하려 하면 멈추고 이유와 대안을 들은 뒤 결정합니다. 모든 프롬프트에 "새 의존성은 먼저 묻기" 규칙이 있습니다.
7. **🙋 내가 할 일**이 있는 STEP은 Claude Code를 실행하기 전에 그 일부터 합니다.
8. 막히면 §7 트러블슈팅을 먼저 보고, 그래도 안 되면 오류 화면이나 메시지 전문을 Claude Code에 그대로 붙여넣습니다.

### 0.3 전체 로드맵

| 단계 | 내용 | 구분 | 사용자 결정·행동 |
|---|---|---|---|
| V2-0 | 준비: 작업 브랜치, 설계서 반입, 규칙 보강 | 필수 | 이 파일을 저장소에 넣기 |
| V2-1 | 맥에서 엔진 실측: 워커 이미지, 스모크 테스트, 실제 로그 확보 | 필수 | Docker Desktop 설치 |
| V2-2 | 전 구간 진단 (고치지 않고 기록) | 필수 | — |
| V2-3 | 진행률 정확하게 + 단위 테스트 도입 | 필수 | — |
| V2-4 | 결과 판정 정확하게 + 표지 자동 복구 + 엔진 로그 보존 | 필수 | — |
| V2-5 | 화면 상태를 서버와 일치시키기 | 필수 | — |
| V2-6 | 테스트를 믿을 수 있게 | 필수 | (선택) GitHub Actions 승인 |
| V2-7 | 빌드 재현성 | 필수 | 설치 방식 승인 |
| V2-8 | 운영 보안 설정 | 필수 | Vercel 연결 해제 |
| V2-9 | 관측·복구·작업 취소 | 필수 | — |
| V2-10 | 실서버 배포 (VPS) | 필수 | VPS·도메인 준비 |
| V2-11 | 업로드·작업 카드 다듬기 | 권장 | — |
| V2-12 | 미리보기 개선 + 원본과 나란히 보기 | 권장 | (선택) pdfjs-dist 승인 |
| V2-13 | 디자인 새로 입히기 | 선택 | 두 안 중 선택 |
| V2-14 | 엔진 5.11.0 비교 후 업그레이드 결정 | 권장 | 실제 악보 5개 준비, 업그레이드 결정 |
| V2-15 | 쪽 범위 선택 + 가사 언어(한국어) | 권장 | 한국어 가사 악보 준비 |
| V2-16 | 확인이 필요한 마디 표시 | 선택 | — |

> Phase 0~2(V2-0 ~ V2-10)까지가 **공개 출시 전 필수**입니다. 기존 설계서의 백로그 10-E(`.omr` 제공)와 10-F(MIDI)는 그대로 유효하며, V2-16 이후에 기존 설계서 STEP 10의 프롬프트를 쓰면 됩니다.

### 0.4 이미 반영한 결정 (추천안 적용)

| 번호 | 결정 | 적용한 안 | 이유 | 바꾸고 싶다면 |
|---|---|---|---|---|
| D1 | 배포 방식 | VPS 1대 + docker compose, Vercel 설정 삭제 | 코드가 이미 이 구조입니다. Vercel에서는 큐 워커·공유 디스크·20분짜리 작업이 불가능해 화면만 뜨고 변환은 안 됩니다. | V2-8의 5)를 빼고, V2-10을 다른 인프라 기준으로 요청 |
| D2 | 엔진 버전 | 5.10.2로 기준선 → V2-14에서 5.11.0 비교 후 결정 | 5.11.0에는 일괄 내보내기 중 오류로 멈추던 문제의 수정이 들어 있습니다. 단, 표지 문제는 5.11.0에서도 똑같이 재현됐습니다. | V2-14 결과를 보고 결정 |
| D3 | 보안(암호·권한 제한) PDF | 거부 유지 + 안내 문구 구체화 | 비밀번호 없이 열리는 '권한 제한' PDF도 엔진은 변환합니다. 하지만 권한 제한은 저작권법의 기술적 보호조치로 볼 여지가 있어 우회하지 않는 쪽이 안전합니다. (법률 자문은 아닙니다) | V2-11의 안내 문구만 수정 |
| D4 | 엔진의 `-save` 옵션 | **유지** | 지난 대화에서 "빼면 약 25% 빨라진다"고 말씀드렸지만, 추가 실험 결과 표지 복구(약 6초)에 단계별 저장본이 필요해 **제거 제안을 철회**합니다. | V2-4에서 "1쪽짜리 PDF만 생략" 정도로 조정 가능 |

### 0.5 사전 준비물

| 항목 | 내용 |
|---|---|
| 컴퓨터 | 맥 (Apple 칩 또는 Intel 칩), RAM 16GB 이상 권장 |
| 설치할 것 | Docker Desktop, Node.js 22, git, Claude Code (pnpm은 `corepack enable`로 준비) |
| Docker 메모리 | 8GB 이상 할당 (Audiveris가 작업당 2~4GB 사용) |
| 테스트 악보 | V2-1에서 공개 악보를 자동으로 내려받습니다. V2-14·V2-15용 실제 악보는 직접 준비 (저장소에는 올라가지 않게 설정) |

---

## 1. 진단 결과 — 지금 무엇이 문제인가

### 1.1 실제로 돌려서 확인한 것 (자세한 수치는 부록 B)

- **엔진은 정상**: 바흐 프렐류드 1번(2쪽) 35마디, 엘리제를 위하여(3쪽) 106마디를 인식했습니다. 제목 OCR도 됐고, 로그에 `Installed OCR languages: eng,kor`가 찍혀 한국어 데이터도 정상 로드됩니다. 결과 MXL은 저장소의 검증 유틸(`validateMxl`)을 통과합니다.
- **진행률 재현**: 실제 엔진 로그를 앱의 진행률 코드(`worker/src/progress.ts`)에 그대로 넣었더니 1.85초 만에 90%가 되어 끝까지 그대로였습니다. 로그 문장 `Book reaching PAGE on sheets:[#1#2]`의 "PAGE"를 마지막 단계로 착각하기 때문입니다. 단계 이름도 `Systems:` 안의 "STEMS", `Scale information`의 "SCALE"처럼 엉뚱하게 바뀝니다.
- **표지 쪽 문제**: 글자만 있는 표지 1쪽 + 악보 2쪽 PDF는 표지가 `flagged as invalid`로 표시된 뒤, 나머지 2쪽을 다 처리하고도 마지막에 `Could not export since transcription did not complete successfully`로 **전체가 실패**했습니다. 종료코드는 1이고 `.mxl`은 없습니다. 5.10.2는 70.3초, 5.11.0은 58.6초를 쓴 뒤 똑같이 실패했습니다.
- **복구 가능 확인**: 실패 후 남은 `out/input.omr`에서 `-sheets 2 3`으로 정상 쪽만 다시 내보내면 **6.3초 만에 35마디가 온전한 `input.mxl`**이 생겼습니다.
- **실패 분류 오류**: 악보가 아닌 PDF는 4.3초 만에 종료코드 1로 끝납니다. 앱은 종료코드부터 보기 때문에 "악보를 인식하지 못했습니다"가 아니라 "변환 엔진 오류"로 안내합니다. 프로젝트 자체 규칙(성공 판정은 결과 파일로)과도 어긋납니다.
- **`-save` 비용**: 2쪽 악보 기준 사용 시 61.6초·59.0초, 미사용 시 47.4초·47.0초였습니다(약 25% 차이). 하지만 위 복구에 필요해서 유지합니다(결정 D4).
- **권한 제한 PDF**: 비밀번호 없이 열리는 권한 제한 PDF를 엔진은 정상 변환했지만, 앱의 업로드 검증은 `ENCRYPTED_PDF`로 거부합니다.
- **결과 파일 속 서버 경로**: MXL 안의 `<source>`와 `source-file` 항목에 서버 경로(`/data/jobs/<작업ID>/input.pdf`)가 그대로 기록됩니다.
- **마디 수 집계 오류**: 검증 유틸이 `<measure-numbering>` 같은 다른 태그까지 세어 35마디를 37로, 106마디를 109로 보고합니다(품질 기록이 틀어짐).
- **타입 검사**: web·worker 모두 통과했습니다. 설치된 주요 버전은 Next 16.2.10, React 19.2.7, BullMQ 5.79.2, OSMD 2.0.0, pdf-lib 1.17.1, Tailwind 4.3.2입니다.

### 1.2 문제 목록

심각도: 🔴 출시 전 반드시 / 🟠 빨리 고칠 것 / 🟡 개선

| ID | 심각도 | 무엇이 문제인가 | 근거 | 해결 단계 |
|---|---|---|---|---|
| B1 | 🔴 | 진행률이 시작 2초 만에 90%로 고정 | 실측 재현, `worker/src/progress.ts` | V2-3 |
| B2 | 🔴 | 표지·해설 쪽이 섞이면 전체 실패, 앱은 "엔진 오류"로 안내 | 실측(5.10.2·5.11.0) | V2-4, V2-15 |
| B3 | 🟠 | 악보가 아닌 PDF를 "엔진 오류"로 안내 (종료코드 우선 판정) | 실측, `worker/src/audiveris.ts` 98행 | V2-4 |
| B4 | 🟡 | 결과 MXL에 서버 경로·작업 ID 기록 | 실측 | V2-11(선택) |
| B5 | 🟡 | 권한 제한만 걸린 PDF도 거부 (엔진은 변환 가능) | 실측, `web/src/lib/pdf.ts` | V2-11(안내 개선) |
| B6 | 🟠 | 실패 원인이 남지 않음: 엔진 출력을 버리고 코드만 기록 | 코드: `ConversionError.details`를 어디서도 쓰지 않음 | V2-4 |
| S1 | 🔴 | 운영에서도 3000번 포트 공개, Docker는 UFW 방화벽을 우회 | 코드: `docker-compose.yml`이 운영 설정에 합쳐짐 | V2-8 |
| S2 | 🔴 | 운영 이미지에 `HOSTNAME=0.0.0.0`이 없어 헬스체크 실패 → Caddy 미기동 가능성 높음 | 코드(Next 16.2.10 템플릿 확인), 실행 확인은 V2-2 | V2-8 |
| S3 | 🟠 | Vercel 설정: 화면만 배포되고 변환은 불가 | `vercel.json`, `docs/VERCEL.md` | V2-8 |
| S4 | 🟠 | `.dockerignore`가 없어 맥에서 web 이미지 빌드가 깨질 위험 | 코드: `web/Dockerfile`의 `COPY . .` | V2-1 |
| S5 | 🟡 | 잠금 파일 없이 설치(빌드마다 버전이 달라질 수 있음), worker 실행 스크립트 경로 오류 | 코드 | V2-7 |
| S6 | 🟡 | 업로드 횟수 제한의 INCR/EXPIRE가 분리돼 영구 차단 키가 남을 수 있음 | 코드: `rate-limit.ts` | V2-8 |
| S7 | 🟠 | Redis 장애 시 JSON이 아닌 500 응답 → 막연한 오류 | 코드: `api/jobs/route.ts`에 예외 처리 없음 | V2-9 |
| S8 | 🟠 | 워커 헬스체크가 항상 정상(`process.exit(0)`) | 코드: `docker-compose.yml` | V2-9 |
| S9 | 🟠 | 워커가 꺼져도 업로드 성공 → 영원히 대기 | 코드 | V2-9 |
| U1 | 🟠 | 대기 중인 작업이 "변환 중"으로 표시 | 코드: `jobs.ts`(BullMQ 기본 progress 0을 진행률로 전송) + `use-job-status.ts` | V2-5 |
| U2 | 🟠 | 실시간 연결(SSE)이 멈추면 상태를 한 번만 다시 확인하고 멈춤 | 코드: `use-job-status.ts` | V2-5 |
| U3 | 🟠 | 개발 모드에서 새로고침하면 작업 목록이 지워질 가능성 | 코드: `upload-app.tsx`(React StrictMode에서 저장 순서 문제) — 실측 필요 | V2-5 |
| U4 | 🟡 | 단계 라벨 4개(REDUCTION, CUE_BEAMS, CURVES, LINKS)가 영어로 노출 | 코드: `web/src/lib/ui.ts` | V2-3 |
| U5 | 🟡 | 다운로드 파일명이 "원본명-input.mxl" | 코드: `filenames.ts` | V2-11 |
| U6 | 🟡 | 만료된 작업 카드가 계속 쌓임 | 코드 | V2-5 |
| U7 | 🟡 | 링크 안에 버튼이 들어간 구조, 진행 막대에 접근성 정보 없음 | 코드: `job-card.tsx`, `progress.tsx` | V2-11 |
| U8 | 🟡 | 업로드 전송률·대기 순번·예상 시간 없음 | 코드 | V2-5, V2-11 |
| U9 | 🟡 | 잘못된 파일을 올려도 업로드 횟수가 차감됨 (5번 실수하면 10분 차단) | 코드: `api/jobs/route.ts` | V2-5 |
| Q1 | 🟠 | E2E 3개 중 2개가 실제로는 실패해도 통과할 수 있음 | 코드: `e2e/conversion.spec.ts` | V2-6 |
| Q2 | 🟡 | 단위 테스트가 0개 | 코드 | V2-3부터 |
| Q3 | 🟡 | 품질 기준선 미측정 (`docs/QUALITY.md`가 전부 "대기") | 문서 | V2-2 |
| Q4 | 🟡 | 마디 수를 실제보다 많게 셈 (35 → 37) | 실측, `worker/src/validate-mxl.ts` | V2-6 |
| E1 | — | Audiveris 5.11.0 출시(2026-07-11) | 공식 릴리스 | V2-14 |

그 밖의 작은 것: 엔진 출력의 청크 경계에서 줄이 잘리는 문제(V2-3), SSE 연결마다 리스너를 붙이는 구조(V2-5), 유지보수 작업을 예전 방식(`repeat`)으로 등록(V2-9), 품질 코퍼스의 쪽수 추정이 정규식 기반(V2-2), 화면 푸터의 엔진 버전이 하드코딩(V2-9).

### 1.3 잘 되어 있는 점 (고치다가 깨뜨리지 말 것)

- 업로드 검증 순서(크기 → `%PDF-` 확인 → 파싱 → 암호화 → 쪽수), 서버 UUID로 저장, 원본 파일명을 경로에 쓰지 않음
- 다운로드는 실제 결과 파일 목록에 있는 이름만 허용하고 경로 이탈을 한 번 더 검사, 한글 파일명 헤더 처리(`filename*`)
- 워커 격리(권한 제거, 읽기 전용, 내부 전용 네트워크, 프로세스 수 제한), 20분 타임아웃과 프로세스 그룹 종료
- 큐에는 `{ jobId }`만 싣고 경로는 각 프로세스가 `DATA_DIR`로 계산
- 한국어 오류 문구를 한 곳(`errors.ts`)에서 관리, AGPL 고지 푸터
- SSE 접속 시 이미 끝난 작업은 즉시 결과를 보내는 처리
- 결과 MXL 검증 유틸이 실제 Audiveris 결과를 정상으로 판정 (실측 5건)

### 1.4 조사 범위와 한계

- **확인한 것**: 저장소 전체 코드, 타입 검사, 공식 패키지(5.10.2·5.11.0)로 엔진 직접 실행(리눅스 x86_64, 1코어·4GB), 앱의 진행률·결과 검증·업로드 검증 함수를 실제 로그·결과·PDF로 실행
- **확인 못 한 것**: Docker 이미지 빌드(조사 환경에 Docker 없음), 웹 화면·SSE·E2E 실행, 운영 compose 리허설, Apple Silicon 빌드, 5.11.0의 일반 악보 비교(조사 환경에서 실행이 도중에 끊김), 한국어 가사 인식
- 시간 수치는 1코어 환경 기준이라 실제 서버에서는 더 빠를 수 있습니다. 그래서 V2-1·V2-2에서 사용자님의 맥으로 다시 측정합니다.

---

## 2. Phase 0 — 기준선: 실제로 돌려 보기

> "코드는 있는데 돌아가는지 모르는" 상태를 끝내는 단계입니다. 기능 코드는 거의 고치지 않고, 사용자님의 맥에서 실제로 실행해 사실을 기록합니다. 이후 모든 수정은 이 기록을 기준으로 "나아졌는지"를 판단합니다.

---

### V2-0 — 준비: 작업 브랜치, 설계서 반입, 규칙 보강

**목표**: 안전하게 되돌릴 수 있는 작업 공간을 만들고, 이번 조사로 확인된 엔진 동작과 품질 규칙을 `CLAUDE.md`에 넣어 이후 모든 세션이 같은 사실을 알고 시작하게 합니다.

#### 🙋 내가 먼저 할 일

1. 이 파일(`2차_개선_바이브코딩_프롬프트_설계서.md`)을 내려받아 **저장소 폴더 맨 위**(`CLAUDE.md`, `PROGRESS.md`가 있는 폴더)에 넣습니다. Finder에서 저장소 폴더를 열고 파일을 끌어다 놓으면 됩니다.
2. 터미널에서 저장소 폴더로 이동해 `claude`를 실행합니다.
3. `Shift+Tab`으로 plan 모드로 바꾼 뒤 아래 프롬프트를 붙여넣습니다.

#### 📋 프롬프트 V2-0

```text
CLAUDE.md, PROGRESS.md, docs/SPEC.md를 먼저 읽어라.
이번 STEP은 문서와 저장소 설정만 다룬다. 앱 코드는 수정하지 마라.

## 1) 작업 브랜치
- 현재 브랜치와 git status를 보고하라. 커밋되지 않은 변경이 있으면 멈추고 나에게 물어라.
- git switch -c v2 로 작업 브랜치를 만든다. 이후 모든 STEP은 v2 브랜치에서 진행한다.
  (main이 자동 배포에 연결돼 있을 수 있으므로 main 병합은 V2-10에서 내 승인 후에만)

## 2) 설계서 반입
- 저장소 루트의 "2차_개선_바이브코딩_프롬프트_설계서.md"를 docs/IMPROVEMENT_V2.md로 옮기고 git add.
  파일이 없으면 멈추고 알려라.

## 3) CLAUDE.md 보강
- docs/IMPROVEMENT_V2.md의 "부록 D. CLAUDE.md 추가 문안"을 기존 CLAUDE.md 끝에 추가한다.
  기존 규칙과 충돌하는 부분이 있으면 추가하기 전에 나에게 보여라.

## 4) .gitignore
- 지금의 samples/*.pdf 는 samples/real/ 같은 하위 폴더의 PDF를 막지 못한다.
  samples/**/*.pdf 로 바꾸고 "권리가 있는 실제 악보를 올리지 않기 위함"이라고 주석을 단다.
- git check-ignore -v samples/real/test.pdf 로 무시되는지 확인.

## 5) PROGRESS.md
- "2차 개선 트랙" 섹션을 추가하고 V2-0 ~ V2-16 체크리스트를 만든다 (V2-0만 [x]).
- 기존 STEP 0~9 옆에 "코드 작성 완료, 실측 미검증(V2-1·V2-2에서 검증)" 주석을 한 줄 붙인다.

## 완료 절차
- git diff --stat, CLAUDE.md에 추가된 부분 전문, check-ignore 결과를 보여라
- 커밋: "docs: v2 improvement plan and verified engine facts"
```

#### ✅ 완료 기준

- [ ] `v2` 브랜치에서 작업 중이다 (`git branch --show-current` 결과가 v2)
- [ ] `docs/IMPROVEMENT_V2.md`가 생겼고, `CLAUDE.md` 끝에 실측 사실과 품질 규칙이 추가됐다
- [ ] 앱 코드(`web/src`, `worker/src`)는 바뀌지 않았다

---

### V2-1 — 맥에서 엔진 실측: 워커 이미지, 스모크 테스트, 실제 로그 확보

**목표**: 사용자님의 맥에서 워커 이미지를 실제로 빌드하고, 이후 버그 수정의 시험 자료가 될 **실제 엔진 로그**를 저장소에 남깁니다.

#### 🙋 내가 먼저 할 일

1. 내 맥의 칩 확인: 화면 왼쪽 위 Apple 메뉴 → **이 Mac에 관하여** → "칩" 항목 (Apple M으로 시작하면 Apple 칩, Intel이면 Intel).
2. docker.com에서 **맥용 Docker Desktop**(내 칩에 맞는 것)을 설치하고 실행합니다.
3. Docker Desktop의 **설정(톱니바퀴) → Resources**에서 메모리를 **8GB 이상**으로 올리고 적용합니다. 메뉴 위치는 버전에 따라 조금 다를 수 있습니다. 맥의 RAM이 16GB보다 작으면 이 STEP을 시작할 때 Claude Code에 알려 주세요.
4. Docker Desktop이 켜진 상태에서 Claude Code를 실행합니다. 첫 빌드는 10~20분 걸릴 수 있습니다.

#### 📋 프롬프트 V2-1

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1, 부록 A·B)를 먼저 읽어라.
이번 STEP 목표: 이 맥에서 워커 Docker 이미지를 실제로 빌드하고, 실제 엔진 로그를 확보한다.
앱 기능 코드는 수정하지 않는다 (빌드를 막는 설정 문제만 최소로 고치고 보고).

## 0) 환경 점검 — 표로 보고
- uname -m (arm64면 Apple Silicon), docker version, docker info의 메모리·CPU, node -v, pnpm -v
  (pnpm이 없으면 corepack enable 후 확인)
- Docker 메모리가 8GB 미만이면 멈추고 늘리는 방법을 안내하라.

## 1) .dockerignore 추가 (web/, worker/ 각각)
- node_modules, .next, dist, coverage, playwright-report, test-results, *.log, .env*, .vercel
- 이유: web/Dockerfile의 COPY . . 가 맥의 node_modules(pnpm 심볼릭 링크, macOS용 네이티브 파일)를
  이미지 안에 덮어써서 빌드나 실행이 깨질 수 있다.

## 2) 테스트 악보 준비 (samples/ — git에는 올라가지 않음)
- 공개 악보(Mutopia Project)를 curl로 받는다:
  simple.pdf ← https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1-a4.pdf (2쪽)
  multi.pdf  ← https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59-a4.pdf (3쪽)
  gymno.pdf  ← https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1-a4.pdf
- web/scripts/make-fixtures.mjs를 만들어 pdf-lib(이미 web 의존성)만으로 생성:
  bad.pdf     = 글자만 있는 1쪽 (악보 아님)
  cover.pdf   = 글자만 있는 표지 1쪽 + simple.pdf 2쪽 (총 3쪽)
  pages21.pdf = 빈 쪽 21개 (쪽수 제한 시험용)
  실행: cd web && node scripts/make-fixtures.mjs → 파일별 쪽수 출력

## 3) 워커 이미지 빌드
- docker compose build worker (첫 빌드는 Audiveris 소스 빌드 때문에 10~20분 — 정상)
- 실패하면 에러 전문을 보여주고 임의로 우회하지 말 것. 특히 확인할 것:
  - app/build/distributions/app-5.10.2.tar 경로 (다르면 빌드 단계에서 ls로 실제 이름을 확인해 맞춤)
  - 실행 파일이 /opt/audiveris/bin/Audiveris 인지
- 성공하면 이미지 크기, 빌드 시간, 아키텍처(docker image inspect <이미지> --format '{{.Architecture}}')

## 4) 스모크 테스트 + 실측 로그 확보
- bash worker/smoke-test.sh <이미지명> 실행 결과 원문.
- simple.pdf, multi.pdf, bad.pdf, cover.pdf 각각을 워커와 똑같은 인자로 컨테이너에서 실행:
  -batch -export -save -output <out> -constant org.audiveris.omr.text.Language.defaultSpecification=eng -- <input.pdf>
  stdout+stderr 전체를 worker/test/fixtures/audiveris/<이름>.log로 저장하고,
  종료코드·소요 시간·생성 파일(이름과 크기)을 표로 보고.
- cover.pdf 복구 실험: 실패 후 남은 <out>/input.omr에서 정상 쪽만 다시 내보내기
  (docs/IMPROVEMENT_V2.md 부록 A-4의 명령) → .mxl 생성 여부, 위치, 소요 시간, 마디 수.
- 로그에 "Installed OCR languages: eng,kor"가 있는지 확인.
- JVM 최대 메모리가 의도(-Xmx4g)대로인지 확인 (변환 중 /proc/<pid>/cmdline 등으로).
  다르면 보고만 하고 수정은 V2-7에서.

## 5) 기록
- docs/V2_BASELINE.md 새로 작성: 환경, 빌드 시간, 스모크 결과, 4개 파일 실측 표, 복구 실험 결과,
  docs/IMPROVEMENT_V2.md 부록 A·B와 다른 점
- PROGRESS.md 갱신, 커밋: "chore(v2): dockerignore, fixtures, real engine baseline"
```

#### ✅ 완료 기준

- [ ] 워커 이미지가 빌드되고 스모크 테스트가 통과했다
- [ ] `worker/test/fixtures/audiveris/`에 실제 엔진 로그 4개가 저장됐다
- [ ] `docs/V2_BASELINE.md`에 내 맥에서의 변환 시간·결과와 표지 복구 실험 결과가 있다

#### 🔧 막혔을 때

- **Apple Silicon에서 워커 빌드 실패**: 에러 전문을 받은 뒤 "승인한다. platform: linux/amd64로 다시 빌드해"라고 답하세요. Docker Desktop이 인텔용 이미지를 에뮬레이션으로 돌려 느리지만 동작합니다. 참고로 Audiveris 5.10.2의 빌드 설정은 빌드하는 컴퓨터의 CPU에 맞는 OCR 라이브러리를 고르게 돼 있어(arm64 포함), 원칙적으로는 Apple Silicon에서도 빌드됩니다.
- **빌드 중 메모리 오류**: Docker 메모리를 더 올리거나 다른 앱을 닫고 다시 시도합니다.
- **curl로 악보를 못 받음**: 브라우저로 같은 주소를 열어 PDF를 받은 뒤 `samples/` 폴더에 해당 이름으로 넣으세요.

---

### V2-2 — 전 구간 진단 (고치지 않고 기록만)

**목표**: 업로드부터 다운로드까지, 그리고 운영 모드까지 실제로 돌려 보고 §1.2의 문제가 사용자님 환경에서도 재현되는지 기록합니다. **이 STEP에서는 아무것도 고치지 않습니다.** 무엇이 문제인지 정확히 알고 고쳐야 고친 뒤 비교할 수 있습니다.

#### 📋 프롬프트 V2-2

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md, docs/V2_BASELINE.md를 먼저 읽어라.
이번 STEP 목표: 코드를 고치지 않고, 현재 앱이 실제로 어떻게 동작하는지 전 구간을 실측해 기록한다.
고칠 것은 목록만 만든다. 진단용 임시 스크립트는 scripts/tmp/에 두고 커밋하지 말 것.

## A. 개발 모드 전체 흐름 (docker compose up --build)
1. curl로: simple.pdf 업로드 → 상태 조회 → SSE(curl -N) → 다운로드 → unzip -l. 응답 원문.
2. 오류 경로: 텍스트 파일(NOT_A_PDF), pages21.pdf(TOO_MANY_PAGES), 31MB 파일(FILE_TOO_LARGE),
   없는 작업 ID(404), bad.pdf와 cover.pdf(실제로 어떤 코드와 문구가 나오는지)
3. 진행률 관찰: simple.pdf 변환 중 SSE progress 값을 시간과 함께 기록
   (설계서 §1.1의 "2초 만에 90%" 현상이 재현되는지)
4. 브라우저: Playwright 스크립트로 업로드 → 카드 상태 변화(대기/변환 중/완료) 스크린샷,
   미리보기 스크린샷, 두 파일 연속 업로드 시 두 번째 카드의 표시, 새로고침 후 목록 유지 여부

## B. 운영 모드 리허설 (로컬)
- DOMAIN=localhost로 docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
- docker compose ps에서 web이 healthy가 되는지, caddy가 뜨는지 기록. 안 되면 로그로 원인 기록만
  (수정은 V2-8)
- 호스트에서 curl --max-time 5 http://localhost:3000 이 열리는지 기록 (운영인데 열리면 S1 재현)
- 끝나면 운영 모드 컨테이너를 내린다.

## C. E2E와 품질 코퍼스
- cd web && npx playwright install chromium (처음 1회) → RATE_LIMIT_DISABLED=1 npx playwright test 원문
- 품질 코퍼스 실행 → docs/QUALITY.md에 실제 수치

## D. 기록
- docs/V2_BASELINE.md에 "전 구간 실측" 섹션: 항목별 기대 vs 실제,
  설계서 §1.2 문제 목록 각각에 대해 "재현됨 / 재현 안 됨 / 확인 불가"와 근거
- 새로 발견한 문제는 V2-NEW-1, V2-NEW-2 … 형식으로 추가하고 어느 STEP에서 고칠지 제안
- 커밋: "docs(v2): full-cycle baseline measurements"
이 STEP에서 기능 코드를 수정하지 말 것.
```

#### ✅ 완료 기준

- [ ] 업로드 → 다운로드 전체 흐름의 원문 기록이 있다
- [ ] §1.2 문제 목록마다 "재현됨 / 재현 안 됨 / 확인 불가"가 적혀 있다
- [ ] `docs/QUALITY.md`에 실제 수치가 들어갔다
- [ ] 기능 코드는 바뀌지 않았다

> 운영 리허설에서 caddy가 뜨지 않거나 3000번이 열려도 **정상적인 진단 결과**입니다. V2-8에서 고칩니다.

---

## 3. Phase 1 — 확인된 버그 수정

> 사용자가 바로 체감하는 문제부터 고칩니다. 모든 STEP은 "먼저 실패하는 테스트 → 고치기 → 통과" 순서입니다.

---

### V2-3 — 진행률 정확하게 + 단위 테스트 도입

**목표**: 진행률이 실제 쪽과 단계에 맞춰 고르게 오르고, 화면에 "2/5쪽 · 음표 머리 찾는 중"처럼 보이게 합니다.

**왜 필요한가**: 지금 코드는 로그 한 줄에 "PAGE", "STEMS" 같은 단어가 들어 있기만 하면 그 단계로 판단합니다. 실제 로그로 재현한 결과는 이렇습니다(2쪽 악보, 약 60초 변환).

```text
  시간   기존 코드가 보낸 값    원인이 된 로그 줄
 1.65초    2% starting        Book | 2 sheets in …
 1.85초   90% PAGE            Book | Book reaching PAGE on sheets:[#1#2]   ← 시작 직후 90%
 4.80초   90% STEMS           PeakGraph | Systems: #1[1, 2] #2[3, 4] …    ← "Systems" 속 STEMS
 7.14초   90% STEMS           StemSeedsStep | stem(3 max:4)
58.41초   90% PAGE            [input#2] StepMonitoring | PAGE
59.98초   90% LOAD            SheetStub | Loaded /sheet#1/sheet#1.xml     ← 끝나기 직전 "불러오는 중"으로 되돌아감
```

엔진은 단계마다 `StepMonitoring | 단계이름` 줄을 쪽 번호와 함께 찍습니다(부록 A). 이 줄만 읽으면 정확하게 계산할 수 있습니다.

#### 📋 프롬프트 V2-3

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.1, V2-3, 부록 A)를 먼저 읽어라.
이번 STEP 목표: 진행률을 실제 쪽·단계 기준으로 정확하게 만든다. 단위 테스트를 이 STEP에서 처음 도입한다.
새 의존성 금지 (테스트는 node:test + worker에 이미 있는 tsx).

## 0) 테스트 환경
- worker/package.json에 "test": "node --import tsx --test \"src/**/*.test.ts\"" 추가
- 픽스처: V2-1에서 저장한 worker/test/fixtures/audiveris/*.log
  (없으면 docs/IMPROVEMENT_V2.md 부록 A의 발췌를 같은 폴더에 파일로 만들어 쓴다)

## 1) 먼저 실패하는 테스트 (고치기 전에 실행해 실패 원문을 보여라)
- simple(2쪽) 로그를 한 줄씩 넣었을 때:
  a) "Book reaching PAGE on sheets:[#1#2]" 줄 직후 pct가 5 미만 (지금 코드는 90)
  b) 2쪽 LOAD 시점 pct가 45~52
  c) pct가 절대 줄어들지 않고, 내보내기 전까지 93을 넘지 않음
  d) "Systems:", "Scale information", "MeasureStack", "Page#2.1", "Loaded /sheet#1" 같은 줄은
     단계(stage)를 바꾸지 않음
- bad(1쪽): 쪽 번호가 없는 "[input]" 줄도 1/1쪽으로 해석하고, invalid 쪽 [1]을 기록
- cover(3쪽): 1쪽 invalid 기록 후 2·3쪽 진행이 이어짐
- 로그를 7바이트씩 잘라 넣어도(스트림 청크 경계) 줄 단위로 넣은 것과 결과가 같음

## 2) 구현 — worker/src/progress.ts를 상태를 가진 추적기로 교체
- 아래 줄만 인식한다 (그 밖의 줄은 무시):
  - 전체 쪽수: /(\d+) sheets? in /
  - 처리 대상 쪽: /reaching PAGE on sheets:\[((?:#\d+)+)\]/   (V2-15의 쪽 범위 선택 대비)
  - 단계: /\[[^\]\s]*?(?:#(\d+))?\]\s+StepMonitoring\s+\d+\s+\|\s+([A-Z_]+)\s*$/  (#번호가 없으면 첫 쪽)
  - invalid 쪽: /Sheet \S*?(?:#(\d+))? flagged as invalid/
  - 내보내기: /Exporting sheet\(s\)/ → stage EXPORT(96), /exported to .*\.mxl/ → 97
- 계산: 대상 쪽이 n개일 때 쪽마다 20단계로 보고
  pct = 3 + floor(90 × 완료 단계 수 ÷ (n × 20)), 완료 단계 수 = (대상 쪽 중 현재 쪽의 순서) × 20 + (단계 순서 + 1).
  시작 전 2, EXPORT 96, 결과 확인(collecting) 98, 완료 100. 항상 이전 값 이상.
- progress 데이터: { pct, stage, sheet: { current, total } | null } (기존 pct·stage는 유지)
- audiveris.ts: stdout/stderr를 줄 단위로 처리 (남은 조각을 보관하는 버퍼 또는 node:readline)
- job.updateProgress는 최대 0.5초에 1번 (쪽이 바뀌거나 EXPORT 이후는 즉시)

## 3) 화면
- web/src/lib/ui.ts의 단계 라벨을 docs/IMPROVEMENT_V2.md "V2-3 단계 라벨 표"로 전부 교체.
  모르는 값은 영어 대신 "악보 분석 중".
- 카드에 "2/5쪽 · 음표 머리 찾는 중" 형식으로 표시 (sheet 정보가 있을 때만 쪽 표시)
- web의 progress 타입과 SSE 정규화 함수가 sheet 필드를 전달하게 수정

## 완료 절차
1. 테스트: 고치기 전 실패 원문 → 고친 뒤 통과 원문
2. worker/scripts/replay-progress.ts(새로 작성)로 simple 로그의 "시간 → pct·stage" 표 출력
3. docker compose로 실제 변환 1회: SSE 원문(curl -N)에서 pct가 쪽 단위로 고르게 오르는 것
4. 카드 스크린샷 ("1/2쪽 · …" 표시)
5. PROGRESS.md 갱신, 커밋: "fix(progress): sheet-aware progress parser with real-log tests"
```

#### V2-3 단계 라벨 표

| 값 | 화면 문구 | 값 | 화면 문구 |
|---|---|---|---|
| queued | 대기 중 | CUE_BEAMS | 작은 음표의 빔 찾는 중 |
| starting | 변환 준비 중 | TEXTS | 제목·가사 글자 읽는 중 |
| LOAD | 쪽 이미지 불러오는 중 | MEASURES | 마디 나누는 중 |
| BINARY | 흑백으로 정리하는 중 | CHORDS | 화음 묶는 중 |
| SCALE | 선 굵기·간격 재는 중 | CURVES | 이음줄 같은 곡선 기호 찾는 중 |
| GRID | 오선·마디줄 찾는 중 | SYMBOLS | 나머지 기호 찾는 중 |
| HEADERS | 음자리표·조표·박자표 찾는 중 | LINKS | 기호 연결하는 중 |
| STEM_SEEDS | 음표 기둥 후보 찾는 중 | RHYTHMS | 리듬 맞추는 중 |
| BEAMS | 빔(꼬리 묶음) 찾는 중 | PAGE | 쪽 마무리하는 중 |
| LEDGERS | 덧줄 찾는 중 | EXPORT | MXL 파일 만드는 중 |
| HEADS | 음표 머리 찾는 중 | collecting | 결과 확인하는 중 |
| STEMS | 음표 기둥 연결하는 중 | completed | 완료 |
| REDUCTION | 겹친 기호 정리하는 중 | (그 외) | 악보 분석 중 |

#### ✅ 완료 기준

- [ ] 2쪽 악보라면 1쪽이 끝날 무렵 약 50%, 끝나기 직전 93% 안팎으로 고르게 오른다
- [ ] 카드에 "몇 쪽 중 몇 쪽 · 무엇을 하는 중"이 한국어로 보인다
- [ ] `pnpm --filter @pdf-score-mxl/worker test`(또는 worker 폴더에서 `npm test`)가 통과한다

---

### V2-4 — 결과 판정 정확하게 + 표지 자동 복구 + 엔진 로그 보존

**목표**: 성공·실패를 로그와 결과 파일로 정확히 판정하고, 표지·해설 쪽 때문에 전체가 실패하는 경우를 자동으로 살려 냅니다. 실패하면 원인을 운영자가 추적할 수 있게 엔진 로그를 남깁니다.

**왜 필요한가** (실측):
- 악보가 아닌 PDF → 종료코드 1 → 지금은 "변환 엔진 오류"로 안내됩니다. 사용자는 서버 고장으로 오해합니다.
- 표지 1쪽 + 악보 2쪽 → 표지가 `flagged as invalid` → 나머지를 다 처리하고도 전체 실패. 5.10.2와 5.11.0 모두 같았습니다.
- 복구: 실패 후 남은 `out/input.omr`에서 정상 쪽만 `-sheets`로 다시 내보내면 **6.3초** 만에 35마디가 온전한 결과가 나왔습니다. 처음부터 다시 변환하는 것(약 47~60초)보다 훨씬 빠릅니다. 이 복구가 `-save`를 유지하는 이유입니다(결정 D4). 참고로 `-save`가 없어도 **성공한** 경우에는 마지막에 `.omr`이 저장됐지만, 실패한 경우에 온전한 `.omr`이 남는지는 확인하지 못했습니다.

#### 📋 프롬프트 V2-4

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.1, V2-4, 부록 A·B)를 먼저 읽어라.
이번 STEP 목표: 결과 판정을 로그와 결과 파일 기준으로 정확히 하고, 표지·해설 쪽 때문에 전체가 실패하는
문제를 자동 복구하며, 엔진 로그를 남긴다. 새 의존성 금지.
중요: -save 옵션은 유지한다 (복구에 필요). 제거하지 말 것.

## 1) 먼저 실패하는 테스트
- 새 worker/src/classify.ts의 판정 함수(순수 함수)를 픽스처 로그 + 가짜 결과 파일 목록으로 시험:
  bad → NO_OUTPUT / cover(복구 전) → 복구 대상(invalid [1], 정상 [2,3]) / simple → 성공 /
  타임아웃 → TIMEOUT / 로그에 "java.lang.OutOfMemoryError" → OUT_OF_MEMORY /
  실행 파일 없음(spawn ENOENT) → ENGINE_ERROR / .mxl은 있는데 검증 실패 → INVALID_OUTPUT

## 2) 판정 규칙 (위에서부터 순서대로)
1. 타임아웃 → TIMEOUT
2. out/*.mxl이 있고 모두 validateMxl 통과 → 성공 (invalid 쪽이 있었으면 warnings에 기록)
3. .mxl은 있는데 검증 실패 → INVALID_OUTPUT
4. .mxl 없음 + invalid 쪽이 있고 정상 쪽이 1개 이상 + out/input.omr 있음 → 복구 시도(아래 3)
5. .mxl 없음 + OutOfMemoryError → OUT_OF_MEMORY
6. .mxl 없음 + ("No system found" | "flagged as invalid" |
   "Could not export since transcription did not complete") → NO_OUTPUT
7. 그 외 → ENGINE_ERROR
종료코드는 참고 정보로만 기록한다 (CLAUDE.md 규칙: 성공 판정은 결과 파일로).

## 3) 표지·해설 쪽 자동 복구
- 2차 실행: Audiveris -batch -export -sheets <정상 쪽들> -- <out>/input.omr
  (-sheets 인자를 넘기는 모양은 실제 실행으로 확인. 실측에서는 결과가 -output과 관계없이 .omr 옆에 생겼다)
- 제한 시간은 전체 20분 중 남은 시간 안에서, 진행 표시는 EXPORT 단계
- .mxl이 생기고 검증을 통과하면 성공 + warnings: [{ code: "SKIPPED_PAGES", pages: [1] }]
- 복구도 실패하면 규칙 5~7로 판정. 정상 쪽이 0개면 복구하지 않고 NO_OUTPUT.

## 4) 엔진 로그 보존
- 엔진 stdout+stderr를 <jobDir>/engine.log에 스트림으로 저장 (메모리에 전부 쌓지 말 것)
- 판정에 필요한 신호(invalid 쪽, OOM 등)는 줄 단위로 추출해 보관
- job_completed / job_failed 구조화 로그에: code, 쪽수, invalidSheets, durationMs, recovered 여부,
  실패 시 engine.log 마지막 30줄
- 사용자 화면에는 로그 원문을 절대 보여주지 않는다

## 5) web 반영
- errors.ts: OUT_OF_MEMORY 추가 ("악보가 너무 크거나 복잡해 메모리가 부족했습니다. 쪽을 나눠서 다시
  시도해 주세요."), NO_OUTPUT 문구에 "표지만 있거나 악보가 아닌 PDF일 수 있습니다" 보강
- 작업 결과에 warnings 포함 → 완료 카드에 "1쪽은 악보로 인식되지 않아 제외했습니다" 안내

## 완료 절차
1. 테스트: 고치기 전 실패 → 고친 뒤 통과 원문
2. docker compose 실제 변환: bad.pdf → NO_OUTPUT 문구 / cover.pdf → 완료 + "1쪽 제외" 안내 /
   simple.pdf → 완료. 각각 워커 구조화 로그 한 줄과 소요 시간
3. cover.pdf 결과의 마디 수가 simple.pdf 결과와 같음을 확인
4. PROGRESS.md 갱신, 커밋: "fix(worker): log-based outcome classification, cover-page recovery"
```

#### ✅ 완료 기준

- [ ] 악보가 아닌 PDF는 "악보를 인식하지 못했습니다" 계열로 안내된다
- [ ] 표지가 있는 PDF도 변환되고, 어느 쪽이 빠졌는지 카드에 나온다
- [ ] 실패한 작업의 폴더에 `engine.log`가 남는다

---

### V2-5 — 화면 상태를 서버와 일치시키기

**목표**: 대기 중은 "대기 중 · N번째", 변환 중은 진행률, 끝나면 결과가 항상 정확히 보이게 합니다. 새로고침해도 목록이 남게 합니다.

**왜 필요한가** (코드 분석):
- BullMQ는 대기 중인 작업의 진행률 기본값이 0입니다. 서버가 이 0을 진행률로 보내고, 화면은 진행률을 받으면 "변환 중"으로 바꿉니다. 그래서 대기 중인데 "변환 중 0%"로 보입니다.
- 실시간 연결(SSE)이 조용히 끊기면 30초 뒤 상태를 딱 한 번 확인하고 끝납니다.
- 서버의 실패 이벤트 이름 `error`가 브라우저의 연결 오류 이벤트와 이름이 같아 헷갈립니다.
- 목록 불러오기와 저장이 따로 실행돼, 개발 모드(React StrictMode)에서 저장된 목록이 빈 목록으로 덮일 수 있습니다(코드상 유력, V2-2에서 재현 여부 확인).
- 잘못된 파일을 올려도 업로드 횟수(10분 5회)가 차감됩니다.

#### 📋 프롬프트 V2-5

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.2의 U1~U3·U6·U9)와 docs/V2_BASELINE.md를 먼저 읽어라.
이번 STEP 목표: 화면 상태가 서버의 실제 상태와 항상 일치하게. 새 의존성 금지.

## 1) 먼저 재현 (고치기 전 증거)
- 개발 모드에서 작업 2개를 연속 업로드 → 두 번째 카드가 "대기 중"이 아니라 "변환 중"으로 보이는
  스크린샷 (worker concurrency가 1이라 두 번째는 실제로 대기)
- 개발 모드에서 새로고침 → 목록이 사라지는지 (재현 여부를 그대로 보고)

## 2) 서버
- getJobStatus: waiting/delayed면 progress를 null로. queuePosition(1부터)을 포함
  (queue.getWaiting()에서 순서 계산 — 대기열이 작으므로 충분)
- SSE (/api/jobs/:id/events):
  - 연결 직후 event: status (전체 JobStatus) 1회
  - QueueEvents의 active → status(active), progress → progress, completed → done,
    failed → failed (실패 이벤트 이름을 error에서 failed로 변경, 클라이언트도 맞춤)
  - 대기 중이면 15초마다 status를 다시 보내 순번 갱신 (핑 겸용)
  - QueueEvents 리스너는 모듈에 1세트만 두고 jobId별 구독자 목록(Map)으로 나눠 준다
    (연결마다 리스너를 붙이면 동시 연결이 10개를 넘을 때 경고가 나고 누수 위험)
  - 이미 닫힌 스트림에 쓰거나 닫을 때 예외가 나지 않게 보호
- 업로드 횟수 제한은 작업이 실제로 등록된 경우에만 차감. 검증 실패 시도는 별도의 넉넉한 한도
  (예: 10분 30회)로 남용만 막는다.

## 3) 클라이언트 (useJobStatus)
- 상태는 서버가 보낸 status/progress/done/failed로만 바꾼다 (progress로 active를 추측하는 로직 삭제)
- 20초 동안 이벤트가 없고 아직 안 끝났으면 5초 간격 폴링 → 이벤트가 다시 오거나 끝나면 중지
- 404(만료) → "만료됨" 상태: 흐린 카드 + "결과가 삭제되었습니다(24시간 경과)" + 목록에서 지우기 버튼
- 대기 중 카드: "대기 중 · N번째 순서"

## 4) 목록 저장 (upload-app.tsx)
- 불러오기가 끝난 뒤에만 저장 (hydrated 플래그), 24시간 지난 항목 자동 정리, 최대 30개

## 5) 테스트
- 순수 함수로 뺀 상태 매핑(대기 → progress null 등)과 횟수 제한 판단에 단위 테스트
  (web에 tsx devDependency가 필요하면 먼저 물어라 — 이미 worker에서 쓰는 도구라 추천)
- 1)의 재현 시나리오를 고친 뒤 다시 실행해 해결된 스크린샷

## 완료 절차
1. 고치기 전/후 스크린샷 (대기 카드, 새로고침 후 목록)
2. 대기 작업의 SSE 원문: status(순번) → status(active) → progress… → done
3. 브라우저를 10초간 오프라인으로 만들었다가 복구해도 카드가 끝까지 갱신되는 증거
4. 잘못된 파일 6번 업로드 후에도 정상 업로드가 되는 원문
5. PROGRESS.md 갱신, 커밋: "fix(web): accurate job states, resilient SSE, safe list persistence"
```

#### ✅ 완료 기준

- [ ] 두 번째 작업이 "대기 중 · 1번째 순서"로 보이다가 차례가 되면 진행률로 바뀐다
- [ ] 새로고침해도 목록이 남고, 오래된 작업은 "만료됨"으로 정리된다
- [ ] 연결이 잠깐 끊겨도 결과가 결국 표시된다

---

### V2-6 — 테스트를 믿을 수 있게

**목표**: 테스트가 "진짜로 실패하면 실패"하게 만들고, V2-3~V2-5에서 고친 동작을 테스트로 고정합니다.

**왜 필요한가** (코드 분석, E2E 3개 중 2개):
- 1번 시나리오의 `getByText("완료")`는 업로드 직후 안내 문구("업로드가 완료되어…")에도 걸려 **변환이 끝나기 전에 통과**할 수 있습니다. 미리보기 확인 선택자의 `svg`는 화면의 아이콘에도 걸려, **악보가 안 그려져도 통과**할 수 있습니다.
- 3번 시나리오는 bad.pdf 결과로 "인식 실패"와 "엔진 오류" 문구를 **둘 다 허용**해서, 실패 분류 버그(B3)를 가립니다.
- 검증 유틸이 `<measure-numbering>`까지 마디로 세어 품질 기록이 틀어집니다(35마디 → 37).

#### 📋 프롬프트 V2-6

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.2의 Q1·Q4)를 먼저 읽어라.
이번 STEP 목표: E2E 테스트가 진짜 실패하면 실패하게 하고, V2-3~V2-5의 동작을 E2E로 고정한다.

## 1) 선택자 안정화
- data-testid 추가: job-card, job-status, job-progress, job-error, job-warning, score-preview,
  download-link (문구가 바뀌어도 테스트가 흔들리지 않게)
- 상태 확인은 정확 일치: 카드 안의 job-status가 정확히 "완료"
- 미리보기: score-preview 안의 악보에서 음표 요소가 1개 이상
  (실제 렌더된 DOM을 확인해 선택자를 정하라 — 아이콘 svg와 구분되는 것)

## 2) 시나리오
A. simple.pdf: 업로드 → "n/2쪽" 진행 표시 → 완료 → 미리보기 음표 존재 → 다운로드 파일이 validateMxl 통과
B. 텍스트 파일: 화면에서 거부 문구
C. bad.pdf: 정확히 NO_OUTPUT 문구 (ENGINE_ERROR 문구면 실패)
D. cover.pdf: 완료 + "1쪽 제외" 안내 + 미리보기 성공
E. 연속 2개 업로드: 두 번째가 "대기 중 · 1번째 순서" → 이후 완료
F. 새로고침 후 목록 유지
G. API: pages21.pdf → TOO_MANY_PAGES, 없는 ID → 404 (Playwright request 사용)

## 3) 검증 유틸 정확도 (worker/src/validate-mxl.ts)
- measureCount가 <measure-numbering> 같은 다른 태그까지 센다 (실측: 35마디 → 37).
  <measure 뒤에 공백이나 > 가 오는 경우만 세고, 파트별 마디 수(measuresPerPart)도 함께 반환.
- 단위 테스트: 부록 A의 실측 결과 기준 simple 35, multi 106

## 4) 실행과 "되돌림 확인"
- cd web && RATE_LIMIT_DISABLED=1 npx playwright test → 전 시나리오 통과 원문
- 일부러 버그를 되돌렸을 때 테스트가 실패하는지 확인: 예) worker/src/progress.ts만 V2-3 이전 버전으로
  임시 복원 → A가 실패하는 원문 → 즉시 원복. 원복 후 git status가 깨끗한지 보여라.

## 5) (선택 — 먼저 묻고 진행) GitHub Actions
- push할 때 타입 검사 + 단위 테스트만 도는 가벼운 워크플로 (Docker·Audiveris 없이)

## 완료 절차
1. playwright test 원문(7개), 되돌림 시 실패 원문, 단위 테스트 원문
2. PROGRESS.md 갱신, 커밋: "test: strict e2e assertions, v2 regression scenarios, exact measure count"
```

#### ✅ 완료 기준

- [ ] E2E 7개가 모두 통과하고, 버그를 되돌리면 실패하는 것을 확인했다
- [ ] 마디 수가 실제와 같게 나온다 (simple 35, multi 106)

---

## 4. Phase 2 — 출시 전 필수: 빌드·보안·운영

> 이 Phase가 끝나야 외부에 공개할 수 있습니다. V2-10에서 실제 서버에 올립니다.

---

### V2-7 — 빌드를 매번 똑같이 (재현성)

**목표**: 누가 언제 빌드해도 같은 라이브러리 버전이 들어가고, 엔진 버전을 한 줄로 바꿀 수 있게 합니다.

**왜 필요한가**: 지금 Dockerfile은 잠금 파일(lockfile, 설치 버전을 고정해 두는 파일) 없이 `npm install`을 해서 빌드할 때마다 버전이 달라질 수 있습니다. 또 JVM 메모리 옵션(`JAVA_OPTS`)이 실제로 적용되는지 확인할 방법이 없습니다. 참고로 공식 패키지판 실행 파일은 `JAVA_OPTS`를 무시하고 자체 설정의 `-Xmx8G`를 쓰는 것을 실측으로 확인했습니다(부록 B).

#### 📋 프롬프트 V2-7

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.2의 S4·S5, 부록 B)를 먼저 읽어라.
이번 STEP 목표: Docker 빌드 재현성과 엔진 버전 전환 준비. 기능 변화는 없다.

## 1) 잠금 파일 기반 설치
- 지금 web/worker Dockerfile은 package.json만 복사해 npm install 한다 → 저장소 루트의
  pnpm-lock.yaml이 쓰이지 않아 빌드마다 버전이 달라질 수 있다.
- 목표: 이미지 안의 설치 버전이 pnpm-lock.yaml과 정확히 같게 한다.
  방법은 둘 중 하나를 골라 장단점과 함께 먼저 제안하고 내 승인을 받아라:
  (a) compose의 build context를 저장소 루트로 바꾸고 pnpm install --frozen-lockfile --filter 사용
  (b) pnpm deploy로 패키지별 독립 폴더를 만들어 복사
- 주의: Next.js standalone 출력은 모노레포 루트 기준으로 빌드하면 server.js 위치가
  .next/standalone/web/server.js 처럼 바뀔 수 있다. 실제 위치를 확인해 CMD를 맞춰라.
- 검증: 이미지 안에서 next, bullmq, opensheetmusicdisplay, pdf-lib의 실제 버전을 출력해
  pnpm-lock.yaml의 버전과 일치함을 표로 보여라.

## 2) 워커 이미지 정리
- ARG AUDIVERIS_VERSION=5.10.2 추가: git clone 브랜치와 tar 파일명이 이 값을 쓰게 하고,
  이미지 라벨(org.opencontainers.image.version 등)에도 기록한다.
- JVM 옵션은 JAVA_TOOL_OPTIONS 환경변수로 준다. JVM이 항상 읽고 로그 첫 줄에
  "Picked up JAVA_TOOL_OPTIONS: ..."를 남기므로 적용 여부를 로그로 확인할 수 있다.
  compose의 JAVA_OPTS 값도 이쪽으로 옮긴다. -Xmx는 컨테이너 메모리 제한보다 1GB 이상 작게.
- gradle 빌드에 BuildKit 캐시 마운트(RUN --mount=type=cache,target=/root/.gradle)를 적용해
  재빌드 시간을 줄인다. 캐시 없는 첫 빌드와 재빌드 시간을 각각 측정해 보고.
- worker/package.json의 "start" 스크립트를 실제 산출물 경로(dist/src/worker.js)에 맞춘다
  (지금은 dist/worker.js로 되어 있어 틀리다).

## 3) (선택 — 먼저 묻고 진행) 공식 .deb 설치 경로
- Audiveris는 ubuntu24.04 x86_64용 공식 .deb를 배포한다. 소스 빌드 대신 쓰면 빌드가 빨라지지만
  x86_64 전용이다(Apple Silicon 맥에서는 에뮬레이션 필요). 적용한다면:
  - dpkg -i 대신 dpkg-deb -x 로 풀 것 (컨테이너에서는 설치 후 스크립트가
    "xdg-desktop-menu: No writable system menu directory found"로 실패하는 것을 실측 확인)
  - JVM 옵션은 JAVA_TOOL_OPTIONS로만 적용된다 (패키지 실행 파일은
    /opt/audiveris/lib/app/Audiveris.cfg의 -Xmx8G를 쓰고 JAVA_OPTS를 읽지 않음)
- VPS에서 빌드가 너무 느릴 때만 진행한다.

## 완료 절차
1. 캐시 없는 빌드 1회 + 재빌드 1회 소요 시간, 이미지 크기
2. 스모크 테스트 통과 원문, 엔진 로그의 "Picked up JAVA_TOOL_OPTIONS: -Xmx..." 줄
3. 단위 테스트·타입 검사 통과 원문
4. PROGRESS.md 갱신, 커밋: "build: lockfile-based images, engine version arg"
새 의존성이 필요하면 먼저 물어라.
```

#### ✅ 완료 기준

- [ ] 이미지 안 라이브러리 버전이 lockfile과 같다 (표로 확인)
- [ ] 엔진 로그에 JVM 메모리 옵션이 적용됐다는 줄이 보인다
- [ ] `AUDIVERIS_VERSION` 값 하나로 엔진 버전을 바꿀 수 있다

---

### V2-8 — 운영 보안 설정 (배포 전 필수)

**목표**: 운영 서버에서 HTTPS 서버(Caddy)가 정상적으로 뜨고, HTTPS를 거치지 않고는 앱에 접근할 수 없게 합니다.

**왜 필요한가** (쉬운 설명):
- Next.js 운영 서버는 `HOSTNAME`이라는 환경변수에 적힌 주소로만 접속을 받습니다(설치된 Next 16.2.10 코드에서 `process.env.HOSTNAME || '0.0.0.0'` 확인). 그런데 Docker는 이 변수에 컨테이너 ID를 자동으로 넣습니다. 그러면 컨테이너 안의 헬스체크(`127.0.0.1:3000`)가 실패하고, "web이 건강해야 시작"하도록 묶인 Caddy가 아예 뜨지 못할 수 있습니다.
- 개발용 설정(`docker-compose.yml`)의 `3000:3000` 포트 공개가 운영에서도 그대로 합쳐집니다. Docker가 연 포트는 서버 방화벽(UFW) 규칙을 우회하므로, `http://서버IP:3000`으로 HTTPS 없이 바로 접속됩니다. 이 경로로는 IP 헤더를 위조해 업로드 횟수 제한도 피할 수 있습니다.
- Vercel 설정은 화면만 배포되고 변환은 절대 동작할 수 없는 상태입니다(결정 D1).

#### 📋 프롬프트 V2-8

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.2의 S1~S3·S6)와 docs/DEPLOY.md를 먼저 읽어라.
이번 STEP 목표: 운영 배포를 막거나 위험하게 만드는 설정 수정. 기능 변화 없음.

## 1) 개발 전용 포트 분리
- docker-compose.yml에서 web의 "3000:3000", redis의 "127.0.0.1:6379:6379" 포트 공개를 빼서
  새 파일 docker-compose.override.yml로 옮긴다.
  (compose는 -f 없이 실행하면 override 파일을 자동으로 합치고, 운영 명령처럼 -f를 명시하면
   합치지 않는다 → 개발은 지금과 같고, 운영에서는 포트가 열리지 않는다)
- 검증: docker compose -f docker-compose.yml -f docker-compose.prod.yml config 결과에 web·redis의
  ports가 없고, docker compose config(개발)에는 있음을 원문으로 보여라.
- CLAUDE.md 명령어 설명과 docs/DEPLOY.md에 이 구조와
  "Docker가 공개한 포트는 UFW 방화벽 규칙을 우회한다"는 주의를 반영.

## 2) Next.js 운영 서버 바인딩
- web Dockerfile의 production 스테이지에 ENV HOSTNAME=0.0.0.0 추가
  (Next standalone server.js는 process.env.HOSTNAME으로 바인딩하는데 Docker가 이 변수에
   컨테이너 ID를 넣는다 → 127.0.0.1 헬스체크 실패 → caddy 미기동)
- 검증: 로컬 운영 리허설(DOMAIN=localhost)에서 docker compose ps로 web healthy, caddy running.

## 3) Caddyfile 보강
- 응답 헤더: X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin,
  X-Frame-Options SAMEORIGIN(V2-12의 원본 대조 뷰가 같은 사이트 iframe을 쓰므로), Server 헤더 제거.
- HSTS는 실제 도메인일 때만 넣는다(DOMAIN이 localhost면 넣지 않음).
- 압축(encode)을 켜려면 SSE 경로(/api/jobs/*/events)는 반드시 제외. 확신이 없으면 압축은 넣지 말 것.
- request_body max_size 35MB 유지.

## 4) 요청 제한 원자화
- rate-limit.ts는 INCR 후 별도 EXPIRE를 한다. 그 사이에 프로세스가 죽으면 만료 없는 키가 남아
  그 IP가 영구 차단된다. MULTI(INCR + EXPIRE ... NX) 또는 Lua 한 번으로 원자적으로 바꾼다.
- IP는 Caddy가 넣는 X-Forwarded-For 첫 값을 쓰되, "web은 Caddy 뒤에서만 접근 가능하다"는
  전제를 주석으로 남긴다.
- 순수 함수로 분리해 단위 테스트 추가.

## 5) Vercel 설정 정리 (결정 D1)
- vercel.json, docs/VERCEL.md 삭제 → docs/DEPLOY.md에
  "Vercel 단독 배포는 지원하지 않음 (큐 워커·공유 디스크·장시간 작업이 필요하기 때문)" 3줄 추가.
- 코드 밖에서 내가 해야 할 일(Vercel 프로젝트 연결 해제)을 마지막 보고에 적어라.

## 완료 절차
1. 로컬 운영 리허설: docker compose ps (web healthy, caddy up), curl -kI https://localhost 헤더 원문
2. 운영 모드에서 호스트의 curl --max-time 5 http://localhost:3000 이 실패하는 원문 (포트 비공개 증거)
3. 개발 모드(docker compose up)는 여전히 3000으로 열리는 증거
4. RATE_LIMIT_DISABLED=0 상태에서 정상 업로드 6회 → 6번째가 429인 원문
5. PROGRESS.md 갱신, 커밋: "fix(ops): prod port isolation, next hostname, caddy headers"
```

#### ✅ 완료 기준

- [ ] 운영 리허설에서 web이 healthy, caddy가 실행 중이다
- [ ] 운영 모드에서 3000번 포트로는 접속되지 않는다
- [ ] 개발 모드 사용법은 그대로다

#### 🙋 내가 할 일 — Vercel 연결 해제

제가 사용자님의 Vercel 계정은 확인하지 않았습니다. 이 저장소가 Vercel 프로젝트와 연결돼 있다면 main에 올릴 때마다 동작하지 않는 사이트가 배포됩니다.

1. vercel.com에 로그인 → 이 저장소와 연결된 프로젝트를 엽니다.
2. **Settings → Git**에서 저장소 연결을 끊거나(Disconnect), 필요 없다면 **Settings → General** 맨 아래에서 프로젝트를 삭제합니다.
3. 메뉴 이름은 Vercel 화면 개편에 따라 조금 다를 수 있습니다. 찾기 어려우면 화면을 캡처해 Claude에게 보여 주세요.

---

### V2-9 — 고장 나도 알 수 있게 (관측·복구·취소)

**목표**: 워커가 멈추거나 Redis가 죽어도 사용자가 "영원히 대기"하지 않게 하고, 운영자는 원인을 알 수 있게 합니다. 사용자가 변환을 취소할 수 있게 합니다.

**왜 필요한가**: 지금은 워커가 꺼져 있어도 업로드가 성공하고 작업이 끝없이 "대기 중"으로 남습니다. 워커 헬스체크는 `process.exit(0)`만 실행해서 항상 '정상'으로 나옵니다. Redis가 죽으면 업로드 API가 JSON이 아닌 오류 페이지를 돌려줘, 화면에는 막연한 오류만 뜹니다.

#### 📋 프롬프트 V2-9

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.2의 S7~S9)를 먼저 읽어라.
이번 STEP 목표: 상태 확인 API, 워커 생존 신호, 장애 시 명확한 안내, 작업 취소.
새 의존성 금지. BullMQ 기능은 설치된 버전(5.79.x)의 타입 정의와 공식 문서로 확인하고 근거를 보여라.

## 1) 상태 API
- /api/health는 지금처럼 가볍게 유지 (Docker healthcheck용, 외부 의존 없음)
- 새 GET /api/status: { redis: "ok"|"down", workers: <queue.getWorkersCount()>, waiting, active,
  diskFreeBytes(DATA_DIR 기준 fs.statfs), engineVersion } — 각 조회는 1초 타임아웃,
  일부가 실패해도 200으로 부분 결과 반환. 내부 경로·호스트명 같은 정보는 넣지 말 것.
- 화면: 처음 열 때와 60초마다 /api/status 확인 → workers가 0이면 상단 배너
  "변환 서버를 점검하고 있습니다. 잠시 후 다시 시도해 주세요." + 업로드 버튼 비활성.
- 푸터의 엔진 버전 표기를 하드코딩(5.10.2) 대신 engineVersion 값으로 (AGPL 고지 정확성).

## 2) 장애 응답
- POST /api/jobs 전체를 try/catch:
  Redis 오류 → 503 SERVICE_UNAVAILABLE / 워커 0개 → 503 WORKER_UNAVAILABLE /
  디스크 여유 2GB 미만 → 503 STORAGE_FULL. 모두 { error: { code, message } } JSON,
  한국어 메시지는 errors.ts에 추가.
- 상태·파일·SSE 라우트도 Redis 오류 시 JSON 503(SSE는 failed 이벤트)을 돌려주게.

## 3) 워커 생존 신호
- 워커가 30초마다 Redis ping에 성공하면 /tmp/worker-heartbeat 파일에 현재 시각 기록
  (/tmp는 tmpfs라 read_only 컨테이너에서도 쓸 수 있다).
- compose의 worker healthcheck를 "하트비트가 90초 이내인가" 검사로 교체.
- 테스트용 스위치 HEARTBEAT_DISABLED=1 (unhealthy 전환 검증용, 운영에는 설정 금지).

## 4) 작업 취소
- DELETE /api/jobs/:id
  - 대기 중 → job.remove() 후 작업 폴더 삭제
  - 변환 중 → 워커에 취소 요청 전달(Redis pub/sub 채널 또는 짧은 TTL 키 중 택1, 이유 설명).
    워커는 BullMQ Worker의 cancelJob(jobId)과 처리 함수의 AbortSignal(5.79 타입 정의에 있음)로
    받아 Audiveris 프로세스 그룹을 종료하고 CANCELLED로 끝낸다(재시도 없음).
  - 이미 끝난 작업 → 409
- errors.ts: CANCELLED "변환을 취소했습니다."
- 작업 ID를 아는 사람만 취소할 수 있다(추측 불가능한 UUID). 이 전제를 주석으로 남겨라.
- 화면: 대기·변환 중 카드에 "취소" 버튼(확인 대화상자 포함).

## 5) 유지보수 작업 등록 방식
- maintenance.ts의 queue.add(..., { repeat })를 queue.upsertJobScheduler(...)로 교체해
  재시작 때마다 중복 등록될 위험을 없앤다. 예전 방식으로 남은 반복 작업이 있으면 1회 정리.

## 완료 절차 (각 장애를 일부러 만들어 증거 제시)
1. docker compose stop worker → /api/status의 workers 0, 배너 스크린샷, 업로드 503 원문 → start 후 복구
2. docker compose stop redis → 업로드·상태 API가 JSON 503을 돌려주는 원문 → 복구
3. HEARTBEAT_DISABLED=1로 워커 재기동 → 2분 안에 unhealthy → 원복 후 healthy
4. 대기 중 취소 / 변환 중 취소 각각: 카드 스크린샷 + 워커 로그(엔진 프로세스 종료 확인)
5. 워커를 3번 재시작한 뒤에도 유지보수 스케줄러가 1개뿐인 증거
6. 단위 테스트·E2E 통과, PROGRESS.md 갱신,
   커밋: "feat(ops): status api, heartbeat, cancel, clear outage errors"
```

#### ✅ 완료 기준

- [ ] 워커나 Redis가 멈추면 화면과 API가 이유를 알려 준다
- [ ] 멈춘 워커는 헬스체크에서 unhealthy로 보인다
- [ ] 대기·변환 중인 작업을 취소할 수 있다

---

### V2-10 — 실서버 배포 (VPS)

**목표**: Phase 0~2의 결과를 실제 서버에 올리고, 인터넷에서 전체 흐름이 되는지 확인합니다.

#### 🙋 내가 먼저 준비할 것

1. **VPS 1대**: 4 vCPU / 8GB RAM 이상, Ubuntu 24.04 (기존 설계서의 권장 사양). 사용자가 주로 한국에 있다면 서울·도쿄처럼 가까운 지역을 고르는 것이 좋습니다. 가격은 업체마다 달라 직접 비교해야 합니다.
2. **도메인 1개**와 DNS A 레코드(도메인 → 서버 IP). 도메인이 없으면 HTTPS 인증서를 받을 수 없습니다.
3. **맥에서 서버로 SSH 접속**이 되는 상태 (업체 안내에 따라 SSH 키 등록).

> 참고: 1코어 테스트 환경에서 2쪽 악보가 약 47~60초 걸렸습니다(부록 B). 4코어 서버에서는 더 빠를 것으로 예상되지만, V2-2의 실측으로 확인하세요.

#### 📋 프롬프트 V2-10

```text
CLAUDE.md, PROGRESS.md, docs/DEPLOY.md, docs/IMPROVEMENT_V2.md를 먼저 읽어라.
이번 STEP 목표: V2 변경을 반영한 실서버 배포. 나는 개발자가 아니다.
서버에서 실행할 명령은 한 번에 한 블록씩, 각 명령이 무엇을 하는지 한 줄 설명과 함께 줘라.
내가 결과를 붙여 넣으면 판정한 뒤 다음 블록을 줘라.
(내가 따로 요청하기 전에는 서버에 직접 접속해 명령을 실행하지 말 것)

## 사전 확인 (나에게 물어볼 것)
- 서버 IP, 도메인, SSH 접속 사용자 이름
- DNS: 맥에서 dig +short <도메인> 결과가 서버 IP인지

## 절차
1. docs/DEPLOY.md를 V2 기준(override 분리, HOSTNAME, 상태 API, 하트비트)으로 갱신하고 커밋
2. v2 브랜치를 main에 병합할지 나에게 묻고, 승인하면 병합 후 push
3. 서버: Docker 설치 → 방화벽(22/80/443) → git clone → .env 작성(DOMAIN) → 운영 compose 기동
4. 배포 후 점검 (내가 결과를 붙여 넣으면 판정):
   - https://<도메인> 접속, 인증서 정상
   - 맥에서 curl --max-time 5 http://<서버IP>:3000 → 접속 불가여야 정상
   - https://<도메인>/api/status → redis ok, workers 1
   - simple.pdf 업로드 → 진행률이 쪽 단위로 오르는지 → 완료 → 미리보기 → 다운로드
   - docker compose ps 전부 healthy, 워커 로그의 job_completed 한 줄
5. docs/DEPLOY.md 끝에 운영 수칙 정리: 갱신 방법, 로그 보는 법, 장애 시 확인 순서, 디스크 확인

주의: .env 같은 비밀 값은 커밋하지 말 것.
```

#### ✅ 완료 기준

- [ ] 도메인으로 HTTPS 접속이 되고, 서버IP:3000으로는 접속되지 않는다
- [ ] 실제 인터넷에서 업로드 → 진행률 → 미리보기 → 다운로드가 된다
- [ ] 배포·갱신·장애 확인 방법이 DEPLOY.md에 정리돼 있다

---

## 5. Phase 3 — 사용성

---

### V2-11 — 업로드와 작업 카드 다듬기

**목표**: 업로드가 얼마나 됐는지, 내 차례가 언제인지, 실패하면 무엇을 해야 하는지 화면만 보고 알 수 있게 합니다.

#### 📋 프롬프트 V2-11

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(§1.2의 U5~U8, B4~B5)를 먼저 읽어라.
이번 STEP 목표: 업로드와 작업 카드의 사용성 개선. 새 의존성 금지.

## 1) 업로드
- fetch 대신 XMLHttpRequest로 업로드해 전송률(%)을 보여주고, 전송 중 취소(xhr.abort) 가능하게
- 한 번에 여러 파일(최대 5개)을 놓으면 순서대로 업로드 → 파일마다 카드 생성
- 거부 사유를 구체적으로: "PDF가 아닙니다" / "30MB를 넘습니다" / "한 번에 5개까지" 
  (react-dropzone의 fileRejections 오류 코드 사용)
- 보안 PDF 안내 구체화 (결정 D3 — 거부는 유지):
  "보안이 설정된 PDF(열람 암호 또는 권한 제한)는 변환할 수 없습니다. 보안이 없는 원본 PDF로 다시
   올려 주세요." 암호 해제 도구 안내 같은 우회 방법은 쓰지 말 것.

## 2) 작업 카드
- 원본 정보: 쪽수·크기 (metadata.json의 값을 상태 API에 meta로 포함)
- 경과 시간, 대기 순번(V2-5), 예상 남은 시간: 최근 완료 20건의 "쪽당 평균 초"를 워커가 Redis 목록에
  기록하고(LPUSH + LTRIM), 화면은 "약 N분 (예상)"으로 표시. 기록이 3건 미만이면 표시하지 않음.
- 실패 카드: 코드별 해결 안내 (예: NO_OUTPUT → "인쇄 악보인가요? / 300DPI 이상인가요? /
  표지·해설 쪽이 있다면 쪽 범위에서 빼 보세요") + "다시 시도" 버튼
  (POST /api/jobs/:id/retry → 같은 input.pdf로 새 작업 생성, 레이트리밋 적용)
- 완료 카드: 제외된 쪽 안내(V2-4의 warnings), "24시간 후 삭제" 안내는 한 번만

## 3) 다운로드 파일명
- "원본명-input.mxl" → "원본명.mxl", 다악장은 "원본명 (1악장).mxl"
- ASCII 대체 이름 + filename*(UTF-8) 방식은 유지하고, 한글 파일명이 정상인지 확인

## 4) (선택) 결과 파일 속 서버 경로 정리 — 신중하게
- Audiveris는 MXL 안의 <source>와 <miscellaneous-field name="source-file">에 서버 경로
  (/data/jobs/<작업ID>/input.pdf)를 기록한다(실측). 이를 원본 파일명으로 바꾼다.
- MXL은 zip이다. 새 의존성 없이 Node zlib(deflateRawSync, crc32)로 다시 쓰고, 다시 쓴 파일이
  validateMxl을 통과하고 OSMD 미리보기가 되는지 확인. 어느 단계든 실패하면 원래 파일을
  그대로 제공 (손상 파일을 주는 것이 최악의 실패다).
- 단위 테스트: 다시 쓴 zip이 unzip -t를 통과하고, 바꾼 부분 외 XML이 동일함.

## 5) 접근성·모바일
- <a> 안에 <button>이 들어간 구조 제거 (링크 자체를 버튼 모양으로)
- 진행 막대에 role="progressbar"와 aria-valuenow/valuemin/valuemax, 상태 변화는 aria-live로
- 390px 폭(모바일)에서 카드·버튼이 넘치지 않는지 스크린샷

## 완료 절차
1. 스크린샷: 업로드 전송률, 여러 파일 업로드, 대기 순번+예상 시간, 실패 카드 안내,
   제외된 쪽 안내, 모바일 폭
2. 한글 파일명으로 다운로드된 파일 이름 확인
3. (4를 했다면) 경로가 바뀐 XML 부분 원문 + 검증 통과
4. 단위 테스트·E2E 통과, PROGRESS.md 갱신,
   커밋: "feat(ux): upload progress, queue eta, retry, clean filenames"
```

#### ✅ 완료 기준

- [ ] 업로드 전송률과 내 대기 순번이 보인다
- [ ] 실패하면 무엇을 해 보면 되는지 카드에 나온다
- [ ] 다운로드 파일 이름이 "원본명.mxl" 형태다
- [ ] 모바일 폭에서 화면이 깨지지 않는다

---

### V2-12 — 미리보기 개선 + 원본과 나란히 보기

**목표**: "제대로 변환됐나?"를 원본과 비교해서 빠르게 판단할 수 있게 합니다. 사용자가 가장 오래 쓰는 시간은 변환 자체보다 **결과가 맞는지 확인하는 시간**이므로, 확인을 빠르게 해 주는 화면이 곧 경쟁력입니다.

#### 📋 프롬프트 V2-12

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md를 먼저 읽어라.
이번 STEP 목표: 결과를 원본과 비교하며 확인하기 쉽게. 1차는 새 의존성 없이.

## 1) 미리보기
- 확대/축소(OSMD zoom, 50~200%), 기본은 화면 폭 맞춤, 전체 화면 보기
- 상단 요약: 파트 수, 파트별 마디 수, 인식에서 제외된 쪽(있으면)
- 렌더 실패 문구는 기존처럼 "변환 실패와 다르다"는 점을 유지

## 2) 원본 PDF 보기 (의존성 없는 1차안)
- GET /api/jobs/:id/source → input.pdf를 Content-Type: application/pdf,
  Content-Disposition: inline, X-Content-Type-Options: nosniff로 제공 (작업 ID 검증은 기존 방식)
- 데스크톱(1024px 이상): 왼쪽 원본(iframe, 브라우저 내장 PDF 뷰어) / 오른쪽 변환 결과(OSMD).
  "원본 N쪽" 선택 시 iframe 주소 끝을 #page=N으로 바꿔 이동 (Chrome·Firefox 지원, Safari는 제한적)
- 모바일: "원본 / 변환 결과" 탭 전환, 원본은 "새 탭에서 열기" 링크로
  (모바일 브라우저는 iframe 속 PDF를 제대로 못 보여주는 경우가 많다)
- V2-8에서 X-Frame-Options를 SAMEORIGIN으로 뒀는지 확인

## 3) (선택 — 승인 후) pdfjs-dist로 쪽 단위 동기화
- 1차안으로 부족할 때만. pdfjs-dist 추가 승인을 먼저 요청하라 (버전, 번들 크기 영향, 라이선스 포함).

## 완료 절차
1. 데스크톱 나란히 보기 스크린샷, 쪽 이동 동작, 모바일 탭 스크린샷
2. 확대/축소 3단계 스크린샷
3. 테스트 통과, PROGRESS.md 갱신, 커밋: "feat(preview): zoom and side-by-side source view"
```

#### ✅ 완료 기준

- [ ] 데스크톱에서 원본과 결과를 나란히 볼 수 있다
- [ ] 모바일에서도 원본과 결과를 오가며 볼 수 있다

---

### V2-13 — (선택) 디자인 새로 입히기

**목표**: 지금 화면은 동작에는 문제가 없지만 흔한 템플릿 느낌(청록 강조색, 같은 모양 둥근 카드의 반복, 작은 고정폭 숫자)입니다. "악보"라는 주제에서 나온 개성 있는 화면으로 바꿉니다. **기능 단계를 모두 마친 뒤에** 하세요. 이 STEP은 제안을 먼저 받고, 사용자님이 고른 안으로만 구현합니다.

#### 📋 프롬프트 V2-13

```text
CLAUDE.md, PROGRESS.md를 먼저 읽어라. 이번 STEP은 두 단계다. 1단계는 제안만 하고 멈춘다.

## 브리프
- 주제: 인쇄 악보를 디지털 악보(MusicXML)로 옮기는 도구. 핵심 가치는 "결과를 믿고 확인할 수 있음"
- 사용자: 한국의 음악 교사·학생·편곡자. 모바일 사용 비중이 높다
- 화면의 주 임무: PDF 올리기 → 진행 확인 → 원본과 비교 → 다운로드
- 기억에 남을 요소는 한 곳에만. 1순위 후보: 진행률을 오선(5줄) 위에 표현하고 쪽마다 한 마디씩
  채워지는 방식 (더 나은 아이디어가 있으면 근거와 함께 제안)

## 피할 것 (흔한 AI 생성 화면의 기본값)
- 크림색 배경 + 세리프 제목 + 테라코타 강조 / 어두운 배경 + 형광 강조색 하나
- 모든 내용을 같은 둥근 카드·같은 그림자로 자르기, 장식용 그라데이션
- 제목 위의 작은 대문자 라벨, "A · B · C" 식 메타 줄, 작은 고정폭 숫자 라벨, 버튼 글자 끝의 화살표

## 1단계 (제안만)
- 디자인 계획 2안: 색 4~6개(이름 + HEX), 글꼴과 역할(한글 지원, next/font로 로드 — 새 npm 의존성
  없이), 레이아웃(모바일·데스크톱 ASCII 와이어프레임), 원칙 3줄
- 각 안이 "악보"라는 주제에서 어떻게 나왔는지 설명. 흔한 기본값과 겹치는 부분이 있으면 스스로 고친 뒤
  무엇을 왜 고쳤는지 적어라.
- 여기서 멈추고 내 선택을 기다려라.

## 2단계 (내가 고른 뒤)
- 선택한 안으로 구현. 기능·문구·테스트 ID(data-testid)는 유지.
- 품질 바닥선: 모바일 360px까지, 키보드 초점 표시, prefers-reduced-motion 존중, 명도 대비 WCAG AA
- 움직임은 사용자 행동에 대한 반응과 진행률 한 곳에만
- 모바일·데스크톱 × (빈 화면, 변환 중, 완료, 실패) 스크린샷 → E2E 통과 →
  커밋: "feat(design): score-inspired visual refresh"
```

#### ✅ 완료 기준

- [ ] 두 가지 안을 스크린샷이 아닌 계획(색·글꼴·배치)으로 먼저 비교해 골랐다
- [ ] 고른 안이 모바일에서도 읽기 쉽고, 기존 테스트가 모두 통과한다

---

## 6. Phase 4 — 품질·차별화

---

### V2-14 — 엔진 5.11.0 비교 후 업그레이드 결정

**목표**: Audiveris 5.11.0으로 올릴지 **데이터로** 결정합니다. 비교와 추천은 Claude Code가, 결정은 사용자님이 합니다.

**알고 있는 것**: 5.11.0(2026-07-11 출시)에는 불완전한 스캔에서 일괄 내보내기를 중단시키던 오류 수정 등이 들어 있습니다(공식 릴리스 노트). 이번 조사에서 표지 포함 PDF는 5.11.0에서도 똑같이 실패했으므로, **업그레이드만으로 표지 문제가 풀리지는 않습니다** — V2-4의 복구는 계속 필요합니다. 일반 악보의 결과 비교는 조사 환경에서 끝까지 실행하지 못해 아직 모릅니다.

#### 🙋 내가 먼저 할 일

- 실제로 변환해 보고 싶은 악보 PDF를 **5개 이상** 준비해 `samples/real/` 폴더에 넣습니다. 표지가 있는 것, 스캔본, 여러 악기, 한국어 가사가 있는 것 등 다양할수록 좋습니다. 사용 권리가 있는 파일만 쓰세요. (V2-0에서 이 폴더의 PDF는 git에 올라가지 않게 설정했습니다)

#### 📋 프롬프트 V2-14

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(V2-14, 부록 B), docs/QUALITY.md를 먼저 읽어라.
이번 STEP 목표: Audiveris 5.11.0으로 올릴지 비교 데이터와 추천을 만든다. 결정은 내가 한다.

## 1) 두 이미지
- V2-7의 AUDIVERIS_VERSION으로 5.10.2와 5.11.0 워커 이미지를 각각 빌드 (태그를 구분)
- 5.11.0의 Java 요구 버전이나 빌드 방법이 바뀌었는지 공식 저장소에서 확인하고 보고

## 2) 비교 실행 (같은 조건, 파일마다 2회씩)
- samples/ 전체 + samples/real/ 전체
- 항목: 결과 코드, 평균 소요 시간, 파트별 마디 수, validateMxl 통과, invalid 쪽, 복구 여부,
  제목·가사 텍스트 유무, (V2-16 이후라면) 확인 필요 마디 수
- 로그 형식 회귀: 5.11.0 로그로 V2-3 진행률 테스트와 V2-4 판정 테스트를 다시 돌려라.
  형식이 달라졌으면 5.11.0 픽스처를 추가하고, 파서가 두 버전 모두 통과하게 고쳐라.
- 결과가 다르게 나온 파일은 첫 쪽 미리보기를 나란히 캡처

## 3) 보고
- docs/QUALITY.md에 비교표, 요약 3줄, 추천(올린다/보류)과 근거
- 여기서 멈추고 내 결정을 기다려라

## 4) (내가 "올린다"고 하면)
- CLAUDE.md 버전 고정표, docs/SPEC.md, 스모크 테스트, 기본 AUDIVERIS_VERSION을 5.11.0으로 갱신
- 화면 푸터 표기가 상태 API의 engineVersion으로 5.11.0이 나오는지 확인
- 전체 테스트 통과 후 커밋: "chore(engine): upgrade audiveris to 5.11.0"
```

#### ✅ 완료 기준

- [ ] 두 버전의 비교표가 `docs/QUALITY.md`에 있다
- [ ] 진행률·판정 테스트가 두 버전 로그 모두에서 통과한다
- [ ] 업그레이드 여부를 표를 보고 결정했다

---

### V2-15 — 쪽 범위 선택 + 가사 언어(한국어)

**목표**: 업로드 전에 "변환할 쪽"과 "가사 언어"를 고를 수 있게 합니다. 표지·해설 쪽을 미리 빼면 V2-4의 복구 없이 더 빨리 끝나고, 한국어 가사 악보도 제대로 읽을 수 있습니다.

**알고 있는 것**: 5.10.2 도움말에 `-sheets int[] : Select sheet numbers and ranges (1 4-5)` 옵션이 있고, 한국어 OCR 데이터는 이미 이미지에 들어 있습니다(`Installed OCR languages: eng,kor`). 지금 워커는 언어를 `eng`로 고정해 두었습니다.

#### 🙋 내가 먼저 할 일

- 한국어 가사가 있는 악보 PDF 1개 이상을 `samples/real/`에 넣습니다 (사용 권리가 있는 파일).

#### 📋 프롬프트 V2-15

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(V2-15)를 먼저 읽어라.
이번 STEP 목표: 업로드 전에 "변환할 쪽"과 "가사 언어"를 고를 수 있게 한다. 새 의존성 금지.

## 1) 화면
- 업로드 영역 위에 옵션 2개 (기본값은 지금과 같은 동작):
  - 변환할 쪽: 전체(기본) / 직접 입력 (예: "2-5, 7")
  - 가사 언어: 영어(기본) / 한국어 / 한국어+영어
- 여러 파일을 한 번에 올리면 같은 옵션이 모두에 적용된다고 안내

## 2) 서버
- 옵션은 업로드 요청에 함께 보내고 서버에서 다시 검증:
  - 쪽 범위: 숫자·쉼표·하이픈만, 1 ≤ 쪽 ≤ 실제 쪽수, 중복 제거, 최대 20쪽 → 어기면 PAGE_RANGE_INVALID
  - 언어: 허용 목록 {eng, kor, kor+eng} 밖이면 거부
- 큐 데이터는 계속 { jobId }만 (CLAUDE.md 규칙). 옵션은 작업 폴더의 metadata.json에 저장하고 워커가 읽는다.

## 3) 워커
- 쪽 범위 → -sheets 인자. 여러 값과 범위를 어떤 모양으로 넘겨야 하는지 실제 실행으로 확인하고 보고
- 언어 → -constant org.audiveris.omr.text.Language.defaultSpecification=<값>
- 진행률: 일부 쪽만 처리할 때 "reaching PAGE on sheets:[#2#3]" 기준으로 분모가 바뀌는지 테스트
  (V2-3 파서가 이미 지원해야 한다 — 테스트로 확인)

## 4) 검증
- cover.pdf를 쪽 범위 "2-3"으로 → 복구 없이 바로 성공(invalid 쪽 없음), 전체 변환보다 짧은 시간
- 한국어 가사 악보로 eng와 kor+eng 비교: MusicXML의 <lyric> 안 <text> 개수와 앞부분 10개 원문을 표로
- docs/QUALITY.md에 가사 비교 결과 추가
- PROGRESS.md 갱신, 커밋: "feat: page range selection and lyrics language option"
```

#### ✅ 완료 기준

- [ ] 표지를 뺀 쪽 범위로 올리면 경고 없이 바로 성공한다
- [ ] 한국어 가사 악보에서 한국어 설정이 영어 설정보다 가사를 제대로 읽는다 (표로 확인)

---

### V2-16 — 확인이 필요한 마디 표시

**목표**: 오인식 가능성이 높은 마디를 자동으로 찾아 "확인이 필요한 마디"로 알려 줍니다. "결과를 믿고 확인할 수 있게"라는 이 앱의 핵심 가치에 가장 직접적인 기능입니다.

**알고 있는 것**: 실제 엔진 로그에는 `StackRhythm … | S1 MeasureStack#1 no correct rhythm`처럼 엔진 스스로 리듬을 맞추지 못한 마디를 알리는 줄이 있습니다(바흐 프렐류드 변환에서 2건). 여기에 MusicXML의 박자 계산을 더하면 두 가지 신호로 찾을 수 있습니다.

#### 📋 프롬프트 V2-16

```text
CLAUDE.md, PROGRESS.md, docs/IMPROVEMENT_V2.md(V2-16, 부록 A)를 먼저 읽어라.
이번 STEP 목표: 오인식 가능성이 높은 마디를 찾아 "확인이 필요한 마디"로 보여준다. 새 의존성 금지.

## 신호 두 가지
1. MusicXML 계산: 파트·마디마다 음표 길이 합(<chord/>가 붙은 화음의 둘째 음, <grace/> 꾸밈음 제외,
   <backup>/<forward>로 성부 구분)을 박자표(<time>)와 <divisions>로 계산한 기대 길이와 비교.
   첫 마디(못갖춘마디)와 implicit="yes" 마디는 예외 처리.
2. 엔진 로그: "StackRhythm … | S<n> MeasureStack#<m> no correct rhythm" 줄.
   이 번호가 실제 마디 번호와 어떻게 대응되는지 픽스처로 확인하고, 확실하지 않으면 1번 신호만 쓴다.

## 구현
- 워커: 검증 후 결과에 suspectMeasures: [{ file, part, measure, reason }] 포함 (최대 50개)
- 화면: 완료 카드에 "확인이 필요한 마디 2곳: 1, 15" → 누르면 미리보기에서 해당 마디로 이동,
  가능하면 해당 마디 강조 (OSMD 2.0 API로 가능한 방법을 조사해 먼저 제안한 뒤 구현)
- 문구는 단정하지 않기: "자동 점검 결과입니다. 표시된 마디는 원본과 비교해 보세요."

## 테스트
- 음표 하나를 지운 MusicXML 픽스처 → 해당 마디가 잡힘
- 직접 만든 정상 4/4 두 마디 MusicXML → 0건
- simple.pdf 실측: 계산 결과와 엔진 로그 신호를 비교한 표

## 완료 절차
- 테스트 통과, 표시·이동 스크린샷, docs/QUALITY.md에 파일별 확인 필요 마디 수 추가
- PROGRESS.md 갱신, 커밋: "feat: suspect measure detection"
```

#### ✅ 완료 기준

- [ ] 일부러 망가뜨린 악보에서 해당 마디가 잡히고, 정상 악보에서는 잡히지 않는다
- [ ] 카드의 마디 번호를 누르면 미리보기에서 그 마디로 이동한다

> 기존 설계서의 백로그 10-E(`.omr` 파일 제공 — `-save` 유지로 준비됨)와 10-F(MIDI 내보내기)는 이 다음에 기존 설계서 STEP 10의 프롬프트를 그대로 쓰면 됩니다.

---

## 7. 트러블슈팅

| 증상 | 원인 | 처방 |
|---|---|---|
| 진행률이 시작하자마자 90%에서 멈춤 | 단어가 포함된 줄로 단계를 추측하는 계산 | V2-3 |
| 표지가 있는 PDF가 실패하거나 "엔진 오류"로 나옴 | 엔진이 악보가 아닌 쪽 하나 때문에 전체 내보내기를 중단 | V2-4 자동 복구, V2-15 쪽 범위 |
| 악보가 아닌 PDF에 "엔진 오류" | 종료코드 1을 엔진 고장으로 판정 | V2-4 |
| web 이미지 빌드 중 `Cannot find module`이나 네이티브 모듈 오류 | `.dockerignore`가 없어 맥의 node_modules가 복사됨 | V2-1의 1) |
| 운영에서 caddy가 안 뜨고 web이 unhealthy | Docker가 넣은 HOSTNAME으로 Next가 바인딩 | V2-8의 2) |
| `http://서버IP:3000`으로 접속됨 | 개발용 포트 공개가 운영에 합쳐짐 + Docker의 방화벽 우회 | V2-8의 1) |
| 업로드는 되는데 계속 "대기 중" | 워커가 꺼졌거나 멈춤 | V2-9 상태 배너, `docker compose ps`와 `docker compose logs worker` 확인 |
| 대기 중인데 "변환 중 0%"로 보임 | 대기 작업의 기본 진행률 0을 진행으로 오해 | V2-5 |
| 개발 모드에서 새로고침하면 목록이 사라짐 | 목록 저장 순서 문제(StrictMode) | V2-5의 4) |
| 제목·가사가 비어 있음 | 언어 설정(기본 eng) 또는 OCR 데이터 문제 | 엔진 로그의 `Installed OCR languages` 확인, V2-15 |
| 큰 악보 변환 중 컨테이너가 죽음 | 메모리 부족 | `JAVA_TOOL_OPTIONS`의 -Xmx와 컨테이너 한도(V2-7), OUT_OF_MEMORY 안내(V2-4) |
| `-Xmx`를 바꿨는데 적용이 안 됨 | 실행 파일 종류에 따라 `JAVA_OPTS`를 무시 | `JAVA_TOOL_OPTIONS` 사용, 로그의 `Picked up` 줄 확인 (V2-7) |
| Apple Silicon에서 워커 빌드 실패 | 네이티브 라이브러리 또는 빌드 도구 문제 | V2-1의 🔧 (`platform: linux/amd64`) |
| 공식 .deb 설치 중 `xdg-desktop-menu` 오류 | 컨테이너에 데스크톱 메뉴 폴더가 없음 | `dpkg-deb -x`로 풀기 (V2-7의 3) |
| E2E가 너무 빨리 통과 | 느슨한 선택자 | V2-6 |
| 코드를 고쳤는데 개발 compose 화면이 그대로 | 개발 compose는 소스 코드를 연결(마운트)하지 않음 | `docker compose up --build`, 또는 CLAUDE.md의 "웹만 로컬" 실행 |
| 마디 수가 실제보다 많게 나옴 | 검증 유틸이 `<measure-numbering>`까지 셈 | V2-6의 3) |
| 테스트 명령이 "tsx를 찾을 수 없음" | web 폴더에는 tsx가 없음 | worker 폴더에서 실행하거나, 승인 후 web에 추가 (V2-5) |

---

## 8. 부록

### 부록 A. 실제 Audiveris 5.10.2 로그 발췌 (시험 자료)

> 조사 환경에서 공식 패키지로 실제 변환한 로그입니다. 진행률·판정에 필요한 줄만 남겼고, 시각 표시는 뺐으며, 경로는 운영 서버 형태(`/data/jobs/<작업ID>/`)로 바꿨습니다. 실제 로그에는 `Stored /sheet#1/…` 같은 줄이 훨씬 많이 섞여 있습니다. V2-1에서 사용자님의 맥으로 전체 로그를 다시 저장해 시험 자료로 씁니다. 첫 줄의 `-Xmx2g`는 조사 환경의 값이고, 저장소 설정은 `-Xmx4g`입니다.

#### A-1. 정상: 2쪽 악보 (바흐 프렐류드 1번)

```text
Picked up JAVA_TOOL_OPTIONS: -Xmx2g -Djava.awt.headless=true
INFO  []                      Main 250  | Running in batch mode
INFO  []                 Languages 138  | Installed OCR languages: eng,kor
INFO  [input]                      Book 560  | 2 sheets in /data/jobs/3f2b9c1e-7a4d-4c1b-9e2f-5d6a7b8c9d01/input.pdf
INFO  []                      Book 1929 | Book reaching PAGE on sheets:[#1#2]
INFO  [input#1]            StepMonitoring 98   | LOAD
INFO  [input#1]            StepMonitoring 98   | BINARY
INFO  [input#1]            StepMonitoring 98   | SCALE
INFO  [input#1]            StepMonitoring 98   | GRID
INFO  [input#1]                 PeakGraph 310  | Systems: #1[1, 2] #2[3, 4] #3[5, 6] #4[7, 8] #5[9, 10] #6[11, 12]
INFO  [input#1]            StepMonitoring 98   | HEADERS
INFO  [input#1]            StepMonitoring 98   | STEM_SEEDS
INFO  [input#1]             StemSeedsStep 86   | stem(3 max:4)
INFO  [input#1]            StepMonitoring 98   | BEAMS
INFO  [input#1]            StepMonitoring 98   | LEDGERS
INFO  [input#1]            StepMonitoring 98   | HEADS
INFO  [input#1]             HeadSeedTally 235  | Scale information: HeadSeeds{NOTEHEAD_VOID[L:0.5] NOTEHEAD_BLACK[L:0.5,R:-0.3]}
INFO  [input#1]            StepMonitoring 98   | STEMS
INFO  [input#1]            StepMonitoring 98   | REDUCTION
INFO  [input#1]             ReductionStep 105  | Stems free length median value: 63 pixels, 3.0 interlines
INFO  [input#1]            StepMonitoring 98   | CUE_BEAMS
INFO  [input#1]            StepMonitoring 98   | TEXTS
INFO  [input#1]            StepMonitoring 98   | MEASURES
INFO  [input#1]            StepMonitoring 98   | CHORDS
INFO  [input#1]            StepMonitoring 98   | CURVES
INFO  [input#1]            StepMonitoring 98   | SYMBOLS
INFO  [input#1]            StepMonitoring 98   | LINKS
INFO  [input#1]            StepMonitoring 98   | RHYTHMS
INFO  [input#1]               StackRhythm 224  | S1 MeasureStack#1 no correct rhythm
INFO  [input#1]               StackRhythm 224  | S1 MeasureStack#2 no correct rhythm
INFO  [input#1]               StackRhythm 224  | S2 MeasureStack#4 no correct rhythm
INFO  [input#1]               StackRhythm 224  | S2 MeasureStack#5 no correct rhythm
INFO  [input#1]               StackRhythm 224  | S2 MeasureStack#6 no correct rhythm
INFO  [input#1]            StepMonitoring 98   | PAGE
INFO  [input#2]            StepMonitoring 98   | LOAD
INFO  [input#2]            StepMonitoring 98   | BINARY
INFO  [input#2]            StepMonitoring 98   | SCALE
INFO  [input#2]            StepMonitoring 98   | GRID
INFO  [input#2]                 PeakGraph 310  | Systems: #1[1, 2] #2[3, 4] #3[5, 6] #4[7, 8] #5[9, 10] #6[11, 12]
INFO  [input#2]            StepMonitoring 98   | HEADERS
INFO  [input#2]            StepMonitoring 98   | STEM_SEEDS
INFO  [input#2]             StemSeedsStep 86   | stem(3 max:4)
INFO  [input#2]            StepMonitoring 98   | BEAMS
INFO  [input#2]            StepMonitoring 98   | LEDGERS
INFO  [input#2]            StepMonitoring 98   | HEADS
INFO  [input#2]             HeadSeedTally 235  | Scale information: HeadSeeds{NOTEHEAD_VOID[L:0.5] NOTEHEAD_BLACK[L:0.5,R:-0.3]}
INFO  [input#2]            StepMonitoring 98   | STEMS
INFO  [input#2]            StepMonitoring 98   | REDUCTION
INFO  [input#2]             ReductionStep 105  | Stems free length median value: 66 pixels, 3.1 interlines
INFO  [input#2]            StepMonitoring 98   | CUE_BEAMS
INFO  [input#2]            StepMonitoring 98   | TEXTS
INFO  [input#2]            StepMonitoring 98   | MEASURES
INFO  [input#2]            StepMonitoring 98   | CHORDS
INFO  [input#2]            StepMonitoring 98   | CURVES
INFO  [input#2]            StepMonitoring 98   | SYMBOLS
INFO  [input#2]            StepMonitoring 98   | LINKS
INFO  [input#2]             SymbolsLinker 258  | No chord linked to OctaveShiftInter#7114{(0.177) staff:12 QUINDICESIMA BASSA} at java.awt.Point[x=1454,y=3280]
INFO  [input#2]            StepMonitoring 98   | RHYTHMS
INFO  [input#2]                PageRhythm 199  | {Page#2.1} Time value reused from sheet#1
INFO  [input#2]               StackRhythm 224  | S6 MeasureStack#15 no correct rhythm
INFO  [input#2]            StepMonitoring 98   | PAGE
INFO  [input]           PartwiseBuilder 2706 | Exporting sheet(s): [#1#2]
INFO  [input]             ScoreExporter 164  | Score input exported to /data/jobs/3f2b9c1e-7a4d-4c1b-9e2f-5d6a7b8c9d01/out/input.mxl
INFO  [input]                     Score 181  | Closing {Score 1}
(종료코드 0, 61.6초)
```

읽는 법: `[input#1]`의 `#1`이 쪽 번호입니다. 쪽마다 LOAD부터 PAGE까지 20단계가 찍힙니다. `Systems:`, `stem(3 max:4)`, `Scale information`, `MeasureStack`, `Page#2.1`, `Loaded /sheet#1` 줄은 진행률 계산에 쓰면 안 되는 줄(기존 버그의 원인)입니다. `no correct rhythm` 줄은 V2-16의 신호입니다.

#### A-2. 실패: 악보가 아닌 1쪽 (글자만 있는 PDF)

```text
Picked up JAVA_TOOL_OPTIONS: -Xmx2g -Djava.awt.headless=true
INFO  []                      Main 250  | Running in batch mode
INFO  []                 Languages 138  | Installed OCR languages: eng,kor
INFO  [input]                      Book 560  | 1 sheet in /data/jobs/8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e02/input.pdf
INFO  []                      Book 1929 | Book reaching PAGE on sheets:[#1]
INFO  [input]            StepMonitoring 98   | LOAD
INFO  [input]            StepMonitoring 98   | BINARY
INFO  [input]            StepMonitoring 98   | SCALE
INFO  [input]            StepMonitoring 98   | GRID
WARN  [input]                 PeakGraph 305  | No system found
INFO  [input]                 SheetStub 1194 | Sheet input flagged as invalid.
INFO  [input]                      Book 596  | Could not export since transcription did not complete successfully
WARN  [input]                       CLI 956  | Exception occurred java.lang.Exception: Error in export
java.lang.Exception: Error in export
	at org.audiveris.omr.CLI$ProcessingTask.processBook(CLI.java:930)
	at org.audiveris.omr.CLI$CliTask.call(CLI.java:513)
WARN  []                      Main 364  | Exception on input, java.lang.Exception: Error in export
java.lang.Exception: Error in export
WARN  []                      Main 298  | Exit forced. Failure
(종료코드 1, 4.3초)
```

읽는 법: 1쪽짜리는 `[input]`처럼 쪽 번호가 없습니다. GRID 단계에서 `No system found` → `flagged as invalid` → 내보내기 실패 → 종료코드 1. 이것은 엔진 고장이 아니라 **인식 실패(NO_OUTPUT)** 입니다.

#### A-3. 실패: 표지 1쪽 + 악보 2쪽

```text
INFO  [input]                      Book 560  | 3 sheets in /data/jobs/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c03/input.pdf
INFO  []                      Book 1929 | Book reaching PAGE on sheets:[#1#2#3]
INFO  [input#1]            StepMonitoring 98   | LOAD
INFO  [input#1]            StepMonitoring 98   | BINARY
INFO  [input#1]            StepMonitoring 98   | SCALE
INFO  [input#1]            StepMonitoring 98   | GRID
WARN  [input#1]                 PeakGraph 305  | No system found
INFO  [input#1]                 SheetStub 1194 | Sheet input#1 flagged as invalid.
INFO  [input#2]            StepMonitoring 98   | LOAD
INFO  [input#2]            StepMonitoring 98   | BINARY
INFO  [input#2]            StepMonitoring 98   | SCALE
INFO  [input#2]            StepMonitoring 98   | GRID
INFO  [input#2]            StepMonitoring 98   | HEADERS
INFO  [input#2]            StepMonitoring 98   | STEM_SEEDS
INFO  [input#2]            StepMonitoring 98   | BEAMS
INFO  [input#2]            StepMonitoring 98   | LEDGERS
INFO  [input#2]            StepMonitoring 98   | HEADS
INFO  [input#2]            StepMonitoring 98   | STEMS
INFO  [input#2]            StepMonitoring 98   | REDUCTION
INFO  [input#2]            StepMonitoring 98   | CUE_BEAMS
INFO  [input#2]            StepMonitoring 98   | TEXTS
INFO  [input#2]            StepMonitoring 98   | MEASURES
INFO  [input#2]            StepMonitoring 98   | CHORDS
INFO  [input#2]            StepMonitoring 98   | CURVES
INFO  [input#2]            StepMonitoring 98   | SYMBOLS
INFO  [input#2]            StepMonitoring 98   | LINKS
INFO  [input#2]            StepMonitoring 98   | RHYTHMS
INFO  [input#2]            StepMonitoring 98   | PAGE
INFO  [input#3]            StepMonitoring 98   | LOAD
INFO  [input#3]            StepMonitoring 98   | BINARY
INFO  [input#3]            StepMonitoring 98   | SCALE
INFO  [input#3]            StepMonitoring 98   | GRID
INFO  [input#3]            StepMonitoring 98   | HEADERS
INFO  [input#3]            StepMonitoring 98   | STEM_SEEDS
INFO  [input#3]            StepMonitoring 98   | BEAMS
INFO  [input#3]            StepMonitoring 98   | LEDGERS
INFO  [input#3]            StepMonitoring 98   | HEADS
INFO  [input#3]            StepMonitoring 98   | STEMS
INFO  [input#3]            StepMonitoring 98   | REDUCTION
INFO  [input#3]            StepMonitoring 98   | CUE_BEAMS
INFO  [input#3]            StepMonitoring 98   | TEXTS
INFO  [input#3]            StepMonitoring 98   | MEASURES
INFO  [input#3]            StepMonitoring 98   | CHORDS
INFO  [input#3]            StepMonitoring 98   | CURVES
INFO  [input#3]            StepMonitoring 98   | SYMBOLS
INFO  [input#3]            StepMonitoring 98   | LINKS
INFO  [input#3]            StepMonitoring 98   | RHYTHMS
INFO  [input#3]            StepMonitoring 98   | PAGE
INFO  [input]                      Book 596  | Could not export since transcription did not complete successfully
WARN  [input]                       CLI 956  | Exception occurred java.lang.Exception: Error in export
WARN  []                      Main 298  | Exit forced. Failure
(종료코드 1, 70.3초, .mxl 없음)
```

읽는 법: 1쪽이 invalid가 된 뒤에도 2·3쪽은 끝까지 처리되지만, 마지막에 전체 내보내기가 실패합니다. 5.11.0에서도 같은 순서로 실패했습니다(58.6초).

#### A-4. 복구: 저장된 `.omr`에서 정상 쪽만 다시 내보내기

```bash
Audiveris -batch -export -sheets 2 3 -- /data/jobs/<작업ID>/out/input.omr
```

```text
INFO  []                      Book 2965 | Loading book /data/jobs/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c03/out/input.omr
INFO  [input]           PartwiseBuilder 2706 | Exporting sheet(s): [#2#3]
INFO  [input]             ScoreExporter 164  | Score input exported to /data/jobs/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c03/out/input.mxl
INFO  [input]                      Book 2525 | Book stored as /data/jobs/5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c03/out/input.omr
(종료코드 0, 6.3초)
```

결과: `out/input.mxl`(35마디, validateMxl 통과). `-output`을 줘도 `.omr` 옆에 생겼습니다.

### 부록 B. 측정 기록

조사 환경: 리눅스 x86_64, 1코어, 메모리 4GB, `JAVA_TOOL_OPTIONS=-Xmx2g`, 공식 Ubuntu 24.04용 패키지(5.10.2, 5.11.0), OCR 데이터 eng+kor. 공개 악보는 Mutopia Project에서 받았고, 표지·글자 PDF는 직접 만들었습니다.

| 파일 | 쪽 | 엔진 | -save | 소요 시간 | 종료코드 | 결과 |
|---|---|---|---|---|---|---|
| simple.pdf (바흐 BWV 846 프렐류드) | 2 | 5.10.2 | 사용 | 61.6초 / 59.0초 | 0 | input.mxl 9.6KB(35마디, 1파트), input.omr 533KB, 엔진 로그 24KB |
| simple.pdf | 2 | 5.10.2 | 미사용 | 47.4초 / 47.0초 | 0 | input.mxl 9.6KB, input.omr 526KB(마지막에 한 번 저장됨) |
| multi.pdf (베토벤 엘리제를 위하여) | 3 | 5.10.2 | 사용 | 89.6초 | 0 | input.mxl 16.5KB(106마디), input.omr 901KB |
| bad.pdf (글자만 1쪽) | 1 | 5.10.2 | 사용 | 4.3초 | 1 | .mxl 없음 (No system found) |
| cover.pdf (표지 1 + 악보 2) | 3 | 5.10.2 | 사용 | 70.3초 | 1 | .mxl 없음, input.omr 543KB 남음 |
| cover 복구 (.omr에서 `-sheets 2 3`) | 2 | 5.10.2 | — | 6.3초 | 0 | input.mxl(35마디, 검증 통과) |
| cover.pdf | 3 | 5.11.0 | 사용 | 58.6초 | 1 | .mxl 없음 (같은 방식으로 실패) |
| 권한 제한 PDF (비밀번호 없이 열림, simple과 같은 내용) | 2 | 5.10.2 | 사용 | 82.4초* | 0 | 정상 변환 — 하지만 앱 업로드 검증은 ENCRYPTED_PDF로 거부 |

\* 다른 작업과 동시에 실행돼 시간 비교에는 쓰지 않습니다. 5.11.0의 simple.pdf 비교 실행은 조사 환경에서 도중에 끊겨 결과가 없습니다(미확인).

앱 코드를 실제로 실행한 결과:
- `worker/src/progress.ts`: 실제 로그 재생 시 1.85초에 90% 도달 후 고정 (V2-3 표)
- `worker/src/validate-mxl.ts`: 실제 결과 5건 모두 통과, 단 마디 수는 35 → 37, 106 → 109로 과다 집계
- `web/src/lib/pdf.ts`(업로드 검증): 정상 악보 통과(쪽수 정확), 권한 제한·열람 암호 PDF 모두 ENCRYPTED_PDF
- 타입 검사: web·worker 통과
- 단위 테스트 러너: `node --import tsx --test`가 worker에서 새 의존성 없이 동작

### 부록 C. 용어 풀이

| 용어 | 뜻 |
|---|---|
| OMR | 악보 이미지 인식(Optical Music Recognition). Audiveris가 하는 일. `.omr`은 Audiveris의 작업 파일 |
| MusicXML / MXL | 디지털 악보 표준 형식 / 그것을 압축한 파일. MuseScore·Sibelius·Finale 등에서 열림 |
| OSMD | 브라우저에서 MusicXML을 악보 그림으로 그려 주는 라이브러리 (미리보기) |
| 큐(BullMQ) | 변환 작업을 줄 세워 두는 대기열. 워커가 하나씩 꺼내 처리 |
| 워커 | 실제로 Audiveris를 실행하는 별도 프로그램(컨테이너) |
| Redis | 큐와 작업 상태를 저장하는 빠른 저장소 |
| SSE | 서버가 브라우저로 진행 상황을 계속 흘려보내는 연결. 진행률 표시에 씀 |
| 헬스체크 | 프로그램이 정상인지 주기적으로 확인하는 검사 |
| Caddy(리버스 프록시) | 인터넷 요청을 받아 HTTPS를 처리하고 안쪽 앱으로 전달하는 문지기 서버 |
| 레이트리밋 | 같은 사람이 짧은 시간에 너무 많이 요청하지 못하게 막는 장치 |
| 픽스처 | 테스트에 쓰는 고정 자료. 여기서는 실제 엔진 로그 파일 |
| 단위 테스트 / E2E 테스트 | 함수 하나를 따로 시험 / 브라우저로 사용자처럼 처음부터 끝까지 시험 |
| 잠금 파일(lockfile) | 설치할 라이브러리의 정확한 버전을 적어 둔 파일 (`pnpm-lock.yaml`) |
| .dockerignore | Docker 이미지를 만들 때 복사하지 않을 파일 목록 |
| StrictMode | React 개발 모드에서 코드를 일부러 두 번 실행해 버그를 드러내는 기능 |
| plan 모드 | Claude Code가 파일을 바꾸지 않고 계획만 세우는 모드 |
| VPS | 월 단위로 빌리는 가상 서버 |
| AGPL | Audiveris의 라이선스. 수정해서 서비스로 제공하면 소스 공개 의무가 생길 수 있음 (화면 푸터에 고지 중) |

### 부록 D. CLAUDE.md 추가 문안 (V2-0에서 사용)

```markdown
## 실측으로 확인된 Audiveris 동작 (docs/IMPROVEMENT_V2.md 부록 A·B)
- 진행 로그: `INFO  [input#<쪽>]  StepMonitoring 98 | <단계>`. 1쪽짜리 문서는 `[input]`(쪽 번호 없음).
  진행률은 이 줄과 쪽 번호로만 계산한다. 다른 줄에 섞인 단어(PAGE, STEMS 등)로 판단하지 않는다.
- 전체 쪽수: `<N> sheets in <경로>` (1쪽이면 `1 sheet in`). 처리 대상 쪽: `Book reaching PAGE on sheets:[#1#2]`.
- 악보가 아닌 쪽: `No system found` → `Sheet input#<쪽> flagged as invalid.`
- invalid 쪽이 하나라도 있으면 전체 내보내기가 실패한다(5.10.2·5.11.0 동일):
  `Could not export since transcription did not complete successfully` → `Exit forced. Failure` → 종료코드 1, .mxl 없음.
- 복구: `-save`로 저장된 `out/input.omr`에서 정상 쪽만 다시 내보낸다:
  `Audiveris -batch -export -sheets 2 3 -- <out>/input.omr` → `out/input.mxl` (약 6초, -output과 관계없이 .omr 옆에 생성).
  그래서 `-save`는 유지한다.
- 성공: `Score input exported to <out>/input.mxl`, 종료코드 0. 종료코드는 참고용이고 판정은 결과 파일로 한다.
- MXL 안의 `<source>`와 `source-file`에 서버의 입력 파일 경로가 기록된다.
- OCR 언어 확인 줄: `Installed OCR languages: eng,kor`.
- JVM 옵션은 V2-7부터 `JAVA_TOOL_OPTIONS`로 준다 (로그 첫 줄 `Picked up JAVA_TOOL_OPTIONS`로 적용 확인).

## 품질 규칙 (2차 개선)
- "완료"는 증거(명령 출력 원문, 테스트 결과, 스크린샷)와 함께만 보고한다. 실행하지 못한 검증은 "미실행"으로 적는다.
- 버그를 고칠 때는 먼저 실패하는 테스트를 만들고, 고친 뒤 통과를 보여준다.
- 단위 테스트: Node 내장 테스트 러너 + tsx. worker에서 `node --import tsx --test "src/**/*.test.ts"`.
  web에 tsx가 필요하면 추가 전에 묻는다.
- 엔진 로그 시험 자료: `worker/test/fixtures/audiveris/*.log`. 진행률·판정 로직은 이 파일로 시험한다.
- 작업 브랜치는 `v2`. main 병합은 사용자 승인 후에만.
- samples/ 아래의 PDF(특히 실제 악보)는 커밋하지 않는다.
```

### 부록 E. 참고 링크

- Audiveris 릴리스(5.10.2, 5.11.0): https://github.com/Audiveris/audiveris/releases
- Audiveris 핸드북(명령줄 옵션): https://audiveris.github.io/audiveris/
- Tesseract 언어 데이터: https://github.com/tesseract-ocr/tessdata
- BullMQ 문서(Job Scheduler, 작업 취소): https://docs.bullmq.io/
- OpenSheetMusicDisplay: https://github.com/opensheetmusicdisplay/opensheetmusicdisplay
- Next.js standalone 출력: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Docker와 방화벽(UFW): https://docs.docker.com/engine/network/packet-filtering-firewalls/
- Mutopia Project(공개 악보): https://www.mutopiaproject.org/
- Claude Code 단축키·명령: https://code.claude.com/docs/en/interactive-mode
- 기존 설계서: 저장소의 `바이브코딩_프롬프트_설계서.md`

---

*이 설계서는 실행으로 확인한 사실과 코드로만 확인한 추정을 구분해 적었습니다. "실측 필요"라고 적힌 항목은 V2-1·V2-2에서 사용자님의 환경으로 다시 확인합니다.*
