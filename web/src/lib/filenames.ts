export function sanitizeFileName(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "score.pdf";
}

export function downloadName(
  originalName: string | undefined,
  resultName: string,
  resultNames: readonly string[] = [resultName],
) {
  const originalBase = sanitizeFileName(originalName ?? "score.pdf").replace(/\.pdf$/i, "").trim() || "score";
  const resultIndex = resultNames.indexOf(resultName);
  const explicitMovement = movementNumberForResult(resultName);
  const fallbackMovement = resultNames.length > 1 ? (resultIndex >= 0 ? resultIndex + 1 : 1) : null;
  const movementNumber = explicitMovement ?? fallbackMovement;
  const movement = movementNumber === null ? "" : ` (${movementNumber}악장)`;

  // Leave room for the movement marker and extension so sanitizing a long
  // upload name can never remove the user-visible .mxl suffix.
  const maximumStemLength = Math.max(1, 120 - movement.length - ".mxl".length);
  return `${originalBase.slice(0, maximumStemLength)}${movement}.mxl`;
}

export function movementNumberForResult(name: string) {
  const match = name.match(/\.mvt(\d+)\.mxl$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function compareResultNames(left: string, right: string) {
  const leftMovement = movementNumberForResult(left);
  const rightMovement = movementNumberForResult(right);

  if (leftMovement !== null && rightMovement !== null && leftMovement !== rightMovement) {
    return leftMovement - rightMovement;
  }

  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

export function attachmentContentDisposition(fileName: string) {
  return contentDisposition("attachment", fileName);
}

export function inlineContentDisposition(fileName: string) {
  return contentDisposition("inline", fileName);
}

function contentDisposition(disposition: "attachment" | "inline", fileName: string) {
  const fallback = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

