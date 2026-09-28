import assert from "node:assert/strict";
import test from "node:test";
import type { SuspectMeasure } from "./client-types";
import { groupSuspectMeasureLocations } from "./suspect-measures-ui";

test("groups part-level findings into distinct file and physical-measure locations", () => {
  const suspects: SuspectMeasure[] = [
    { file: "second.mxl", part: "P2", measure: 4, reason: "DURATION_MISMATCH" },
    { file: "first.mxl", part: "P2", measure: 2, reason: "DURATION_MISMATCH" },
    { file: "first.mxl", part: "P1", measure: 2, reason: "DURATION_MISMATCH" },
    { file: "first.mxl", part: "P1", measure: 1, reason: "DURATION_MISMATCH" },
    { file: "first.mxl", part: "P1", measure: 2, reason: "DURATION_MISMATCH" },
  ];

  assert.deepEqual(groupSuspectMeasureLocations(suspects, ["first.mxl", "second.mxl"]), [
    { file: "first.mxl", measure: 1, parts: ["P1"] },
    { file: "first.mxl", measure: 2, parts: ["P1", "P2"] },
    { file: "second.mxl", measure: 4, parts: ["P2"] },
  ]);
});

test("sorts unknown files after known result files without changing the input", () => {
  const suspects: SuspectMeasure[] = [
    { file: "unknown.mxl", part: "P1", measure: 3, reason: "DURATION_MISMATCH" },
    { file: "known.mxl", part: "P1", measure: 8, reason: "DURATION_MISMATCH" },
  ];
  const snapshot = structuredClone(suspects);

  assert.deepEqual(groupSuspectMeasureLocations(suspects, ["known.mxl"]), [
    { file: "known.mxl", measure: 8, parts: ["P1"] },
    { file: "unknown.mxl", measure: 3, parts: ["P1"] },
  ]);
  assert.deepEqual(suspects, snapshot);
});
