export const MAX_SUSPECT_MEASURES = 50;

export type SuspectMeasure = {
  file: string;
  part: string;
  measure: number;
  reason: "DURATION_MISMATCH";
};

export function normalizeSuspectMeasures(value: unknown): SuspectMeasure[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const suspects: SuspectMeasure[] = [];
  for (const item of value) {
    const suspect = normalizeSuspectMeasure(item);
    if (suspect) {
      suspects.push(suspect);
      if (suspects.length === MAX_SUSPECT_MEASURES) {
        break;
      }
    }
  }

  return suspects;
}

export function suspectMeasuresForStatus(status: string, value: unknown): SuspectMeasure[] {
  return status === "completed" ? normalizeSuspectMeasures(value) : [];
}

function normalizeSuspectMeasure(value: unknown): SuspectMeasure | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.file !== "string" ||
    candidate.file.trim().length === 0 ||
    typeof candidate.part !== "string" ||
    candidate.part.trim().length === 0 ||
    !Number.isSafeInteger(candidate.measure) ||
    (candidate.measure as number) < 1 ||
    candidate.reason !== "DURATION_MISMATCH"
  ) {
    return null;
  }

  return {
    file: candidate.file,
    part: candidate.part,
    measure: candidate.measure as number,
    reason: candidate.reason,
  };
}
