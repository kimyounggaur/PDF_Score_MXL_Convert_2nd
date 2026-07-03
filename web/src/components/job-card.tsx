"use client";

import { Download, FileMusic, RefreshCw, XCircle } from "lucide-react";
import type { StoredJob } from "@/lib/client-types";
import { formatBytes, resultFileLabel, stageLabel } from "@/lib/ui";
import { useJobStatus } from "@/hooks/use-job-status";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Progress } from "./ui/progress";

export function JobCard({ job, onRemove }: { job: StoredJob; onRemove: (jobId: string) => void }) {
  const { status, isLoading, error } = useJobStatus(job.jobId);
  const state = status?.status ?? "queued";
  const progress = status?.progress?.pct ?? (state === "queued" ? 3 : 0);
  const badge = badgeForState(state, isLoading);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileMusic className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
            <h2 className="truncate text-base font-semibold text-slate-950">{job.fileName}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">작업 ID: {job.jobId.slice(0, 8)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          <Button variant="ghost" size="sm" onClick={() => onRemove(job.jobId)} aria-label="작업 카드 제거">
            <XCircle className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <Alert tone="error">{error}</Alert> : null}

        {state === "failed" && status?.error ? <Alert tone="error">{status.error.message}</Alert> : null}

        {state !== "completed" && state !== "failed" ? (
          <div className="space-y-3">
            <Progress value={progress} />
            <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
              <span>{stageLabel(status?.progress?.stage ?? "queued")}</span>
              <span className="font-mono text-xs">{Math.round(progress)}%</span>
            </div>
          </div>
        ) : null}

        {state === "completed" && status?.files ? (
          <div className="space-y-4">
            <Alert tone="info">결과는 24시간 후 자동 삭제됩니다.</Alert>
            <div className="flex flex-wrap gap-2">
              {status.files.map((file, index) => (
                <a key={file.name} href={`/api/jobs/${job.jobId}/files/${encodeURIComponent(file.name)}`}>
                  <Button variant="secondary">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {resultFileLabel(file.name, index, status.files?.length ?? 1)}
                    <span className="font-mono text-xs text-slate-500">{formatBytes(file.bytes)}</span>
                  </Button>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            상태를 확인하는 중입니다.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function badgeForState(state: string, isLoading: boolean): { label: string; tone: "slate" | "blue" | "teal" | "rose" | "amber" } {
  if (isLoading) {
    return { label: "확인 중", tone: "slate" };
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

  return { label: "대기 중", tone: "amber" };
}

