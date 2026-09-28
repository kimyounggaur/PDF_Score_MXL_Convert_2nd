import assert from "node:assert/strict";
import test from "node:test";
import { failedEventDisposition } from "./client-status";

test("SSE JOB_NOT_FOUND는 재시도 가능한 실패가 아니라 만료로 분류한다", () => {
  assert.equal(failedEventDisposition({ code: "JOB_NOT_FOUND" }), "expired");
  assert.equal(failedEventDisposition({ code: "SERVICE_UNAVAILABLE", recoverable: true }), "recoverable");
  assert.equal(failedEventDisposition({ code: "NO_OUTPUT" }), "failed");
});
