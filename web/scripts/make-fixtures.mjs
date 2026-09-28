import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const samplesDirectory = resolve(scriptDirectory, "../../samples");

async function savePdf(name, document) {
  const outputPath = resolve(samplesDirectory, name);
  await writeFile(outputPath, await document.save());
  console.log(`${name}: ${document.getPageCount()}쪽`);
}

await mkdir(samplesDirectory, { recursive: true });

const bad = await PDFDocument.create();
const badPage = bad.addPage([595.28, 841.89]);
const helvetica = await bad.embedFont(StandardFonts.Helvetica);
badPage.drawText("This page contains text only, not printed music.", {
  x: 72,
  y: 740,
  size: 18,
  font: helvetica,
  color: rgb(0.12, 0.12, 0.12),
});
await savePdf("bad.pdf", bad);

const simpleBytes = await readFile(resolve(samplesDirectory, "simple.pdf"));
const simple = await PDFDocument.load(simpleBytes);
const cover = await PDFDocument.create();
const coverPage = cover.addPage([595.28, 841.89]);
const coverFont = await cover.embedFont(StandardFonts.HelveticaBold);
coverPage.drawText("PDF Score Conversion Test Cover", {
  x: 88,
  y: 470,
  size: 24,
  font: coverFont,
  color: rgb(0.1, 0.1, 0.1),
});
coverPage.drawText("The following pages contain public-domain sheet music.", {
  x: 88,
  y: 430,
  size: 12,
  font: await cover.embedFont(StandardFonts.Helvetica),
});
const copiedPages = await cover.copyPages(simple, simple.getPageIndices());
for (const page of copiedPages) cover.addPage(page);
await savePdf("cover.pdf", cover);

const pages21 = await PDFDocument.create();
for (let index = 0; index < 21; index += 1) {
  pages21.addPage([595.28, 841.89]);
}
await savePdf("pages21.pdf", pages21);
