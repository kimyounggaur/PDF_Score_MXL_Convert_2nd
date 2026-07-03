import { Redis } from "ioredis";
import { getRedisUrl } from "./env";

let redis: Redis | null = null;

export function getRedisClient() {
  if (!redis) {
    redis = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  return redis;
}

