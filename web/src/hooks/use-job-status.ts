"use client";

import { useEffect, useState } from "react";
import type { JobFile, JobProgress, JobStatus, JobWarning } from "@/lib/client-types";
import { failedEventDisposition } from "@/lib/client-status";

const SSE_INACTIVITY_MS = 20_000;
const POLL_INTERVAL_MS = 5_000;

type DoneEventData = {
  files: JobFile[];
  warnings?: JobWarning[];
};

type FailedEventData = {
  code: string;
  message: string;
  recoverable?: boolean;
};

export function useJobStatus(jobId: string) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusReceivedAt, setStatusReceivedAt] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let terminal = false;
    let hasCanonicalStatus = false;
    let source: EventSource | null = null;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;
    let pollController: AbortController | null = null;

    setStatus(null);
    setStatusReceivedAt(null);
    setIsLoading(true);
    setIsExpired(false);
    setError(null);

    const clearInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };

    const clearPollTimer = () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };

    const stopPolling = () => {
      polling = false;
      clearPollTimer();
      pollController?.abort();
      pollController = null;
    };

    const finishTerminalState = () => {
      terminal = true;
      clearInactivityTimer();
      stopPolling();
      source?.close();
    };

    const applyStatus = (nextStatus: JobStatus) => {
      const normalized = normalizeJobStatus(nextStatus);
      hasCanonicalStatus = true;
      setStatusReceivedAt(Date.now());
      setStatus(normalized);
      setIsExpired(false);
      setIsLoading(false);
      setError(null);

      if (isTerminal(normalized)) {
        finishTerminalState();
      }
    };

    const applyExpiredState = () => {
      setStatus(null);
      setStatusReceivedAt(null);
      setIsExpired(true);
      setIsLoading(false);
      setError(null);
      finishTerminalState();
    };

    const syncStatus = async () => {
      const controller = new AbortController();
      pollController = controller;

      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);

        if (disposed || controller.signal.aborted || !polling) {
          return;
        }

        if (response.status === 404) {
          applyExpiredState();
          return;
        }

        if (!response.ok || !isJobStatus(data)) {
          setIsLoading(!hasCanonicalStatus);
          setError(readErrorMessage(data) ?? "작업 상태를 불러오지 못했습니다. 잠시 후 다시 확인합니다.");
          return;
        }

        applyStatus(data);
      } catch (caught) {
        if (!disposed && polling && !isAbortError(caught)) {
          setIsLoading(!hasCanonicalStatus);
          setError("작업 상태를 불러오지 못했습니다. 잠시 후 다시 확인합니다.");
        }
      } finally {
        if (pollController === controller) {
          pollController = null;
        }
      }
    };

    const poll = async () => {
      if (disposed || terminal || !polling) {
        return;
      }

      await syncStatus();

      if (!disposed && !terminal && polling) {
        clearPollTimer();
        pollTimer = setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      }
    };

    const startPolling = (immediate = false) => {
      if (disposed || terminal) {
        return;
      }

      if (polling) {
        if (immediate && !pollController) {
          clearPollTimer();
          void poll();
        }
        return;
      }

      polling = true;
      clearPollTimer();

      if (immediate) {
        void poll();
        return;
      }

      pollTimer = setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    const scheduleInactivityCheck = () => {
      clearInactivityTimer();

      if (terminal || disposed) {
        return;
      }

      inactivityTimer = setTimeout(() => {
        startPolling(true);
      }, SSE_INACTIVITY_MS);
    };

    const markSseDataReceived = () => {
      stopPolling();
      setError(null);
      scheduleInactivityCheck();
    };

    const handleMalformedEvent = () => {
      setIsLoading(!hasCanonicalStatus);
      setError("실시간 상태를 읽지 못해 서버 상태를 다시 확인합니다.");
      startPolling(true);
    };

    if (typeof EventSource === "undefined") {
      startPolling(true);
    } else {
      source = new EventSource(`/api/jobs/${jobId}/events`);
      scheduleInactivityCheck();

      source.addEventListener("status", (event) => {
        const data = parseEventData(event);
        if (disposed || !isJobStatus(data)) {
          if (!disposed) {
            handleMalformedEvent();
          }
          return;
        }

        markSseDataReceived();
        applyStatus(data);
      });

      source.addEventListener("progress", (event) => {
        const data = parseEventData(event);
        if (disposed || !isJobProgress(data)) {
          if (!disposed) {
            handleMalformedEvent();
          }
          return;
        }

        markSseDataReceived();

        if (!hasCanonicalStatus) {
          startPolling(true);
          return;
        }

        setStatus((current) => (current ? { ...current, progress: normalizeJobProgress(data) } : current));
        setIsLoading(false);
      });

      source.addEventListener("done", (event) => {
        const data = parseEventData(event);
        if (disposed || !isDoneEventData(data)) {
          if (!disposed) {
            handleMalformedEvent();
          }
          return;
        }

        markSseDataReceived();
        setStatusReceivedAt(Date.now());
        hasCanonicalStatus = true;
        setStatus((current) => ({
          status: "completed",
          progress: { pct: 100, stage: "completed", sheet: null },
          queuePosition: null,
          meta: current?.meta ?? null,
          timing: current?.timing ?? null,
          estimate: current?.estimate ?? null,
          files: data.files,
          warnings: data.warnings ?? current?.warnings ?? [],
          error: null,
        }));
        setIsExpired(false);
        setIsLoading(false);
        setError(null);
        finishTerminalState();
      });

      source.addEventListener("failed", (event) => {
        const data = parseEventData(event);
        if (disposed || !isFailedEventData(data)) {
          if (!disposed) {
            handleMalformedEvent();
          }
          return;
        }

        markSseDataReceived();

        const disposition = failedEventDisposition(data);
        if (disposition === "expired") {
          applyExpiredState();
          return;
        }

        if (disposition === "recoverable") {
          setIsLoading(!hasCanonicalStatus);
          setError(data.message);
          startPolling(true);
          return;
        }

        setStatusReceivedAt(Date.now());
        hasCanonicalStatus = true;
        setStatus((current) => ({
          status: "failed",
          progress: current?.progress ?? null,
          queuePosition: null,
          meta: current?.meta ?? null,
          timing: current?.timing ?? null,
          estimate: current?.estimate ?? null,
          files: null,
          warnings: current?.warnings ?? [],
          error: { code: data.code, message: data.message },
        }));
        setIsExpired(false);
        setIsLoading(false);
        setError(null);
        finishTerminalState();
      });

      source.onerror = () => {
        if (disposed || terminal) {
          return;
        }

        clearInactivityTimer();
        setIsLoading(!hasCanonicalStatus);
        setError("실시간 연결이 끊겼습니다. 서버 상태를 다시 확인합니다.");
        startPolling(true);
      };
    }

    return () => {
      disposed = true;
      clearInactivityTimer();
      stopPolling();
      source?.close();
    };
  }, [jobId]);

  return { status, statusReceivedAt, isLoading, isExpired, error };
}

