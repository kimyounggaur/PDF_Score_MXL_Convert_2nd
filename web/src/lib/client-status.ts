import type { JobFile, JobProgress, JobStatus, JobWarning } from "./client-types";
import { normalizeResultFiles } from "./result-files";
import { suspectMeasuresForStatus } from "./suspect-measures";

export type FailedEventDisposition = "expired" | "recoverable" | "failed";

export type DoneEventData = {
  files: JobFile[];
  warnings?: JobWarning[];
  suspectMeasures: JobStatus["suspectMeasures"];
};

export function failedEventDisposition(failure: { code: string; recoverable?: boolean }): FailedEventDisposition {
  if (failure.code === "JOB_NOT_FOUND") {
    return "expired";
  }

  return failure.recoverable ? "recoverable" : "failed";
}

export function normalizeJobStatus(status: JobStatus): JobStatus {
  return {
    ...status,
    progress: status.progress ? normalizeJobProgress(status.progress) : null,
    queuePosition: typeof status.queuePosition === "number" ? status.queuePosition : null,
    meta: status.meta ?? null,
    timing: status.timing ?? null,
    estimate: status.estimate ?? null,
    files: normalizeResultFiles(status.files),
    warnings: Array.isArray(status.warnings) ? status.warnings : [],
    suspectMeasures: suspectMeasuresForStatus(status.status, status.suspectMeasures),
  };
}

export function normalizeJobProgress(progress: JobProgress): JobProgress {
  return {
    ...progress,
    sheet: progress.sheet ?? null,
  };
}

export function normalizeDoneEventData(value: unknown): DoneEventData | null {
  if (typeof value !== "object" || value === null || !("files" in value)) {
    return null;
  }

  const result = value as { files: unknown; warnings?: unknown; suspectMeasures?: unknown };
  const files = normalizeResultFiles(result.files);
  if (!files) {
    return null;
  }

  return {
    files,
    warnings: Array.isArray(result.warnings) ? (result.warnings as JobWarning[]) : undefined,
    suspectMeasures: suspectMeasuresForStatus("completed", result.suspectMeasures),
  };
}
