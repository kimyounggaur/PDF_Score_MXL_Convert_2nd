import { errorMessage, normalizeFailureCode } from "@/lib/errors";
import { getJobStatus } from "@/lib/jobs";
import { getConversionQueueEvents, type ConversionFile, type ConversionProgress } from "@/lib/queue";
import { isSafeJobId } from "@/lib/paths";

export const runtime = "nodejs";

type Controller = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!isSafeJobId(id)) {
    return new Response("event: error\ndata: {\"code\":\"JOB_NOT_FOUND\",\"message\":\"존재하지 않거나 만료된 작업입니다.\"}\n\n", {
      status: 404,
      headers: sseHeaders(),
    });
  }

  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const ping = () => {
        if (!closed) {
          controller.enqueue(encoder.encode(": ping\n\n"));
        }
      };
      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(pingTimer);
        queueEvents.off("progress", onProgress);
        queueEvents.off("completed", onCompleted);
        queueEvents.off("failed", onFailed);
        controller.close();
      };

      const queueEvents = getConversionQueueEvents();
      const pingTimer = setInterval(ping, 15_000);

      const onProgress = ({ jobId, data }: { jobId: string; data: unknown }) => {
        if (jobId !== id) {
          return;
        }
        send("progress", normalizeProgress(data));
      };

      const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
        if (jobId !== id) {
          return;
        }

        const files = normalizeCompletedFiles(returnvalue);
        send("done", { files });
        close();
      };

      const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: unknown }) => {
        if (jobId !== id) {
          return;
        }

        const code = normalizeFailureCode(failedReason);
        send("error", { code, message: errorMessage(code) });
        close();
      };

      queueEvents.on("progress", onProgress);
      queueEvents.on("completed", onCompleted);
      queueEvents.on("failed", onFailed);
      cleanup = close;

      const status = await getJobStatus(id);
      if (!status) {
        send("error", { code: "JOB_NOT_FOUND", message: errorMessage("JOB_NOT_FOUND") });
        close();
        return;
      }

      if (status.progress) {
        send("progress", status.progress);
      }

      if (status.status === "completed") {
        send("done", { files: status.files ?? [] });
        close();
        return;
      }

      if (status.status === "failed" && status.error) {
        send("error", status.error);
        close();
      }
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

function normalizeProgress(data: unknown): ConversionProgress {
  if (typeof data === "object" && data !== null && "pct" in data && "stage" in data) {
    const value = data as { pct?: unknown; stage?: unknown };
    return {
      pct: typeof value.pct === "number" ? value.pct : 0,
      stage: typeof value.stage === "string" ? value.stage : "processing",
    };
  }

  return { pct: typeof data === "number" ? data : 0, stage: "processing" };
}

function normalizeCompletedFiles(returnvalue: unknown): ConversionFile[] {
  if (typeof returnvalue !== "object" || returnvalue === null || !("files" in returnvalue)) {
    return [];
  }

  const files = (returnvalue as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    return [];
  }

  return files.filter(isConversionFile);
}

function isConversionFile(file: unknown): file is ConversionFile {
  return (
    typeof file === "object" &&
    file !== null &&
    "name" in file &&
    "bytes" in file &&
    typeof (file as { name: unknown }).name === "string" &&
    typeof (file as { bytes: unknown }).bytes === "number"
  );
}
