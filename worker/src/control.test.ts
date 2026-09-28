import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  CANCEL_REASON,
  cancellationKey,
  startWorkerHeartbeat,
  watchForCancellation,
} from "./control.js";

test("uses the web/worker cancellation-key contract", () => {
  assert.equal(cancellationKey("7df3"), "job:7df3:cancel");
});

test("cancellation polling calls the local worker once and removes its abort listener", async () => {
  const controller = new AbortController();
  const reasons: string[] = [];
  const watcher = watchForCancellation({
    redis: { async get() { return "1"; } },
    jobId: "job-id",
    signal: controller.signal,
    intervalMs: 5,
    cancel(reason) {
      reasons.push(reason);
      controller.abort(reason);
      return true;
    },
  });

  await eventually(() => reasons.length === 1);
  await delay(20);
  assert.deepEqual(reasons, [CANCEL_REASON]);
  watcher.stop();
});

test("a completed job cannot be cancelled by a late Redis reply", async () => {
  let resolveGet!: (value: string | null) => void;
  const requested = new Promise<string | null>((resolve) => {
    resolveGet = resolve;
  });
  let cancels = 0;
  const watcher = watchForCancellation({
    redis: { get: async () => await requested },
    jobId: "job-id",
    intervalMs: 60_000,
    cancel() {
      cancels += 1;
      return true;
    },
  });

  watcher.stop();
  resolveGet("1");
  await delay(0);
  assert.equal(cancels, 0);
});

test("heartbeat updates its marker only after a successful Redis ping", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "worker-control-"));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "heartbeat");
  const heartbeat = startWorkerHeartbeat({
    redis: { async ping() { return "PONG"; } },
    filePath,
    intervalMs: 60_000,
    now: () => new Date("2026-09-28T01:02:03.000Z"),
  });

  await eventually(async () => (await readFile(filePath, "utf8").catch(() => "")) !== "");
  assert.equal(await readFile(filePath, "utf8"), "2026-09-28T01:02:03.000Z");
  await heartbeat.stop();
});

test("failed Redis ping does not create a healthy marker", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "worker-control-"));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "heartbeat");
  let observedError = false;
  const heartbeat = startWorkerHeartbeat({
    redis: { async ping() { throw new Error("redis down"); } },
    filePath,
    intervalMs: 60_000,
    onError: () => {
      observedError = true;
    },
  });

  await eventually(() => observedError);
  await heartbeat.stop();
  assert.equal(await readFile(filePath, "utf8").catch(() => null), null);
});

test("disabled heartbeat removes a stale marker without pinging Redis", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "worker-control-"));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "heartbeat");
  await writeFile(filePath, "stale", "utf8");
  let pings = 0;
  const heartbeat = startWorkerHeartbeat({
    redis: { async ping() { pings += 1; return "PONG"; } },
    disabled: true,
    filePath,
  });

  await heartbeat.stop();
  assert.equal(await readFile(filePath, "utf8").catch(() => null), null);
  assert.equal(pings, 0);
});

async function eventually(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 1_000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      assert.fail("condition was not met before timeout");
    }
    await delay(5);
  }
}
