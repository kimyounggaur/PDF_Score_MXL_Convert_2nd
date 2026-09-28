import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import type { SuspectMeasure } from "./types.js";

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export type MxlValidationResult =
  | {
      ok: true;
      rootFile: string;
      measureCount: number;
      measuresPerPart: Record<string, number>;
      suspectMeasures: MxlSuspectMeasure[];
    }
  | { ok: false; reason: string };

export type MxlSuspectMeasure = Omit<SuspectMeasure, "file">;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

export async function validateMxl(filePath: string): Promise<MxlValidationResult> {
  try {
    const buffer = await readFile(filePath);
    const entries = readZipEntries(buffer);
    const names = new Set(entries.map((entry) => entry.name));
    const containerEntry = entries.find((entry) => entry.name === "META-INF/container.xml");

    if (!containerEntry) {
      return { ok: false, reason: "MISSING_CONTAINER" };
    }

    const containerXml = extractZipEntry(buffer, containerEntry).toString("utf8");
    const rootFile = parseRootFile(containerXml);

    if (!rootFile || !names.has(rootFile)) {
      return { ok: false, reason: "MISSING_ROOTFILE" };
    }

    const rootEntry = entries.find((entry) => entry.name === rootFile);
    if (!rootEntry) {
      return { ok: false, reason: "MISSING_ROOTFILE" };
    }

    const xml = extractZipEntry(buffer, rootEntry).toString("utf8");
    const xmlWithoutComments = stripCommentsAndCdata(xml);
    const scoreMatch = xmlWithoutComments.match(/<score-(partwise|timewise)(?=[\s>])/i);
    if (!scoreMatch) {
      return { ok: false, reason: "INVALID_ROOT" };
    }

    const measureCount = xmlWithoutComments.match(/<measure(?=[\s>])/gi)?.length ?? 0;
    if (measureCount < 1) {
      return { ok: false, reason: "NO_MEASURES" };
    }

    const scoreKind = scoreMatch[1].toLowerCase() as "partwise" | "timewise";
    const measuresPerPart = scoreKind === "partwise"
      ? countPartwiseMeasures(xmlWithoutComments)
      : countTimewiseMeasures(xmlWithoutComments);
    const suspectMeasures = findDurationSuspects(xmlWithoutComments, scoreKind);

    return { ok: true, rootFile, measureCount, measuresPerPart, suspectMeasures };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "INVALID_ZIP",
    };
  }
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new Error("INVALID_ZIP");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("INVALID_CENTRAL_DIRECTORY");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65_557);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function extractZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("INVALID_LOCAL_HEADER");
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) {
    return compressed;
  }

  if (entry.method === 8) {
    const inflated = inflateRawSync(compressed);
    if (entry.uncompressedSize > 0 && inflated.length !== entry.uncompressedSize) {
      throw new Error("SIZE_MISMATCH");
    }
    return inflated;
  }

  throw new Error("UNSUPPORTED_ZIP_METHOD");
}

function parseRootFile(containerXml: string) {
  return containerXml.match(/full-path=["']([^"']+)["']/i)?.[1] ?? null;
}

function stripCommentsAndCdata(xml: string) {
  return xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
}

function countPartwiseMeasures(xml: string) {
  const measuresPerPart: Record<string, number> = {};
  const partPattern = /<part(?=[\s>])([^>]*)>([\s\S]*?)<\/part\s*>/gi;
  let partIndex = 0;

  for (const match of xml.matchAll(partPattern)) {
    const partId = partIdFromAttributes(match[1], partIndex);
    const measureCount = match[2].match(/<measure(?=[\s>])/gi)?.length ?? 0;
    measuresPerPart[partId] = (measuresPerPart[partId] ?? 0) + measureCount;
    partIndex += 1;
  }

  return measuresPerPart;
}

function countTimewiseMeasures(xml: string) {
  const measuresPerPart: Record<string, number> = {};
  const measurePattern = /<measure(?=[\s>])[^>]*>([\s\S]*?)<\/measure\s*>/gi;

  for (const measureMatch of xml.matchAll(measurePattern)) {
    const partPattern = /<part(?=[\s>])([^>]*)>/gi;
    let partIndex = 0;
    for (const partMatch of measureMatch[1].matchAll(partPattern)) {
      const partId = partIdFromAttributes(partMatch[1], partIndex);
      measuresPerPart[partId] = (measuresPerPart[partId] ?? 0) + 1;
      partIndex += 1;
    }
  }

  return measuresPerPart;
}

function partIdFromAttributes(attributes: string, index: number) {
  const value = attributes.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
  return value || `part-${index + 1}`;
}

type Fraction = {
  numerator: bigint;
  denominator: bigint;
};

type RhythmState = {
  divisions: Fraction | null;
  meter: Fraction | null;
};

type MeasureRhythmAnalysis = {
  nextState: RhythmState;
  mismatch: boolean;
};

