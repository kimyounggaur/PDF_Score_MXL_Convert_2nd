import assert from "node:assert/strict";
import test from "node:test";
import {
  CANCEL_REQUEST_TTL_SECONDS,
  cancelConversionJob,
  cancelRequestKey,
  type CancelJobDependencies,
} from "./cancellation";
import { errorMessage, normalizeFailureCode } from "./errors";

test("대기 중인 작업은 큐와 작업 폴더에서 즉시 제거한다", async () => {
  const calls: string[] = [];
  const result = await cancelConversionJob("job-id", dependencies({
    getState: async () => "waiting",
    remove: async () => {
      calls.push("remove-job");
    },
  }, calls));

  assert.equal(result, "cancelled");
  assert.deepEqual(calls, ["remove-job", "remove-directory", "clear-request"]);
});

test("대기 작업이 동시에 실행되기 시작하면 TTL 취소 요청으로 전환한다", async () => {
  const calls: string[] = [];
  const states = ["waiting", "active", "active"];
  const result = await cancelConversionJob("job-id", dependencies({
    getState: async () => states.shift() ?? "active",
    remove: async () => {
      throw new Error("job is locked");
    },
  }, calls));

  assert.equal(result, "cancel_requested");
  assert.deepEqual(calls, ["set-request"]);
});

test("취소 키를 쓴 직후 완료된 작업은 409로 매핑할 결과를 반환한다", async () => {
  const calls: string[] = [];
  const states = ["active", "completed"];
  const result = await cancelConversionJob("job-id", dependencies({
    getState: async () => states.shift() ?? "completed",
    remove: async () => undefined,
  }, calls));

  assert.equal(result, "already_finished");
  assert.deepEqual(calls, ["set-request", "clear-request"]);
});

test("이미 끝난 작업과 없는 작업을 구분한다", async () => {
  const completed = await cancelConversionJob("job-id", dependencies({
    getState: async () => "failed",
    remove: async () => undefined,
  }, []));
  const missing = await cancelConversionJob("job-id", {
    ...dependencies({ getState: async () => "unknown", remove: async () => undefined }, []),
    getJob: async () => null,
  });

  assert.equal(completed, "already_finished");
  assert.equal(missing, "not_found");
});

test("취소 신호 키와 TTL 계약은 워커와 공유할 수 있게 고정한다", () => {
  assert.equal(cancelRequestKey("abc"), "job:abc:cancel");
  assert.equal(CANCEL_REQUEST_TTL_SECONDS, 120);
  assert.equal(normalizeFailureCode("Error: CANCELLED"), "CANCELLED");
  assert.equal(errorMessage("CANCELLED"), "변환을 취소했습니다.");
});

function dependencies(
  job: { getState: () => Promise<string>; remove: () => Promise<void> },
  calls: string[],
): CancelJobDependencies {
  return {
    getJob: async () => job,
    setCancelRequest: async () => {
      calls.push("set-request");
    },
    clearCancelRequest: async () => {
      calls.push("clear-request");
    },
    removeJobDirectory: async () => {
      calls.push("remove-directory");
    },
  };
}
