import assert from "node:assert/strict";
import test from "node:test";
import { buildInitialArguments } from "./audiveris-args.js";
import { parseJobOptions } from "./job-options.js";

test("기존 작업의 기본 argv는 전체 쪽과 영어 OCR을 유지한다", () => {
  assert.deepEqual(
    buildInitialArguments("/data/jobs/id/out", "/data/jobs/id/input.pdf", parseJobOptions({ pages: 3 })),
    [
      "-batch",
      "-export",
      "-save",
      "-output",
      "/data/jobs/id/out",
      "-constant",
      "org.audiveris.omr.text.Language.defaultSpecification=eng",
      "--",
      "/data/jobs/id/input.pdf",
    ],
  );
});

test("선택 쪽은 정규화된 개별 argv로, 혼합 언어는 kor+eng 그대로 전달한다", () => {
  const options = parseJobOptions({
    pages: 7,
    options: { sheets: [7, 2, 5, 4, 3], language: "kor+eng" },
  });

  assert.deepEqual(
    buildInitialArguments("out", "input.pdf", options),
    [
      "-batch",
      "-export",
      "-save",
      "-output",
      "out",
      "-constant",
      "org.audiveris.omr.text.Language.defaultSpecification=kor+eng",
      "-sheets",
      "2",
      "3",
      "4",
      "5",
      "7",
      "--",
      "input.pdf",
    ],
  );
});
