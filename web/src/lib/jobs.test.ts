import assert from "node:assert/strict";
import test from "node:test";
import { progressForJobState, queuePositionFromWaitingJobs } from "./jobs";

const storedProgress = {
  pct: 0,
  stage: "processing",
  sheet: { current: 1, total: 2 },
};

test("대기·지연 상태는 BullMQ의 기본 진행률 0을 노출하지 않는다", () => {
  assert.equal(progressForJobState("waiting", 0), null);
  assert.equal(progressForJobState("delayed", storedProgress), null);
  assert.equal(progressForJobState("prioritized", 0), null);
});

test("변환 중에는 저장된 진행률과 쪽 정보를 유지한다", () => {
  assert.deepEqual(progressForJobState("active", storedProgress), storedProgress);
});

test("대기 순번은 1부터 시작하고 목록에 없으면 null이다", () => {
  const waiting = [{ id: "first" }, { id: "target" }, { id: "third" }];
  assert.equal(queuePositionFromWaitingJobs("first", waiting), 1);
  assert.equal(queuePositionFromWaitingJobs("target", waiting), 2);
  assert.equal(queuePositionFromWaitingJobs("missing", waiting), null);
});
