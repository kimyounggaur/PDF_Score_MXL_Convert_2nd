import { Job, Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { getRedisUrl } from "./env";

export const QUEUE_NAME = "conversion";

export type ConversionJobData = {
  jobId: string;
};

export type ConversionProgress = {
  pct: number;
  stage: string;
  sheet: { current: number; total: number } | null;
};

export type ConversionFile = {
  name: string;
  bytes: number;
};

export type ConversionWarning = {
  code: "SKIPPED_PAGES";
  pages: number[];
};

export type ConversionResult = {
  files: ConversionFile[];
  durationMs: number;
  warnings: ConversionWarning[];
};

type ConversionQueue = Queue<ConversionJobData, ConversionResult, "convert">;

let queue: ConversionQueue | null = null;
let queueEvents: QueueEvents | null = null;

export function getRedisConnectionOptions(): ConnectionOptions {
  const redisUrl = new URL(getRedisUrl());
  const db = redisUrl.pathname ? Number(redisUrl.pathname.slice(1)) : 0;

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function getConversionQueue() {
  if (!queue) {
    queue = new Queue<ConversionJobData, ConversionResult, "convert">(QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 86_400 },
      },
    });
  }

  return queue;
}

export function getConversionQueueEvents() {
  if (!queueEvents) {
    queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
  }

  return queueEvents;
}

export async function getJob(jobId: string) {
  return await Job.fromId<ConversionJobData, ConversionResult, "convert">(getConversionQueue(), jobId);
}

