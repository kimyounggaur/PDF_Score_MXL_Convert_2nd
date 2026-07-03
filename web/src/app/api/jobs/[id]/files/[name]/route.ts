import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { downloadName } from "@/lib/filenames";
import { listOutputFiles, readJobMetadata } from "@/lib/jobs";
import { assertInside, isSafeJobId, outputDir } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await context.params;

  if (!isSafeJobId(id) || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return jsonError("FILE_NOT_FOUND", 404);
  }

  const files = await listOutputFiles(id);
  const allowed = files.some((file) => file.name === name);
  if (!allowed) {
    return jsonError("FILE_NOT_FOUND", 404);
  }

  const outDir = outputDir(id);
  const filePath = assertInside(outDir, path.join(outDir, name));
  const bytes = await readFile(filePath);
  const metadata = await readJobMetadata(id);
  const safeDownloadName = downloadName(metadata?.originalName, name);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.recordare.musicxml",
      "Content-Disposition": contentDisposition(safeDownloadName),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

