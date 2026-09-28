import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { InvalidJobOptionsError, parseJobOptions, readJobOptions } from "./job-options.js";

test("옵션이 없는 기존 metadata는 전체 쪽과 영어로 처리한다", () => {
  assert.deepEqual(
    parseJobOptions({ originalName: "legacy.pdf", pages: 3 }),
    { sheets: null, language: "eng" },
  );
});

test("명시된 쪽을 중복 제거·오름차순 정규화하고 kor+eng를 보존한다", () => {
  assert.deepEqual(
    parseJobOptions({
      pages: 7,
      options: {
        sheets: [7, 2, 5, 3, 4, 2],
        language: "kor+eng",
      },
    }),
    { sheets: [2, 3, 4, 5, 7], language: "kor+eng" },
  );
});

test("전체 쪽의 명시적 null과 한국어 옵션을 허용한다", () => {
  assert.deepEqual(
    parseJobOptions({ pages: 20, options: { sheets: null, language: "kor" } }),
    { sheets: null, language: "kor" },
  );
});

test("명시됐지만 잘못된 options는 기본값으로 숨기지 않고 거부한다", () => {
  const invalidValues: unknown[] = [
    null,
    [],
    {},
    { pages: 0 },
    { pages: 3, options: null },
    { pages: 3, options: { sheets: null } },
    { pages: 3, options: { language: "eng" } },
    { pages: 3, options: { sheets: [], language: "eng" } },
    { pages: 3, options: { sheets: [0], language: "eng" } },
    { pages: 3, options: { sheets: [4], language: "eng" } },
    { pages: 3, options: { sheets: [1.5], language: "eng" } },
    { pages: 3, options: { sheets: [Number.MAX_SAFE_INTEGER + 1], language: "eng" } },
    { pages: 21, options: { sheets: Array.from({ length: 21 }, (_, index) => index + 1), language: "eng" } },
    { pages: 21, options: { sheets: null, language: "eng" } },
    { pages: 3, options: { sheets: [1], language: "eng+kor" } },
    { pages: 3, options: { sheets: [1], language: "deu" } },
  ];

  for (const value of invalidValues) {
    assert.throws(() => parseJobOptions(value), InvalidJobOptionsError);
  }
});

test("작업 metadata.json을 읽고 잘못된 명시 옵션은 파일 경로에서도 거부한다", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "worker-job-options-"));
  const previousDataDir = process.env.DATA_DIR;
  const validJobId = "00000000-0000-4000-8000-000000000001";
  const invalidJobId = "00000000-0000-4000-8000-000000000002";
  process.env.DATA_DIR = dataDir;

  t.after(async () => {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  await Promise.all([
    writeMetadata(dataDir, validJobId, {
      pages: 7,
      options: { sheets: [7, 2, 3], language: "kor+eng" },
    }),
    writeMetadata(dataDir, invalidJobId, {
      pages: 2,
      options: { sheets: [2], language: "eng+kor" },
    }),
  ]);

  assert.deepEqual(await readJobOptions(validJobId), {
    sheets: [2, 3, 7],
    language: "kor+eng",
  });
  await assert.rejects(readJobOptions(invalidJobId), InvalidJobOptionsError);
});

async function writeMetadata(dataDir: string, jobId: string, metadata: unknown) {
  const directory = path.join(dataDir, "jobs", jobId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "metadata.json"), JSON.stringify(metadata));
}
