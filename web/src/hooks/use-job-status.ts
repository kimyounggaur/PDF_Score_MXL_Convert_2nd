"use client";

import { useEffect, useState } from "react";
import type { JobStatus } from "@/lib/client-types";

export function useJobStatus(jobId: string) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
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

        if (data.status !== "completed" && data.status !== "failed") {
          timer = setTimeout(load, 2000);
        }
      } catch {
        if (!cancelled) {
          setError("작업 상태를 불러오지 못했습니다. 잠시 후 다시 확인합니다.");
          timer = setTimeout(load, 4000);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [jobId]);

  return { status, isLoading, error };
}

