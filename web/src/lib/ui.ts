import type { JobStatus } from "./client-types";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function stageLabel(stage: string | undefined) {
  const labels: Record<string, string> = {
    queued: "대기 중",
    starting: "변환 준비 중",
    processing: "악보 분석 중",
    LOAD: "쪽 이미지 불러오는 중",
    BINARY: "흑백으로 정리하는 중",
    SCALE: "선 굵기·간격 재는 중",
    GRID: "오선·마디줄 찾는 중",
    HEADERS: "음자리표·조표·박자표 찾는 중",
    STEM_SEEDS: "음표 기둥 후보 찾는 중",
    BEAMS: "빔(꼬리 묶음) 찾는 중",
    LEDGERS: "덧줄 찾는 중",
    HEADS: "음표 머리 찾는 중",
    STEMS: "음표 기둥 연결하는 중",
    REDUCTION: "겹친 기호 정리하는 중",
    CUE_BEAMS: "작은 음표의 빔 찾는 중",
    TEXTS: "제목·가사 글자 읽는 중",
    MEASURES: "마디 나누는 중",
    CHORDS: "화음 묶는 중",
    CURVES: "이음줄 같은 곡선 기호 찾는 중",
    SYMBOLS: "나머지 기호 찾는 중",
    LINKS: "기호 연결하는 중",
    RHYTHMS: "리듬 맞추는 중",
    PAGE: "쪽 마무리하는 중",
    EXPORT: "MXL 파일 만드는 중",
    collecting: "결과 확인하는 중",
    completed: "완료",
  };

  return labels[stage ?? ""] ?? "악보 분석 중";
}

export function progressLabel(progress: { stage: string; sheet: { current: number; total: number } | null } | null | undefined) {
  const label = stageLabel(progress?.stage ?? "queued");
  return progress?.sheet ? `${progress.sheet.current}/${progress.sheet.total}쪽 · ${label}` : label;
}

export function skippedPagesLabel(pages: number[]) {
  const sorted = [...new Set(pages)].sort((left, right) => left - right);
  return `${sorted.join(", ")}쪽은 악보로 인식되지 않아 제외했습니다.`;
}

export function resultFileLabel(name: string, index: number, total: number) {
  const movement = name.match(/\.mvt(\d+)\.mxl$/i);
  if (movement) {
    return `${movement[1]}악장`;
  }

  if (total > 1) {
    return `${index + 1}번째 파일`;
  }

  return "MXL 다운로드";
}

export function dropRejectionMessage(errorCodes: string[]) {
  if (errorCodes.includes("too-many-files")) {
    return "한 번에 5개까지";
  }

  if (errorCodes.includes("file-too-large")) {
    return "30MB를 넘습니다";
  }

  return "PDF가 아닙니다";
}

export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (minutes > 0) {
    return `${minutes}분 ${seconds}초`;
  }

  return `${seconds}초`;
}

export function formatEstimatedMinutes(remainingSeconds: number) {
  return `약 ${Math.max(1, Math.ceil(Math.max(0, remainingSeconds) / 60))}분 (예상)`;
}

export function currentElapsedMs(status: JobStatus | null, clock: number, receivedAt: number | null) {
  if (!status?.timing) {
    return 0;
  }

  if ((status.status !== "queued" && status.status !== "active") || status.timing.finishedAt !== null) {
    return status.timing.elapsedMs;
  }

  return status.timing.elapsedMs + localElapsedMs(clock, receivedAt);
}

export function currentEstimateSeconds(status: JobStatus | null, clock: number, receivedAt: number | null) {
  if (!status?.estimate) {
    return null;
  }

  if (status.status !== "active") {
    return status.estimate.remainingSeconds;
  }

  return Math.max(0, status.estimate.remainingSeconds - Math.floor(localElapsedMs(clock, receivedAt) / 1_000));
}

function localElapsedMs(clock: number, receivedAt: number | null) {
  if (receivedAt === null || clock <= 0) {
    return 0;
  }

  return Math.max(0, clock - receivedAt);
}

export function failureGuidance(code: string): string[] {
  const guidance: Record<string, string[]> = {
    NO_OUTPUT: ["인쇄 악보인가요?", "300DPI 이상인가요?", "표지·해설 쪽이 있다면 쪽 범위에서 빼 보세요."],
    TIMEOUT: ["쪽수가 적은 PDF로 나눠 보세요.", "해상도가 지나치게 높다면 300DPI 안팎으로 조정해 보세요."],
    OUT_OF_MEMORY: ["쪽수가 적은 PDF로 나눠 보세요.", "복잡한 악보는 한 악장씩 나눠 보세요."],
    INVALID_OUTPUT: ["다른 스캔본이나 원본 PDF로 다시 시도해 보세요."],
    ENGINE_ERROR: ["다른 PDF로 다시 시도해 보세요.", "문제가 계속되면 잠시 후 다시 시도해 보세요."],
    ENCRYPTED_PDF: ["보안이 없는 원본 PDF로 다시 올려 주세요."],
    CORRUPT_PDF: ["PDF가 정상적으로 열리는지 확인해 주세요.", "다른 원본 파일로 다시 시도해 보세요."],
    CANCELLED: ["필요하면 같은 원본으로 다시 시작할 수 있습니다."],
  };

  return guidance[code] ?? ["원본 PDF를 확인한 뒤 다시 시도해 보세요."];
}

