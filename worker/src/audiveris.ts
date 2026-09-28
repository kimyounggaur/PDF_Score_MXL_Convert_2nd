import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import type { Job } from "bullmq";
import { EngineSignalCollector, classifyConversion, type EngineSignals } from "./classify.js";
import { getAudiverisBin, getConversionTimeoutMs } from "./config.js";
import { engineLogPath, inputPdfPath, omrPath, outputDir } from "./paths.js";
import { AudiverisProgressTracker, LineBuffer, ProgressUpdateThrottler } from "./progress.js";
import type {
  ConversionDiagnostics,
  ConversionFailureCode,
  ConversionFile,
  ConversionJobData,
  ConversionResult,
  ConversionWarning,
} from "./types.js";
import { ConversionError } from "./types.js";
import { validateMxl, type MxlValidationResult } from "./validate-mxl.js";

const ENGINE_TAIL_LINES = 30;

type EngineRunResult = {
  cancelled: boolean;
  timedOut: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnError: string | null;
  signals: EngineSignals;
};

type InspectedOutputs = {
  files: ConversionFile[];
  outputCount: number;
  allValid: boolean;
  invalidReasons: string[];
};

export async function runAudiverisConversion(
  job: Job<ConversionJobData>,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  const startedAt = Date.now();
  const deadline = startedAt + getConversionTimeoutMs();
  const jobId = job.data.jobId;
  const outDir = outputDir(jobId);
  const inputPath = inputPdfPath(jobId);
  const savedOmrPath = omrPath(jobId);

  await mkdir(outDir, { recursive: true });

  const progressTracker = new AudiverisProgressTracker();
  await job.updateProgress(progressTracker.getProgress());

  const progressPublisher = new ProgressUpdateThrottler(async (progress) => {
    await job.updateProgress(progress).catch(() => undefined);
  });
  const engineTail: string[] = [];
  const engineLog = await openEngineLog(engineLogPath(jobId));
  let lastRun: EngineRunResult = emptyRunResult();
  let initialTargetSheets: number[] = [];
  let initialTotalSheets: number | null = null;
  let recoveryAttempted = false;

  const consumeLine = (collector: EngineSignalCollector, line: string) => {
    if (!line.trim()) {
      return;
    }

    engineTail.push(line);
    if (engineTail.length > ENGINE_TAIL_LINES) {
      engineTail.shift();
    }

    collector.pushLine(line);
    const update = progressTracker.pushLine(line);
    if (update) {
      progressPublisher.publish(update.progress, update.immediate);
    }
  };

  try {
    lastRun = await runEngineProcess({
      args: initialArguments(outDir, inputPath),
      timeoutMs: remainingTime(deadline),
      engineLog,
      consumeLine,
      signal,
    });

    initialTargetSheets = progressTracker.getTargetSheets();
    initialTotalSheets = progressTracker.getTotalSheets();
    throwIfCancelled(signal, lastRun, progressTracker, engineTail, initialTotalSheets, initialTargetSheets);
    let outputs = await inspectOutputs(outDir);
    throwIfCancelled(signal, lastRun, progressTracker, engineTail, initialTotalSheets, initialTargetSheets);
    let classification = classifyConversion({
      timedOut: lastRun.timedOut,
      outputCount: outputs.outputCount,
      allOutputsValid: outputs.allValid,
      invalidSheets: progressTracker.getInvalidSheets(),
      targetSheets: initialTargetSheets,
      omrExists: await isFile(savedOmrPath),
      outOfMemory: lastRun.signals.outOfMemory,
      noOutputSignal: lastRun.signals.noOutput,
      recoveryAttempted,
      exitCode: lastRun.exitCode,
      spawnError: lastRun.spawnError,
    });

    if (classification.kind === "recover") {
      recoveryAttempted = true;
      const timeoutMs = remainingTime(deadline);
      if (timeoutMs <= 0) {
        lastRun = { ...emptyRunResult(), timedOut: true };
        classification = { kind: "failure", code: "TIMEOUT" };
      } else {
        await progressPublisher.flush();
        await job.updateProgress({
          pct: 96,
          stage: "EXPORT",
          sheet: progressTracker.getProgress().sheet,
        });
        engineLog.write("\n--- automatic recovery ---\n");
        lastRun = await runEngineProcess({
          args: recoveryArguments(classification.sheets, savedOmrPath),
          timeoutMs,
          engineLog,
          consumeLine,
          signal,
        });
        throwIfCancelled(signal, lastRun, progressTracker, engineTail, initialTotalSheets, initialTargetSheets);
        outputs = await inspectOutputs(outDir);
        throwIfCancelled(signal, lastRun, progressTracker, engineTail, initialTotalSheets, initialTargetSheets);
        classification = classifyConversion({
          timedOut: lastRun.timedOut,
          outputCount: outputs.outputCount,
          allOutputsValid: outputs.allValid,
          invalidSheets: progressTracker.getInvalidSheets(),
          targetSheets: initialTargetSheets,
          omrExists: await isFile(savedOmrPath),
          outOfMemory: lastRun.signals.outOfMemory,
          noOutputSignal: lastRun.signals.noOutput,
          recoveryAttempted,
          exitCode: lastRun.exitCode,
          spawnError: lastRun.spawnError,
        });
      }
    }

    if (classification.kind === "failure") {
      throw conversionFailure(
        classification.code,
        lastRun,
        outputs.invalidReasons,
        diagnostics({
          progressTracker,
          engineTail,
          run: lastRun,
          totalSheets: initialTotalSheets,
          targetSheets: initialTargetSheets,
          recovered: false,
        }),
      );
    }

    if (classification.kind !== "success") {
      throw conversionFailure(
        "ENGINE_ERROR",
        lastRun,
        ["Recovery was requested but not executed"],
        diagnostics({
          progressTracker,
          engineTail,
          run: lastRun,
          totalSheets: initialTotalSheets,
          targetSheets: initialTargetSheets,
          recovered: false,
        }),
      );
    }

    await progressPublisher.flush();
    throwIfCancelled(signal, lastRun, progressTracker, engineTail, initialTotalSheets, initialTargetSheets);
    const sheet = progressTracker.getProgress().sheet;
    await job.updateProgress({ pct: 98, stage: "collecting", sheet });

    const invalidSheets = progressTracker.getInvalidSheets();
    const warnings: ConversionWarning[] = invalidSheets.length > 0
      ? [{ code: "SKIPPED_PAGES", pages: invalidSheets }]
      : [];
    const recovered = recoveryAttempted;

    await job.updateProgress({ pct: 100, stage: "completed", sheet });
    throwIfCancelled(signal, lastRun, progressTracker, engineTail, initialTotalSheets, initialTargetSheets);
    return {
      files: outputs.files,
      durationMs: Date.now() - startedAt,
      warnings,
      totalSheets: initialTotalSheets,
      targetSheets: initialTargetSheets,
      invalidSheets,
      recovered,
    };
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }

    throw new ConversionError(
      "ENGINE_ERROR",
      error instanceof Error ? error.message : String(error),
      diagnostics({
        progressTracker,
        engineTail,
        run: lastRun,
        totalSheets: initialTotalSheets,
        targetSheets: initialTargetSheets,
        recovered: false,
      }),
    );
  } finally {
    await progressPublisher.close(false);
    engineLog.end();
    await finished(engineLog).catch(() => undefined);
  }
}

