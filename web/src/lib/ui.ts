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
    LOAD: "PDF 불러오는 중",
    BINARY: "이미지 정리 중",
    SCALE: "보표 크기 분석 중",
    GRID: "보표 구조 분석 중",
    HEADERS: "머리말 분석 중",
    STEM_SEEDS: "기둥 후보 분석 중",
    BEAMS: "빔 분석 중",
    LEDGERS: "덧줄 분석 중",
    HEADS: "음표 머리 분석 중",
    STEMS: "음표 기둥 분석 중",
    TEXTS: "텍스트 분석 중",
    MEASURES: "마디 분석 중",
    CHORDS: "화음 분석 중",
    SYMBOLS: "기호 분석 중",
    RHYTHMS: "리듬 검증 중",
    PAGE: "페이지 정리 중",
    collecting: "결과 파일 정리 중",
    completed: "완료",
  };

  return labels[stage ?? ""] ?? stage ?? "처리 중";
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

