"use client";

import { useEffect, useState } from "react";
import type { ServiceStatus } from "@/lib/client-types";

const STATUS_REFRESH_MS = 60_000;
const STATUS_REQUEST_TIMEOUT_MS = 10_000;

export function useServiceStatus() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;

    const refresh = async () => {
      if (disposed || inFlight) {
        return;
      }

      inFlight = true;
      setIsChecking(true);
      const nextController = new AbortController();
      controller = nextController;
      const timeout = window.setTimeout(() => nextController.abort(), STATUS_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch("/api/status", {
          cache: "no-store",
          signal: nextController.signal,
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok || !isServiceStatus(data)) {
          throw new Error("invalid_status_response");
        }

        if (!disposed) {
          setStatus(data);
          setError(null);
        }
      } catch {
        if (!disposed) {
          setError("변환 서버 상태를 확인하지 못했습니다.");
        }
      } finally {
        window.clearTimeout(timeout);
        if (controller === nextController) {
          controller = null;
        }
        inFlight = false;
        if (!disposed) {
          setIsChecking(false);
        }
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, STATUS_REFRESH_MS);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, []);

  const isUnavailable =
    error !== null ||
    status?.redis === "down" ||
    (status !== null && (status.workers === null || status.workers < 1));
  const canUpload = error === null && status?.redis === "ok" && status.workers !== null && status.workers > 0;

  return { status, isChecking, isUnavailable, canUpload, error };
}

export function isServiceStatus(value: unknown): value is ServiceStatus {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.redis === "ok" || candidate.redis === "down") &&
    isNullableCount(candidate.workers) &&
    isNullableCount(candidate.waiting) &&
    isNullableCount(candidate.active) &&
    isNullableCount(candidate.diskFreeBytes) &&
    typeof candidate.engineVersion === "string" &&
    candidate.engineVersion.length > 0
  );
}

function isNullableCount(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}
