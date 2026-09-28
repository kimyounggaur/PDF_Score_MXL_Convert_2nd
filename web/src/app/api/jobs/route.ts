import { mkdir, rm, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { parseConversionOptions } from "@/lib/conversion-options";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { jsonError } from "@/lib/api-response";
import { sanitizeFileName } from "@/lib/filenames";
import { inputPdfPath, jobDir, metadataPath } from "@/lib/paths";
import { validatePdf } from "@/lib/pdf";
import { getConversionQueue } from "@/lib/queue";
import { checkUploadRateLimit, checkValidationRateLimit, releaseUploadRateLimit, requestIp } from "@/lib/rate-limit";
import { getDiskFreeBytes, MINIMUM_DISK_FREE_BYTES, STATUS_QUERY_TIMEOUT_MS } from "@/lib/system-status";
import { withTimeout } from "@/lib/timeouts";

export const runtime = "nodejs";

// Keep the cheap Content-Length guard without rejecting a valid 30 MiB file
// merely because multipart boundaries and the small option fields add bytes.
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const ip = requestIp(request);
  let dir: string | null = null;
  let registered = false;
  let registrationMayHaveSucceeded = false;
  let uploadQuotaConsumed = false;

  try {
    const validationRateLimit = await withTimeout(
      () => checkValidationRateLimit(ip),
      STATUS_QUERY_TIMEOUT_MS,
    );
    if (!validationRateLimit.ok) {
      return jsonError("RATE_LIMITED", 429);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
    ) {
      return jsonError("FILE_TOO_LARGE", 413);
    }

    const formData = await request.formData();
    const fileValues = formData.getAll("file");
    const pageRangeValues = formData.getAll("pageRange");
    const languageValues = formData.getAll("language");
    const file = fileValues.length === 1 ? fileValues[0] : undefined;
    const pageRange = singleFormValue(pageRangeValues);
    const language = singleFormValue(languageValues);

    if (!(file instanceof File)) {
      return jsonError("MISSING_FILE");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validatePdf(bytes, {
      allowMoreThanMaxPages: pageRangeValues.length > 0,
    });

    if (!validation.ok) {
      return jsonError(validation.code, validation.status ?? 400);
    }

    const conversionOptions = parseConversionOptions({
      pageRange,
      language,
      pageCount: validation.pageCount,
    });
    if (!conversionOptions.ok) {
      return jsonError(conversionOptions.code);
    }

    const queue = getConversionQueue();
    const [workers, counts, diskFreeBytes] = await Promise.all([
      withTimeout(() => queue.getWorkersCount(), STATUS_QUERY_TIMEOUT_MS),
      withTimeout(() => queue.getJobCounts("waiting", "active"), STATUS_QUERY_TIMEOUT_MS),
      getDiskFreeBytes(),
    ]);

    if (workers < 1) {
      return jsonError("WORKER_UNAVAILABLE", 503);
    }

    if (diskFreeBytes < MINIMUM_DISK_FREE_BYTES) {
      return jsonError("STORAGE_FULL", 503);
    }

    if ((counts.waiting ?? 0) + (counts.active ?? 0) >= 20) {
      return jsonError("QUEUE_FULL", 429);
    }

    // Reserve the strict upload quota only after validation. If registration
    // fails, the reservation is returned in the catch block below.
    const uploadRateLimit = await withTimeout(
      () => checkUploadRateLimit(ip),
      STATUS_QUERY_TIMEOUT_MS,
    );
    if (!uploadRateLimit.ok) {
      return jsonError("RATE_LIMITED", 429);
    }
    uploadQuotaConsumed = uploadRateLimit.consumed;

    const jobId = uuidv4();
    dir = jobDir(jobId);
    await mkdir(dir, { recursive: true });
    await writeFile(inputPdfPath(jobId), bytes);
    await writeFile(
      metadataPath(jobId),
      JSON.stringify(
        {
          originalName: sanitizeFileName(file.name || "score.pdf"),
          bytes: bytes.byteLength,
          pages: validation.pageCount,
          createdAt: new Date().toISOString(),
          options: conversionOptions.options,
        },
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
            { jobId },
            {
              jobId,
              attempts: 1,
              removeOnComplete: { age: 86_400 },
              removeOnFail: { age: 86_400 },
            },
          ),
        STATUS_QUERY_TIMEOUT_MS,
      );
      registered = true;
    } catch (error) {
      // A Redis reply can be lost after the command itself succeeded. Confirm
      // the deterministic job ID before deleting its files or refunding quota.
      const existingJob = await withTimeout(() => queue.getJob(jobId), STATUS_QUERY_TIMEOUT_MS);
      if (!existingJob) {
        registrationMayHaveSucceeded = false;
        throw error;
      }
      registered = true;
    }

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (error) {
    if (dir && !registered && !registrationMayHaveSucceeded) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (uploadQuotaConsumed && !registered && !registrationMayHaveSucceeded) {
      await releaseUploadRateLimit(ip).catch(() => undefined);
    }

    return jsonError(isStorageCapacityError(error) ? "STORAGE_FULL" : "SERVICE_UNAVAILABLE", 503);
  }
}

function singleFormValue(values: FormDataEntryValue[]): unknown {
  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 ? values[0] : values;
}

function isStorageCapacityError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === "ENOSPC" || code === "EDQUOT";
}
