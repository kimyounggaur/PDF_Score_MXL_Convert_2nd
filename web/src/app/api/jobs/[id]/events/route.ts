import { errorMessage } from "@/lib/errors";
import { getJobEventHub, type JobQueueEvent } from "@/lib/job-event-hub";
import { createDoneEventPayload, getJobStatus, type JobStatus } from "@/lib/jobs";
import { isSafeJobId } from "@/lib/paths";
import type { ConversionProgress } from "@/lib/queue";
import { STATUS_QUERY_TIMEOUT_MS } from "@/lib/system-status";
import { withTimeout } from "@/lib/timeouts";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const SERVICE_UNAVAILABLE = {
  code: "SERVICE_UNAVAILABLE",
  message: errorMessage("SERVICE_UNAVAILABLE"),
  recoverable: true,
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!isSafeJobId(id)) {
    return new Response(sseFrame("failed", { code: "JOB_NOT_FOUND", message: errorMessage("JOB_NOT_FOUND") }), {
      status: 404,
      headers: sseHeaders(),
    });
  }

  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let initialized = false;
      let currentState: JobStatus["status"] | null = null;
      let refreshTimer: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => undefined;
      let eventChain = Promise.resolve();
      const pendingEvents: JobQueueEvent[] = [];

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
        unsubscribe();
        request.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          // The browser or stream may already have closed the controller.
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) {
          return false;
        }

        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
          return true;
        } catch {
          close();
          return false;
        }
      };

      const sendComment = () => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          close();
        }
      };

      const failConnection = () => {
        if (send("failed", SERVICE_UNAVAILABLE)) {
          close();
        }
      };

      const publishStatus = (status: JobStatus) => {
        currentState = status.status;
        if (!send("status", status)) {
          return;
        }

        if (status.status === "completed") {
          send("done", createDoneEventPayload(status));
          close();
        } else if (status.status === "failed" && status.error) {
          send("failed", status.error);
          close();
        }
      };

      const refreshStatus = async (forceActive = false) => {
        const status = await withTimeout(() => getJobStatus(id), STATUS_QUERY_TIMEOUT_MS);
        if (closed) {
          return;
        }

        if (!status) {
          send("failed", { code: "JOB_NOT_FOUND", message: errorMessage("JOB_NOT_FOUND") });
          close();
          return;
        }

        publishStatus(
          forceActive && status.status === "queued"
            ? { ...status, status: "active", queuePosition: null }
            : status,
        );
      };

      const processQueueEvent = async (event: JobQueueEvent) => {
        if (closed) {
          return;
        }

        if (event.type === "active") {
          await refreshStatus(true);
          return;
        }

        if (event.type === "progress") {
          currentState = "active";
          send("progress", normalizeProgress(event.data));
          return;
        }

        if (event.type === "completed") {
          // QueueEvents fires after BullMQ has stored the terminal job state.
          // Re-read it so meta/timing/estimate and the final file list arrive
          // in one authoritative snapshot before the compatibility `done`
          // event closes the stream.
          await refreshStatus();
          return;
        }

        if (event.type === "failed") {
          await refreshStatus();
          return;
        }

        failConnection();
      };

      const scheduleQueueEvent = (event: JobQueueEvent) => {
        if (!initialized) {
          pendingEvents.push(event);
          return;
        }

        eventChain = eventChain.then(() => processQueueEvent(event)).catch(failConnection);
      };

      cleanup = close;
      if (request.signal.aborted) {
        close();
        return;
      }

      request.signal.addEventListener("abort", close, { once: true });
      try {
        unsubscribe = getJobEventHub().subscribe(id, scheduleQueueEvent);
      } catch {
        failConnection();
        return;
      }
      refreshTimer = setInterval(() => {
        if (currentState === "queued") {
          eventChain = eventChain.then(() => refreshStatus()).catch(failConnection);
        } else {
          sendComment();
        }
      }, 15_000);

      void (async () => {
        try {
          const status = await withTimeout(() => getJobStatus(id), STATUS_QUERY_TIMEOUT_MS);
          if (closed) {
            return;
          }

          if (!status) {
            send("failed", { code: "JOB_NOT_FOUND", message: errorMessage("JOB_NOT_FOUND") });
            close();
            return;
          }

          // The first named event is always a complete server snapshot.
          publishStatus(status);
          if (closed) {
            return;
          }

          initialized = true;
          for (const event of pendingEvents.splice(0)) {
            scheduleQueueEvent(event);
          }
        } catch {
          failConnection();
        }
      })();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: sseHeaders(),
  });
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

function sseFrame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function normalizeProgress(data: unknown): ConversionProgress {
  if (typeof data === "object" && data !== null && "pct" in data && "stage" in data) {
    const value = data as { pct?: unknown; stage?: unknown; sheet?: unknown };
    return {
      pct: typeof value.pct === "number" ? value.pct : 0,
      stage: typeof value.stage === "string" ? value.stage : "processing",
      sheet: normalizeSheet(value.sheet),
    };
  }

  return { pct: typeof data === "number" ? data : 0, stage: "processing", sheet: null };
}

function normalizeSheet(value: unknown): { current: number; total: number } | null {
  if (typeof value !== "object" || value === null || !("current" in value) || !("total" in value)) {
    return null;
  }

  const sheet = value as { current: unknown; total: unknown };
  if (typeof sheet.current !== "number" || typeof sheet.total !== "number") {
    return null;
  }

  return { current: sheet.current, total: sheet.total };
}
