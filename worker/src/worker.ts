import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAME, getRedisUrl } from "./config.js";
import { getRedisConnectionOptions } from "./queue.js";
import { startWorkerHeartbeat } from "./control.js";
import { createConversionProcessor } from "./processor.js";
import type { ConversionJobData, ConversionResult } from "./types.js";
import { startMaintenance } from "./maintenance.js";

const maintenance = startMaintenance();
const controlRedis = new Redis(getRedisUrl(), {
  connectTimeout: 1_000,
  commandTimeout: 1_000,
  enableOfflineQueue: false,
  enableReadyCheck: false,
  maxRetriesPerRequest: 1,
});
controlRedis.on("error", (error) => {
  console.log(JSON.stringify({ level: "warn", event: "control_redis_error", message: error.message }));
});

let worker!: Worker<ConversionJobData, ConversionResult, "convert">;
const processor = createConversionProcessor({
  redis: controlRedis,
  cancelJob(jobId, reason) {
    return worker.cancelJob(jobId, reason);
  },
});

worker = new Worker<ConversionJobData, ConversionResult, "convert">(
  QUEUE_NAME,
  processor,
  {
    connection: getRedisConnectionOptions(),
    concurrency: 1,
  },
);

const heartbeat = startWorkerHeartbeat({
  redis: controlRedis,
  disabled: process.env.HEARTBEAT_DISABLED === "1",
  onError: (error) => {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "heartbeat_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  },
});

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

worker.on("error", (error) => {
  console.log(JSON.stringify({ level: "error", event: "worker_error", message: error.message }));
});

let shutdownPromise: Promise<void> | null = null;
const shutdown = async () => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    console.log(JSON.stringify({ level: "info", event: "worker_shutdown" }));
    await heartbeat.stop();
    await maintenance.close();
    await worker.close();
    controlRedis.disconnect();
  })();

  return shutdownPromise;
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