const ZERO: Fraction = { numerator: 0n, denominator: 1n };
const FOUR: Fraction = { numerator: 4n, denominator: 1n };

function findDurationSuspects(
  xml: string,
  scoreKind: "partwise" | "timewise",
): MxlSuspectMeasure[] {
  return scoreKind === "partwise"
    ? findPartwiseDurationSuspects(xml)
    : findTimewiseDurationSuspects(xml);
}

function findPartwiseDurationSuspects(xml: string) {
  const suspects: MxlSuspectMeasure[] = [];
  const partPattern = /<part(?=[\s>])([^>]*)>([\s\S]*?)<\/part\s*>/gi;
  let partIndex = 0;

  for (const partMatch of xml.matchAll(partPattern)) {
    const partId = partIdFromAttributes(partMatch[1], partIndex);
    const measurePattern = /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure\s*>/gi;
    let state = emptyRhythmState();
    let measure = 0;

    for (const measureMatch of partMatch[2].matchAll(measurePattern)) {
      measure += 1;
      const analysis = analyzeMeasureRhythm(measureMatch[2], state);
      state = analysis.nextState;

      if (
        measure > 1 &&
        !isYesAttribute(measureMatch[1], "implicit") &&
        !isYesAttribute(measureMatch[1], "non-controlling") &&
        analysis.mismatch
      ) {
        suspects.push({ part: partId, measure, reason: "DURATION_MISMATCH" });
      }
    }

    partIndex += 1;
  }

  return suspects;
}

function findTimewiseDurationSuspects(xml: string) {
  const suspects: MxlSuspectMeasure[] = [];
  const states = new Map<string, RhythmState>();
  const measurePattern = /<measure(?=[\s>])([^>]*)>([\s\S]*?)<\/measure\s*>/gi;
  let measure = 0;

  for (const measureMatch of xml.matchAll(measurePattern)) {
    measure += 1;
    const partPattern = /<part(?=[\s>])([^>]*)>([\s\S]*?)<\/part\s*>/gi;
    let partIndex = 0;

    for (const partMatch of measureMatch[2].matchAll(partPattern)) {
      const partId = partIdFromAttributes(partMatch[1], partIndex);
      const analysis = analyzeMeasureRhythm(partMatch[2], states.get(partId) ?? emptyRhythmState());
      states.set(partId, analysis.nextState);

      if (
        measure > 1 &&
        !isYesAttribute(measureMatch[1], "implicit") &&
        !isYesAttribute(measureMatch[1], "non-controlling") &&
        analysis.mismatch
      ) {
        suspects.push({ part: partId, measure, reason: "DURATION_MISMATCH" });
      }

      partIndex += 1;
    }
  }

  return suspects;
}

function analyzeMeasureRhythm(body: string, previousState: RhythmState): MeasureRhythmAnalysis {
  let divisions = previousState.divisions;
  let meter = previousState.meter;
  let cursor = ZERO;
  let maximumExtent = ZERO;
  let sawRhythmicEvent = false;
  let invalidRhythm = false;
  let uncheckable = false;
  const eventPattern = /<(attributes|note|backup|forward)(?=[\s>])[^>]*>([\s\S]*?)<\/\1\s*>/gi;

  for (const eventMatch of body.matchAll(eventPattern)) {
    const event = eventMatch[1].toLowerCase();
    const eventBody = eventMatch[2];

    if (event === "attributes") {
      const divisionsPresent = hasElement(eventBody, "divisions");
      const meterUpdate = parseTimeUpdate(eventBody);

      if (sawRhythmicEvent && meterUpdate.present) {
        // Mid-measure meter changes apply in score order and cannot be
        // reconstructed safely from this small document-order scan. Divisions
        // changes remain exact because each duration is normalized immediately.
        uncheckable = true;
      }

      if (divisionsPresent) {
        const value = directChildText(eventBody, "divisions");
        divisions = value === null ? null : parsePositiveDecimal(value);
      }

      if (meterUpdate.present) {
        meter = meterUpdate.value;
      }
      continue;
    }

    sawRhythmicEvent = true;
    if (event === "note" && (hasElement(eventBody, "chord") || hasElement(eventBody, "grace"))) {
      continue;
    }

    const durationText = directChildText(eventBody, "duration");
    const duration = durationText === null ? null : parsePositiveDecimal(durationText);
    if (!duration) {
      invalidRhythm = true;
      continue;
    }
    if (!divisions) {
      uncheckable = true;
      continue;
    }

    const delta = divideFractions(duration, divisions);
    cursor = event === "backup"
      ? subtractFractions(cursor, delta)
      : addFractions(cursor, delta);

    if (compareFractions(cursor, ZERO) < 0) {
      invalidRhythm = true;
    }
    if (compareFractions(cursor, maximumExtent) > 0) {
      maximumExtent = cursor;
    }
  }

  const nextState = { divisions, meter };
  if (invalidRhythm) {
    return { nextState, mismatch: true };
  }
  if (uncheckable || !divisions || !meter) {
    return { nextState, mismatch: false };
  }

  return {
    nextState,
    mismatch: compareFractions(maximumExtent, meter) !== 0,
  };
}

