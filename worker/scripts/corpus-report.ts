import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getConversionQueue, getConversionQueueEvents, closeQueueClients } from "../src/queue.js";
import { inputPdfPath, jobDir, outputDir } from "../src/paths.js";
import { validateMxl } from "../src/validate-mxl.js";

type CorpusRow = {
  file: string;
  pages: number | string;
  duration: string;
  fileCount: number | string;
  valid: string;
  note: string;
};

const root = path.resolve(process.cwd(), "..");
const samplesDir = path.join(root, "samples");
const qualityPath = path.join(root, "docs", "QUALITY.md");
const queue = getConversionQueue();
const events = getConversionQueueEvents();

await events.waitUntilReady();

const pdfs = (await readdir(samplesDir)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
const rows: CorpusRow[] = [];

for (const pdf of pdfs) {
  const source = path.join(samplesDir, pdf);
  const pages = await estimatePdfPages(source);
  const jobId = randomUUID();
  const dir = jobDir(jobId);
  const startedAt = Date.now();

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await copyFile(source, inputPdfPath(jobId));
  await queue.add("convert", { jobId }, { jobId, attempts: 1 });

  const result = await waitForJob(jobId);
  if (result.status === "failed") {
    rows.push({
      file: pdf,
      pages,
      duration: formatDuration(Date.now() - startedAt),
      fileCount: 0,
      valid: "실패",
      note: result.reason,
    });
    continue;
  }

  let measureCount = 0;
  let valid = true;

  for (const file of result.files) {
    const validation = await validateMxl(path.join(outputDir(jobId), file.name));
    if (!validation.ok) {
      valid = false;
    } else {
      measureCount += validation.measureCount;
    }
  }

  rows.push({
    file: pdf,
    pages,
    duration: formatDuration(result.durationMs),
    fileCount: result.files.length,
    valid: valid ? "통과" : "실패",
    note: `${measureCount}마디`,
  });
}

await writeFile(qualityPath, renderQuality(rows));
await closeQueueClients();

console.log(await readFile(qualityPath, "utf8"));

function waitForJob(jobId: string) {
  return new Promise<
    | { status: "completed"; durationMs: number; files: Array<{ name: string; bytes: number }> }
    | { status: "failed"; reason: string }
  >((resolve) => {
    const onCompleted = ({ jobId: eventJobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
      if (eventJobId !== jobId) {
        return;
      }
      cleanup();
      const value = returnvalue as { durationMs?: number; files?: Array<{ name: string; bytes: number }> };
      resolve({ status: "completed", durationMs: value.durationMs ?? 0, files: value.files ?? [] });
    };

    const onFailed = ({ jobId: eventJobId, failedReason }: { jobId: string; failedReason: string }) => {
      if (eventJobId !== jobId) {
        return;
      }
      cleanup();
      resolve({ status: "failed", reason: failedReason });
    };

    const cleanup = () => {
      events.off("completed", onCompleted);
      events.off("failed", onFailed);
    };

    events.on("completed", onCompleted);
    events.on("failed", onFailed);
  });
}

async function estimatePdfPages(filePath: string) {
  const raw = await readFile(filePath, "latin1");
  return raw.match(/\/Type\s*\/Page\b/g)?.length ?? "?";
}

function formatDuration(ms: number) {
  if (!ms) {
    return "?";
  }
  return `${(ms / 1000).toFixed(1)}초`;
}

function renderQuality(rows: CorpusRow[]) {
  const lines = [
    "# 품질 코퍼스 기준선",
    "",
    `생성일: ${new Date().toISOString()}`,
    "",
    "| 파일 | 쪽수 | 소요시간 | 결과 파일 수 | 검증 통과 | 비고(마디 수) |",
    "|---|---:|---:|---:|---|---|",
    ...rows.map((row) => `| ${row.file} | ${row.pages} | ${row.duration} | ${row.fileCount} | ${row.valid} | ${row.note} |`),
    "",
  ];

  return lines.join("\n");
}

