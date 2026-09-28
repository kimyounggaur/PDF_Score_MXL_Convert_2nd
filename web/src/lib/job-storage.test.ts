import assert from "node:assert/strict";
import test from "node:test";
import type { StoredJob } from "./client-types";
import {
  deserializeStoredJobs,
  MAX_STORED_JOBS,
  pruneStoredJobs,
  serializeStoredJobs,
  STORED_JOB_TTL_MS,
} from "./job-storage";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");

test("저장된 작업을 최신순으로 읽고 24시간 지난 항목을 제거한다", () => {
  const recent = storedJob("recent", NOW - 1_000);
  const older = storedJob("older", NOW - 10_000);
  const expired = storedJob("expired", NOW - STORED_JOB_TTL_MS);

  assert.deepEqual(deserializeStoredJobs(JSON.stringify([older, expired, recent]), NOW), [recent, older]);
});

test("손상된 저장값과 작업 모양이 아닌 항목을 무시한다", () => {
  assert.deepEqual(deserializeStoredJobs("not-json", NOW), []);
  assert.deepEqual(deserializeStoredJobs(JSON.stringify([{ jobId: "missing-fields" }, null]), NOW), []);
});

test("같은 작업 ID는 최신 항목만 남기고 최대 30개로 제한한다", () => {
  const jobs = Array.from({ length: MAX_STORED_JOBS + 5 }, (_, index) => storedJob(`job-${index}`, NOW - index * 1_000));
  const staleDuplicate = { ...storedJob("job-0", NOW - 60_000), fileName: "old-name.pdf" };
  const result = pruneStoredJobs([...jobs, staleDuplicate], NOW);

  assert.equal(result.length, MAX_STORED_JOBS);
  assert.equal(result[0]?.jobId, "job-0");
  assert.equal(result[0]?.fileName, "job-0.pdf");
  assert.equal(result.at(-1)?.jobId, `job-${MAX_STORED_JOBS - 1}`);
});

test("직렬화할 때도 만료와 개수 제한을 적용한다", () => {
  const current = storedJob("current", NOW - 1_000);
  const expired = storedJob("expired", NOW - STORED_JOB_TTL_MS - 1);

  assert.equal(serializeStoredJobs([expired, current], NOW), JSON.stringify([current]));
});

function storedJob(jobId: string, createdAtMs: number): StoredJob {
  return {
    jobId,
    fileName: `${jobId}.pdf`,
    createdAt: new Date(createdAtMs).toISOString(),
  };
}
