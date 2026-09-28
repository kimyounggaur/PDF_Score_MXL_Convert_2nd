import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { validateMxl } from "./validate-mxl.js";

const musicXmlFixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/musicxml",
);

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
  assert.deepEqual(result.suspectMeasures, []);
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
  assert.deepEqual(result.suspectMeasures, []);
});

test("normal 4/4 fixture has no suspect measures", async (t) => {
  const score = await readFile(path.join(musicXmlFixtures, "normal-4-4.musicxml"), "utf8");
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, []);
});

test("a missing note marks the physical measure ordinal without invalidating the MXL", async (t) => {
  const score = await readFile(path.join(musicXmlFixtures, "missing-note-4-4.musicxml"), "utf8");
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, [
    { part: "P1", measure: 2, reason: "DURATION_MISMATCH" },
  ]);
});

test("chord tones and grace notes do not advance the rhythmic cursor", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Chord</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>16</duration></note>
      </measure>
      <measure number="2">
        <note><grace/><pitch><step>D</step><octave>5</octave></pitch></note>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration></note>
        <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration></note>
        <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration></note>
        <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration></note>
        <note><pitch><step>F</step><octave>5</octave></pitch><duration>4</duration></note>
      </measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, []);
});

test("backup separates voices and forward advances invisible time", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Voices</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>16</duration></note>
      </measure>
      <measure number="2">
        <note><rest/><duration>16</duration><voice>1</voice></note>
        <backup><duration>16</duration></backup>
        <forward><duration>4</duration><voice>2</voice></forward>
        <note><rest/><duration>4</duration><voice>2</voice></note>
      </measure>
      <measure number="3">
        <forward><duration>16</duration><voice>1</voice></forward>
      </measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, []);
});

test("first and implicit measures are exempt while later short measures are reported", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Pickup</part-name></score-part></part-list>
    <part id="P1">
      <measure number="0">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>1</duration></note>
      </measure>
      <measure number="X" implicit="yes"><note><rest/><duration>1</duration></note></measure>
      <measure number="1"><note><rest/><duration>3</duration></note></measure>
      <measure number="2"><note><rest/><duration>4</duration></note></measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, [
    { part: "P1", measure: 3, reason: "DURATION_MISMATCH" },
  ]);
});

test("divisions and time inherit and support additive and composite meters", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Meter</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>6</duration></note>
      </measure>
      <measure number="2"><note><rest/><duration>6</duration></note></measure>
      <measure number="3">
        <attributes><divisions>4</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
        <note><rest/><duration>12</duration></note>
      </measure>
      <measure number="4">
        <attributes><time><beats>3+2</beats><beat-type>8</beat-type></time></attributes>
        <note><rest/><duration>10</duration></note>
      </measure>
      <measure number="5">
        <attributes><time><beats>2</beats><beat-type>4</beat-type><beats>3</beats><beat-type>8</beat-type></time></attributes>
        <note><rest/><duration>14</duration></note>
      </measure>
      <measure number="6"><note><rest/><duration>12</duration></note></measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, [
    { part: "P1", measure: 6, reason: "DURATION_MISMATCH" },
  ]);
});

test("a complete measure remains checkable across a mid-measure divisions change", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Divisions</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </measure>
      <measure number="2">
        <note><rest/><duration>1</duration></note>
        <attributes><divisions>2</divisions></attributes>
        <note><rest/><duration>6</duration></note>
      </measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, []);
});

test("a short measure is reported across a mid-measure divisions change", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Divisions</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </measure>
      <measure number="2">
        <note><rest/><duration>1</duration></note>
        <attributes><divisions>2</divisions></attributes>
        <note><rest/><duration>4</duration></note>
      </measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, [
    { part: "P1", measure: 2, reason: "DURATION_MISMATCH" },
  ]);
});

test("non-controlling measures are exempt but still update state in both score layouts", async (t) => {
  const partwise = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Partwise</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </measure>
      <measure number="2" non-controlling="yes">
        <attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>1</duration></note>
      </measure>
      <measure number="3"><note><rest/><duration>3</duration></note></measure>
      <measure number="4"><note><rest/><duration>2</duration></note></measure>
    </part>
  </score-partwise>`;
  const timewise = `<score-timewise version="4.0">
    <part-list><score-part id="P1"><part-name>Timewise</part-name></score-part></part-list>
    <measure number="1">
      <part id="P1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </part>
    </measure>
    <measure number="2" non-controlling="yes">
      <part id="P1">
        <attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>1</duration></note>
      </part>
    </measure>
    <measure number="3"><part id="P1"><note><rest/><duration>3</duration></note></part></measure>
    <measure number="4"><part id="P1"><note><rest/><duration>2</duration></note></part></measure>
  </score-timewise>`;

  const partwiseResult = await validateScore(t, partwise);
  const timewiseResult = await validateScore(t, timewise);
  const expected = [{ part: "P1", measure: 4, reason: "DURATION_MISMATCH" as const }];
  assert.deepEqual(partwiseResult.suspectMeasures, expected);
  assert.deepEqual(timewiseResult.suspectMeasures, expected);
});

test("staff-scoped time stays uncheckable until a later unscoped time restores it", async (t) => {
  const score = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Staff meters</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </measure>
      <measure number="2">
        <attributes><time number="2"><beats>3</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </measure>
      <measure number="3">
        <attributes>
          <time><beats>4</beats><beat-type>4</beat-type></time>
          <time number="2"><beats>3</beats><beat-type>4</beat-type></time>
        </attributes>
        <note><rest/><duration>2</duration></note>
      </measure>
      <measure number="4"><note><rest/><duration>2</duration></note></measure>
      <measure number="5">
        <attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>3</duration></note>
      </measure>
    </part>
  </score-partwise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, [
    { part: "P1", measure: 5, reason: "DURATION_MISMATCH" },
  ]);
});

test("score-timewise rhythm checking keeps independent part state", async (t) => {
  const score = `<score-timewise version="4.0">
    <part-list>
      <score-part id="P1"><part-name>One</part-name></score-part>
      <score-part id="P2"><part-name>Two</part-name></score-part>
    </part-list>
    <measure number="1">
      <part id="P1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>4</duration></note>
      </part>
      <part id="P2">
        <attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
        <note><rest/><duration>6</duration></note>
      </part>
    </measure>
    <measure number="2">
      <part id="P1"><note><rest/><duration>3</duration></note></part>
      <part id="P2"><note><rest/><duration>6</duration></note></part>
    </measure>
  </score-timewise>`;
  const result = await validateScore(t, score);

  assert.deepEqual(result.suspectMeasures, [
    { part: "P1", measure: 2, reason: "DURATION_MISMATCH" },
  ]);
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

async function validateScore(t: TestContext, scoreXml: string) {
  const result = await validateMxl(await writeMxlFixture(t, scoreXml));
  if (!result.ok) {
    throw new Error(result.reason);
  }
  assert.equal(result.ok, true);
  return result;
}

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
