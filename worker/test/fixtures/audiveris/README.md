# Audiveris 로그 픽스처

이 디렉터리의 `*.log` 파일은 `docs/IMPROVEMENT_V2.md` 부록 A의 실측 로그를 테스트에 필요한 줄만 보존한 참조 픽스처다. 현재 Windows 개발 환경에는 Docker CLI가 없어 이 저장소에서 새로 실행한 전체 로그가 아니다.

Docker를 사용할 수 있는 환경에서는 동일한 파일명으로 전체 stdout/stderr를 다시 캡처하고, `docs/V2_BASELINE.md`에 환경과 실행 시간을 기록한다.