function normalizeJobStatus(status: JobStatus): JobStatus {
  return {
    ...status,
    progress: status.progress ? normalizeJobProgress(status.progress) : null,
    queuePosition: typeof status.queuePosition === "number" ? status.queuePosition : null,
    meta: status.meta ?? null,
    timing: status.timing ?? null,
    estimate: status.estimate ?? null,
    warnings: Array.isArray(status.warnings) ? status.warnings : [],
  };
}

function normalizeJobProgress(progress: JobProgress): JobProgress {
  return {
    ...progress,
    sheet: progress.sheet ?? null,
  };
}

function isTerminal(status: JobStatus) {
  return status.status === "completed" || status.status === "failed";
}

function parseEventData(event: Event): unknown {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null;
  }

  try {
    return JSON.parse(event.data) as unknown;
  } catch {
    return null;
  }
}

function isJobStatus(value: unknown): value is JobStatus {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    return false;
  }

  const state = (value as { status: unknown }).status;
  return state === "queued" || state === "active" || state === "completed" || state === "failed";
}

function isJobProgress(value: unknown): value is JobProgress {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const progress = value as { pct?: unknown; stage?: unknown };
  return typeof progress.pct === "number" && typeof progress.stage === "string";
}

function isDoneEventData(value: unknown): value is DoneEventData {
  return typeof value === "object" && value !== null && "files" in value && Array.isArray((value as { files: unknown }).files);
}

function isFailedEventData(value: unknown): value is FailedEventData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const failure = value as { code?: unknown; message?: unknown };
  return typeof failure.code === "string" && typeof failure.message === "string";
}

function readErrorMessage(value: unknown) {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }

  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return null;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}
