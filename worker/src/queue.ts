import { Queue, QueueEvents, type ConnectionOptions } from "bullmq";
import { QUEUE_NAME, getRedisUrl } from "./config.js";
import type { ConversionJobData, ConversionResult } from "./types.js";

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
  }
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

export async function closeQueueClients() {
  await Promise.allSettled([
    queueEvents?.close(),
    queue?.close(),
  ]);
  queueEvents = null;
  queue = null;
}
