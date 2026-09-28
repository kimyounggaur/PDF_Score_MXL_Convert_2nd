import { Worker } from "bullmq";
import { QUEUE_NAME } from "./config.js";
import { getRedisConnectionOptions } from "./queue.js";
import { runAudiverisConversion } from "./audiveris.js";
import { ConversionError, type ConversionJobData } from "./types.js";
import { startMaintenance } from "./maintenance.js";

const maintenance = startMaintenance();

const worker = new Worker<ConversionJobData>(
  QUEUE_NAME,
  async (job) => {
    const startedAt = Date.now();
    console.log(JSON.stringify({ level: "info", event: "job_started", jobId: job.data.jobId }));

    try {
      const result = await runAudiverisConversion(job);
      console.log(
        JSON.stringify({
          level: "info",
          event: "job_completed",
          jobId: job.data.jobId,
          code: "SUCCESS",
          durationMs: result.durationMs,
          fileCount: result.files.length,
          pages: result.totalSheets,
          targetSheets: result.targetSheets,
          invalidSheets: result.invalidSheets,
          recovered: result.recovered,
        }),
      );
      return result;
    } catch (error) {
      const code = error instanceof ConversionError ? error.code : "ENGINE_ERROR";
      const diagnostics = error instanceof ConversionError ? error.diagnostics : undefined;
      console.log(
        JSON.stringify({
          level: "error",
          event: "job_failed",
          jobId: job.data.jobId,
          durationMs: Date.now() - startedAt,
          code,
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof ConversionError ? error.details : undefined,
          pages: diagnostics?.totalSheets ?? null,
          targetSheets: diagnostics?.targetSheets ?? [],
          invalidSheets: diagnostics?.invalidSheets ?? [],
          recovered: diagnostics?.recovered ?? false,
          engineTail: diagnostics?.engineTail ?? [],
        }),
      );
      throw error;
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 1,
  },
);

worker.on("ready", () => {
  console.log(JSON.stringify({ level: "info", event: "worker_ready", queue: QUEUE_NAME }));
});

worker.on("failed", (job, error) => {
  console.log(
    JSON.stringify({
      level: "error",
      event: "bullmq_failed",
      jobId: job?.data.jobId,
      message: error.message,
    }),
  );
});

const shutdown = async () => {
  console.log(JSON.stringify({ level: "info", event: "worker_shutdown" }));
  await maintenance.close();
  await worker.close();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
