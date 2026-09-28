import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { metadataForRetry, readJobMetadata } from "@/lib/jobs";
import { inputPdfPath, jobDir, metadataPath } from "@/lib/paths";
import { getConversionQueue } from "@/lib/queue";
import { checkUploadRateLimit, releaseUploadRateLimit, requestIp } from "@/lib/rate-limit";
import { isExistingRetryDirectoryError, retryJobIdFor } from "@/lib/retry";
import { getDiskFreeBytes, MINIMUM_DISK_FREE_BYTES, STATUS_QUERY_TIMEOUT_MS } from "@/lib/system-status";
import { withTimeout } from "@/lib/timeouts";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const newJobId = retryJobIdFor(id);
  if (!newJobId) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  const ip = requestIp(request);
  let newDir: string | null = null;
  let ownsNewDir = false;
  let registered = false;
  let registrationMayHaveSucceeded = false;
  let uploadQuotaConsumed = false;

  const releaseConsumedQuota = async () => {
    if (!uploadQuotaConsumed) {
      return;
    }

    // A lost Redis reply must not make us decrement a shared counter twice.
    uploadQuotaConsumed = false;
    await releaseUploadRateLimit(ip);
  };

  try {
    const queue = getConversionQueue();
    const originalJob = await withTimeout(() => queue.getJob(id), STATUS_QUERY_TIMEOUT_MS);
    if (!originalJob) {
      return jsonError("JOB_NOT_FOUND", 404);
    }

    const state = await withTimeout(() => originalJob.getState(), STATUS_QUERY_TIMEOUT_MS);
    if (state !== "failed") {
      return jsonError("JOB_NOT_RETRYABLE", 409);
    }

    // A retry is idempotent for a given source job. Check before all capacity,
    // rate-limit, and filesystem work so a repeated request is free.
    const existingRetry = await withTimeout(
      () => queue.getJob(newJobId),
      STATUS_QUERY_TIMEOUT_MS,
    );
    if (existingRetry) {
      return NextResponse.json({ jobId: newJobId }, { status: 201 });
    }

    const [metadata, inputStat] = await Promise.all([
      readJobMetadata(id),
      stat(inputPdfPath(id)).catch(() => null),
    ]);
    if (!metadata || !inputStat?.isFile()) {
      return jsonError("JOB_NOT_RETRYABLE", 409);
    }

    const [workers, counts, diskFreeBytes] = await Promise.all([
      withTimeout(() => queue.getWorkersCount(), STATUS_QUERY_TIMEOUT_MS),
      withTimeout(() => queue.getJobCounts("waiting", "active"), STATUS_QUERY_TIMEOUT_MS),
      getDiskFreeBytes(),
    ]);

    // Cover a concurrent request that registered the deterministic job while
    // this request was checking worker, queue, and storage capacity. Reuse it
    // before interpreting capacity snapshots that may already include it.
    const concurrentlyCreatedRetry = await withTimeout(
      () => queue.getJob(newJobId),
      STATUS_QUERY_TIMEOUT_MS,
    );
    if (concurrentlyCreatedRetry) {
      return NextResponse.json({ jobId: newJobId }, { status: 201 });
    }

    if (workers < 1) {
      return jsonError("WORKER_UNAVAILABLE", 503);
    }
    if (diskFreeBytes < MINIMUM_DISK_FREE_BYTES) {
      return jsonError("STORAGE_FULL", 503);
    }
    if ((counts.waiting ?? 0) + (counts.active ?? 0) >= 20) {
      return jsonError("QUEUE_FULL", 429);
    }

    const uploadRateLimit = await withTimeout(
      () => checkUploadRateLimit(ip),
      STATUS_QUERY_TIMEOUT_MS,
    );
    if (!uploadRateLimit.ok) {
      return jsonError("RATE_LIMITED", 429);
    }
    uploadQuotaConsumed = uploadRateLimit.consumed;

    newDir = jobDir(newJobId);
    try {
      // The deterministic directory doubles as an atomic ownership claim.
      // Only its creator may write, register, or clean up this retry.
      await mkdir(newDir);
      ownsNewDir = true;
    } catch (error) {
      if (!isExistingRetryDirectoryError(error)) {
        throw error;
      }

      const existingJob = await withTimeout(
        () => queue.getJob(newJobId),
        STATUS_QUERY_TIMEOUT_MS,
      );
      await releaseConsumedQuota();

      if (existingJob) {
        return NextResponse.json({ jobId: newJobId }, { status: 201 });
      }

      // Another request owns the files but has not made queue registration
      // observable yet. Never touch its directory; a later POST can reuse it.
      return jsonError("SERVICE_UNAVAILABLE", 503);
    }

    await copyFile(inputPdfPath(id), inputPdfPath(newJobId));
    await writeFile(
      metadataPath(newJobId),
      JSON.stringify(
        metadataForRetry(metadata, id),
        null,
        2,
      ),
    );

    try {
      registrationMayHaveSucceeded = true;
      await withTimeout(
        () =>
          queue.add(
            "convert",
            { jobId: newJobId },
            {
              jobId: newJobId,
              attempts: 1,
              removeOnComplete: { age: 86_400 },
              removeOnFail: { age: 86_400 },
            },
          ),
        STATUS_QUERY_TIMEOUT_MS,
      );
      registered = true;
    } catch (error) {
      // A timed-out Redis reply is ambiguous: confirm the deterministic ID
      // before deleting the copied source or returning the rate-limit token.
      const existingJob = await withTimeout(() => queue.getJob(newJobId), STATUS_QUERY_TIMEOUT_MS);
      if (!existingJob) {
        registrationMayHaveSucceeded = false;
        throw error;
      }
      registered = true;
    }

    return NextResponse.json({ jobId: newJobId }, { status: 201 });
  } catch (error) {
    if (newDir && ownsNewDir && !registered && !registrationMayHaveSucceeded) {
      await rm(newDir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (uploadQuotaConsumed && !registered && !registrationMayHaveSucceeded) {
      await releaseConsumedQuota().catch(() => undefined);
    }

    return jsonError(isStorageCapacityError(error) ? "STORAGE_FULL" : "SERVICE_UNAVAILABLE", 503);
  }
}

function isStorageCapacityError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === "ENOSPC" || code === "EDQUOT";
}
