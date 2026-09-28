import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { attachmentContentDisposition, downloadName } from "@/lib/filenames";
import { getJobStatus, listOutputFiles, readJobMetadata } from "@/lib/jobs";
import { assertInside, isSafeJobId, outputDir } from "@/lib/paths";
import { STATUS_QUERY_TIMEOUT_MS } from "@/lib/system-status";
import { withTimeout } from "@/lib/timeouts";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await context.params;

  if (!isSafeJobId(id) || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return jsonError("FILE_NOT_FOUND", 404);
  }

  try {
    const status = await withTimeout(() => getJobStatus(id), STATUS_QUERY_TIMEOUT_MS);
    if (!status || status.status !== "completed") {
      return jsonError("FILE_NOT_FOUND", 404);
    }
  } catch {
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }

  try {
    const files = await listOutputFiles(id);
    const allowed = files.some((file) => file.name === name);
    if (!allowed) {
      return jsonError("FILE_NOT_FOUND", 404);
    }

    const outDir = outputDir(id);
    const filePath = assertInside(outDir, path.join(outDir, name));
    const bytes = await readFile(filePath);
    const metadata = await readJobMetadata(id);
    const safeDownloadName = downloadName(
      metadata?.originalName,
      name,
      files.map((file) => file.name),
    );

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.recordare.musicxml",
        "Content-Disposition": attachmentContentDisposition(safeDownloadName),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonError("FILE_NOT_FOUND", 404);
  }
}

