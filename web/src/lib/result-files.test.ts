import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResultFiles } from "./result-files";

test("검증된 결과 파일의 마디 요약을 정확히 보존한다", () => {
  assert.deepEqual(
    normalizeResultFiles([
      {
        name: "input.mxl",
        bytes: 1_024,
        measureCount: 37,
        measuresPerPart: { P1: 20, P2: 17 },
      },
    ]),
    [
      {
        name: "input.mxl",
        bytes: 1_024,
        measureCount: 37,
        measuresPerPart: { P1: 20, P2: 17 },
      },
    ],
  );
});

test("이전 작업이나 파일시스템 fallback의 누락된 요약은 null로 정규화한다", () => {
  assert.deepEqual(normalizeResultFiles([{ name: "legacy.mxl", bytes: 12 }]), [
    { name: "legacy.mxl", bytes: 12, measureCount: null, measuresPerPart: null },
  ]);
  assert.deepEqual(
    normalizeResultFiles([
      { name: "partial.mxl", bytes: 12, measureCount: 4, measuresPerPart: { P1: -1 } },
    ]),
    [{ name: "partial.mxl", bytes: 12, measureCount: null, measuresPerPart: null }],
  );
});

test("파일 자체의 필수 필드가 잘못되면 결과 목록을 거부한다", () => {
  assert.equal(normalizeResultFiles([{ name: "bad.mxl", bytes: -1 }]), null);
  assert.equal(normalizeResultFiles("not-an-array"), null);
});
