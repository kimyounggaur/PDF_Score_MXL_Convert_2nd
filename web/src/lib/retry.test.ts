import assert from "node:assert/strict";
import test from "node:test";
import { isSafeJobId } from "./paths";
import { isExistingRetryDirectoryError, retryJobIdFor } from "./retry";

const SOURCE_JOB_ID = "123e4567-e89b-42d3-a456-426614174000";

test("같은 원본 작업은 항상 같은 UUID 재시도 ID를 만든다", () => {
  const first = retryJobIdFor(SOURCE_JOB_ID);
  const second = retryJobIdFor(SOURCE_JOB_ID.toUpperCase());

  assert.equal(first, second);
  assert.equal(first, "5ddb659e-c062-5ff0-badc-7d5debf382a2");
  assert.ok(first && isSafeJobId(first));
});

test("서로 다른 원본 작업은 서로 다른 재시도 ID를 만든다", () => {
  const first = retryJobIdFor(SOURCE_JOB_ID);
  const second = retryJobIdFor("123e4567-e89b-42d3-a456-426614174001");

  assert.notEqual(first, second);
});

test("안전한 UUID가 아닌 원본 작업 ID는 거부한다", () => {
  assert.equal(retryJobIdFor("../source"), null);
  assert.equal(retryJobIdFor("not-a-uuid"), null);
  assert.equal(retryJobIdFor(""), null);
});

test("원자적 디렉터리 생성의 EEXIST만 동시 재시도 패자로 분류한다", () => {
  assert.equal(isExistingRetryDirectoryError({ code: "EEXIST" }), true);
  assert.equal(isExistingRetryDirectoryError({ code: "ENOSPC" }), false);
  assert.equal(isExistingRetryDirectoryError(new Error("EEXIST")), false);
  assert.equal(isExistingRetryDirectoryError(null), false);
});
