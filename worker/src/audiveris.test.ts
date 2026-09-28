import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Job } from "bullmq";
import { compareOutputFileNames, runAudiverisConversion } from "./audiveris.js";
import { ConversionError, type ConversionJobData } from "./types.js";

test("Audiveris 다악장 결과를 명시된 mvt 번호의 자연 순서로 정렬한다", () => {
  const names = ["input.mvt10.mxl", "input.mvt7.mxl", "input.mvt2.mxl", "input.mvt1.mxl"];
  assert.deepEqual([...names].sort(compareOutputFileNames), [
    "input.mvt1.mxl",
    "input.mvt2.mxl",
    "input.mvt7.mxl",
    "input.mvt10.mxl",
  ]);
});

test("비 mvt 결과도 숫자를 자연스럽게 정렬한다", () => {
  const names = ["movement-10.mxl", "movement-2.mxl", "movement-1.mxl"];
  assert.deepEqual([...names].sort(compareOutputFileNames), ["movement-1.mxl", "movement-2.mxl", "movement-10.mxl"]);
});

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
