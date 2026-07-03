import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Job } from "bullmq";
import { getAudiverisBin, getConversionTimeoutMs } from "./config.js";
import { inputPdfPath, outputDir } from "./paths.js";
import { parseAudiverisProgress } from "./progress.js";
import type { ConversionJobData, ConversionProgress, ConversionResult } from "./types.js";
import { ConversionError } from "./types.js";

const MAX_LOG_LINES = 500;

export async function runAudiverisConversion(job: Job<ConversionJobData>): Promise<ConversionResult> {
  const startedAt = Date.now();
  const jobId = job.data.jobId;
  const outDir = outputDir(jobId);
  const inputPath = inputPdfPath(jobId);

  await mkdir(outDir, { recursive: true });
  await job.updateProgress({ pct: 1, stage: "queued" });

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
  let progress: ConversionProgress = { pct: 1, stage: "starting" };
  let timedOut = false;
  let settled = false;

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

    const parsed = parseAudiverisProgress(line, progress);
    if (parsed && (parsed.pct !== progress.pct || parsed.stage !== progress.stage)) {
      progress = parsed;
      void job.updateProgress(progress).catch(() => undefined);
    }
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => chunk.split(/\r?\n/).forEach(consumeLine));
  child.stderr?.on("data", (chunk: string) => chunk.split(/\r?\n/).forEach(consumeLine));

  return await new Promise<ConversionResult>((resolve, reject) => {
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new ConversionError("ENGINE_ERROR", error.message));
    });

    child.on("close", async (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      try {
        if (timedOut) {
          throw new ConversionError("TIMEOUT");
        }

        if (code !== 0) {
          throw new ConversionError("ENGINE_ERROR", `Audiveris exited with code ${code ?? "null"} signal ${signal ?? "none"}\n${lines.join("\n")}`);
        }

        await job.updateProgress({ pct: 96, stage: "collecting" });
        const files = await listMxlFiles(outDir);

        if (files.length === 0) {
          throw new ConversionError("NO_OUTPUT");
        }

        await job.updateProgress({ pct: 100, stage: "completed" });
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

