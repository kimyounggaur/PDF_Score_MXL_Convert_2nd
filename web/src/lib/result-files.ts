export type ResultFile = {
  name: string;
  bytes: number;
  measureCount: number | null;
  measuresPerPart: Record<string, number> | null;
};

export function normalizeResultFiles(value: unknown): ResultFile[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const files: ResultFile[] = [];
  for (const item of value) {
    const file = normalizeResultFile(item);
    if (!file) {
      return null;
    }
    files.push(file);
  }

  return files;
}

function normalizeResultFile(value: unknown): ResultFile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.name !== "string" ||
    candidate.name.length === 0 ||
    !Number.isSafeInteger(candidate.bytes) ||
    (candidate.bytes as number) < 0
  ) {
    return null;
  }

  const measureCount = positiveInteger(candidate.measureCount);
  const measuresPerPart = normalizeMeasuresPerPart(candidate.measuresPerPart);
  const hasCompleteSummary = measureCount !== null && measuresPerPart !== null;

  return {
    name: candidate.name,
    bytes: candidate.bytes as number,
    measureCount: hasCompleteSummary ? measureCount : null,
    measuresPerPart: hasCompleteSummary ? measuresPerPart : null,
  };
}

function normalizeMeasuresPerPart(value: unknown): Record<string, number> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value);
  if (entries.some(([part, count]) => part.length === 0 || !Number.isSafeInteger(count) || (count as number) < 0)) {
    return null;
  }

  return Object.fromEntries(entries) as Record<string, number>;
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null;
}
