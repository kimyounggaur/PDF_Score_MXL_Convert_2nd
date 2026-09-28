import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { errorMessage, normalizeFailureCode } from "./errors";
import { getJob, type ConversionFile, type ConversionProgress, type ConversionResult, type ConversionWarning } from "./queue";
import { metadataPath, outputDir } from "./paths";

export type JobStatus = {
  status: "queued" | "active" | "completed" | "failed";
  progress: ConversionProgress | null;
  files: ConversionFile[] | null;
  warnings: ConversionWarning[];
  error: { code: string; message: string } | null;
};

export type JobMetadata = {
  originalName: string;
  bytes: number;
  pages: number;
  createdAt: string;
};

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = normalizeProgress(job.progress);

  if (state === "completed") {
    const returnValue = job.returnvalue as ConversionResult | undefined;
    return {
      status: "completed",
      progress: { pct: 100, stage: "completed", sheet: null },
      files: returnValue?.files ?? (await listOutputFiles(jobId)),
      warnings: returnValue?.warnings ?? [],
      error: null,
    };
  }

  if (state === "failed") {
    const code = normalizeFailureCode(job.failedReason);
    return {
      status: "failed",
      progress,
      files: null,
      warnings: [],
      error: {
        code,
        message: errorMessage(code),
      },
    };
  }

  return {
    status: mapState(state),
    progress,
    files: null,
    warnings: [],
    error: null,
  };
}

export async function listOutputFiles(jobId: string): Promise<ConversionFile[]> {
  const outDir = outputDir(jobId);
  let entries: string[];

  try {
    entries = await readdir(outDir);
  } catch {
    return [];
  }

  return await Promise.all(
    entries
      .filter((name) => name.toLowerCase().endsWith(".mxl"))
      .sort((a, b) => a.localeCompare(b, "en"))
      .map(async (name) => {
        const fileStat = await stat(path.join(outDir, name));
        return {
          name,
          bytes: fileStat.size,
        };
      }),
  );
}

export async function readJobMetadata(jobId: string): Promise<JobMetadata | null> {
  try {
    const raw = await readFile(metadataPath(jobId), "utf8");
    return JSON.parse(raw) as JobMetadata;
  } catch {
    return null;
  }
}

function normalizeProgress(progress: unknown): ConversionProgress | null {
  if (typeof progress === "object" && progress !== null && "pct" in progress && "stage" in progress) {
    const value = progress as { pct: unknown; stage: unknown; sheet?: unknown };
    return {
      pct: typeof value.pct === "number" ? value.pct : 0,
      stage: typeof value.stage === "string" ? value.stage : "processing",
      sheet: normalizeSheet(value.sheet),
    };
  }

  if (typeof progress === "number") {
    return { pct: progress, stage: "processing", sheet: null };
  }

  return null;
}

function normalizeSheet(value: unknown): { current: number; total: number } | null {
  if (typeof value !== "object" || value === null || !("current" in value) || !("total" in value)) {
    return null;
  }

  const sheet = value as { current: unknown; total: unknown };
  if (typeof sheet.current !== "number" || typeof sheet.total !== "number") {
    return null;
  }

  return { current: sheet.current, total: sheet.total };
}

function mapState(state: string): "queued" | "active" | "completed" | "failed" {
  if (state === "active") {
    return "active";
  }

  if (state === "completed") {
    return "completed";
  }

  if (state === "failed") {
    return "failed";
  }

  return "queued";
}
