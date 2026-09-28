import { Queue, Worker } from "bullmq";
import { MAINTENANCE_QUEUE_NAME } from "./config.js";
import { getRedisConnectionOptions } from "./queue.js";
import { cleanupExpiredJobs } from "./cleanup.js";

export const MAINTENANCE_JOB_NAME = "cleanup-expired-jobs";
export const MAINTENANCE_SCHEDULER_ID = "cleanup-expired-jobs-hourly";

type MaintenanceQueue = Pick<
  Queue,
  "getRepeatableJobs" | "removeRepeatableByKey" | "upsertJobScheduler"
>;

export async function registerMaintenanceScheduler(queue: MaintenanceQueue) {
  const repeatables = await queue.getRepeatableJobs(0, -1, true);
  const legacy = repeatables.filter(
    (item) => item.name === MAINTENANCE_JOB_NAME && item.key !== MAINTENANCE_SCHEDULER_ID,
  );

  for (const item of legacy) {
    await queue.removeRepeatableByKey(item.key);
  }

  await queue.upsertJobScheduler(
    MAINTENANCE_SCHEDULER_ID,
    { pattern: "0 * * * *" },
    {
      name: MAINTENANCE_JOB_NAME,
      data: {},
      opts: {
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 86_400 },
      },
    },
  );

  return { removedLegacy: legacy.length };
}

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

  const registration = registerMaintenanceScheduler(queue);
  void registration
    .then(({ removedLegacy }) => {
      console.log(
        JSON.stringify({
          level: "info",
          event: "maintenance_scheduler_ready",
          schedulerId: MAINTENANCE_SCHEDULER_ID,
          removedLegacy,
        }),
      );
    })
    .catch((error) => {
      console.log(
        JSON.stringify({
          level: "error",
          event: "maintenance_scheduler_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });

  return {
    ready: registration,
    async close() {
      await registration.catch(() => undefined);
      await worker.close();
      await queue.close();
    },
  };
}

