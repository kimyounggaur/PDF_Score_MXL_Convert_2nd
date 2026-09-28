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
};

export type ConversionResult = {
  files: ConversionFile[];
  durationMs: number;
};

export type ConversionFailureCode =
  | "TIMEOUT"
  | "NO_OUTPUT"
  | "ENGINE_ERROR"
  | "INVALID_OUTPUT";

export class ConversionError extends Error {
  constructor(
    public readonly code: ConversionFailureCode,
    public readonly details?: string,
  ) {
    super(code);
    this.name = "ConversionError";
  }
}
