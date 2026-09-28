import assert from "node:assert/strict";
import test from "node:test";
import type { JobStatus } from "./client-types";
import {
  failedEventDisposition,
  normalizeDoneEventData,
  normalizeJobStatus,
} from "./client-status";

test("SSE JOB_NOT_FOUND는 재시도 가능한 실패가 아니라 만료로 분류한다", () => {
  assert.equal(failedEventDisposition({ code: "JOB_NOT_FOUND" }), "expired");
  assert.equal(failedEventDisposition({ code: "SERVICE_UNAVAILABLE", recoverable: true }), "recoverable");
  assert.equal(failedEventDisposition({ code: "NO_OUTPUT" }), "failed");
});

test("완료 상태 스냅샷은 확인이 필요한 마디를 보존하고 레거시 누락은 빈 배열로 바꾼다", () => {
  const suspect = { file: "input.mxl", part: "P1", measure: 2, reason: "DURATION_MISMATCH" } as const;

  assert.deepEqual(normalizeJobStatus(jobStatus("completed", [suspect])).suspectMeasures, [suspect]);
  assert.deepEqual(normalizeJobStatus(jobStatus("completed", undefined)).suspectMeasures, []);
});

test("완료 전·실패 상태 스냅샷은 잘못 포함된 확인 필요 마디를 노출하지 않는다", () => {
  const suspect = { file: "input.mxl", part: "P1", measure: 2, reason: "DURATION_MISMATCH" } as const;

  for (const status of ["queued", "active", "failed"] as const) {
    assert.deepEqual(normalizeJobStatus(jobStatus(status, [suspect])).suspectMeasures, []);
  }
});

test("SSE done 데이터는 확인이 필요한 마디를 보존하고 레거시 누락을 허용한다", () => {
  const file = {
    name: "input.mxl",
    bytes: 100,
    measureCount: 4,
    measuresPerPart: { P1: 4 },
  };
  const suspect = { file: "input.mxl", part: "P1", measure: 2, reason: "DURATION_MISMATCH" } as const;

  assert.deepEqual(normalizeDoneEventData({ files: [file], suspectMeasures: [suspect] }), {
    files: [file],
    warnings: undefined,
    suspectMeasures: [suspect],
  });
  assert.deepEqual(normalizeDoneEventData({ files: [file] })?.suspectMeasures, []);
});

function jobStatus(status: JobStatus["status"], suspectMeasures: unknown): JobStatus {
  return {
    status,
    progress: null,
    queuePosition: null,
    meta: null,
    timing: null,
    estimate: null,
    files: status === "completed" ? [] : null,
    warnings: [],
    error: null,
    suspectMeasures,
  } as JobStatus;
}
