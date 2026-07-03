import type { ConversionProgress } from "./types.js";

const STAGES = [
  "LOAD",
  "BINARY",
  "SCALE",
  "GRID",
  "HEADERS",
  "STEM_SEEDS",
  "BEAMS",
  "LEDGERS",
  "HEADS",
  "STEMS",
  "REDUCTION",
  "CUE_BEAMS",
  "TEXTS",
  "MEASURES",
  "CHORDS",
  "CURVES",
  "SYMBOLS",
  "LINKS",
  "RHYTHMS",
  "PAGE",
] as const;

const STAGE_WEIGHT = 92 / STAGES.length;

export function parseAudiverisProgress(line: string, previous?: ConversionProgress): ConversionProgress | null {
  const upper = line.toUpperCase();
  const foundIndex = STAGES.findIndex((stage) => upper.includes(stage));

  if (foundIndex === -1) {
    if (/PROCESS|EXPORT|SAVE|OMR|BOOK|SHEET/.test(upper)) {
      return {
        pct: Math.max(previous?.pct ?? 2, 2),
        stage: previous?.stage ?? "processing",
      };
    }

    return null;
  }

  const pct = Math.max(3, Math.min(95, Math.round(3 + foundIndex * STAGE_WEIGHT)));
  return {
    pct: Math.max(previous?.pct ?? 0, pct),
    stage: STAGES[foundIndex],
  };
}

