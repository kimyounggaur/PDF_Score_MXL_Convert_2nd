import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Job } from "bullmq";
import { runAudiverisConversion } from "./audiveris.js";
import { ConversionError, type ConversionJobData } from "./types.js";

test("an already-aborted conversion exits as CANCELLED without spawning Audiveris", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "audiveris-cancel-"));
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  t.after(async () => {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  const controller = new AbortController();
  controller.abort("CANCELLED");
  const job = {
    data: { jobId: "00000000-0000-4000-8000-000000000000" },
    async updateProgress() {},
  } as unknown as Job<ConversionJobData>;

  await assert.rejects(
    runAudiverisConversion(job, controller.signal),
    (error: unknown) => error instanceof ConversionError && error.code === "CANCELLED",
  );
});
