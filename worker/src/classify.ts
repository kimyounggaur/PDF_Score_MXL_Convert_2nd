import type { ConversionFailureCode } from "./types.js";

export type EngineSignals = {
  outOfMemory: boolean;
  noOutput: boolean;
};

export class EngineSignalCollector {
  private outOfMemory = false;
  private noOutput = false;

  pushLine(line: string) {
    if (line.includes("java.lang.OutOfMemoryError")) {
      this.outOfMemory = true;
    }

    if (
      line.includes("No system found") ||
      line.includes("flagged as invalid") ||
      line.includes("Could not export since transcription did not complete")
    ) {
      this.noOutput = true;
    }
  }

  getSignals(): EngineSignals {
    return {
      outOfMemory: this.outOfMemory,
      noOutput: this.noOutput,
    };
  }
}

export type ConversionClassificationInput = {
  timedOut: boolean;
  outputCount: number;
  allOutputsValid: boolean;
  invalidSheets: number[];
  targetSheets: number[];
  omrExists: boolean;
  outOfMemory: boolean;
  noOutputSignal: boolean;
  recoveryAttempted: boolean;
  exitCode: number | null;
  spawnError: string | null;
};

export type ConversionClassification =
  | { kind: "success" }
  | { kind: "recover"; sheets: number[] }
  | { kind: "failure"; code: ConversionFailureCode };

/** Applies the outcome rules in their documented order. Exit status is diagnostic only. */
export function classifyConversion(input: ConversionClassificationInput): ConversionClassification {
  if (input.timedOut) {
    return { kind: "failure", code: "TIMEOUT" };
  }

  if (input.outputCount > 0 && input.allOutputsValid) {
    return { kind: "success" };
  }

  if (input.outputCount > 0) {
    return { kind: "failure", code: "INVALID_OUTPUT" };
  }

  const invalid = new Set(input.invalidSheets);
  const normalSheets = input.targetSheets.filter((sheet) => !invalid.has(sheet));
  if (
    !input.recoveryAttempted &&
    input.invalidSheets.length > 0 &&
    normalSheets.length > 0 &&
    input.omrExists
  ) {
    return { kind: "recover", sheets: normalSheets };
  }

  if (input.outOfMemory) {
    return { kind: "failure", code: "OUT_OF_MEMORY" };
  }

  if (input.noOutputSignal) {
    return { kind: "failure", code: "NO_OUTPUT" };
  }

  return { kind: "failure", code: "ENGINE_ERROR" };
}
