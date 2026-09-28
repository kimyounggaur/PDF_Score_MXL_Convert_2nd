import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { Job } from "bullmq";
import { createConversionProcessor } from "./processor.js";
import { ConversionError, type ConversionJobData, type ConversionResult } from "./types.js";

const successResult: ConversionResult = {
  files: [],
  durationMs: 1,
  warnings: [],
  totalSheets: 1,
  targetSheets: [1],
  invalidSheets: [],
  recovered: false,
};

test("declares three processor arguments and forwards cancellation through AbortSignal", async () => {
  const controller = new AbortController();
  const cancellations: Array<{ jobId: string; reason: string }> = [];
  const processor = createConversionProcessor({
    redis: { async get() { return "1"; } },
    cancelPollIntervalMs: 5,
    cancelJob(jobId, reason) {
      cancellations.push({ jobId, reason });
      controller.abort(reason);
      return true;
    },
    async runConversion(_job, signal) {
      await waitForAbort(signal);
      throw new ConversionError("CANCELLED");
    },
  });

  assert.equal(processor.length, 3, "BullMQ uses function.length to decide whether to create an AbortSignal");
  await assert.rejects(
    processor(fakeJob(), undefined, controller.signal),
    (error: unknown) => error instanceof ConversionError && error.code === "CANCELLED",
  );
  assert.deepEqual(cancellations, [{ jobId: "bull-job-id", reason: "CANCELLED" }]);
});

test("stops polling before a completed job can receive a late cancellation", async () => {
  let resolveGet!: (value: string | null) => void;
  const getResult = new Promise<string | null>((resolve) => {
    resolveGet = resolve;
  });
  let cancellations = 0;
  const processor = createConversionProcessor({
    redis: { get: async () => await getResult },
    cancelJob() {
      cancellations += 1;
      return true;
    },
    async runConversion() {
      return successResult;
    },
  });

  assert.deepEqual(await processor(fakeJob(), undefined, new AbortController().signal), successResult);
  resolveGet("1");
  await delay(0);
  assert.equal(cancellations, 0);
});

function fakeJob() {
  return {
    id: "bull-job-id",
    data: { jobId: "public-job-id" },
  } as Job<ConversionJobData, ConversionResult, "convert">;
}

async function waitForAbort(signal?: AbortSignal) {
  if (signal?.aborted) {
    return;
  }

  await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
}
