import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateForJob,
  metadataForRetry,
  parseJobMetadata,
  progressForJobState,
  publicJobMetadata,
  queuePositionFromWaitingJobs,
  timingForJob,
} from "./jobs";

const storedProgress = {
  pct: 0,
  stage: "processing",
  sheet: { current: 1, total: 2 },
};

test("대기·지연 상태는 BullMQ의 기본 진행률 0을 노출하지 않는다", () => {
  assert.equal(progressForJobState("waiting", 0), null);
  assert.equal(progressForJobState("delayed", storedProgress), null);
  assert.equal(progressForJobState("prioritized", 0), null);
});

test("변환 중에는 저장된 진행률과 쪽 정보를 유지한다", () => {
  assert.deepEqual(progressForJobState("active", storedProgress), storedProgress);
});

test("대기 순번은 1부터 시작하고 목록에 없으면 null이다", () => {
  const waiting = [{ id: "first" }, { id: "target" }, { id: "third" }];
  assert.equal(queuePositionFromWaitingJobs("first", waiting), 1);
  assert.equal(queuePositionFromWaitingJobs("target", waiting), 2);
  assert.equal(queuePositionFromWaitingJobs("missing", waiting), null);
});

test("metadata는 런타임 검증 뒤 확장 필드를 보존하고 공개 필드만 상태에 노출한다", () => {
  const metadata = parseJobMetadata({
    originalName: "한글 악보.pdf",
    bytes: 12_345,
    pages: 4,
    createdAt: "2026-09-28T04:00:00.000Z",
    retryOf: "old-job",
    futureOption: { language: "eng" },
  });

  assert.ok(metadata);
  assert.equal(metadata.retryOf, "old-job");
  assert.deepEqual(publicJobMetadata(metadata), {
    originalName: "한글 악보.pdf",
    bytes: 12_345,
    pages: 4,
    createdAt: "2026-09-28T04:00:00.000Z",
  });
});

test("metadata의 필수 값이 잘못되면 null이다", () => {
  assert.equal(parseJobMetadata(null), null);
  assert.equal(
    parseJobMetadata({ originalName: "", bytes: 1, pages: 1, createdAt: "2026-09-28T04:00:00Z" }),
    null,
  );
  assert.equal(
    parseJobMetadata({ originalName: "a.pdf", bytes: -1, pages: 1, createdAt: "2026-09-28T04:00:00Z" }),
    null,
  );
  assert.equal(
    parseJobMetadata({ originalName: "a.pdf", bytes: 1, pages: 0, createdAt: "2026-09-28T04:00:00Z" }),
    null,
  );
  assert.equal(
    parseJobMetadata({ originalName: "a.pdf", bytes: 1, pages: 1, createdAt: "not-a-date" }),
    null,
  );
});

test("재시도 metadata는 확장 필드를 보존하고 생성 시각과 부모 작업만 갱신한다", () => {
  const metadata = parseJobMetadata({
    originalName: "score.pdf",
    bytes: 100,
    pages: 2,
    createdAt: "2026-09-20T00:00:00.000Z",
    pageRange: "2-3",
    retryOf: "grandparent",
  });
  assert.ok(metadata);

  assert.deepEqual(metadataForRetry(metadata, "parent", new Date("2026-09-28T05:00:00.000Z")), {
    originalName: "score.pdf",
    bytes: 100,
    pages: 2,
    createdAt: "2026-09-28T05:00:00.000Z",
    pageRange: "2-3",
    retryOf: "parent",
  });
});

test("BullMQ 타임스탬프로 생성·시작·종료·경과 시간을 계산한다", () => {
  assert.deepEqual(
    timingForJob({ timestamp: 1_000, processedOn: 2_000, finishedOn: 8_500 }, 20_000),
    {
      createdAt: 1_000,
      startedAt: 2_000,
      finishedAt: 8_500,
      elapsedMs: 7_500,
    },
  );

  assert.deepEqual(timingForJob({ timestamp: 5_000, processedOn: 6_000 }, 9_000), {
    createdAt: 5_000,
    startedAt: 6_000,
    finishedAt: null,
    elapsedMs: 4_000,
  });
});

test("ETA는 최근 양수 표본이 3개 이상일 때만 계산한다", () => {
  assert.equal(
    estimateForJob({ state: "waiting", pages: 5, processedOn: null, now: 20_000, samples: [10, 20] }),
    null,
  );
  assert.deepEqual(
    estimateForJob({
      state: "waiting",
      pages: 5,
      processedOn: null,
      now: 20_000,
      samples: [10, 20, 30, 0, -1, Number.NaN],
    }),
    { remainingSeconds: 100, sampleCount: 3 },
  );
  assert.deepEqual(
    estimateForJob({
      state: "active",
      pages: 5,
      processedOn: 10_000,
      now: 20_000,
      samples: [10, 20, 30],
    }),
    { remainingSeconds: 90, sampleCount: 3 },
  );
  assert.equal(
    estimateForJob({ state: "completed", pages: 5, processedOn: 10_000, now: 20_000, samples: [10, 20, 30] }),
    null,
  );
});