function initialArguments(outDir: string, inputPath: string) {
  return [
    "-batch",
    "-export",
    "-save",
    "-output",
    outDir,
    "-constant",
    "org.audiveris.omr.text.Language.defaultSpecification=eng",
    "--",
    inputPath,
  ];
}

function recoveryArguments(sheets: number[], savedOmrPath: string) {
  return [
    "-batch",
    "-export",
    "-sheets",
    ...sheets.map(String),
    "--",
    savedOmrPath,
  ];
}

async function runEngineProcess(options: {
  args: string[];
  timeoutMs: number;
  engineLog: WriteStream;
  consumeLine: (collector: EngineSignalCollector, line: string) => void;
  signal?: AbortSignal;
}): Promise<EngineRunResult> {
  if (options.signal?.aborted) {
    return { ...emptyRunResult(), cancelled: true };
  }

  if (options.timeoutMs <= 0) {
    return { ...emptyRunResult(), timedOut: true };
  }

  const collector = new EngineSignalCollector();
  let child: ReturnType<typeof spawn>;

  try {
    child = spawn(getAudiverisBin(), options.args, {
      detached: true,
      env: {
        ...process.env,
        JAVA_TOOL_OPTIONS: process.env.JAVA_TOOL_OPTIONS ?? "-Xmx4g -Djava.awt.headless=true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return {
      ...emptyRunResult(),
      spawnError: formatSpawnError(error),
      signals: collector.getSignals(),
    };
  }

  const stdoutLines = new LineBuffer((line) => options.consumeLine(collector, line));
  const stderrLines = new LineBuffer((line) => options.consumeLine(collector, line));
  let settled = false;
  let timedOut = false;
  let cancelled = false;

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.pipe(options.engineLog, { end: false });
  child.stderr?.pipe(options.engineLog, { end: false });
  child.stdout?.on("data", (chunk: string) => stdoutLines.push(chunk));
  child.stderr?.on("data", (chunk: string) => stderrLines.push(chunk));

  return await new Promise<EngineRunResult>((resolve) => {
    const timeout = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, options.timeoutMs);

    const abort = () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      killProcessGroup(child.pid);
    };

    const finish = (result: Omit<EngineRunResult, "signals" | "cancelled">) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      stdoutLines.flush();
      stderrLines.flush();
      resolve({ ...result, cancelled, signals: collector.getSignals() });
    };

    child.once("error", (error) => {
      finish({
        timedOut,
        exitCode: null,
        signal: null,
        spawnError: formatSpawnError(error),
      });
    });

    child.once("close", (exitCode, signal) => {
      finish({
        timedOut,
        exitCode,
        signal,
        spawnError: null,
      });
    });

    options.signal?.addEventListener("abort", abort, { once: true });
    // Close the small race between the pre-spawn check and listener setup.
    // Process listeners are already installed so a very fast exit is observed.
    if (options.signal?.aborted) {
      abort();
    }
  });
}

