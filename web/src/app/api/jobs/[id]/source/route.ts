import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { inlineContentDisposition, sanitizeFileName } from "@/lib/filenames";
import { readJobMetadata } from "@/lib/jobs";
import { inputPdfPath, isSafeJobId } from "@/lib/paths";
import { getJob } from "@/lib/queue";
import { STATUS_QUERY_TIMEOUT_MS } from "@/lib/system-status";
import { withTimeout } from "@/lib/timeouts";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!isSafeJobId(id)) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  try {
    const job = await withTimeout(() => getJob(id), STATUS_QUERY_TIMEOUT_MS);
    if (!job) {
      return jsonError("JOB_NOT_FOUND", 404);
    }
  } catch {
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }

  try {
    const [bytes, metadata] = await Promise.all([
      readFile(inputPdfPath(id)),
      readJobMetadata(id),
    ]);
    const sourceName = sanitizeFileName(metadata?.originalName ?? "score.pdf");

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": inlineContentDisposition(sourceName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return jsonError("FILE_NOT_FOUND", 404);
  }
}
