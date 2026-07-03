export function sanitizeFileName(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "score.pdf";
}

export function downloadName(originalName: string | undefined, resultName: string) {
  const originalBase = sanitizeFileName(originalName ?? "score.pdf").replace(/\.pdf$/i, "");
  return sanitizeFileName(`${originalBase}-${resultName}`);
}

