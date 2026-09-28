import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStoredConversionOptions,
  parseConversionOptions,
} from "./conversion-options";

test("누락한 옵션은 전체 쪽과 영어로 정규화한다", () => {
  assert.deepEqual(parseConversionOptions({ pageCount: 8 }), {
    ok: true,
    options: { sheets: null, language: "eng" },
  });
});

test("쪽 범위의 ASCII 공백·범위·중복을 허용하고 오름차순으로 정렬한다", () => {
  assert.deepEqual(
    parseConversionOptions({
      pageRange: " 7, 2 - 5, 3, 1 ",
      language: "kor+eng",
      pageCount: 8,
    }),
    {
      ok: true,
      options: { sheets: [1, 2, 3, 4, 5, 7], language: "kor+eng" },
    },
  );
});

test("20쪽보다 긴 PDF에서도 선택한 고유 쪽이 20개 이하면 허용한다", () => {
  assert.deepEqual(
    parseConversionOptions({ pageRange: "1-20, 20", language: "kor", pageCount: 30 }),
    {
      ok: true,
      options: { sheets: Array.from({ length: 20 }, (_, index) => index + 1), language: "kor" },
    },
  );
});

test("빈 값·잘못된 토큰·역방향·범위 밖·21개 선택은 PAGE_RANGE_INVALID다", () => {
  for (const pageRange of [
    "",
    "   ",
    "1,,2",
    "1-",
    "1\t-2",
    "1\n,2",
    "1\u00a0-2",
    "0",
    "3-2",
    "1-6",
    "999999999999999999999999",
  ]) {
    assert.deepEqual(parseConversionOptions({ pageRange, pageCount: 5 }), {
      ok: false,
      code: "PAGE_RANGE_INVALID",
    });
  }

  assert.deepEqual(parseConversionOptions({ pageRange: "1-21", pageCount: 30 }), {
    ok: false,
    code: "PAGE_RANGE_INVALID",
  });
  assert.deepEqual(parseConversionOptions({ pageRange: { value: "1" }, pageCount: 5 }), {
    ok: false,
    code: "PAGE_RANGE_INVALID",
  });
  assert.deepEqual(parseConversionOptions({ pageRange: `${"1,".repeat(256)}1`, pageCount: 5 }), {
    ok: false,
    code: "PAGE_RANGE_INVALID",
  });
});

test("언어는 세 허용값만 받고 필드 누락만 영어 기본값을 쓴다", () => {
  for (const language of ["eng", "kor", "kor+eng"] as const) {
    assert.deepEqual(parseConversionOptions({ language, pageCount: 1 }), {
      ok: true,
      options: { sheets: null, language },
    });
  }

  for (const language of ["", "ENG", "eng+kor", " kor", null, 1]) {
    assert.deepEqual(parseConversionOptions({ language, pageCount: 1 }), {
      ok: false,
      code: "LANGUAGE_INVALID",
    });
  }
});

test("기존 metadata의 옵션 누락은 기본값으로 읽고 저장 옵션은 안전하게 정규화한다", () => {
  assert.deepEqual(normalizeStoredConversionOptions(undefined, 20), {
    sheets: null,
    language: "eng",
  });
  assert.deepEqual(
    normalizeStoredConversionOptions({ sheets: [5, 2, 5], language: "kor" }, 5),
    { sheets: [2, 5], language: "kor" },
  );
  assert.equal(normalizeStoredConversionOptions({ sheets: [], language: "eng" }, 5), null);
  assert.equal(normalizeStoredConversionOptions({ sheets: null }, 5), null);
  assert.equal(normalizeStoredConversionOptions({ language: "eng" }, 5), null);
  assert.equal(normalizeStoredConversionOptions({ sheets: [6], language: "eng" }, 5), null);
  assert.equal(normalizeStoredConversionOptions({ sheets: null, language: "ja" }, 5), null);
  assert.equal(normalizeStoredConversionOptions(undefined, 21), null);
  assert.equal(normalizeStoredConversionOptions({ sheets: null, language: "eng" }, 21), null);
  assert.deepEqual(
    normalizeStoredConversionOptions({ sheets: Array(21).fill(2), language: "eng" }, 30),
    { sheets: [2], language: "eng" },
  );
});

test("중복 multipart 값이나 파일 값은 명시된 잘못된 옵션으로 거부한다", () => {
  assert.deepEqual(parseConversionOptions({ pageRange: ["1", "2"], pageCount: 2 }), {
    ok: false,
    code: "PAGE_RANGE_INVALID",
  });
  assert.deepEqual(parseConversionOptions({ language: ["eng", "kor"], pageCount: 2 }), {
    ok: false,
    code: "LANGUAGE_INVALID",
  });
  assert.deepEqual(parseConversionOptions({ pageRange: new Blob(["1"]), pageCount: 2 }), {
    ok: false,
    code: "PAGE_RANGE_INVALID",
  });
});
