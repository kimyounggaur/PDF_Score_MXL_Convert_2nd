import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIVERIS_STAGES,
  AudiverisProgressTracker,
  LineBuffer,
  ProgressUpdateThrottler,
  type ProgressThrottleScheduler,
} from "./progress.js";
import type { ConversionProgress } from "./types.js";

const totalLine = (count: number) =>
  `INFO  [input] Book 560 | ${count} ${count === 1 ? "sheet" : "sheets"} in /data/jobs/id/input.pdf`;
const targetLine = (sheets: number[]) => `INFO  [] Book 1929 | Book reaching PAGE on sheets:[${sheets.map((sheet) => `#${sheet}`).join("")}]`;
const stageLine = (sheet: number | null, stage: string) =>
  `INFO  [input${sheet === null ? "" : `#${sheet}`}] StepMonitoring 98 | ${stage}`;

test("tracks two-sheet progress from strict StepMonitoring lines", () => {
  const tracker = new AudiverisProgressTracker();
  const percentages: number[] = [];

  tracker.pushLine(totalLine(2));
  tracker.pushLine(targetLine([1, 2]));

  assert.equal(tracker.getProgress().pct, 2, "the PAGE planning line must not jump progress");
  assert.ok(tracker.getProgress().pct < 5);

  for (const stage of AUDIVERIS_STAGES) {
    const update = tracker.pushLine(stageLine(1, stage));
    assert.ok(update);
    percentages.push(update.progress.pct);
  }

  assert.equal(tracker.getProgress().pct, 48);
  assert.deepEqual(tracker.getProgress().sheet, { current: 1, total: 2 });

  const secondSheetLoad = tracker.pushLine(stageLine(2, "LOAD"));
  assert.ok(secondSheetLoad);
  assert.ok(secondSheetLoad.immediate, "a sheet change must bypass throttling");
  assert.ok(secondSheetLoad.progress.pct >= 45 && secondSheetLoad.progress.pct <= 52);
  assert.deepEqual(secondSheetLoad.progress.sheet, { current: 2, total: 2 });
  percentages.push(secondSheetLoad.progress.pct);

  for (const stage of AUDIVERIS_STAGES.slice(1)) {
    const update = tracker.pushLine(stageLine(2, stage));
    assert.ok(update);
    percentages.push(update.progress.pct);
  }

  assert.equal(tracker.getProgress().pct, 93);
  assert.ok(percentages.every((pct, index) => index === 0 || pct >= percentages[index - 1]));
  assert.ok(percentages.every((pct) => pct <= 93));

  const exporting = tracker.pushLine("INFO [input] PartwiseBuilder 2706 | Exporting sheet(s): [#1#2]");
  assert.deepEqual(exporting, {
    progress: { pct: 96, stage: "EXPORT", sheet: { current: 2, total: 2 } },
    immediate: true,
  });

  const exported = tracker.pushLine("INFO [input] ScoreExporter 164 | Score input exported to /data/jobs/id/out/input.mxl");
  assert.deepEqual(exported, {
    progress: { pct: 97, stage: "EXPORT", sheet: { current: 2, total: 2 } },
    immediate: true,
  });
});

test("ignores nuisance lines containing stage-like words and valid-stage regressions", () => {
  const tracker = new AudiverisProgressTracker();
  tracker.pushLine(totalLine(2));
  tracker.pushLine(targetLine([1, 2]));
  tracker.pushLine(stageLine(1, "LOAD"));

  const before = tracker.getProgress();
  const nuisanceLines = [
    "INFO [input#1] PeakGraph 310 | Systems: #1[1, 2] #2[3, 4]",
    "INFO [input#1] HeadSeedTally 235 | Scale information: HeadSeeds{NOTEHEAD_BLACK}",
    "INFO [input#1] StackRhythm 224 | S1 MeasureStack#1 no correct rhythm",
    "INFO [input#2] PageRhythm 199 | {Page#2.1} Time value reused from sheet#1",
    "INFO [input] SheetStub 1194 | Loaded /sheet#1/sheet#1.xml",
    "INFO [input#1] OtherComponent 1 | PAGE",
  ];

  for (const line of nuisanceLines) {
    assert.equal(tracker.pushLine(line), null);
    assert.deepEqual(tracker.getProgress(), before);
  }

  tracker.pushLine(stageLine(1, "HEADS"));
  const afterHeads = tracker.getProgress();
  assert.equal(tracker.pushLine(stageLine(1, "GRID")), null, "a delayed earlier stage must not change the label or pct");
  assert.deepEqual(tracker.getProgress(), afterHeads);
  assert.equal(tracker.pushLine(stageLine(1, "NOT_A_REAL_STAGE")), null);
});

