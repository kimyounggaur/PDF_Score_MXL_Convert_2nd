import type { QueueEvents } from "bullmq";
import { getConversionQueueEvents } from "./queue";

export type JobQueueEvent =
  | { type: "active" }
  | { type: "progress"; data: unknown }
  | { type: "completed"; returnvalue: unknown }
  | { type: "failed"; failedReason: unknown }
  | { type: "connection-error"; error: Error };

export type JobEventSubscriber = (event: JobQueueEvent) => void;

type QueueEventsSource = Pick<QueueEvents, "on">;

export class JobEventHub {
  private readonly subscribers = new Map<string, Set<JobEventSubscriber>>();

  constructor(queueEvents: QueueEventsSource) {
    queueEvents.on("active", ({ jobId }) => {
      this.emitToJob(jobId, { type: "active" });
    });
    queueEvents.on("progress", ({ jobId, data }) => {
      this.emitToJob(jobId, { type: "progress", data });
    });
    queueEvents.on("completed", ({ jobId, returnvalue }) => {
      this.emitToJob(jobId, { type: "completed", returnvalue });
    });
    queueEvents.on("failed", ({ jobId, failedReason }) => {
      this.emitToJob(jobId, { type: "failed", failedReason });
    });
    queueEvents.on("error", (error) => {
      this.broadcast({
        type: "connection-error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }

  subscribe(jobId: string, subscriber: JobEventSubscriber) {
    const subscribers = this.subscribers.get(jobId) ?? new Set<JobEventSubscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(jobId, subscribers);

    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      subscribers.delete(subscriber);
      if (subscribers.size === 0) {
        this.subscribers.delete(jobId);
      }
    };
  }

  subscriberCount(jobId: string) {
    return this.subscribers.get(jobId)?.size ?? 0;
  }

  private emitToJob(jobId: string, event: JobQueueEvent) {
    const subscribers = this.subscribers.get(jobId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of [...subscribers]) {
      this.safeNotify(subscriber, event);
    }
  }

  private broadcast(event: JobQueueEvent) {
    const notified = new Set<JobEventSubscriber>();
    for (const subscribers of this.subscribers.values()) {
      for (const subscriber of [...subscribers]) {
        if (!notified.has(subscriber)) {
          notified.add(subscriber);
          this.safeNotify(subscriber, event);
        }
      }
    }
  }

  private safeNotify(subscriber: JobEventSubscriber, event: JobQueueEvent) {
    try {
      subscriber(event);
    } catch {
      // A closed stream must not interrupt delivery to other subscribers.
    }
  }
}

type JobEventGlobals = typeof globalThis & {
  __pdfScoreJobEventHub?: JobEventHub;
};

const jobEventGlobals = globalThis as JobEventGlobals;

export function getJobEventHub() {
  if (!jobEventGlobals.__pdfScoreJobEventHub) {
    jobEventGlobals.__pdfScoreJobEventHub = new JobEventHub(getConversionQueueEvents());
  }

  return jobEventGlobals.__pdfScoreJobEventHub;
}
