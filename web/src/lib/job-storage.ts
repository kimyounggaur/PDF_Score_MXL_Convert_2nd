import type { StoredJob } from "./client-types";

export const STORED_JOBS_KEY = "pdf-score-mxl:jobs";
export const STORED_JOB_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_STORED_JOBS = 30;

export function deserializeStoredJobs(raw: string | null, now = Date.now()): StoredJob[] {
  if (!raw) {
    return [];
  }

  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? pruneStoredJobs(value, now) : [];
  } catch {
    return [];
  }
}

export function serializeStoredJobs(jobs: StoredJob[], now = Date.now()): string {
  return JSON.stringify(pruneStoredJobs(jobs, now));
}

export function pruneStoredJobs(jobs: unknown[], now = Date.now()): StoredJob[] {
  const cutoff = now - STORED_JOB_TTL_MS;
  const validJobs = jobs
    .filter(isStoredJob)
    .map((job) => ({ job, createdAtMs: Date.parse(job.createdAt) }))
    .filter(({ createdAtMs }) => Number.isFinite(createdAtMs) && createdAtMs > cutoff)
    .sort((left, right) => right.createdAtMs - left.createdAtMs);

  const seen = new Set<string>();
  const result: StoredJob[] = [];

  for (const { job } of validJobs) {
    if (seen.has(job.jobId)) {
      continue;
    }

    seen.add(job.jobId);
    result.push(job);

    if (result.length === MAX_STORED_JOBS) {
      break;
    }
  }

  return result;
}

function isStoredJob(value: unknown): value is StoredJob {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const job = value as Partial<StoredJob>;
  return typeof job.jobId === "string" && typeof job.fileName === "string" && typeof job.createdAt === "string";
}
