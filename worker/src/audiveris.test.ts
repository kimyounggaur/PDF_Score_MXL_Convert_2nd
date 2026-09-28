import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Job } from "bullmq";
import { compareOutputFileNames, inspectOutputs, runAudiverisConversion } from "./audiveris.js";
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

test("검증된 MXL 요약을 성공 결과 파일에 그대로 보존한다", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "audiveris-output-summary-"));
  t.after(async () => {
    await rm(outDir, { recursive: true, force: true });
  });
  const filePath = path.join(outDir, "input.mxl");
  await writeFile(filePath, "fixture");

  const result = await inspectOutputs(outDir, async (candidate) => {
    assert.equal(candidate, filePath);
    return {
      ok: true,
      rootFile: "score.xml",
      measureCount: 37,
      measuresPerPart: { P1: 20, P2: 17 },
      suspectMeasures: [
        { part: "P1", measure: 12, reason: "DURATION_MISMATCH" },
      ],
    };
  });

  assert.deepEqual(result.files, [
    {
      name: "input.mxl",
      bytes: 7,
      measureCount: 37,
      measuresPerPart: { P1: 20, P2: 17 },
    },
  ]);
  assert.deepEqual(result.suspectMeasures, [
    { file: "input.mxl", part: "P1", measure: 12, reason: "DURATION_MISMATCH" },
  ]);
  assert.equal(result.allValid, true);
});

test("확인 필요 마디를 결과 파일 자연 순서로 합치고 전체 50개로 제한한다", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "audiveris-suspect-limit-"));
  t.after(async () => {
    await rm(outDir, { recursive: true, force: true });
  });
  await Promise.all([
    writeFile(path.join(outDir, "input.mvt2.mxl"), "second"),
    writeFile(path.join(outDir, "input.mvt1.mxl"), "first"),
  ]);

  const result = await inspectOutputs(outDir, async () => ({
    ok: true,
    rootFile: "score.xml",
    measureCount: 31,
    measuresPerPart: { P1: 31 },
    suspectMeasures: Array.from({ length: 30 }, (_, index) => ({
      part: "P1",
      measure: index + 2,
      reason: "DURATION_MISMATCH" as const,
    })),
  }));

  assert.equal(result.suspectMeasures.length, 50);
  assert.deepEqual(result.suspectMeasures[0], {
    file: "input.mvt1.mxl",
    part: "P1",
    measure: 2,
    reason: "DURATION_MISMATCH",
  });
  assert.deepEqual(result.suspectMeasures[29], {
    file: "input.mvt1.mxl",
    part: "P1",
    measure: 31,
    reason: "DURATION_MISMATCH",
  });
  assert.deepEqual(result.suspectMeasures[49], {
    file: "input.mvt2.mxl",
    part: "P1",
    measure: 21,
    reason: "DURATION_MISMATCH",
  });
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
