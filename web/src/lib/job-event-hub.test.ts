import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { JobEventHub, type JobQueueEvent } from "./job-event-hub";

function createHub() {
  const events = new EventEmitter();
  const hub = new JobEventHub(events as unknown as ConstructorParameters<typeof JobEventHub>[0]);
  return { events, hub };
}

test("구독자가 늘어도 QueueEvents 리스너는 이벤트마다 한 개뿐이다", () => {
  const { events, hub } = createHub();
  const unsubscribers = Array.from({ length: 12 }, (_, index) => hub.subscribe(`job-${index}`, () => undefined));

  for (const eventName of ["active", "progress", "completed", "failed", "error"]) {
    assert.equal(events.listenerCount(eventName), 1);
  }

  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  assert.equal(hub.subscriberCount("job-0"), 0);
});

test("이벤트는 같은 작업 ID의 구독자에게만 전달된다", () => {
  const { events, hub } = createHub();
  const first: JobQueueEvent[] = [];
  const second: JobQueueEvent[] = [];
  hub.subscribe("first", (event) => first.push(event));
  hub.subscribe("second", (event) => second.push(event));

  events.emit("active", { jobId: "first" }, "1-0");
  events.emit("progress", { jobId: "second", data: { pct: 25 } }, "1-1");

  assert.deepEqual(first, [{ type: "active" }]);
  assert.deepEqual(second, [{ type: "progress", data: { pct: 25 } }]);
});

test("QueueEvents 오류는 모든 구독자에게 전달되고 한 구독자의 예외가 전파를 막지 않는다", () => {
  const { events, hub } = createHub();
  const received: JobQueueEvent[] = [];
  hub.subscribe("first", () => {
    throw new Error("closed stream");
  });
  hub.subscribe("second", (event) => received.push(event));

  events.emit("error", new Error("redis down"));

  assert.equal(received.length, 1);
  assert.equal(received[0]?.type, "connection-error");
});
