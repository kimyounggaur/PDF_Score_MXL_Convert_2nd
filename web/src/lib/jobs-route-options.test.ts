import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { POST } from "@/app/api/jobs/route";

test("업로드 API는 중복 multipart 파일과 옵션 필드를 거부한다", async (t) => {
  const previousRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
  process.env.RATE_LIMIT_DISABLED = "1";
  t.after(() => {
    if (previousRateLimitDisabled === undefined) {
      delete process.env.RATE_LIMIT_DISABLED;
    } else {
      process.env.RATE_LIMIT_DISABLED = previousRateLimitDisabled;
    }
  });

  const document = await PDFDocument.create();
  document.addPage([100, 100]);
  const pdfBytes = await document.save();

  const duplicatePageRange = formWithPdf(pdfBytes);
  duplicatePageRange.append("pageRange", "1");
  duplicatePageRange.append("pageRange", "1");
  await assertApiError(duplicatePageRange, "PAGE_RANGE_INVALID");

  const duplicateLanguage = formWithPdf(pdfBytes);
  duplicateLanguage.append("language", "eng");
  duplicateLanguage.append("language", "kor");
  await assertApiError(duplicateLanguage, "LANGUAGE_INVALID");

  const duplicateFile = formWithPdf(pdfBytes);
  duplicateFile.append("file", pdfBlob(pdfBytes), "second.pdf");
  await assertApiError(duplicateFile, "MISSING_FILE");
});

function formWithPdf(bytes: Uint8Array) {
  const formData = new FormData();
  formData.append("file", pdfBlob(bytes), "score.pdf");
  return formData;
}

function pdfBlob(bytes: Uint8Array) {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

async function assertApiError(formData: FormData, expectedCode: string) {
  const response = await POST(
    new NextRequest("http://localhost/api/jobs", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { code?: unknown } };
  assert.equal(body.error?.code, expectedCode);
}
