export type FailedEventDisposition = "expired" | "recoverable" | "failed";

export function failedEventDisposition(failure: { code: string; recoverable?: boolean }): FailedEventDisposition {
  if (failure.code === "JOB_NOT_FOUND") {
    return "expired";
  }

  return failure.recoverable ? "recoverable" : "failed";
}
