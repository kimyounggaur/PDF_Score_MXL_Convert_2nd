import type { SuspectMeasure } from "./client-types";

export type SuspectMeasureLocation = {
  file: string;
  measure: number;
  parts: string[];
};

export function groupSuspectMeasureLocations(
  suspects: SuspectMeasure[],
  fileOrder: string[],
): SuspectMeasureLocation[] {
  const grouped = new Map<string, Map<number, Set<string>>>();

  for (const suspect of suspects) {
    let measures = grouped.get(suspect.file);
    if (!measures) {
      measures = new Map<number, Set<string>>();
      grouped.set(suspect.file, measures);
    }

    let parts = measures.get(suspect.measure);
    if (!parts) {
      parts = new Set<string>();
      measures.set(suspect.measure, parts);
    }
    parts.add(suspect.part);
  }

  const fileRanks = new Map(fileOrder.map((file, index) => [file, index]));
  return [...grouped.entries()]
    .flatMap(([file, measures]) =>
      [...measures.entries()].map(([measure, parts]) => ({
        file,
        measure,
        parts: [...parts].sort((left, right) => left.localeCompare(right)),
      })),
    )
    .sort((left, right) => {
      const leftRank = fileRanks.get(left.file) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = fileRanks.get(right.file) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.file.localeCompare(right.file) || left.measure - right.measure;
    });
}
