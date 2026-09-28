import { mkdir, rm, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { jsonError } from "@/lib/api-response";
import { sanitizeFileName } from "@/lib/filenames";
import { inputPdfPath, jobDir, metadataPath } from "@/lib/paths";
import { validatePdf } from "@/lib/pdf";
import { getConversionQueue } from "@/lib/queue";
import { checkUploadRateLimit, checkValidationRateLimit, releaseUploadRateLimit, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = requestIp(request);
  const validationRateLimit = await checkValidationRateLimit(ip);
  if (!validationRateLimit.ok) {
    return jsonError("RATE_LIMITED", 429);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return jsonError("FILE_TOO_LARGE", 413);
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("MISSING_FILE");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = await validatePdf(bytes);

  if (!validation.ok) {
    return jsonError(validation.code, validation.status ?? 400);
  }

  const queue = getConversionQueue();
  const counts = await queue.getJobCounts("waiting", "active");
  if ((counts.waiting ?? 0) + (counts.active ?? 0) >= 20) {
    return jsonError("QUEUE_FULL", 429);
  }

  // Reserve the strict upload quota only after validation. If registration
  // fails, the reservation is returned in the finally block below.
  const uploadRateLimit = await checkUploadRateLimit(ip);
  if (!uploadRateLimit.ok) {
    return jsonError("RATE_LIMITED", 429);
  }

  const jobId = uuidv4();
  const dir = jobDir(jobId);
  let registered = false;

  try {
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
        },
        null,
        2,
      ),
    );

    try {
      await queue.add(
        "convert",
        { jobId },
        {
          jobId,
          attempts: 1,
          removeOnComplete: { age: 86_400 },
          removeOnFail: { age: 86_400 },
        },
      );
      registered = true;
    } catch (error) {
      // A Redis reply can be lost after the command itself succeeded. Confirm
      // the deterministic job ID before deleting its files or refunding quota.
      const existingJob = await queue.getJob(jobId).catch(() => null);
      if (!existingJob) {
        throw error;
      }
      registered = true;
    }

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    if (!registered && uploadRateLimit.consumed) {
      await releaseUploadRateLimit(ip).catch(() => undefined);
    }
  }
}