function parseTimeUpdate(attributesBody: string): { present: boolean; value: Fraction | null } {
  const timePattern = /<time(?=[\s>])([^>]*)>([\s\S]*?)<\/time\s*>/gi;
  const values: Fraction[] = [];
  let present = false;

  for (const timeMatch of attributesBody.matchAll(timePattern)) {
    present = true;
    if (hasAttribute(timeMatch[1], "number")) {
      // A numbered time applies to one staff. One part-wide duration cannot be
      // inferred safely, even if this block also contains an unscoped time.
      return { present: true, value: null };
    }

    const value = parseTimeSignature(timeMatch[2]);
    if (!value) {
      return { present: true, value: null };
    }
    values.push(value);
  }

  if (!present) {
    return { present: false, value: null };
  }

  const first = values[0];
  if (!first || values.some((value) => compareFractions(value, first) !== 0)) {
    // Different staff-specific meters cannot be represented by one part-wide
    // expected duration, so avoid a false positive.
    return { present: true, value: null };
  }

  return { present: true, value: first };
}

function parseTimeSignature(timeBody: string) {
  if (hasElement(timeBody, "senza-misura")) {
    return null;
  }

  const primaryTime = timeBody.replace(/<interchangeable(?=[\s>])[^>]*>[\s\S]*?<\/interchangeable\s*>/gi, "");
  const pairPattern = /<(beats|beat-type)(?=[\s>])[^>]*>([^<]*)<\/\1\s*>/gi;
  let pendingBeats: Fraction | null = null;
  let expected = ZERO;
  let pairCount = 0;

  for (const pairMatch of primaryTime.matchAll(pairPattern)) {
    const name = pairMatch[1].toLowerCase();
    if (name === "beats") {
      if (pendingBeats) {
        return null;
      }
      pendingBeats = parseBeats(pairMatch[2]);
      if (!pendingBeats) {
        return null;
      }
      continue;
    }

    if (!pendingBeats) {
      return null;
    }
    const beatType = parsePositiveDecimal(pairMatch[2]);
    if (!beatType) {
      return null;
    }
    expected = addFractions(expected, divideFractions(multiplyFractions(pendingBeats, FOUR), beatType));
    pendingBeats = null;
    pairCount += 1;
  }

  return pairCount > 0 && pendingBeats === null ? expected : null;
}

function parseBeats(value: string) {
  let total = ZERO;
  const terms = value.trim().split("+");
  if (terms.length === 0) {
    return null;
  }

  for (const term of terms) {
    const parsed = parsePositiveDecimal(term);
    if (!parsed) {
      return null;
    }
    total = addFractions(total, parsed);
  }

  return total;
}

function parsePositiveDecimal(value: string) {
  const normalized = value.trim().replace(/^\+/, "");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return null;
  }

  const [whole = "0", decimal = ""] = normalized.split(".");
  const digits = `${whole || "0"}${decimal}`;
  const numerator = BigInt(digits);
  if (numerator <= 0n) {
    return null;
  }

  return makeFraction(numerator, 10n ** BigInt(decimal.length));
}

function directChildText(body: string, name: string) {
  const pattern = new RegExp(`<${name}(?=[\\s>])[^>]*>([^<]*)<\\/${name}\\s*>`, "i");
  return pattern.exec(body)?.[1]?.trim() ?? null;
}

function hasElement(body: string, name: string) {
  return new RegExp(`<${name}(?=[\\s/>])`, "i").test(body);
}

function isYesAttribute(attributes: string, name: string) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return pattern.exec(attributes)?.[2]?.trim().toLowerCase() === "yes";
}

function hasAttribute(attributes: string, name: string) {
  return new RegExp(`(?:^|\\s)${name}\\s*=`, "i").test(attributes);
}

function emptyRhythmState(): RhythmState {
  return { divisions: null, meter: null };
}

function makeFraction(numerator: bigint, denominator: bigint): Fraction {
  if (numerator === 0n) {
    return ZERO;
  }

  const sign = denominator < 0n ? -1n : 1n;
  const unsignedDenominator = denominator * sign;
  const divisor = greatestCommonDivisor(numerator < 0n ? -numerator : numerator, unsignedDenominator);
  return {
    numerator: (numerator * sign) / divisor,
    denominator: unsignedDenominator / divisor,
  };
}

function addFractions(left: Fraction, right: Fraction) {
  return makeFraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractFractions(left: Fraction, right: Fraction) {
  return makeFraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyFractions(left: Fraction, right: Fraction) {
  return makeFraction(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divideFractions(left: Fraction, right: Fraction) {
  return makeFraction(left.numerator * right.denominator, left.denominator * right.numerator);
}

function compareFractions(left: Fraction, right: Fraction) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function greatestCommonDivisor(left: bigint, right: bigint) {
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

