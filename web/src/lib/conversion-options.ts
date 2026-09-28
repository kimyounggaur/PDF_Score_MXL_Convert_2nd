import { MAX_UPLOAD_PAGES } from "./env";

export const CONVERSION_LANGUAGES = ["eng", "kor", "kor+eng"] as const;
export const MAX_PAGE_RANGE_INPUT_LENGTH = 512;

export type ConversionLanguage = (typeof CONVERSION_LANGUAGES)[number];

export type ConversionOptions = {
  sheets: number[] | null;
  language: ConversionLanguage;
};

type ConversionOptionsErrorCode = "PAGE_RANGE_INVALID" | "LANGUAGE_INVALID";

export type ConversionOptionsResult =
  | { ok: true; options: ConversionOptions }
  | { ok: false; code: ConversionOptionsErrorCode };

export function defaultConversionOptions(): ConversionOptions {
  return { sheets: null, language: "eng" };
}

export function parseConversionOptions({
  pageRange,
  language,
  pageCount,
}: {
  pageRange?: unknown;
  language?: unknown;
  pageCount: number;
}): ConversionOptionsResult {
  const sheets = parsePageRange(pageRange, pageCount);
  if (sheets === undefined) {
    return { ok: false, code: "PAGE_RANGE_INVALID" };
  }

  const normalizedLanguage = parseLanguage(language);
  if (!normalizedLanguage) {
    return { ok: false, code: "LANGUAGE_INVALID" };
  }

  return {
    ok: true,
    options: {
      sheets,
      language: normalizedLanguage,
    },
  };
}

export function normalizeStoredConversionOptions(value: unknown, pageCount: number): ConversionOptions | null {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    return null;
  }

  if (value === undefined) {
    return pageCount <= MAX_UPLOAD_PAGES ? defaultConversionOptions() : null;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (!Object.hasOwn(candidate, "sheets") || !Object.hasOwn(candidate, "language")) {
    return null;
  }

  const language = parseLanguage(candidate.language);
  if (!language) {
    return null;
  }

  if (candidate.sheets === null) {
    return pageCount <= MAX_UPLOAD_PAGES ? { sheets: null, language } : null;
  }

  if (!Array.isArray(candidate.sheets) || candidate.sheets.length === 0) {
    return null;
  }

  const sheets = normalizeSelectedSheets(candidate.sheets, pageCount);
  if (!sheets) {
    return null;
  }

  return { sheets, language };
}

function parsePageRange(value: unknown, pageCount: number): number[] | null | undefined {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > MAX_PAGE_RANGE_INPUT_LENGTH ||
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1
  ) {
    return undefined;
  }

  const items = value.split(",");
  const selected = new Set<number>();

  for (const rawItem of items) {
    const item = trimAsciiSpaces(rawItem);
    const match = /^([0-9]+)(?: *- *([0-9]+))?$/.exec(item);
    if (!match) {
      return undefined;
    }

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end > pageCount
    ) {
      return undefined;
    }

    for (let sheet = start; sheet <= end; sheet += 1) {
      selected.add(sheet);
      if (selected.size > MAX_UPLOAD_PAGES) {
        return undefined;
      }
    }
  }

  if (selected.size === 0) {
    return undefined;
  }

  return [...selected].sort((left, right) => left - right);
}

function normalizeSelectedSheets(values: unknown[], pageCount: number): number[] | null {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    return null;
  }

  const selected = new Set<number>();
  for (const value of values) {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > pageCount) {
      return null;
    }
    selected.add(value as number);
    if (selected.size > MAX_UPLOAD_PAGES) {
      return null;
    }
  }

  return [...selected].sort((left, right) => left - right);
}

function parseLanguage(value: unknown): ConversionLanguage | null {
  if (value === undefined) {
    return "eng";
  }

  return typeof value === "string" && (CONVERSION_LANGUAGES as readonly string[]).includes(value)
    ? (value as ConversionLanguage)
    : null;
}

function trimAsciiSpaces(value: string) {
  return value.replace(/^ +| +$/g, "");
}
