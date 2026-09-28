import type { Redis } from "ioredis";
import type { ConversionResult } from "./types.js";

export const PROCESSING_SECONDS_PER_PAGE_KEY = "conversion:seconds-per-page:v1";
export const PROCESSING_SAMPLE_LIMIT = 20;

type MetricRedis = Pick<Redis, "multi">;
type PageMetricResult = Pick<ConversionResult, "durationMs" | "targetSheets" | "totalSheets">;

export function getProcessedPageCount(result: PageMetricResult): number {
  if (result.targetSheets.length > 0) {
    return result.targetSheets.length;
  }

  if (result.totalSheets !== null && Number.isFinite(result.totalSheets) && result.totalSheets > 0) {
    return Math.max(1, Math.trunc(result.totalSheets));
  }

  return 1;
}

export function calculateSecondsPerPage(result: PageMetricResult): number | null {
  if (!Number.isFinite(result.durationMs) || result.durationMs <= 0) {
    return null;
  }

  const secondsPerPage = result.durationMs / getProcessedPageCount(result) / 1_000;
  return Number.isFinite(secondsPerPage) && secondsPerPage > 0 ? secondsPerPage : null;
}

export async function recordProcessingMetric(
  redis: MetricRedis,
  result: PageMetricResult,
): Promise<number | null> {
  const secondsPerPage = calculateSecondsPerPage(result);
  if (secondsPerPage === null) {
    return null;
  }

  await redis
    .multi()
    .lpush(PROCESSING_SECONDS_PER_PAGE_KEY, String(secondsPerPage))
    .ltrim(PROCESSING_SECONDS_PER_PAGE_KEY, 0, PROCESSING_SAMPLE_LIMIT - 1)
    .exec();

  return secondsPerPage;
}

export async function recordCompletedProcessingMetric(
  redis: MetricRedis,
  result: PageMetricResult,
  context: { jobId: string; log?: (message: string) => void },
) {
  try {
    return await recordProcessingMetric(redis, result);
  } catch (error) {
    (context.log ?? console.log)(
      JSON.stringify({
        level: "warn",
        event: "processing_metric_failed",
        jobId: context.jobId,
        key: PROCESSING_SECONDS_PER_PAGE_KEY,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}
