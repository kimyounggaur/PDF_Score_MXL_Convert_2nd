import type { ErrorCode } from "./errors";
import type { ResultFile } from "./result-files";
import type { SuspectMeasure } from "./suspect-measures";

export type { SuspectMeasure } from "./suspect-measures";

export type JobProgress = {
  pct: number;
  stage: string;
  sheet: { current: number; total: number } | null;
};

export type JobFile = ResultFile;

export type JobWarning = {
  code: "SKIPPED_PAGES";
  pages: number[];
};

export type JobMeta = {
  originalName: string;
  bytes: number;
  pages: number;
  createdAt: string;
};

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

export type JobStatus = {
  status: "queued" | "active" | "completed" | "failed";
  progress: JobProgress | null;
  queuePosition: number | null;
  meta: JobMeta | null;
  timing: JobTiming | null;
  estimate: JobEstimate | null;
  files: JobFile[] | null;
  warnings: JobWarning[];
  suspectMeasures: SuspectMeasure[];
  error: { code: ErrorCode | string; message: string } | null;
};

export type StoredJob = {
  jobId: string;
  fileName: string;
  createdAt: string;
};

export type ServiceStatus = {
  redis: "ok" | "down";
  workers: number | null;
  waiting: number | null;
  active: number | null;
  diskFreeBytes: number | null;
  engineVersion: string;
};

