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

type QueueGlobals = typeof globalThis & {
  __pdfScoreConversionQueue?: ConversionQueue;
  __pdfScoreConversionQueueEvents?: QueueEvents;
};

const queueGlobals = globalThis as QueueGlobals;

export function getRedisConnectionOptions({ blocking = false }: { blocking?: boolean } = {}): ConnectionOptions {
  const redisUrl = new URL(getRedisUrl());
  const db = redisUrl.pathname ? Number(redisUrl.pathname.slice(1)) : 0;

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    // HTTP queue commands must fail promptly. QueueEvents uses a blocking
    // connection and therefore requires unlimited retries.
    maxRetriesPerRequest: blocking ? null : 1,
    connectTimeout: 1_000,
    commandTimeout: blocking ? undefined : 1_000,
    enableReadyCheck: false,
  };
}

export function getConversionQueue() {
  if (!queueGlobals.__pdfScoreConversionQueue) {
    const queue = new Queue<ConversionJobData, ConversionResult, "convert">(QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 86_400 },
      },
    });
    // BullMQ commands still reject to their caller. This listener only keeps an
    // EventEmitter "error" from becoming an uncaught process exception.
    queue.on("error", () => undefined);
    queueGlobals.__pdfScoreConversionQueue = queue;
  }

  return queueGlobals.__pdfScoreConversionQueue;
}

export function getConversionQueueEvents() {
  if (!queueGlobals.__pdfScoreConversionQueueEvents) {
    queueGlobals.__pdfScoreConversionQueueEvents = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnectionOptions({ blocking: true }),
    });
  }

  return queueGlobals.__pdfScoreConversionQueueEvents;
}

export async function getJob(jobId: string) {
  return await Job.fromId<ConversionJobData, ConversionResult, "convert">(getConversionQueue(), jobId);
}

