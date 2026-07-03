import { getRedisClient } from "./redis";

const WINDOW_SECONDS = 10 * 60;
const MAX_UPLOADS = 5;

export async function checkUploadRateLimit(ip: string) {
  if (process.env.RATE_LIMIT_DISABLED === "1") {
    return { ok: true };
  }

  const redis = getRedisClient();
  const key = `rate:upload:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  return { ok: count <= MAX_UPLOADS, count };
}

export function requestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

