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

