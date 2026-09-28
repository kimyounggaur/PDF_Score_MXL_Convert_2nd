# PDF 악보 -> MXL 변환 웹앱 명세

## 제품

인쇄 악보 PDF를 업로드하면 Audiveris 5.10.2 OMR 엔진으로 MXL(압축 MusicXML) 파일을 만들고, 진행률을 실시간으로 보여준 뒤 브라우저 미리보기와 다운로드를 제공한다.

## 핵심 흐름

1. 브라우저가 `POST /api/jobs`로 PDF와 선택한 쪽 범위·가사 언어를 multipart 업로드한다.
2. Next.js API가 PDF와 옵션을 검증하고 `<DATA_DIR>/jobs/<jobId>/input.pdf`와 `metadata.json`으로 저장한다.
3. API가 BullMQ `conversion` 큐에 `{ jobId }`만 등록한다.
4. 워커가 `metadata.json`을 다시 검증한 뒤 쪽 범위는 Audiveris `-sheets`, 가사 언어는 OCR 언어 상수로 넘겨 별도 프로세스를 실행한다.
5. 워커가 진행률과 완료/실패 결과를 BullMQ에 기록한다.
6. API가 `GET /api/jobs/:id/events` SSE와 `GET /api/jobs/:id` 상태 조회로 진행률을 전달한다.
7. 완료된 작업은 `GET /api/jobs/:id/files/:name`으로 MXL 파일을 다운로드하거나 OSMD 미리보기에 사용한다.

## 제한

- PDF만 허용한다.
- 최대 파일 크기는 30MB다.
- 전체 변환은 최대 20쪽이다. 원본이 더 길면 실제 쪽수 범위 안에서 최대 20쪽을 골라 변환할 수 있다.
- 쪽 범위는 쉼표와 하이픈으로 입력하며 중복은 제거한다. 가사 언어는 영어, 한국어, 한국어+영어만 허용한다.
- 암호화 PDF는 거부한다.
- 작업 타임아웃은 20분이다.
- 클라이언트 파일명은 저장 경로에 사용하지 않는다.

## MVP 제외

- 사용자 계정/로그인
- 결제
- 악보 편집기
- 손글씨 인식
- 오디오 재생

## 운영 원칙

- Audiveris는 Docker 컨테이너 안에서 `child_process.spawn`으로만 실행한다.
- 성공 판정은 종료 코드가 아니라 `out/*.mxl` 존재와 결과 파일 검증으로 한다.
- 결과 파일은 24시간 후 삭제 대상으로 간주한다.
- 사용자 대면 문구는 한국어로 제공한다.

