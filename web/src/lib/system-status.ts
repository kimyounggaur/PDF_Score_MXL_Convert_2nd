import { mkdir, statfs } from "node:fs/promises";
import { getDataDir } from "./env";
import { getConversionQueue } from "./queue";
import { getRedisClient } from "./redis";
import { settleWithin } from "./timeouts";

export const STATUS_QUERY_TIMEOUT_MS = 1_000;
export const MINIMUM_DISK_FREE_BYTES = 2 * 1024 * 1024 * 1024;

export type SystemStatus = {
  redis: "ok" | "down";
  workers: number | null;
  waiting: number | null;
  active: number | null;
  diskFreeBytes: number | null;
  engineVersion: string;
};

export type StatusProbeDependencies = {
  pingRedis: () => Promise<unknown>;
  getWorkersCount: () => Promise<number>;
  getJobCounts: () => Promise<{ waiting?: number; active?: number }>;
  getDiskFreeBytes: () => Promise<number>;
  engineVersion: string;
};

export async function getSystemStatus(
  dependencies: StatusProbeDependencies = defaultStatusProbeDependencies(),
  timeoutMs = STATUS_QUERY_TIMEOUT_MS,
): Promise<SystemStatus> {
  const [redis, workers, counts, disk] = await Promise.all([
    settleWithin(dependencies.pingRedis, timeoutMs),
    settleWithin(dependencies.getWorkersCount, timeoutMs),
    settleWithin(dependencies.getJobCounts, timeoutMs),
    settleWithin(dependencies.getDiskFreeBytes, timeoutMs),
  ]);

  return {
    redis: redis.ok && redis.value === "PONG" ? "ok" : "down",
    workers: workers.ok ? finiteNonNegativeNumber(workers.value) : null,
    waiting: counts.ok ? finiteNonNegativeNumber(counts.value.waiting) : null,
    active: counts.ok ? finiteNonNegativeNumber(counts.value.active) : null,
    diskFreeBytes: disk.ok ? finiteNonNegativeNumber(disk.value) : null,
    engineVersion: normalizeEngineVersion(dependencies.engineVersion),
  };
}

export async function getDiskFreeBytes() {
  const dataDir = getDataDir();
  await mkdir(dataDir, { recursive: true });
  const stats = await statfs(dataDir);
  return stats.bavail * stats.bsize;
}

export function normalizeEngineVersion(version: string | undefined) {
  const candidate = version?.trim();
  return candidate && /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(candidate) ? candidate : "unknown";
}

function defaultStatusProbeDependencies(): StatusProbeDependencies {
  return {
    pingRedis: async () => await getRedisClient().ping(),
    getWorkersCount: async () => await getConversionQueue().getWorkersCount(),
    getJobCounts: async () => await getConversionQueue().getJobCounts("waiting", "active"),
    getDiskFreeBytes,
    engineVersion: process.env.AUDIVERIS_VERSION ?? "unknown",
  };
}

function finiteNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}