test("handles a one-sheet no-number context and records its invalid sheet", () => {
  const tracker = new AudiverisProgressTracker();
  tracker.pushLine(totalLine(1));
  tracker.pushLine(targetLine([1]));

  const load = tracker.pushLine(stageLine(null, "LOAD"));
  assert.ok(load);
  assert.deepEqual(load.progress.sheet, { current: 1, total: 1 });

  tracker.pushLine("INFO [input] SheetStub 1194 | Sheet input flagged as invalid.");
  assert.deepEqual(tracker.getInvalidSheets(), [1]);
  assert.deepEqual(tracker.getTargetSheets(), [1]);
  assert.equal(tracker.getTotalSheets(), 1);
});

test("keeps progressing after an invalid cover sheet", () => {
  const tracker = new AudiverisProgressTracker();
  tracker.pushLine(totalLine(3));
  tracker.pushLine(targetLine([1, 2, 3]));
  tracker.pushLine(stageLine(1, "LOAD"));
  tracker.pushLine(stageLine(1, "BINARY"));
  tracker.pushLine(stageLine(1, "SCALE"));
  tracker.pushLine(stageLine(1, "GRID"));
  tracker.pushLine("INFO [input#1] SheetStub 1194 | Sheet input#1 flagged as invalid.");

  const secondSheet = tracker.pushLine(stageLine(2, "LOAD"));
  assert.ok(secondSheet);
  assert.deepEqual(secondSheet.progress.sheet, { current: 2, total: 3 });
  assert.ok(secondSheet.progress.pct > 30);
  assert.deepEqual(tracker.getInvalidSheets(), [1]);

  const thirdSheet = tracker.pushLine(stageLine(3, "LOAD"));
  assert.ok(thirdSheet);
  assert.deepEqual(thirdSheet.progress.sheet, { current: 3, total: 3 });
  assert.ok(thirdSheet.progress.pct >= secondSheet.progress.pct);
});

test("uses selected-sheet order as the progress denominator", () => {
  const tracker = new AudiverisProgressTracker();
  tracker.pushLine(totalLine(5));
  tracker.pushLine(targetLine([2, 4]));

  const first = tracker.pushLine(stageLine(2, "LOAD"));
  const second = tracker.pushLine(stageLine(4, "LOAD"));
  assert.ok(first && second);
  assert.deepEqual(first.progress.sheet, { current: 1, total: 2 });
  assert.deepEqual(second.progress.sheet, { current: 2, total: 2 });
  assert.ok(second.progress.pct >= 45 && second.progress.pct <= 52);
  assert.equal(tracker.getTotalSheets(), 5);
  assert.deepEqual(tracker.getTargetSheets(), [2, 4]);
});

test("metadata에서 고른 2-5, 7쪽만 진행 분모와 invalid 후보로 사용한다", () => {
  const selectedSheets = [2, 3, 4, 5, 7];
  const tracker = new AudiverisProgressTracker(selectedSheets);

  tracker.pushLine(totalLine(30));
  tracker.pushLine(targetLine(selectedSheets));
  assert.deepEqual(tracker.getTargetSheets(), selectedSheets);

  assert.equal(tracker.pushLine(stageLine(1, "LOAD")), null, "선택하지 않은 쪽은 진행률에 포함하지 않는다");
  tracker.pushLine("INFO [input#1] SheetStub 1194 | Sheet input#1 flagged as invalid.");
  assert.deepEqual(tracker.getInvalidSheets(), [], "선택하지 않은 쪽은 복구 후보에도 포함하지 않는다");

  const first = tracker.pushLine(stageLine(2, "LOAD"));
  const last = tracker.pushLine(stageLine(7, "LOAD"));
  assert.ok(first && last);
  assert.deepEqual(first.progress.sheet, { current: 1, total: 5 });
  assert.deepEqual(last.progress.sheet, { current: 5, total: 5 });

  tracker.pushLine("INFO [input#3] SheetStub 1194 | Sheet input#3 flagged as invalid.");
  assert.deepEqual(tracker.getInvalidSheets(), [3]);
});

