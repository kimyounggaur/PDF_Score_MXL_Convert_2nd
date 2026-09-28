export type ConversionJobData = {
  jobId: string;
};

export type ConversionProgress = {
  pct: number;
  stage: string;
  sheet: {
    current: number;
    total: number;
  } | null;
};

export type ConversionFile = {
  name: string;
  bytes: number;
  measureCount: number;
  measuresPerPart: Record<string, number>;
};

export type ConversionWarning = {
  code: "SKIPPED_PAGES";
  pages: number[];
};

export type ConversionResult = {
  files: ConversionFile[];
  durationMs: number;
  warnings: ConversionWarning[];
  totalSheets: number | null;
  targetSheets: number[];
  invalidSheets: number[];
  recovered: boolean;
};

export type ConversionFailureCode =
  | "CANCELLED"
  | "TIMEOUT"
  | "NO_OUTPUT"
  | "OUT_OF_MEMORY"
  | "ENGINE_ERROR"
  | "INVALID_OUTPUT";

export type ConversionDiagnostics = {
  totalSheets: number | null;
  targetSheets: number[];
  invalidSheets: number[];
  recovered: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError: string | null;
  engineTail: string[];
};

export class ConversionError extends Error {
  constructor(
    public readonly code: ConversionFailureCode,
    public readonly details?: string,
    public readonly diagnostics?: ConversionDiagnostics,
  ) {
    super(code);
    this.name = "ConversionError";
  }
}
