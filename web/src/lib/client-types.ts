import type { ErrorCode } from "./errors";

export type JobProgress = {
  pct: number;
  stage: string;
  sheet: { current: number; total: number } | null;
};

export type JobFile = {
  name: string;
  bytes: number;
};

export type JobWarning = {
  code: "SKIPPED_PAGES";
  pages: number[];
};

export type JobStatus = {
  status: "queued" | "active" | "completed" | "failed";
  progress: JobProgress | null;
  files: JobFile[] | null;
  warnings: JobWarning[];
  error: { code: ErrorCode | string; message: string } | null;
};

export type StoredJob = {
  jobId: string;
  fileName: string;
  createdAt: string;
};

