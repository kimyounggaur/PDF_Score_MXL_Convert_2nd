export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_UPLOAD_PAGES = 20;

export function getRedisUrl() {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

export function getDataDir() {
  return process.env.DATA_DIR ?? "./data";
}
