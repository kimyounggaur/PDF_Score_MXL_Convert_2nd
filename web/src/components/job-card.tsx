"use client";

import { Download, FileMusic, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import type { JobStatus, StoredJob } from "@/lib/client-types";
import { formatBytes, progressLabel, resultFileLabel, skippedPagesLabel } from "@/lib/ui";
import { useJobStatus } from "@/hooks/use-job-status";
import { ScorePreview } from "./score-preview";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button, buttonClassName } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Progress } from "./ui/progress";

export function JobCard({ job, onRemove }: { job: StoredJob; onRemove: (jobId: string) => void }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [cancelState, setCancelState] = useState<"idle" | "requesting" | "pending">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { status, isLoading, isExpired, error } = useJobStatus(job.jobId);
  const state: JobViewState = isExpired ? "expired" : (status?.status ?? "queued");
  const progress = status?.progress?.pct ?? 0;
  const activeProgressLabel = progressLabel(status?.progress ?? { stage: "starting", sheet: null });
  const isCancelled = state === "failed" && status?.error?.code === "CANCELLED";
  const isCancellable = status?.status === "queued" || status?.status === "active";
  const badge = badgeForState(state, isLoading, status?.queuePosition ?? null, cancelState, isCancelled);

  const cancelJob = async () => {
    if (cancelState !== "idle" || !isCancellable || !window.confirm("이 변환 작업을 취소할까요?")) {
      return;
    }

    setCancelState("requesting");
    setCancelError(null);

    try {
      const response = await fetch(`/api/jobs/${job.jobId}`, { method: "DELETE" });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setCancelError(readApiErrorMessage(data) ?? "작업을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setCancelState("idle");
        return;
      }

      if (response.status === 202) {
        setCancelState("pending");
        return;
      }

      onRemove(job.jobId);
    } catch {
      setCancelError("작업을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setCancelState("idle");
    }
  };

  return (
    <Card className={isExpired ? "border-slate-200 bg-slate-100 shadow-none" : undefined} data-testid="job-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileMusic className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold text-slate-950">{job.fileName}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">작업 ID: {job.jobId.slice(0, 8)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={badge.tone} data-testid="job-status">
            {badge.label}
          </Badge>
          {isCancellable ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => void cancelJob()}
              disabled={cancelState !== "idle"}
              data-testid="cancel-job"
            >
              {cancelState === "requesting" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {cancelState === "idle" ? "취소" : "취소 중"}
            </Button>
          ) : !isExpired ? (
            <Button variant="ghost" size="sm" onClick={() => onRemove(job.jobId)} aria-label="작업 카드 제거">
              <XCircle className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isExpired ? (
          <div className="flex flex-col items-start gap-3 text-sm text-slate-600">
            <p>결과가 삭제되었습니다(24시간 경과).</p>
            <Button variant="secondary" size="sm" onClick={() => onRemove(job.jobId)}>
              목록에서 지우기
            </Button>
          </div>
        ) : (
          <>
            {error ? (
              <Alert tone="error" data-testid="job-error">
                {error}
              </Alert>
            ) : null}

            {cancelError ? (
              <Alert tone="error" role="alert" data-testid="cancel-error">
                {cancelError}
              </Alert>
            ) : null}

            {cancelState === "pending" && state === "active" ? (
              <Alert tone="info" role="status" aria-live="polite">
                취소 요청을 처리하고 있습니다. 실행 중인 변환을 안전하게 종료하는 중입니다.
              </Alert>
            ) : null}

            {state === "failed" && status?.error ? (
              <Alert tone="error" data-testid="job-error" data-error-code={status.error.code}>
                {status.error.message}
              </Alert>
            ) : null}

            {status?.warnings.map((warning) => (
              <Alert
                key={`${warning.code}:${warning.pages.join(",")}`}
                tone="warning"
                data-testid="job-warning"
                data-warning-code={warning.code}
              >
                {skippedPagesLabel(warning.pages)}
              </Alert>
            ))}

            {state === "queued" && !isLoading ? (
              <p className="text-sm text-slate-600">변환을 기다리고 있습니다.</p>
            ) : null}

            {state === "active" ? (
              <div className="space-y-3">
                <Progress value={progress} label={activeProgressLabel} />
                <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span>{activeProgressLabel}</span>
                  <span className="font-mono text-xs">{Math.round(progress)}%</span>
                </div>
              </div>
            ) : null}

            {state === "completed" && status?.files ? (
              <div className="space-y-4">
                <Alert tone="info">결과는 24시간 후 자동 삭제됩니다.</Alert>
                <div className="flex flex-wrap gap-2">
                  {status.files.map((file, index) => (
                    <a
                      key={file.name}
                      href={`/api/jobs/${job.jobId}/files/${encodeURIComponent(file.name)}`}
                      className={buttonClassName({ variant: "secondary" })}
                      data-testid="download-link"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {resultFileLabel(file.name, index, status.files?.length ?? 1)}
                      <span className="font-mono text-xs text-slate-500">{formatBytes(file.bytes)}</span>
                    </a>
                  ))}
                  <Button variant="primary" onClick={() => setIsPreviewOpen((value) => !value)}>
                    {isPreviewOpen ? "미리보기 닫기" : "미리보기"}
                  </Button>
                </div>
                {isPreviewOpen ? <ScorePreview jobId={job.jobId} files={status.files} /> : null}
              </div>
            ) : null}

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                상태를 확인하는 중입니다.
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

type JobViewState = JobStatus["status"] | "expired";

function badgeForState(
  state: JobViewState,
  isLoading: boolean,
  queuePosition: number | null,
  cancelState: "idle" | "requesting" | "pending",
  isCancelled: boolean,
): { label: string; tone: "slate" | "blue" | "teal" | "rose" | "amber" } {
  if (isCancelled) {
    return { label: "취소됨", tone: "slate" };
  }

  if (cancelState !== "idle" && (state === "queued" || state === "active")) {
    return { label: "취소 중", tone: "slate" };
  }

  if (isLoading) {
    return { label: "확인 중", tone: "slate" };
  }

  if (state === "expired") {
    return { label: "만료됨", tone: "slate" };
  }

  if (state === "active") {
    return { label: "변환 중", tone: "blue" };
  }

  if (state === "completed") {
    return { label: "완료", tone: "teal" };
  }

  if (state === "failed") {
    return { label: "실패", tone: "rose" };
  }

  return {
    label: queuePosition && queuePosition > 0 ? `대기 중 · ${queuePosition}번째 순서` : "대기 중",
    tone: "amber",
  };
}

function readApiErrorMessage(value: unknown) {
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
