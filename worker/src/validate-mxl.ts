import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

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
    }
  | { ok: false; reason: string };

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

    const measuresPerPart = scoreMatch[1].toLowerCase() === "partwise"
      ? countPartwiseMeasures(xmlWithoutComments)
      : countTimewiseMeasures(xmlWithoutComments);

    return { ok: true, rootFile, measureCount, measuresPerPart };
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

