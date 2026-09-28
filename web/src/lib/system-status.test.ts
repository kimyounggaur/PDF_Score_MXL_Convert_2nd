import assert from "node:assert/strict";
import test from "node:test";
import { getSystemStatus, normalizeEngineVersion, type StatusProbeDependencies } from "./system-status";

test("상태 프로브가 모두 성공하면 전체 상태를 반환한다", async () => {
  const status = await getSystemStatus({
    pingRedis: async () => "PONG",
    getWorkersCount: async () => 2,
    getJobCounts: async () => ({ waiting: 3, active: 1 }),
    getDiskFreeBytes: async () => 9_876_543_210,
    engineVersion: "5.10.2",
  });

  assert.deepEqual(status, {
    redis: "ok",
    workers: 2,
    waiting: 3,
    active: 1,
    diskFreeBytes: 9_876_543_210,
    engineVersion: "5.10.2",
  });
});

test("실패하거나 제한 시간을 넘긴 프로브만 null/down으로 표시한다", async () => {
  const never = () => new Promise<number>(() => undefined);
  const dependencies: StatusProbeDependencies = {
    pingRedis: async () => {
      throw new Error("redis down");
    },
    getWorkersCount: async () => 1,
    getJobCounts: async () => ({ waiting: 4, active: 2 }),
    getDiskFreeBytes: never,
    engineVersion: "5.10.2",
  };

  const status = await getSystemStatus(dependencies, 10);

  assert.deepEqual(status, {
    redis: "down",
    workers: 1,
    waiting: 4,
    active: 2,
    diskFreeBytes: null,
    engineVersion: "5.10.2",
  });
});

test("버전 환경값은 공개하기 안전한 짧은 값만 허용한다", () => {
  assert.equal(normalizeEngineVersion(" 5.10.2 "), "5.10.2");
  assert.equal(normalizeEngineVersion("/opt/audiveris/bin/Audiveris"), "unknown");
  assert.equal(normalizeEngineVersion(undefined), "unknown");
});
