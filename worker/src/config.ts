export const QUEUE_NAME = "conversion";
export const MAINTENANCE_QUEUE_NAME = "maintenance";

export function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

export function getDataDir() {
  return process.env.DATA_DIR ?? "../data";
}

export function getAudiverisBin() {
  return process.env.AUDIVERIS_BIN ?? "/opt/audiveris/bin/Audiveris";
}

export function getConversionTimeoutMs() {
  const value = Number(process.env.CONVERSION_TIMEOUT_MS ?? "1200000");
  return Number.isFinite(value) && value > 0 ? value : 1_200_000;
}

