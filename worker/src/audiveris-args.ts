import type { ConversionOptions } from "./job-options.js";

const LANGUAGE_SPECIFICATION = "org.audiveris.omr.text.Language.defaultSpecification";

export function buildInitialArguments(
  outDir: string,
  inputPath: string,
  options: ConversionOptions,
) {
  return [
    "-batch",
    "-export",
    "-save",
    "-output",
    outDir,
    "-constant",
    `${LANGUAGE_SPECIFICATION}=${options.language}`,
    ...(options.sheets ? ["-sheets", ...options.sheets.map(String)] : []),
    "--",
    inputPath,
  ];
}