test("seven-byte stream chunks produce the same result as whole lines", () => {
  const logLines = [
    totalLine(3),
    targetLine([1, 2, 3]),
    stageLine(1, "LOAD"),
    stageLine(1, "GRID"),
    "INFO [input#1] SheetStub 1194 | Sheet input#1 flagged as invalid.",
    stageLine(2, "LOAD"),
    "INFO [input#2] PeakGraph 310 | Systems: #1[1, 2]",
    stageLine(2, "PAGE"),
    stageLine(3, "LOAD"),
    "INFO [input] PartwiseBuilder 2706 | Exporting sheet(s): [#2#3]",
  ];

  const byLine = new AudiverisProgressTracker();
  const byChunk = new AudiverisProgressTracker();
  const expectedUpdates = logLines.map((line) => byLine.pushLine(line)).filter(Boolean);
  const chunkUpdates: unknown[] = [];
  const buffer = new LineBuffer((line) => {
    const update = byChunk.pushLine(line);
    if (update) {
      chunkUpdates.push(update);
    }
  });
  const raw = logLines.join("\r\n");

  for (let offset = 0; offset < raw.length; offset += 7) {
    buffer.push(raw.slice(offset, offset + 7));
  }
  buffer.flush();

  assert.deepEqual(chunkUpdates, expectedUpdates);
  assert.deepEqual(byChunk.getProgress(), byLine.getProgress());
  assert.deepEqual(byChunk.getTargetSheets(), byLine.getTargetSheets());
  assert.deepEqual(byChunk.getInvalidSheets(), byLine.getInvalidSheets());
});

test("separate line buffers never join stdout and stderr fragments", () => {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const stdout = new LineBuffer((line) => stdoutLines.push(line));
  const stderr = new LineBuffer((line) => stderrLines.push(line));

  stdout.push("stdout-fragment");
  stderr.push("stderr-line\n");
  assert.deepEqual(stdoutLines, []);
  assert.deepEqual(stderrLines, ["stderr-line"]);

  stdout.push("-finished\n");
  assert.deepEqual(stdoutLines, ["stdout-fragment-finished"]);
});

test("coalesces ordinary updates for 500ms but sends immediate updates", async () => {
  const scheduler = new FakeScheduler();
  const writes: ConversionProgress[] = [];
  const throttler = new ProgressUpdateThrottler((progress) => {
    writes.push(progress);
  }, 500, scheduler);

  throttler.publish(progress(3, "LOAD"), true);
  await Promise.resolve();
  assert.deepEqual(writes.map((item) => item.stage), ["LOAD"]);

  throttler.publish(progress(4, "BINARY"));
  throttler.publish(progress(5, "SCALE"));
  scheduler.advance(499);
  await Promise.resolve();
  assert.deepEqual(writes.map((item) => item.stage), ["LOAD"]);

  scheduler.advance(1);
  await throttler.flush();
  assert.deepEqual(writes.map((item) => item.stage), ["LOAD", "SCALE"]);

  throttler.publish(progress(6, "GRID"));
  throttler.publish(progress(50, "LOAD", 2), true);
  await throttler.flush();
  assert.deepEqual(writes.map((item) => item.stage), ["LOAD", "SCALE", "LOAD"]);

  await throttler.close();
});

function progress(pct: number, stage: string, current = 1): ConversionProgress {
  return { pct, stage, sheet: { current, total: 2 } };
}

class FakeScheduler implements ProgressThrottleScheduler {
  private time = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();

  now = () => this.time;

  set = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + delayMs, callback });
    return id;
  };

  clear = (handle: unknown) => {
    this.tasks.delete(handle as number);
  };

  advance(milliseconds: number) {
    this.time += milliseconds;

    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= this.time)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) {
        return;
      }

      this.tasks.delete(due[0]);
      due[1].callback();
    }
  }
}
