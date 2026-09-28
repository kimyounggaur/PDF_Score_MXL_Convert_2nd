import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { validateMxl } from "./validate-mxl.js";

test("counts only exact measure elements and returns partwise counts", async (t) => {
  const score = `<?xml version="1.0" encoding="UTF-8"?>
    <score-partwise version="4.0">
      <part-list>
        <score-part id="P1"><part-name>Piano</part-name></score-part>
        <score-part id="P2"><part-name>Violin</part-name></score-part>
      </part-list>
      <defaults><appearance><measure-numbering>system</measure-numbering></appearance></defaults>
      <!-- <measure number="commented-out"/> -->
      <![CDATA[<measure number="not-markup"/>]]>
      <part id="P1">
        <measure number="1"><print><measure-numbering>system</measure-numbering></print></measure>
        <measure
          number="2"><direction><direction-type><words>measurement</words></direction-type></direction></measure>
      </part>
      <part class="strings" id='P2'>
        <measure number="1"></measure>
      </part>
    </score-partwise>`;
  const filePath = await writeMxlFixture(t, score);

  const result = await validateMxl(filePath);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.rootFile, "score.xml");
  assert.equal(result.measureCount, 3, "measure-numbering, text, comments, and CDATA are not measures");
  assert.deepEqual(result.measuresPerPart, { P1: 2, P2: 1 });
});

test("keeps score-timewise validation and reports counts per nested part", async (t) => {
  const score = `<?xml version="1.0"?>
    <score-timewise version="4.0">
      <part-list>
        <score-part id="P1"><part-name>One</part-name></score-part>
        <score-part id="P2"><part-name>Two</part-name></score-part>
      </part-list>
      <measure number="1"><part id="P1"></part><part id="P2"></part></measure>
      <measure number="2"><part id="P1"></part><part id="P2"></part></measure>
    </score-timewise>`;
  const filePath = await writeMxlFixture(t, score);

  const result = await validateMxl(filePath);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.measureCount, 2);
  assert.deepEqual(result.measuresPerPart, { P1: 2, P2: 2 });
});

test("measure-numbering alone still fails with NO_MEASURES", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Empty</part-name></score-part></part-list>
    <part id="P1"><print><measure-numbering>system</measure-numbering></print></part>
  </score-partwise>`;
  const filePath = await writeMxlFixture(t, score);

  assert.deepEqual(await validateMxl(filePath), { ok: false, reason: "NO_MEASURES" });
});

test("retains missing-container and invalid-root validation behavior", async (t) => {
  const missingContainer = await writeZipFixture(t, { "score.xml": "<score-partwise/>" });
  assert.deepEqual(await validateMxl(missingContainer), { ok: false, reason: "MISSING_CONTAINER" });

  const invalidRoot = await writeMxlFixture(t, "<not-a-score><measure></measure></not-a-score>");
  assert.deepEqual(await validateMxl(invalidRoot), { ok: false, reason: "INVALID_ROOT" });
});

test.todo("real Audiveris simple.mxl fixture: documented expected measureCount is 35");
test.todo("real Audiveris multi.mxl fixture: documented expected measureCount is 106");

async function writeMxlFixture(t: TestContext, scoreXml: string) {
  return await writeZipFixture(t, {
    "META-INF/container.xml": `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles>
      </container>`,
    "score.xml": scoreXml,
  });
}

async function writeZipFixture(t: TestContext, entries: Record<string, string>) {
  const directory = await mkdtemp(path.join(tmpdir(), "pdf-score-mxl-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const filePath = path.join(directory, "fixture.mxl");
  await writeFile(filePath, createStoredZip(entries));
  return filePath;
}

function createStoredZip(entries: Record<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(value, "utf8");
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBuffer);

    localOffset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
