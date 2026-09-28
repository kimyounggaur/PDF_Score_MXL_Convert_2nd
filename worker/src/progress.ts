import type { ConversionProgress } from "./types.js";

export const AUDIVERIS_STAGES = [
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

type AudiverisStage = (typeof AUDIVERIS_STAGES)[number];

export type ProgressUpdate = {
  progress: ConversionProgress;
  immediate: boolean;
};

const TOTAL_SHEETS_LINE = /\b(\d+)\s+sheets?\s+in\s+/;
const TARGET_SHEETS_LINE = /reaching PAGE on sheets:\[((?:#\d+)+)\]/;
const STAGE_LINE = /\[[^\]\s]*?(?:#(\d+))?\]\s+StepMonitoring\s+\d+\s+\|\s+([A-Z_]+)\s*$/;
const INVALID_SHEET_LINE = /Sheet\s+\S*?(?:#(\d+))?\s+flagged as invalid\b/;
const EXPORTING_LINE = /Exporting sheet\(s\)/;
const EXPORTED_LINE = /exported to .+\.mxl\s*$/i;

/**
 * Parses only the stable, structured Audiveris log lines documented in
 * docs/IMPROVEMENT_V2.md. Stage-like words in all other messages are ignored.
 */
export class AudiverisProgressTracker {
  private totalSheets: number | null = null;
  private targetSheets: number[];
  private readonly configuredTargetSheets: number[] | null;
  private readonly invalidSheets = new Set<number>();
  private currentSourceSheet: number | null = null;
  private lastCompletedStep = -1;
  private progress: ConversionProgress = {
    pct: 2,
    stage: "starting",
    sheet: null,
  };

  constructor(targetSheets?: readonly number[]) {
    this.configuredTargetSheets = targetSheets ? [...targetSheets] : null;
    this.targetSheets = this.configuredTargetSheets ? [...this.configuredTargetSheets] : [];
  }

  pushLine(line: string): ProgressUpdate | null {
    const totalMatch = line.match(TOTAL_SHEETS_LINE);
    if (totalMatch) {
      const total = Number(totalMatch[1]);
      if (Number.isSafeInteger(total) && total > 0) {
        this.totalSheets = total;
        if (this.targetSheets.length === 0) {
          this.targetSheets = Array.from({ length: total }, (_, index) => index + 1);
        }
      }
      return null;
    }

    const targetsMatch = line.match(TARGET_SHEETS_LINE);
    if (targetsMatch) {
      const targets = [...targetsMatch[1].matchAll(/#(\d+)/g)]
        .map((match) => Number(match[1]))
        .filter((sheet, index, values) => Number.isSafeInteger(sheet) && sheet > 0 && values.indexOf(sheet) === index);

      if (targets.length > 0 && this.configuredTargetSheets === null) {
        this.targetSheets = targets;
      }
      return null;
    }

    const invalidMatch = line.match(INVALID_SHEET_LINE);
    if (invalidMatch) {
      const invalidSheet = this.resolveSheetNumber(invalidMatch[1]);
      if (
        invalidSheet !== null &&
        (this.targetSheets.length === 0 || this.targetSheets.includes(invalidSheet))
      ) {
        this.invalidSheets.add(invalidSheet);
      }
      return null;
    }

    if (EXPORTING_LINE.test(line)) {
      return this.setFixedProgress(96, "EXPORT");
    }

    if (EXPORTED_LINE.test(line)) {
      return this.setFixedProgress(97, "EXPORT");
    }

    const stageMatch = line.match(STAGE_LINE);
    if (!stageMatch) {
      return null;
    }

    const stage = stageMatch[2] as AudiverisStage;
    const stageIndex = AUDIVERIS_STAGES.indexOf(stage);
    if (stageIndex < 0 || this.targetSheets.length === 0) {
      return null;
    }

    const sourceSheet = this.resolveSheetNumber(stageMatch[1]);
    if (sourceSheet === null) {
      return null;
    }

    const targetIndex = this.targetSheets.indexOf(sourceSheet);
    if (targetIndex < 0) {
      return null;
    }

    const completedStep = targetIndex * AUDIVERIS_STAGES.length + stageIndex + 1;
    if (completedStep < this.lastCompletedStep) {
      return null;
    }

    const previousSheet = this.progress.sheet?.current ?? null;
    const currentSheet = targetIndex + 1;
    const pct = Math.max(
      this.progress.pct,
      3 + Math.floor((90 * completedStep) / (this.targetSheets.length * AUDIVERIS_STAGES.length)),
    );

    if (
      completedStep === this.lastCompletedStep &&
      pct === this.progress.pct &&
      stage === this.progress.stage &&
      previousSheet === currentSheet
    ) {
      return null;
    }

    this.lastCompletedStep = completedStep;
    this.currentSourceSheet = sourceSheet;
    this.progress = {
      pct,
      stage,
      sheet: {
        current: currentSheet,
        total: this.targetSheets.length,
      },
    };

    return {
      progress: this.getProgress(),
      immediate: previousSheet !== currentSheet,
    };
  }

  getProgress(): ConversionProgress {
    return cloneProgress(this.progress);
  }

  getTotalSheets() {
    return this.totalSheets;
  }

  getTargetSheets() {
    return [...this.targetSheets];
  }

  getInvalidSheets() {
    return [...this.invalidSheets].sort((left, right) => left - right);
  }

  private resolveSheetNumber(captured: string | undefined) {
    if (captured) {
      const parsed = Number(captured);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }

    if (this.currentSourceSheet !== null) {
      return this.currentSourceSheet;
    }

    if (this.targetSheets.length === 1) {
      return this.targetSheets[0];
    }

    if (this.totalSheets === 1) {
      return 1;
    }

    return null;
  }

  private setFixedProgress(pct: number, stage: string): ProgressUpdate | null {
    if (pct < this.progress.pct || (pct === this.progress.pct && stage === this.progress.stage)) {
      return null;
    }

    this.progress = {
      pct,
      stage,
      sheet: this.progress.sheet ? { ...this.progress.sheet } : null,
    };

    return {
      progress: this.getProgress(),
      immediate: true,
    };
  }
}

/** Keeps incomplete stream chunks until a complete line is available. */
export class LineBuffer {
  private remainder = "";

  constructor(private readonly consumeLine: (line: string) => void) {}

  push(chunk: string) {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    for (const line of lines) {
      this.consumeLine(line);
    }
  }

  flush() {
    if (this.remainder.length === 0) {
      return;
    }

    const line = this.remainder.endsWith("\r") ? this.remainder.slice(0, -1) : this.remainder;
    this.remainder = "";
    this.consumeLine(line);
  }
}

export type ProgressThrottleScheduler = {
  now: () => number;
  set: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
};

const DEFAULT_SCHEDULER: ProgressThrottleScheduler = {
  now: Date.now,
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Coalesces ordinary updates while allowing sheet changes and export updates through immediately. */
export class ProgressUpdateThrottler {
  private pending: ConversionProgress | null = null;
  private timer: unknown = null;
  private lastSentAt: number | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly write: (progress: ConversionProgress) => Promise<void> | void,
    private readonly intervalMs = 500,
    private readonly scheduler: ProgressThrottleScheduler = DEFAULT_SCHEDULER,
  ) {}

  publish(progress: ConversionProgress, immediate = false) {
    if (this.closed) {
      return;
    }

    this.pending = cloneProgress(progress);
    const elapsed = this.lastSentAt === null ? Number.POSITIVE_INFINITY : this.scheduler.now() - this.lastSentAt;

    if (immediate || elapsed >= this.intervalMs) {
      this.clearTimer();
      this.dispatchPending();
      return;
    }

    if (this.timer === null) {
      this.timer = this.scheduler.set(() => {
        this.timer = null;
        this.dispatchPending();
      }, Math.max(0, this.intervalMs - elapsed));
    }
  }

  async flush() {
    this.clearTimer();
    this.dispatchPending();
    await this.writeChain;
  }

  async close(flushPending = true) {
    if (this.closed) {
      await this.writeChain;
      return;
    }

    this.closed = true;
    this.clearTimer();
    if (flushPending) {
      this.dispatchPending();
    } else {
      this.pending = null;
    }
    await this.writeChain;
  }

  private dispatchPending() {
    if (!this.pending) {
      return;
    }

    const progress = this.pending;
    this.pending = null;
    this.lastSentAt = this.scheduler.now();
    this.writeChain = this.writeChain.then(async () => this.write(progress));
  }

  private clearTimer() {
    if (this.timer === null) {
      return;
    }

    this.scheduler.clear(this.timer);
    this.timer = null;
  }
}

function cloneProgress(progress: ConversionProgress): ConversionProgress {
  return {
    pct: progress.pct,
    stage: progress.stage,
    sheet: progress.sheet ? { ...progress.sheet } : null,
  };
}
