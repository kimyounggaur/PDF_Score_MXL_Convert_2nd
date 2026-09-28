import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { validatePdf } from "./pdf";

test("기본 전체 변환은 20쪽을 넘는 PDF를 거부한다", async () => {
  const bytes = await pdfWithPages(21);
  assert.deepEqual(await validatePdf(bytes), {
    ok: false,
    code: "TOO_MANY_PAGES",
  });
});

test("쪽 범위 검증을 위해 20쪽 초과 PDF의 실제 쪽수를 읽을 수 있다", async () => {
  const bytes = await pdfWithPages(21);
  assert.deepEqual(await validatePdf(bytes, { allowMoreThanMaxPages: true }), {
    ok: true,
    pageCount: 21,
  });
});

test("0쪽 PDF는 워커에 보내지 않고 손상 PDF로 거부한다", async () => {
  assert.deepEqual(await validatePdf(zeroPagePdf()), {
    ok: false,
    code: "CORRUPT_PDF",
  });
});

function zeroPagePdf() {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n",
  ];
  let source = "%PDF-1.4\n";
  const offsets = objects.map((object) => {
    const offset = source.length;
    source += object;
    return offset;
  });
  const xrefOffset = source.length;
  const entries = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");

  source += [
    "xref",
    "0 3",
    "0000000000 65535 f ",
    entries.trimEnd(),
    "trailer",
    "<< /Size 3 /Root 1 0 R >>",
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  return new TextEncoder().encode(source);
}

async function pdfWithPages(pageCount: number) {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) {
    document.addPage();
  }
  return new Uint8Array(await document.save());
}
