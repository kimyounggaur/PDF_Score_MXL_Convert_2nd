import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "ioredis";
import {
  PROCESSING_SECONDS_PER_PAGE_KEY,
  calculateSecondsPerPage,
  getProcessedPageCount,
  recordCompletedProcessingMetric,
  recordProcessingMetric,
} from "./metrics.js";

test("uses target sheet count before the reported total", () => {
  const result = metricResult({ durationMs: 10_000, targetSheets: [2, 3, 4, 5, 7], totalSheets: 30 });

  assert.equal(getProcessedPageCount(result), 5);
  assert.equal(calculateSecondsPerPage(result), 2);
});

test("falls back to total sheets and then one valid page", () => {
  assert.equal(getProcessedPageCount(metricResult({ totalSheets: 6 })), 6);
  assert.equal(getProcessedPageCount(metricResult({ totalSheets: 0 })), 1);
  assert.equal(getProcessedPageCount(metricResult({ totalSheets: null })), 1);
});

test("stores a positive seconds-per-page sample and trims atomically to twenty", async () => {
  const commands: unknown[][] = [];
  const transaction = {
    lpush(...args: unknown[]) {
      commands.push(["lpush", ...args]);
      return transaction;
    },
    ltrim(...args: unknown[]) {
      commands.push(["ltrim", ...args]);
      return transaction;
    },
    async exec() {
      commands.push(["exec"]);
      return [];
    },
  };
  const redis = { multi: () => transaction } as unknown as Pick<Redis, "multi">;

  assert.equal(
    await recordProcessingMetric(
      redis,
      metricResult({ durationMs: 2_500, targetSheets: [1, 2], totalSheets: 2 }),
    ),
    1.25,
  );
  assert.deepEqual(commands, [
    ["lpush", PROCESSING_SECONDS_PER_PAGE_KEY, "1.25"],
    ["ltrim", PROCESSING_SECONDS_PER_PAGE_KEY, 0, 19],
    ["exec"],
  ]);
});

test("does not store non-positive or non-finite durations", async () => {
  let transactions = 0;
  const redis = {
    multi() {
      transactions += 1;
      throw new Error("must not open a transaction");
    },
  } as unknown as Pick<Redis, "multi">;

  assert.equal(await recordProcessingMetric(redis, metricResult({ durationMs: 0 })), null);
  assert.equal(await recordProcessingMetric(redis, metricResult({ durationMs: Number.NaN })), null);
  assert.equal(transactions, 0);
});

test("completed metric failures are logged and never escape the worker event", async () => {
  const messages: string[] = [];
  const redis = {
    multi() {
      throw new Error("redis unavailable");
    },
  } as unknown as Pick<Redis, "multi">;

  const value = await recordCompletedProcessingMetric(
    redis,
    metricResult({ durationMs: 2_000, targetSheets: [1], totalSheets: 1 }),
    { jobId: "job-1", log: (message) => messages.push(message) },
  );

  assert.equal(value, null);
  assert.deepEqual(JSON.parse(messages[0] ?? "{}"), {
    level: "warn",
    event: "processing_metric_failed",
    jobId: "job-1",
    key: "conversion:seconds-per-page:v1",
    message: "redis unavailable",
  });
});

function metricResult(overrides: Partial<{
  durationMs: number;
  targetSheets: number[];
  totalSheets: number | null;
}> = {}) {
  return {
    durationMs: overrides.durationMs ?? 1_000,
    targetSheets: overrides.targetSheets ?? [],
    totalSheets: overrides.totalSheets === undefined ? null : overrides.totalSheets,
  };
}
