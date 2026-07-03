export type ErrorCode =
  | "FILE_TOO_LARGE"
  | "MISSING_FILE"
  | "NOT_A_PDF"
  | "CORRUPT_PDF"
  | "ENCRYPTED_PDF"
  | "TOO_MANY_PAGES"
  | "JOB_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "QUEUE_FULL"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NO_OUTPUT"
  | "ENGINE_ERROR"
  | "INVALID_OUTPUT";

const MESSAGES: Record<ErrorCode, string> = {
  FILE_TOO_LARGE: "파일이 너무 큽니다. 30MB 이하의 PDF를 업로드해 주세요.",
  MISSING_FILE: "업로드할 PDF 파일을 찾지 못했습니다.",
  NOT_A_PDF: "PDF 파일만 업로드할 수 있습니다.",
  CORRUPT_PDF: "PDF를 읽을 수 없습니다. 파일이 손상되었는지 확인해 주세요.",
  ENCRYPTED_PDF: "암호화된 PDF는 변환할 수 없습니다. 암호를 해제한 뒤 다시 시도해 주세요.",
  TOO_MANY_PAGES: "20쪽 이하의 PDF만 변환할 수 있습니다. 파일을 나눠서 시도해 주세요.",
  JOB_NOT_FOUND: "존재하지 않거나 만료된 작업입니다.",
  FILE_NOT_FOUND: "요청한 결과 파일을 찾을 수 없습니다.",
  QUEUE_FULL: "현재 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  TIMEOUT: "변환 시간이 20분을 초과했습니다. 페이지 수가 적은 파일로 나눠서 시도해 보세요.",
  NO_OUTPUT: "악보를 인식하지 못했습니다. 300DPI 이상의 선명한 인쇄 악보 스캔인지 확인해 주세요.",
  ENGINE_ERROR: "변환 엔진에서 오류가 발생했습니다. 다른 PDF로 다시 시도해 주세요.",
  INVALID_OUTPUT: "변환 결과 파일이 손상되어 제공할 수 없습니다. 다른 스캔본으로 다시 시도해 주세요.",
};

export function errorMessage(code: ErrorCode) {
  return MESSAGES[code];
}

export function normalizeFailureCode(value: unknown): ErrorCode {
  if (typeof value !== "string") {
    return "ENGINE_ERROR";
  }

  if (value in MESSAGES) {
    return value as ErrorCode;
  }

  if (value.includes("TIMEOUT")) {
    return "TIMEOUT";
  }

  if (value.includes("NO_OUTPUT")) {
    return "NO_OUTPUT";
  }

  if (value.includes("INVALID_OUTPUT")) {
    return "INVALID_OUTPUT";
  }

  return "ENGINE_ERROR";
}