export async function inspectOutputs(
  outDir: string,
  validate: (filePath: string) => Promise<MxlValidationResult> = validateMxl,
): Promise<InspectedOutputs> {
  const names = (await readdir(outDir))
    .filter((name) => name.toLowerCase().endsWith(".mxl"))
    .sort(compareOutputFileNames);
  const files: ConversionFile[] = [];
  const invalidReasons: string[] = [];

  for (const name of names) {
    const fullPath = path.join(outDir, name);
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      invalidReasons.push(`${name}: NOT_A_FILE`);
      continue;
    }

    const validation = await validate(fullPath);
    if (!validation.ok) {
      invalidReasons.push(`${name}: ${validation.reason}`);
      continue;
    }

    files.push({
      name,
      bytes: fileStat.size,
      measureCount: validation.measureCount,
      measuresPerPart: validation.measuresPerPart,
    });
  }

  return {
    files,
    outputCount: names.length,
    allValid: files.length > 0 && invalidReasons.length === 0 && files.length === names.length,
    invalidReasons,
  };
}

export function compareOutputFileNames(left: string, right: string) {
  const leftMovement = movementNumberForOutput(left);
  const rightMovement = movementNumberForOutput(right);

  if (leftMovement !== null && rightMovement !== null && leftMovement !== rightMovement) {
    return leftMovement - rightMovement;
  }

  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

function movementNumberForOutput(name: string) {
  const match = name.match(/\.mvt(\d+)\.mxl$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function conversionFailure(
  code: ConversionFailureCode,
  run: EngineRunResult,
  invalidReasons: string[],
  conversionDiagnostics: ConversionDiagnostics,
) {
  const details = [
    run.spawnError,
    run.exitCode === null ? null : `exitCode=${run.exitCode}`,
    run.signal ? `signal=${run.signal}` : null,
    ...invalidReasons,
  ].filter((value): value is string => Boolean(value));

  return new ConversionError(code, details.join("; ") || undefined, conversionDiagnostics);
}

function diagnostics(options: {
  progressTracker: AudiverisProgressTracker;
  engineTail: string[];
  run: EngineRunResult;
  totalSheets: number | null;
  targetSheets: number[];
  recovered: boolean;
}): ConversionDiagnostics {
  return {
    totalSheets: options.totalSheets,
    targetSheets: [...options.targetSheets],
    invalidSheets: options.progressTracker.getInvalidSheets(),
    recovered: options.recovered,
    exitCode: options.run.exitCode,
    signal: options.run.signal,
    spawnError: options.run.spawnError,
    engineTail: [...options.engineTail],
  };
}

async function openEngineLog(filePath: string) {
  const stream = createWriteStream(filePath, { flags: "w" });
  await new Promise<void>((resolve, reject) => {
    stream.once("open", () => resolve());
    stream.once("error", reject);
  });
  return stream;
}

async function isFile(filePath: string) {
  return (await stat(filePath).catch(() => null))?.isFile() ?? false;
}

function remainingTime(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

function emptyRunResult(): EngineRunResult {
  return {
    cancelled: false,
    timedOut: false,
    exitCode: null,
    signal: null,
    spawnError: null,
    signals: { outOfMemory: false, noOutput: false },
  };
}

function throwIfCancelled(
  signal: AbortSignal | undefined,
  run: EngineRunResult,
  progressTracker: AudiverisProgressTracker,
  engineTail: string[],
  totalSheets: number | null,
  targetSheets: number[],
) {
  if (!run.cancelled && !signal?.aborted) {
    return;
  }

  throw new ConversionError(
    "CANCELLED",
    undefined,
    diagnostics({
      progressTracker,
      engineTail,
      run,
      totalSheets,
      targetSheets,
      recovered: false,
    }),
  );
}

function formatSpawnError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code ? `${code}: ${error.message}` : error.message;
}

function killProcessGroup(pid: number | undefined) {
  if (!pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      process.kill(pid, "SIGKILL");
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}
