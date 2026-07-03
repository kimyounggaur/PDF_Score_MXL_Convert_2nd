export type ConversionJobData = {
  jobId: string;
};

export type ConversionProgress = {
  pct: number;
  stage: string;
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
    message: string = code,
  ) {
    super(message);
    this.name = "ConversionError";
  }
}
