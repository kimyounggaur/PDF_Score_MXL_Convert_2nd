import { Redis } from "ioredis";
import { getRedisUrl } from "./env";

type RedisGlobals = typeof globalThis & {
  __pdfScoreRedisClient?: Redis;
};

const redisGlobals = globalThis as RedisGlobals;

export function getRedisClient() {
  if (!redisGlobals.__pdfScoreRedisClient) {
    const redis = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      enableReadyCheck: false,
    });
    redis.on("error", () => undefined);
    redisGlobals.__pdfScoreRedisClient = redis;
  }

  return redisGlobals.__pdfScoreRedisClient;
}

