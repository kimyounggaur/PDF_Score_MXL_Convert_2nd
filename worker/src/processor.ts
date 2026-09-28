import type { Job, Processor } from "bullmq";
import { runAudiverisConversion } from "./audiveris.js";
import { CANCEL_REASON, watchForCancellation } from "./control.js";
import { ConversionError, type ConversionJobData, type ConversionResult } from "./types.js";

type CancelRedisClient = Parameters<typeof watchForCancellation>[0]["redis"];

type RunConversion = (
  job: Job<ConversionJobData, ConversionResult, "convert">,
  signal?: AbortSignal,
) => Promise<ConversionResult>;

export function createConversionProcessor(options: {
  redis: CancelRedisClient;
  cancelJob: (jobId: string, reason: string) => boolean;
  runConversion?: RunConversion;
  cancelPollIntervalMs?: number;
}): Processor<ConversionJobData, ConversionResult, "convert"> {
  const runConversion = options.runConversion ?? runAudiverisConversion;

  // Keep all three declared arguments: BullMQ 5.79 only creates and passes the
  // AbortSignal when processor.length >= 3.
  return async function processConversion(job, _token, signal) {
    const startedAt = Date.now();
    const bullJobId = String(job.id ?? job.data.jobId);
    const cancellation = watchForCancellation({
      redis: options.redis,
      jobId: job.data.jobId,
      signal,
      intervalMs: options.cancelPollIntervalMs,
      cancel: (reason) => options.cancelJob(bullJobId, reason),
      onError: (error) => {
        console.log(
          JSON.stringify({
            level: "warn",
            event: "cancel_poll_failed",
            jobId: job.data.jobId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      },
    });

    console.log(JSON.stringify({ level: "info", event: "job_started", jobId: job.data.jobId }));

    try {
      const result = await runConversion(job, signal);
      // Cover cancellation arriving after the engine exits but before BullMQ
      // moves the job to completed.
      if (signal?.aborted) {
        throw new ConversionError(CANCEL_REASON);
      }

      console.log(
        JSON.stringify({
          level: "info",
          event: "job_completed",
          jobId: job.data.jobId,
          code: "SUCCESS",
          durationMs: result.durationMs,
          fileCount: result.files.length,
          pages: result.totalSheets,
          targetSheets: result.targetSheets,
          invalidSheets: result.invalidSheets,
          recovered: result.recovered,
        }),
      );
      return result;
    } catch (error) {
      const code = error instanceof ConversionError ? error.code : "ENGINE_ERROR";
      const diagnostics = error instanceof ConversionError ? error.diagnostics : undefined;
      console.log(
        JSON.stringify({
          level: code === "CANCELLED" ? "info" : "error",
          event: code === "CANCELLED" ? "job_cancelled" : "job_failed",
          jobId: job.data.jobId,
          durationMs: Date.now() - startedAt,
          code,
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof ConversionError ? error.details : undefined,
          pages: diagnostics?.totalSheets ?? null,
          targetSheets: diagnostics?.targetSheets ?? [],
          invalidSheets: diagnostics?.invalidSheets ?? [],
          recovered: diagnostics?.recovered ?? false,
          engineTail: diagnostics?.engineTail ?? [],
        }),
      );
      throw error;
    } finally {
      cancellation.stop();
    }
  };
}
