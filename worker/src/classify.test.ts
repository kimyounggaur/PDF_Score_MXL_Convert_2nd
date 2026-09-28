import assert from "node:assert/strict";
import test from "node:test";
import {
  EngineSignalCollector,
  classifyConversion,
  type ConversionClassificationInput,
} from "./classify.js";

const base: ConversionClassificationInput = {
  timedOut: false,
  outputCount: 0,
  allOutputsValid: false,
  invalidSheets: [],
  targetSheets: [1],
  omrExists: false,
  outOfMemory: false,
  noOutputSignal: false,
  recoveryAttempted: false,
  exitCode: 0,
  spawnError: null,
};

test("classifies simple valid output as success", () => {
  assert.deepEqual(
    classifyConversion({ ...base, outputCount: 1, allOutputsValid: true }),
    { kind: "success" },
  );
});

test("valid output wins over a nonzero engine exit code", () => {
  assert.deepEqual(
    classifyConversion({ ...base, outputCount: 1, allOutputsValid: true, exitCode: 1 }),
    { kind: "success" },
  );
});

test("timeout has precedence even if an output file exists", () => {
  assert.deepEqual(
    classifyConversion({ ...base, timedOut: true, outputCount: 1, allOutputsValid: true }),
    { kind: "failure", code: "TIMEOUT" },
  );
});

test("invalid MXL output is never treated as success or recovery", () => {
  assert.deepEqual(
    classifyConversion({
      ...base,
      outputCount: 1,
      allOutputsValid: false,
      invalidSheets: [1],
      targetSheets: [1, 2],
      omrExists: true,
    }),
    { kind: "failure", code: "INVALID_OUTPUT" },
  );
});

test("cover failure requests one recovery with only normal target sheets", () => {
  assert.deepEqual(
    classifyConversion({
      ...base,
      invalidSheets: [1],
      targetSheets: [1, 2, 3],
      omrExists: true,
      noOutputSignal: true,
      exitCode: 1,
    }),
    { kind: "recover", sheets: [2, 3] },
  );
});

test("쪽 범위 변환의 복구 후보는 처음 선택한 쪽 안에서만 고른다", () => {
  assert.deepEqual(
    classifyConversion({
      ...base,
      invalidSheets: [3],
      targetSheets: [2, 3, 4, 5, 7],
      omrExists: true,
      noOutputSignal: true,
      exitCode: 1,
    }),
    { kind: "recover", sheets: [2, 4, 5, 7] },
  );
});

test("bad one-sheet input with no normal sheet is NO_OUTPUT", () => {
  assert.deepEqual(
    classifyConversion({
      ...base,
      invalidSheets: [1],
      targetSheets: [1],
      omrExists: true,
      noOutputSignal: true,
      exitCode: 1,
    }),
    { kind: "failure", code: "NO_OUTPUT" },
  );
});

test("a failed recovery is not attempted a second time", () => {
  assert.deepEqual(
    classifyConversion({
      ...base,
      invalidSheets: [1],
      targetSheets: [1, 2, 3],
      omrExists: true,
      noOutputSignal: true,
      recoveryAttempted: true,
      exitCode: 1,
    }),
    { kind: "failure", code: "NO_OUTPUT" },
  );
});

test("detects OOM before generic no-output signals", () => {
  assert.deepEqual(
    classifyConversion({ ...base, outOfMemory: true, noOutputSignal: true, exitCode: 1 }),
    { kind: "failure", code: "OUT_OF_MEMORY" },
  );
});

test("spawn ENOENT becomes ENGINE_ERROR", () => {
  assert.deepEqual(
    classifyConversion({ ...base, exitCode: null, spawnError: "ENOENT" }),
    { kind: "failure", code: "ENGINE_ERROR" },
  );
});

test("collects OOM and known no-output log signals without retaining log text", () => {
  const collector = new EngineSignalCollector();
  collector.pushLine("WARN PeakGraph | No system found");
  collector.pushLine("java.lang.OutOfMemoryError: Java heap space");
  assert.deepEqual(collector.getSignals(), { outOfMemory: true, noOutput: true });
});
