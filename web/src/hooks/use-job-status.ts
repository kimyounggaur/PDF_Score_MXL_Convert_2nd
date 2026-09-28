"use client";

import { useEffect, useState } from "react";
import type { JobFile, JobProgress, JobStatus } from "@/lib/client-types";

export function useJobStatus(jobId: string) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let terminal = false;
    let source: EventSource | null = null;

    const clearFallback = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const syncOnce = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setError(data?.error?.message ?? "작업 상태를 불러오지 못했습니다.");
          setIsLoading(false);
          return;
        }

        setStatus(data as JobStatus);
        setError(null);
        setIsLoading(false);

        if (data.status === "completed" || data.status === "failed") {
          terminal = true;
          source?.close();
        }
      } catch {
        if (!cancelled) {
          setError("작업 상태를 불러오지 못했습니다. 잠시 후 다시 확인합니다.");
        }
      }
    };

    const scheduleFallback = () => {
      clearFallback();
      fallbackTimer = setTimeout(() => {
        void syncOnce();
      }, 30_000);
    };

    if (typeof EventSource === "undefined") {
      const poll = async () => {
        await syncOnce();
        if (!cancelled && !terminal) {
          fallbackTimer = setTimeout(poll, 2000);
        }
      };
      void poll();
    } else {
      source = new EventSource(`/api/jobs/${jobId}/events`);
      scheduleFallback();

      source.addEventListener("progress", (event) => {
        if (cancelled) {
          return;
        }

        const progress = JSON.parse(event.data) as JobProgress;
        clearFallback();
        setStatus((current) => ({
          status: current?.status === "queued" ? "queued" : "active",
          progress,
          files: null,
          error: null,
        }));
        setIsLoading(false);
        setError(null);
        scheduleFallback();
      });

      source.addEventListener("done", (event) => {
        if (cancelled) {
          return;
        }

        terminal = true;
        clearFallback();
        const data = JSON.parse(event.data) as { files: JobFile[] };
        setStatus({
          status: "completed",
          progress: { pct: 100, stage: "completed", sheet: null },
          files: data.files,
          error: null,
        });
        setIsLoading(false);
        setError(null);
        source?.close();
      });

      source.addEventListener("error", (event) => {
        if (cancelled || terminal) {
          return;
        }

        if ("data" in event && typeof event.data === "string" && event.data) {
          const data = JSON.parse(event.data) as { code: string; message: string };
          terminal = true;
          clearFallback();
          setStatus({
            status: "failed",
            progress: null,
            files: null,
            error: data,
          });
          setIsLoading(false);
          setError(null);
          source?.close();
          return;
        }

        setError("실시간 연결이 끊겼습니다. 상태를 다시 확인하는 중입니다.");
        void syncOnce();
        scheduleFallback();
      });

      source.onerror = () => {
        if (!terminal && !cancelled) {
          setError("실시간 연결을 다시 시도하고 있습니다.");
          scheduleFallback();
        }
      };
    }

    return () => {
      cancelled = true;
      clearFallback();
      source?.close();
    };
  }, [jobId]);

  return { status, isLoading, error };
}
