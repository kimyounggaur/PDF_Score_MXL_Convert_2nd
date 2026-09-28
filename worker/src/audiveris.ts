import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Job } from "bullmq";
import { getAudiverisBin, getConversionTimeoutMs } from "./config.js";
import { inputPdfPath, outputDir } from "./paths.js";
import { AudiverisProgressTracker, LineBuffer, ProgressUpdateThrottler } from "./progress.js";
import type { ConversionJobData, ConversionResult } from "./types.js";
import { ConversionError } from "./types.js";
import { validateMxl } from "./validate-mxl.js";

const MAX_LOG_LINES = 500;

export async function runAudiverisConversion(job: Job<ConversionJobData>): Promise<ConversionResult> {
  const startedAt = Date.now();
  const jobId = job.data.jobId;
  const outDir = outputDir(jobId);
  const inputPath = inputPdfPath(jobId);

  await mkdir(outDir, { recursive: true });

  const progressTracker = new AudiverisProgressTracker();
  await job.updateProgress(progressTracker.getProgress());

  const args = [
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

  const lines: string[] = [];
  let timedOut = false;
  let settled = false;

  const progressPublisher = new ProgressUpdateThrottler(async (progress) => {
    await job.updateProgress(progress).catch(() => undefined);
  });

  const child = spawn(getAudiverisBin(), args, {
    detached: true,
    env: {
      ...process.env,
      JAVA_OPTS: process.env.JAVA_OPTS ?? "-Xmx4g -Djava.awt.headless=true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    killProcessGroup(child.pid);
  }, getConversionTimeoutMs());

  const consumeLine = (line: string) => {
    if (!line.trim()) {
      return;
    }

    lines.push(line);
    if (lines.length > MAX_LOG_LINES) {
      lines.shift();
    }

    const update = progressTracker.pushLine(line);
    if (update) {
      progressPublisher.publish(update.progress, update.immediate);
    }
  };

  const stdoutLines = new LineBuffer(consumeLine);
  const stderrLines = new LineBuffer(consumeLine);
  const flushLineBuffers = () => {
    stdoutLines.flush();
    stderrLines.flush();
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => stdoutLines.push(chunk));
  child.stderr?.on("data", (chunk: string) => stderrLines.push(chunk));

  return await new Promise<ConversionResult>((resolve, reject) => {
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      flushLineBuffers();
      void progressPublisher.close(false).finally(() => {
        reject(new ConversionError("ENGINE_ERROR", error.message));
      });
    });

    child.on("close", async (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      flushLineBuffers();
      await progressPublisher.close(false);

      try {
        if (timedOut) {
          throw new ConversionError("TIMEOUT");
        }

        if (code !== 0) {
          throw new ConversionError("ENGINE_ERROR", `Audiveris exited with code ${code ?? "null"} signal ${signal ?? "none"}\n${lines.join("\n")}`);
        }

        const sheet = progressTracker.getProgress().sheet;
        await job.updateProgress({ pct: 98, stage: "collecting", sheet });
        const files = await listMxlFiles(outDir);

        if (files.length === 0) {
          throw new ConversionError("NO_OUTPUT");
        }

        for (const file of files) {
          const validation = await validateMxl(path.join(outDir, file.name));
          if (!validation.ok) {
            throw new ConversionError("INVALID_OUTPUT", validation.reason);
          }
        }

        await job.updateProgress({ pct: 100, stage: "completed", sheet });
        resolve({
          files,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function listMxlFiles(outDir: string) {
  const entries = await readdir(outDir);
  const files = await Promise.all(
    entries
      .filter((name) => name.toLowerCase().endsWith(".mxl"))
      .sort((a, b) => a.localeCompare(b, "en"))
      .map(async (name) => {
        const fullPath = path.join(outDir, name);
        const fileStat = await stat(fullPath);
        return { name, bytes: fileStat.size };
      }),
  );

  return files;
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
