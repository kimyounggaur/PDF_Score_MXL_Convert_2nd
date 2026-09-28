import assert from "node:assert/strict";
import test from "node:test";
import {
  MAINTENANCE_JOB_NAME,
  MAINTENANCE_SCHEDULER_ID,
  registerMaintenanceScheduler,
} from "./maintenance.js";

test("removes the legacy repeat entry once and upserts one stable scheduler", async () => {
  const removed: string[] = [];
  const upserts: unknown[][] = [];
  const queue = {
    async getRepeatableJobs() {
      return [
        repeatable("old-sha256-key", MAINTENANCE_JOB_NAME),
        repeatable(MAINTENANCE_SCHEDULER_ID, MAINTENANCE_JOB_NAME),
        repeatable("unrelated", "another-task"),
      ];
    },
    async removeRepeatableByKey(key: string) {
      removed.push(key);
      return true;
    },
    async upsertJobScheduler(...args: unknown[]) {
      upserts.push(args);
      return {};
    },
  };

  const result = await registerMaintenanceScheduler(
    queue as unknown as Parameters<typeof registerMaintenanceScheduler>[0],
  );

  assert.deepEqual(result, { removedLegacy: 1 });
  assert.deepEqual(removed, ["old-sha256-key"]);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]?.[0], MAINTENANCE_SCHEDULER_ID);
  assert.deepEqual(upserts[0]?.[1], { pattern: "0 * * * *" });
  assert.deepEqual(upserts[0]?.[2], {
    name: MAINTENANCE_JOB_NAME,
    data: {},
    opts: {
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 86_400 },
    },
  });
});

function repeatable(key: string, name: string) {
  return {
    key,
    name,
    id: null,
    endDate: null,
    tz: null,
    pattern: "0 * * * *",
    next: Date.now(),
  };
}
