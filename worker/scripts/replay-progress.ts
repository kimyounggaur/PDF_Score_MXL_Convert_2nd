import { readFile } from "node:fs/promises";
import path from "node:path";
import { AudiverisProgressTracker, LineBuffer } from "../src/progress.js";

const requestedPath = process.argv.slice(2).find((argument) => argument !== "--") ?? "test/fixtures/audiveris/simple.log";
const logPath = path.resolve(process.cwd(), requestedPath);
const raw = await readFile(logPath, "utf8");
const tracker = new AudiverisProgressTracker();
let lineNumber = 0;

console.log("시각/줄\t진행률\t단계\t쪽");

const lines = new LineBuffer((line) => {
  lineNumber += 1;
  const update = tracker.pushLine(line);
  if (!update) {
    return;
  }

  const timestamp = line.match(/\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/)?.[0] ?? `L${lineNumber}`;
  const sheet = update.progress.sheet
    ? `${update.progress.sheet.current}/${update.progress.sheet.total}`
    : "-";
  console.log(`${timestamp}\t${update.progress.pct}%\t${update.progress.stage}\t${sheet}`);
});

lines.push(raw);
lines.flush();

console.log(`대상 쪽: ${tracker.getTargetSheets().join(", ") || "확인되지 않음"}`);
console.log(`인식 제외 쪽: ${tracker.getInvalidSheets().join(", ") || "없음"}`);
