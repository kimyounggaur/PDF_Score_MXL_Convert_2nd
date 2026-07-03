import { Queue, Worker } from "bullmq";
import { MAINTENANCE_QUEUE_NAME } from "./config.js";
import { getRedisConnectionOptions } from "./queue.js";
import { cleanupExpiredJobs } from "./cleanup.js";

export function startMaintenance() {
  const queue = new Queue(MAINTENANCE_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    },
  });

  const worker = new Worker(
    MAINTENANCE_QUEUE_NAME,
    async () => {
      const result = await cleanupExpiredJobs();
      console.log(JSON.stringify({ level: "info", event: "maintenance_cleanup", ...result }));
      return result;
    },
    { connection: getRedisConnectionOptions(), concurrency: 1 },
  );

  void queue.add(
    "cleanup-expired-jobs",
    {},
    {
      jobId: "cleanup-expired-jobs-hourly",
      repeat: { pattern: "0 * * * *" },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    },
  );

  return {
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}

