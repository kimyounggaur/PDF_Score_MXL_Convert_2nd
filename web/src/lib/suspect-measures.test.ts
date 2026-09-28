import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SUSPECT_MEASURES,
  normalizeSuspectMeasures,
  suspectMeasuresForStatus,
} from "./suspect-measures";

test("확인이 필요한 마디는 계약에 맞는 항목만 보존한다", () => {
  assert.deepEqual(
    normalizeSuspectMeasures([
      {
        file: "input.mxl",
        part: "P1",
        measure: 2,
        reason: "DURATION_MISMATCH",
        ignored: true,
      },
      { file: "input.mxl", part: "P1", measure: 0, reason: "DURATION_MISMATCH" },
      { file: "input.mxl", part: "P1", measure: 3, reason: "OTHER" },
      { file: "", part: "P1", measure: 4, reason: "DURATION_MISMATCH" },
    ]),
    [{ file: "input.mxl", part: "P1", measure: 2, reason: "DURATION_MISMATCH" }],
  );
});

test("확인이 필요한 마디는 최대 50개로 제한하고 레거시 누락은 빈 배열로 바꾼다", () => {
  const suspects = Array.from({ length: MAX_SUSPECT_MEASURES + 5 }, (_, index) => ({
    file: "input.mxl",
    part: "P1",
    measure: index + 1,
    reason: "DURATION_MISMATCH",
  }));

  assert.equal(normalizeSuspectMeasures(suspects).length, MAX_SUSPECT_MEASURES);
  assert.deepEqual(normalizeSuspectMeasures(undefined), []);
  assert.deepEqual(normalizeSuspectMeasures({}), []);
});

test("완료 상태만 확인이 필요한 마디를 노출한다", () => {
  const suspects = [{ file: "input.mxl", part: "P1", measure: 7, reason: "DURATION_MISMATCH" }];

  assert.deepEqual(suspectMeasuresForStatus("completed", suspects), suspects);
  for (const status of ["queued", "active", "failed"]) {
    assert.deepEqual(suspectMeasuresForStatus(status, suspects), []);
  }
});
