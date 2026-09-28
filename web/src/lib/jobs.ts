import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeStoredConversionOptions, type ConversionOptions } from "./conversion-options";
import { errorMessage, normalizeFailureCode } from "./errors";
import { compareResultNames } from "./filenames";
import { getConversionQueue, getJob, type ConversionProgress, type ConversionResult, type ConversionWarning } from "./queue";
import { metadataPath, outputDir } from "./paths";
import { getRedisClient } from "./redis";
import { normalizeResultFiles, type ResultFile } from "./result-files";
import { withTimeout } from "./timeouts";

export const SECONDS_PER_PAGE_REDIS_KEY = "conversion:seconds-per-page:v1";
const ESTIMATE_SAMPLE_LIMIT = 20;
const MINIMUM_ESTIMATE_SAMPLES = 3;
const ESTIMATE_QUERY_TIMEOUT_MS = 250;

export type JobStatus = {
  status: "queued" | "active" | "completed" | "failed";
  progress: ConversionProgress | null;
  files: ResultFile[] | null;
  warnings: ConversionWarning[];
  error: { code: string; message: string } | null;
  queuePosition: number | null;
  meta: PublicJobMetadata | null;
  timing: JobTiming;
  estimate: JobEstimate | null;
};

export type JobMetadata = {
  originalName: string;
  bytes: number;
  pages: number;
  createdAt: string;
  options: ConversionOptions;
  [key: string]: unknown;
};

export type PublicJobMetadata = Pick<JobMetadata, "originalName" | "bytes" | "pages" | "createdAt">;

export type JobTiming = {
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  elapsedMs: number;
};

export type JobEstimate = {
  remainingSeconds: number;
  sampleCount: number;
};

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const job = await getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = progressForJobState(state, job.progress);
  const metadata = await readJobMetadata(jobId);
  const meta = publicJobMetadata(metadata);
  const timing = timingForJob(job);

  if (state === "completed") {
    const returnValue = job.returnvalue as ConversionResult | undefined;
    const returnedFiles = normalizeResultFiles(returnValue?.files);
    return {
      status: "completed",
      progress: { pct: 100, stage: "completed", sheet: null },
      files: returnedFiles ?? (await listOutputFiles(jobId)),
      warnings: returnValue?.warnings ?? [],
      error: null,
      queuePosition: null,
      meta,
      timing,
      estimate: null,
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
      queuePosition: null,
      meta,
      timing,
      estimate: null,
    };
  }

  const [queuePosition, estimateSamples] = await Promise.all([
    isQueuedState(state)
      ? getConversionQueue()
          .getWaiting(0, -1)
          .then((jobs) => queuePositionFromWaitingJobs(jobId, jobs))
      : Promise.resolve(null),
    readEstimateSamples(),
  ]);

  return {
    status: mapState(state),
    progress,
    files: null,
    warnings: [],
    error: null,
    queuePosition,
    meta,
    timing,
    estimate: estimateForJob({
      state,
      pages: targetPageCountForMetadata(metadata),
      processedOn: job.processedOn ?? null,
      now: Date.now(),
      samples: estimateSamples,
    }),
  };
}

export async function listOutputFiles(jobId: string): Promise<ResultFile[]> {
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
      .sort(compareResultNames)
      .map(async (name) => {
        const fileStat = await stat(path.join(outDir, name));
        return {
          name,
          bytes: fileStat.size,
          measureCount: null,
          measuresPerPart: null,
        };
      }),
  );
}

export async function readJobMetadata(jobId: string): Promise<JobMetadata | null> {
  try {
    const raw = await readFile(metadataPath(jobId), "utf8");
    return parseJobMetadata(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseJobMetadata(value: unknown): JobMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.originalName !== "string" ||
    candidate.originalName.trim().length === 0 ||
    !isFiniteNonNegative(candidate.bytes) ||
    !Number.isInteger(candidate.bytes) ||
    !isFinitePositive(candidate.pages) ||
    !Number.isInteger(candidate.pages) ||
    typeof candidate.createdAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.createdAt))
  ) {
    return null;
  }

  const options = normalizeStoredConversionOptions(candidate.options, candidate.pages);
  if (!options) {
    return null;
  }

  return {
    ...candidate,
    originalName: candidate.originalName,
    bytes: candidate.bytes,
    pages: candidate.pages,
    createdAt: candidate.createdAt,
    options,
  };
}

