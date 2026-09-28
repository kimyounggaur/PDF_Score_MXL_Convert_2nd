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
  | "SERVICE_UNAVAILABLE"
  | "WORKER_UNAVAILABLE"
  | "STORAGE_FULL"
  | "JOB_ALREADY_FINISHED"
  | "CANCELLED"
  | "TIMEOUT"
  | "NO_OUTPUT"
  | "OUT_OF_MEMORY"
  | "ENGINE_ERROR"
  | "INVALID_OUTPUT";

const MESSAGES: Record<ErrorCode, string> = {
  FILE_TOO_LARGE: "파일이 너무 큽니다. 30MB 이하의 PDF를 업로드해 주세요.",
  MISSING_FILE: "업로드할 PDF 파일을 찾지 못했습니다.",
  NOT_A_PDF: "PDF 파일만 업로드할 수 있습니다.",
  CORRUPT_PDF: "PDF를 읽을 수 없습니다. 파일이 손상되었는지 확인해 주세요.",
  ENCRYPTED_PDF: "보안이 설정된 PDF(열람 암호 또는 권한 제한)는 변환할 수 없습니다. 보안이 없는 원본 PDF로 다시 올려 주세요.",
  TOO_MANY_PAGES: "20쪽 이하의 PDF만 변환할 수 있습니다. 파일을 나눠서 시도해 주세요.",
  JOB_NOT_FOUND: "존재하지 않거나 만료된 작업입니다.",
  FILE_NOT_FOUND: "요청한 결과 파일을 찾을 수 없습니다.",
  QUEUE_FULL: "현재 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  SERVICE_UNAVAILABLE: "변환 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  WORKER_UNAVAILABLE: "변환 서버를 점검하고 있습니다. 잠시 후 다시 시도해 주세요.",
  STORAGE_FULL: "서버 저장 공간이 부족합니다. 잠시 후 다시 시도해 주세요.",
  JOB_ALREADY_FINISHED: "이미 완료되었거나 실패한 작업은 취소할 수 없습니다.",
  CANCELLED: "변환을 취소했습니다.",
  TIMEOUT: "변환 시간이 20분을 초과했습니다. 페이지 수가 적은 파일로 나눠서 시도해 보세요.",
  NO_OUTPUT: "악보를 인식하지 못했습니다. 표지만 있거나 악보가 아닌 PDF일 수 있습니다. 300DPI 이상의 선명한 인쇄 악보인지 확인해 주세요.",
  OUT_OF_MEMORY: "악보가 너무 크거나 복잡해 메모리가 부족했습니다. 쪽을 나눠서 다시 시도해 주세요.",
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

  if (value.includes("OUT_OF_MEMORY")) {
    return "OUT_OF_MEMORY";
  }

  if (value.includes("INVALID_OUTPUT")) {
    return "INVALID_OUTPUT";
  }

  if (value.includes("CANCELLED")) {
    return "CANCELLED";
  }

  return "ENGINE_ERROR";
}

