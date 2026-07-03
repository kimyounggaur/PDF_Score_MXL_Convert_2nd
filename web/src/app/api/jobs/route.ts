import { mkdir, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { MAX_UPLOAD_BYTES } from "@/lib/env";
import { jsonError } from "@/lib/api-response";
import { sanitizeFileName } from "@/lib/filenames";
import { inputPdfPath, jobDir, metadataPath } from "@/lib/paths";
import { validatePdf } from "@/lib/pdf";
import { getConversionQueue } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const jobId = uuidv4();
  const dir = jobDir(jobId);
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

  await getConversionQueue().add(
    "convert",
    { jobId },
    {
      jobId,
      attempts: 1,
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    },
  );

  return NextResponse.json({ jobId }, { status: 201 });
}

