import assert from "node:assert/strict";
import test from "node:test";
import type { JobStatus } from "./client-types";
import {
  currentElapsedMs,
  currentEstimateSeconds,
  dropRejectionMessage,
  failureGuidance,
  formatElapsed,
  formatEstimatedMinutes,
} from "./ui";

test("dropzone 오류 코드를 정확한 한국어 거부 사유로 바꾼다", () => {
  assert.equal(dropRejectionMessage(["file-invalid-type"]), "PDF가 아닙니다");
  assert.equal(dropRejectionMessage(["file-too-large"]), "30MB를 넘습니다");
  assert.equal(dropRejectionMessage(["too-many-files"]), "한 번에 5개까지");
  assert.equal(dropRejectionMessage(["file-invalid-type", "too-many-files"]), "한 번에 5개까지");
});

test("경과 시간과 표본이 충분한 ETA에 쓸 분 단위 문구를 만든다", () => {
  assert.equal(formatElapsed(42_900), "42초");
  assert.equal(formatElapsed(125_000), "2분 5초");
  assert.equal(formatElapsed(3_721_000), "1시간 2분");
  assert.equal(formatEstimatedMinutes(1), "약 1분 (예상)");
  assert.equal(formatEstimatedMinutes(121), "약 3분 (예상)");
});

test("진행 중 경과 시간은 서버 시계가 아니라 서버 elapsed 스냅샷과 로컬 수신 후 시간으로 계산한다", () => {
  const status = jobStatus("active");
  status.timing = {
    createdAt: 9_999_999_999,
    startedAt: 9_999_999_999,
    finishedAt: null,
    elapsedMs: 12_000,
  };

  assert.equal(currentElapsedMs(status, 105_000, 100_000), 17_000);

  status.timing.finishedAt = 9_999_999_999;
  assert.equal(currentElapsedMs(status, 205_000, 100_000), 12_000);

  status.status = "completed";
  status.timing.finishedAt = null;
  assert.equal(currentElapsedMs(status, 305_000, 100_000), 12_000);
});

test("활성 작업 ETA만 로컬 시계에 따라 감소하고 대기 작업 ETA는 유지한다", () => {
  const status = jobStatus("active");
  status.estimate = { remainingSeconds: 125, sampleCount: 3 };

  assert.equal(currentEstimateSeconds(status, 141_000, 100_000), 84);

  status.status = "queued";
  assert.equal(currentEstimateSeconds(status, 141_000, 100_000), 125);
});

test("NO_OUTPUT 실패에 실행 가능한 세 가지 확인 항목을 제공한다", () => {
  assert.deepEqual(failureGuidance("NO_OUTPUT"), [
    "인쇄 악보인가요?",
    "300DPI 이상인가요?",
    "표지·해설 쪽이 있다면 쪽 범위에서 빼 보세요.",
  ]);
  assert.deepEqual(failureGuidance("UNKNOWN"), ["원본 PDF를 확인한 뒤 다시 시도해 보세요."]);
});

function jobStatus(status: JobStatus["status"]): JobStatus {
  return {
    status,
    progress: null,
    queuePosition: null,
    meta: null,
    timing: null,
    estimate: null,
    files: null,
    warnings: [],
    suspectMeasures: [],
    error: null,
  };
}
