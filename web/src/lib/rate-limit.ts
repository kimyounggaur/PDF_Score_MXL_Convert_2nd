import { getRedisClient } from "./redis";

const WINDOW_SECONDS = 10 * 60;
const MAX_UPLOADS = 5;
const MAX_VALIDATION_ATTEMPTS = 30;

export type RateLimitResult = {
  ok: boolean;
  count: number;
  consumed: boolean;
};

export async function checkUploadRateLimit(ip: string): Promise<RateLimitResult> {
  return consumeRateLimit(`rate:upload:${ip}`, MAX_UPLOADS);
}

export async function checkValidationRateLimit(ip: string): Promise<RateLimitResult> {
  return consumeRateLimit(`rate:upload-validation:${ip}`, MAX_VALIDATION_ATTEMPTS);
}

export async function releaseUploadRateLimit(ip: string) {
  if (process.env.RATE_LIMIT_DISABLED === "1") {
    return;
  }

  const redis = getRedisClient();
  const key = `rate:upload:${ip}`;
  await redis.eval(
    [
      "local count = tonumber(redis.call('GET', KEYS[1]) or '0')",
      "if count <= 1 then",
      "  redis.call('DEL', KEYS[1])",
      "  return 0",
      "end",
      "return redis.call('DECR', KEYS[1])",
    ].join("\n"),
    1,
    key,
  );
}

export function isRateLimitAllowed(count: number, maximum: number) {
  return Number.isSafeInteger(count) && count > 0 && count <= maximum;
}

async function consumeRateLimit(key: string, maximum: number): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_DISABLED === "1") {
    return { ok: true, count: 0, consumed: false };
  }

  const results = await getRedisClient()
    .multi()
    .incr(key)
    .expire(key, WINDOW_SECONDS, "NX")
    .exec();

  const increment = results?.[0];
  if (!increment || increment[0]) {
    throw increment?.[0] ?? new Error("Rate limit transaction failed");
  }

  const count = Number(increment[1]);
  return {
    ok: isRateLimitAllowed(count, maximum),
    count,
    consumed: true,
  };
}

export function requestIp(request: Request) {
  // Production only exposes this app through Caddy, which owns this header.
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

