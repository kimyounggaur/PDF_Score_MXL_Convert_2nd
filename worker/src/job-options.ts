import { readFile } from "node:fs/promises";
import { metadataPath } from "./paths.js";

export const OCR_LANGUAGES = ["eng", "kor", "kor+eng"] as const;
export const MAX_SELECTED_SHEETS = 20;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

export type ConversionOptions = {
  sheets: number[] | null;
  language: OcrLanguage;
};

const DEFAULT_OPTIONS: ConversionOptions = {
  sheets: null,
  language: "eng",
};

export class InvalidJobOptionsError extends Error {
  constructor(reason: string) {
    super(`INVALID_JOB_OPTIONS: ${reason}`);
    this.name = "InvalidJobOptionsError";
  }
}

export async function readJobOptions(jobId: string): Promise<ConversionOptions> {
  let metadata: unknown;

  try {
    metadata = JSON.parse(await readFile(metadataPath(jobId), "utf8")) as unknown;
  } catch {
    throw new InvalidJobOptionsError("metadata.json을 읽을 수 없습니다");
  }

  return parseJobOptions(metadata);
}

export function parseJobOptions(metadata: unknown): ConversionOptions {
  if (!isRecord(metadata)) {
    throw new InvalidJobOptionsError("metadata가 객체가 아닙니다");
  }

  const pageCount = metadata.pages;
  if (!Number.isSafeInteger(pageCount) || (pageCount as number) < 1) {
    throw new InvalidJobOptionsError("pages가 양의 안전한 정수가 아닙니다");
  }

  if (!Object.hasOwn(metadata, "options")) {
    if ((pageCount as number) > MAX_SELECTED_SHEETS) {
      throw new InvalidJobOptionsError(`전체 변환은 ${MAX_SELECTED_SHEETS}쪽 이하여야 합니다`);
    }
    return cloneOptions(DEFAULT_OPTIONS);
  }

  const options = metadata.options;
  if (!isRecord(options)) {
    throw new InvalidJobOptionsError("options가 객체가 아닙니다");
  }
  if (!Object.hasOwn(options, "sheets") || !Object.hasOwn(options, "language")) {
    throw new InvalidJobOptionsError("options 필드가 완전하지 않습니다");
  }

  const sheets = normalizeSheets(options.sheets, pageCount as number);
  if (sheets === null && (pageCount as number) > MAX_SELECTED_SHEETS) {
    throw new InvalidJobOptionsError(`전체 변환은 ${MAX_SELECTED_SHEETS}쪽 이하여야 합니다`);
  }

  return {
    sheets,
    language: normalizeLanguage(options.language),
  };
}

function normalizeSheets(value: unknown, pageCount: number): number[] | null {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length < 1) {
    throw new InvalidJobOptionsError(`sheets는 1~${MAX_SELECTED_SHEETS}개의 쪽 번호 배열이어야 합니다`);
  }

  const sheets = value.map((sheet) => {
    if (!Number.isSafeInteger(sheet) || (sheet as number) < 1 || (sheet as number) > pageCount) {
      throw new InvalidJobOptionsError("sheets에는 실제 PDF 안의 쪽 번호만 사용할 수 있습니다");
    }
    return sheet as number;
  });

  const normalized = [...new Set(sheets)].sort((left, right) => left - right);
  if (normalized.length > MAX_SELECTED_SHEETS) {
    throw new InvalidJobOptionsError(`sheets는 최대 ${MAX_SELECTED_SHEETS}쪽까지 선택할 수 있습니다`);
  }

  return normalized;
}

function normalizeLanguage(value: unknown): OcrLanguage {
  if (typeof value !== "string" || !OCR_LANGUAGES.includes(value as OcrLanguage)) {
    throw new InvalidJobOptionsError("language가 허용 목록에 없습니다");
  }
  return value as OcrLanguage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneOptions(options: ConversionOptions): ConversionOptions {
  return {
    sheets: options.sheets ? [...options.sheets] : null,
    language: options.language,
  };
}