export function publicJobMetadata(metadata: JobMetadata | null): PublicJobMetadata | null {
  if (!metadata) {
    return null;
  }

  return {
    originalName: metadata.originalName,
    bytes: metadata.bytes,
    pages: metadata.pages,
    createdAt: metadata.createdAt,
  };
}

export function metadataForRetry(metadata: JobMetadata, retryOf: string, createdAt = new Date()): JobMetadata {
  return {
    ...metadata,
    createdAt: createdAt.toISOString(),
    retryOf,
  };
}

export function targetPageCountForMetadata(metadata: JobMetadata | null) {
  return metadata ? (metadata.options.sheets?.length ?? metadata.pages) : null;
}

export function timingForJob(
  job: { timestamp: number; processedOn?: number; finishedOn?: number },
  now = Date.now(),
): JobTiming {
  const createdAt = normalizeTimestamp(job.timestamp, now);
  const startedAt = normalizeOptionalTimestamp(job.processedOn);
  const finishedAt = normalizeOptionalTimestamp(job.finishedOn);
  const end = finishedAt ?? Math.max(now, createdAt);

  return {
    createdAt,
    startedAt,
    finishedAt,
    elapsedMs: Math.max(0, end - createdAt),
  };
}

export function estimateForJob({
  state,
  pages,
  processedOn,
  now,
  samples,
}: {
  state: string;
  pages: number | null;
  processedOn: number | null;
  now: number;
  samples: readonly number[];
}): JobEstimate | null {
  const validSamples = samples.filter(isFinitePositive).slice(0, ESTIMATE_SAMPLE_LIMIT);
  if (
    validSamples.length < MINIMUM_ESTIMATE_SAMPLES ||
    pages === null ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    (!isQueuedState(state) && state !== "active")
  ) {
    return null;
  }

  const secondsPerPage = validSamples.reduce((sum, value) => sum + value, 0) / validSamples.length;
  const elapsedProcessingSeconds =
    state === "active" && processedOn !== null && Number.isFinite(processedOn)
      ? Math.max(0, now - processedOn) / 1_000
      : 0;
  const remainingSeconds = Math.max(1, Math.ceil(secondsPerPage * pages - elapsedProcessingSeconds));

  return {
    remainingSeconds,
    sampleCount: validSamples.length,
  };
}

export function progressForJobState(state: string, progress: unknown): ConversionProgress | null {
  if (isQueuedState(state)) {
    return null;
  }

  return normalizeProgress(progress);
}

export function queuePositionFromWaitingJobs(jobId: string, jobs: ReadonlyArray<{ id?: string }>) {
  const index = jobs.findIndex((job) => job.id === jobId);
  return index >= 0 ? index + 1 : null;
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

function isQueuedState(state: string) {
  return state === "waiting" || state === "delayed" || state === "prioritized" || state === "waiting-children";
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

async function readEstimateSamples() {
  try {
    const values = await withTimeout(
      () => getRedisClient().lrange(SECONDS_PER_PAGE_REDIS_KEY, 0, ESTIMATE_SAMPLE_LIMIT - 1),
      ESTIMATE_QUERY_TIMEOUT_MS,
    );
    return values.map(Number).filter(isFinitePositive);
  } catch {
    // ETA is advisory. A metrics read must never make the status route fail.
    return [];
  }
}

function normalizeTimestamp(value: unknown, fallback: number) {
  return isFiniteNonNegative(value) ? value : fallback;
}

function normalizeOptionalTimestamp(value: unknown) {
  return isFiniteNonNegative(value) ? value : null;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
