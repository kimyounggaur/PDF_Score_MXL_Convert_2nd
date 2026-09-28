"use client";

import { Download, FileMusic, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import type { JobStatus, StoredJob } from "@/lib/client-types";
import { groupSuspectMeasureLocations, type SuspectMeasureLocation } from "@/lib/suspect-measures-ui";
import {
  failureGuidance,
  formatBytes,
  formatElapsed,
  formatEstimatedMinutes,
  currentElapsedMs,
  currentEstimateSeconds,
  progressLabel,
  resultFileLabel,
  skippedPagesLabel,
  cn,
} from "@/lib/ui";
import { useJobStatus } from "@/hooks/use-job-status";
import { ScorePreview, type ScorePreviewTarget } from "./score-preview";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button, buttonClassName } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Progress } from "./ui/progress";

export function JobCard({
  job,
  clock,
  onRemove,
  onReplace,
}: {
  job: StoredJob;
  clock: number;
  onRemove: (jobId: string) => void;
  onReplace: (jobId: string, replacement: StoredJob) => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<ScorePreviewTarget | null>(null);
  const [cancelState, setCancelState] = useState<"idle" | "requesting" | "pending">("idle");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryInFlightRef = useRef(false);
  const previewRequestSequenceRef = useRef(0);
  const { status, statusReceivedAt, isLoading, isExpired, error } = useJobStatus(job.jobId);
  const state: JobViewState = isExpired ? "expired" : (status?.status ?? "queued");
  const progress = status?.progress?.pct ?? 0;
  const activeProgressLabel = progressLabel(status?.progress ?? { stage: "starting", sheet: null });
  const isCancelled = state === "failed" && status?.error?.code === "CANCELLED";
  const isCancellable = status?.status === "queued" || status?.status === "active";
  const badge = badgeForState(state, isLoading, status?.queuePosition ?? null, cancelState, isCancelled);
  const elapsedMs = currentElapsedMs(status, clock, statusReceivedAt);
  const estimate =
    (state === "queued" || state === "active") && status?.estimate && status.estimate.sampleCount >= 3
      ? status.estimate
      : null;
  const estimateSeconds = estimate ? currentEstimateSeconds(status, clock, statusReceivedAt) : null;
  const proofRule =
    state === "failed" && !isCancelled
      ? "border-l-[#B1304A]"
      : state === "active" || state === "completed"
        ? "border-l-[#245C9E]"
        : "border-l-[#BCC7D0]";
  const suspectLocations = groupSuspectMeasureLocations(
    status?.suspectMeasures ?? [],
    status?.files?.map((file) => file.name) ?? [],
  );

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

  const retryJob = async () => {
    if (retryInFlightRef.current || state !== "failed") {
      return;
    }

    retryInFlightRef.current = true;
    setIsRetrying(true);
    setRetryError(null);

    try {
      const response = await fetch(`/api/jobs/${job.jobId}/retry`, { method: "POST" });
      const data: unknown = await response.json().catch(() => null);

      if (response.status !== 201 || !isRetryResponse(data)) {
        setRetryError(readApiErrorMessage(data) ?? "다시 시도할 작업을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      onReplace(job.jobId, {
        jobId: data.jobId,
        fileName: status?.meta?.originalName ?? job.fileName,
        createdAt: new Date().toISOString(),
      });
    } catch {
      setRetryError("다시 시도할 작업을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      retryInFlightRef.current = false;
      setIsRetrying(false);
    }
  };

  const togglePreview = () => {
    setPreviewTarget(null);
    setIsPreviewOpen((value) => !value);
  };

  const showSuspectMeasure = (location: SuspectMeasureLocation) => {
    previewRequestSequenceRef.current += 1;
    setPreviewTarget({
      file: location.file,
      measure: location.measure,
      requestId: previewRequestSequenceRef.current,
    });
    setIsPreviewOpen(true);
  };

  return (
    <Card
      className={cn(
        "rounded-none border-[#BCC7D0] border-l-4 bg-white shadow-none",
        proofRule,
        isExpired && "bg-[#EEF1F3]",
      )}
      data-testid="job-card"
    >
      <CardHeader className="flex flex-col items-start justify-between gap-4 border-[#BCC7D0] px-4 py-4 sm:flex-row sm:px-5">
        <div className="min-w-0 max-w-full">
          <div className="flex items-center gap-2">
            <FileMusic className="h-4 w-4 shrink-0 text-[#245C9E]" aria-hidden="true" />
            <h2 className="min-w-0 break-all text-base font-semibold tracking-[-0.01em] text-[#17232D] sm:truncate sm:text-lg">{job.fileName}</h2>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#596873]">
            <span>작업 ID: {job.jobId.slice(0, 8)}</span>
            {status?.meta ? (
              <span data-testid="job-meta">
                원본 {status.meta.pages}쪽 · {formatBytes(status.meta.bytes)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          <span aria-live="polite">
            <Badge tone={badge.tone} data-testid="job-status">
              {badge.label}
            </Badge>
          </span>
          {isCancellable ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => void cancelJob()}
              disabled={cancelState !== "idle"}
              data-testid="cancel-job"
            >
              {cancelState === "requesting" ? <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {cancelState === "idle" ? "취소" : "취소 중"}
            </Button>
          ) : !isExpired ? (
            <Button variant="ghost" size="sm" onClick={() => onRemove(job.jobId)} aria-label="작업 카드 제거">
              <XCircle className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-4 py-5 sm:px-5">
        {isExpired ? (
          <div className="flex flex-col items-start gap-3 text-sm text-[#596873]">
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

            {retryError ? (
              <Alert tone="error" role="alert" data-testid="retry-error">
                {retryError}
              </Alert>
            ) : null}

            {state === "failed" && status?.error ? (
              <div className="space-y-3">
                <Alert tone="error" data-testid="job-error" data-error-code={status.error.code}>
                  {status.error.message}
                </Alert>
                <div className="border-y border-r border-l-2 border-[#BCC7D0] border-l-[#B1304A] bg-[#FFF7F8] px-4 py-3 text-sm leading-6 text-[#596873]" data-testid="failure-guidance">
                  <p className="font-semibold text-[#17232D]">확인해 볼 사항</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {failureGuidance(status.error.code).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <Button type="button" variant="secondary" onClick={() => void retryJob()} disabled={isRetrying} data-testid="retry-job">
                  {isRetrying ? <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  {isRetrying ? "새 작업 만드는 중" : "다시 시도"}
                </Button>
              </div>
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
              <div className="space-y-1 border-l-2 border-[#BCC7D0] pl-3 text-sm text-[#596873]">
                <p>변환을 기다리고 있습니다.</p>
                {status?.queuePosition && status.queuePosition > 0 ? <p>대기 순번: {status.queuePosition}번째</p> : null}
              </div>
            ) : null}

            {state === "active" ? (
              <div className="space-y-3">
                <Progress value={progress} label={activeProgressLabel} />
                <div className="flex items-center justify-between gap-3 text-sm text-[#596873]">
                  <span>{activeProgressLabel}</span>
                  <span className="font-semibold tabular-nums text-[#245C9E]">{Math.round(progress)}%</span>
                </div>
              </div>
            ) : null}

            {state === "completed" && status?.files ? (
              <div className="space-y-4">
                {suspectLocations.length > 0 ? (
                  <Alert tone="warning" data-testid="suspect-measures">
                    <p className="flex flex-wrap items-center gap-x-1 gap-y-2 font-semibold">
                      <span>확인이 필요한 마디 {suspectLocations.length}곳:</span>{" "}
                      {suspectLocations.map((location, index) => {
                        const label = suspectLocationLabel(location, status.files ?? []);
                        return (
                          <span key={`${location.file}:${location.measure}`} className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="px-2 underline underline-offset-2"
                              onClick={() => showSuspectMeasure(location)}
                              aria-label={`${label}마디 미리보기로 이동`}
                              title={`자동 점검 신호가 있는 파트: ${location.parts.join(", ")}`}
                              data-testid="suspect-measure-button"
                            >
                              {label}
                            </Button>
                            {index < suspectLocations.length - 1 ? <span aria-hidden="true">,{" "}</span> : null}
                          </span>
                        );
                      })}
                    </p>
                    <p className="mt-2 text-[#596873]">자동 점검 결과입니다. 표시된 마디는 원본과 비교해 보세요.</p>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {status.files.map((file, index) => (
                    <a
                      key={file.name}
                      href={`/api/jobs/${job.jobId}/files/${encodeURIComponent(file.name)}`}
                      className={buttonClassName({ variant: "secondary", className: "max-w-full" })}
                      data-testid="download-link"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {resultFileLabel(file.name, index, status.files?.length ?? 1)}
                      <span className="text-sm tabular-nums text-[#596873]">{formatBytes(file.bytes)}</span>
                    </a>
                  ))}
                  <Button variant="primary" onClick={togglePreview}>
                    {isPreviewOpen ? "미리보기 닫기" : "미리보기"}
                  </Button>
                </div>
                {isPreviewOpen ? (
                  <ScorePreview
                    jobId={job.jobId}
                    files={status.files}
                    sourcePages={status.meta?.pages ?? 1}
                    warnings={status.warnings}
                    measureTarget={previewTarget}
                  />
                ) : null}
              </div>
            ) : null}

            {!isLoading && !isExpired && (status?.timing || estimate) ? (
              <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#BCC7D0] pt-3 text-sm text-[#596873]">
                {status?.timing ? (
                  <div className="flex gap-1" data-testid="job-elapsed">
                    <dt>경과 시간:</dt>
                    <dd>{formatElapsed(elapsedMs)}</dd>
                  </div>
                ) : null}
                {estimate && estimateSeconds !== null ? (
                  <div className="flex gap-1" data-testid="job-estimate">
                    <dt>예상 남은 시간:</dt>
                    <dd>{formatEstimatedMinutes(estimateSeconds)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-[#596873]">
                <RefreshCw className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
                상태를 확인하는 중입니다.
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function suspectLocationLabel(location: SuspectMeasureLocation, files: NonNullable<JobStatus["files"]>) {
  if (files.length <= 1) {
    return String(location.measure);
  }

  const fileIndex = files.findIndex((file) => file.name === location.file);
  const fileLabel = fileIndex >= 0 ? resultFileLabel(location.file, fileIndex, files.length) : location.file;
  return `${fileLabel} ${location.measure}`;
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

function isRetryResponse(value: unknown): value is { jobId: string } {
  return typeof value === "object" && value !== null && "jobId" in value && typeof (value as { jobId: unknown }).jobId === "string";
}
