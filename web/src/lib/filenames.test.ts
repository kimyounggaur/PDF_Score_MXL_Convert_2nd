import assert from "node:assert/strict";
import test from "node:test";
import { attachmentContentDisposition, compareResultNames, downloadName, movementNumberForResult } from "./filenames";

test("단일 결과는 엔진 파일명 대신 원본 PDF 이름을 쓴다", () => {
  assert.equal(downloadName("봄 노래.pdf", "input.mxl"), "봄 노래.mxl");
  assert.equal(downloadName("score.PDF", "anything.mxl"), "score.mxl");
});

test("여러 결과는 정렬된 결과 순서대로 악장 번호를 붙인다", () => {
  const results = ["movement-a.mxl", "movement-b.mxl", "movement-c.mxl"];
  assert.equal(downloadName("교향곡.pdf", results[0], results), "교향곡 (1악장).mxl");
  assert.equal(downloadName("교향곡.pdf", results[2], results), "교향곡 (3악장).mxl");
});

test("Audiveris .mvtN 결과는 배열 순서와 번호 공백에 관계없이 명시된 악장 번호를 쓴다", () => {
  const results = ["input.mvt10.mxl", "input.mvt2.mxl", "input.mvt7.mxl"];

  assert.equal(downloadName("교향곡.pdf", results[0], results), "교향곡 (10악장).mxl");
  assert.equal(downloadName("교향곡.pdf", results[1], results), "교향곡 (2악장).mxl");
  assert.equal(downloadName("교향곡.pdf", results[2], results), "교향곡 (7악장).mxl");
  assert.equal(downloadName("교향곡.pdf", "INPUT.MVT4.MXL"), "교향곡 (4악장).mxl");
});

test("비 mvt 다중 결과는 안정적인 배열 순서를 fallback 악장 번호로 쓴다", () => {
  const results = ["allegro.mxl", "adagio.mxl"];

  assert.equal(downloadName("모음곡.pdf", results[0], results), "모음곡 (1악장).mxl");
  assert.equal(downloadName("모음곡.pdf", results[1], results), "모음곡 (2악장).mxl");
  assert.equal(downloadName("모음곡.pdf", "finale.mxl", results), "모음곡 (1악장).mxl");
});

test("결과 이름 정렬은 mvt2를 mvt10보다 앞에 두고 번호 공백을 유지한다", () => {
  const results = ["input.mvt10.mxl", "input.mvt7.mxl", "input.mvt2.mxl"];

  assert.deepEqual([...results].sort(compareResultNames), ["input.mvt2.mxl", "input.mvt7.mxl", "input.mvt10.mxl"]);
  assert.equal(movementNumberForResult("input.mvt10.mxl"), 10);
  assert.equal(movementNumberForResult("input.mxl"), null);
});

test("Content-Disposition은 ASCII 대체명과 RFC 5987 UTF-8 이름을 함께 보낸다", () => {
  assert.equal(
    attachmentContentDisposition("한글 O'Brien (1악장).mxl"),
    "attachment; filename=\"__ O'Brien (1__).mxl\"; filename*=UTF-8''%ED%95%9C%EA%B8%80%20O%27Brien%20%281%EC%95%85%EC%9E%A5%29.mxl",
  );
});

test("긴 이름도 .mxl 확장자를 유지한다", () => {
  const name = downloadName(`${"가".repeat(200)}.pdf`, "one.mxl");
  assert.ok(name.endsWith(".mxl"));
  assert.equal(name.length, 120);
});
