import { PDFDocument } from "pdf-lib";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_PAGES } from "./env";
import type { ErrorCode } from "./errors";

export type PdfValidationResult =
  | { ok: true; pageCount: number }
  | { ok: false; code: ErrorCode; status?: number };

export async function validatePdf(bytes: Uint8Array): Promise<PdfValidationResult> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, code: "FILE_TOO_LARGE", status: 413 };
  }

  const magic = Buffer.from(bytes.subarray(0, 5)).toString("ascii");
  if (magic !== "%PDF-") {
    return { ok: false, code: "NOT_A_PDF" };
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const encrypted = (doc as { isEncrypted?: boolean }).isEncrypted === true;

    if (encrypted) {
      return { ok: false, code: "ENCRYPTED_PDF" };
    }

    const pageCount = doc.getPageCount();
    if (pageCount > MAX_UPLOAD_PAGES) {
      return { ok: false, code: "TOO_MANY_PAGES" };
    }

    return { ok: true, pageCount };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("encrypted")) {
      return { ok: false, code: "ENCRYPTED_PDF" };
    }

    return { ok: false, code: "CORRUPT_PDF" };
  }
}

