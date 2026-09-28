"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Info, Loader2, ShieldCheck, X } from "lucide-react";
import { useDropzone, type FileRejection } from "react-dropzone";
import type { StoredJob } from "@/lib/client-types";
import { deserializeStoredJobs, pruneStoredJobs, serializeStoredJobs, STORED_JOBS_KEY } from "@/lib/job-storage";
import { dropRejectionMessage, cn } from "@/lib/ui";
import { UploadError, uploadPdfWithXhr } from "@/lib/xhr-upload";
import { useServiceStatus } from "@/hooks/use-service-status";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { JobCard } from "./job-card";
import { Progress } from "./ui/progress";

type UploadState = {
  fileName: string;
  current: number;
  total: number;
  percent: number;
  phase: "transferring" | "verifying";
};

const UPLOAD_NOTICES = [
  "인쇄 악보 전용입니다. 손글씨 악보는 지원하지 않습니다.",
  "300DPI 이상의 선명한 스캔본을 권장합니다.",
  "최대 30MB, 20쪽까지 변환할 수 있습니다.",
  "보안이 설정된 PDF(열람 암호 또는 권한 제한)는 변환할 수 없습니다. 보안이 없는 원본 PDF로 다시 올려 주세요.",
];

export function UploadApp() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const batchSequenceRef = useRef(0);
  const activeBatchRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const mountedRef = useRef(false);
  const { status: serviceStatus, isChecking: isCheckingService, isUnavailable, canUpload } = useServiceStatus();
  const clock = useSharedClock(jobs.length > 0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      activeBatchRef.current?.controller.abort();
      activeBatchRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      setJobs(deserializeStoredJobs(window.localStorage.getItem(STORED_JOBS_KEY)));
    } catch {
      setJobs([]);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(STORED_JOBS_KEY, serializeStoredJobs(jobs));
    } catch {
      // 저장 공간이 차도 현재 탭의 작업 목록과 변환은 계속 사용할 수 있다.
    }
  }, [isHydrated, jobs]);

  const uploadFiles = useCallback(async (files: File[], rejectedMessage: string | null = null) => {
    if (activeBatchRef.current) {
      return;
    }

    if (files.length === 0) {
      if (rejectedMessage) {
        setMessage({ tone: "error", text: rejectedMessage });
      }
      return;
    }

    const batchId = ++batchSequenceRef.current;
    const controller = new AbortController();
    activeBatchRef.current = { id: batchId, controller };
    setIsUploading(true);
    setMessage(rejectedMessage ? { tone: "error", text: rejectedMessage } : null);
    let successCount = 0;
    const failures: string[] = [];

    for (const [index, file] of files.slice(0, 5).entries()) {
      if (controller.signal.aborted) {
        break;
      }

      setUploadState({ fileName: file.name, current: index + 1, total: files.length, percent: 0, phase: "transferring" });

      try {
        const result = await uploadPdfWithXhr(file, {
          signal: controller.signal,
          onProgress: ({ percent }) => {
            if (mountedRef.current && activeBatchRef.current?.id === batchId) {
              setUploadState({ fileName: file.name, current: index + 1, total: files.length, percent, phase: "transferring" });
            }
          },
          onTransferComplete: () => {
            if (mountedRef.current && activeBatchRef.current?.id === batchId) {
              setUploadState((current) =>
                current ? { ...current, percent: 100, phase: "verifying" } : current,
              );
            }
          },
        });

        if (!mountedRef.current || activeBatchRef.current?.id !== batchId) {
          return;
        }

        const nextJob: StoredJob = {
          jobId: result.jobId,
          fileName: file.name,
          createdAt: new Date().toISOString(),
        };
        setJobs((current) => pruneStoredJobs([nextJob, ...current]));
        successCount += 1;
      } catch (caught) {
        if (caught instanceof UploadError && caught.kind === "aborted") {
          break;
        }

        const reason = caught instanceof Error ? caught.message : "업로드 중 문제가 발생했습니다. 다시 시도해 주세요.";
        failures.push(`${file.name}: ${reason}`);
      }
    }

    if (!mountedRef.current || activeBatchRef.current?.id !== batchId) {
      return;
    }

    const wasAborted = controller.signal.aborted;
    activeBatchRef.current = null;
    setUploadState(null);
    setIsUploading(false);

    if (wasAborted) {
      const suffix = successCount > 0 ? ` 먼저 등록된 ${successCount}개 작업은 계속 변환됩니다.` : "";
      setMessage({ tone: "info", text: `업로드를 취소했습니다.${suffix}` });
    } else if (failures.length > 0) {
      setMessage({ tone: "error", text: failures.join(" / ") });
    } else if (rejectedMessage) {
      setMessage({ tone: "error", text: rejectedMessage });
    } else {
      setMessage({
        tone: "info",
        text: successCount === 1 ? "업로드가 완료되어 변환 대기열에 등록했습니다." : `${successCount}개 파일을 변환 대기열에 등록했습니다.`,
      });
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (!canUpload) {
        return;
      }

      const rejection = rejectionMessage(fileRejections);
      void uploadFiles(acceptedFiles, rejection);
    },
    [canUpload, uploadFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    disabled: isUploading || !canUpload,
    multiple: true,
    maxFiles: 5,
    maxSize: 30 * 1024 * 1024,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  const removeJob = useCallback((jobId: string) => {
    setJobs((current) => current.filter((item) => item.jobId !== jobId));
  }, []);

  const replaceJob = useCallback((jobId: string, replacement: StoredJob) => {
    setJobs((current) => pruneStoredJobs([replacement, ...current.filter((item) => item.jobId !== jobId)]));
  }, []);

  const cancelUpload = useCallback(() => {
    activeBatchRef.current?.controller.abort();
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F6F8FA] text-[#17232D]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-9 lg:gap-10 lg:px-10 lg:py-12">
        {isUnavailable ? (
          <Alert tone="warning" role="status" aria-live="polite" data-testid="service-status-banner">
            변환 서버를 점검하고 있습니다. 잠시 후 다시 시도해 주세요.
          </Alert>
        ) : null}

        <header className="relative border-b-2 border-[#17232D] pb-7 pt-1 sm:pb-9">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
            <div className="min-w-0 border-l-4 border-[#245C9E] pl-4 sm:pl-6">
              <h1 className="text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-[#17232D]">
                PDF 악보 MXL 변환
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#596873] sm:text-lg">
                인쇄 악보 PDF를 MusicXML(MXL)로 변환합니다.
              </p>
            </div>

            <div className="border-y border-[#BCC7D0] py-3 text-sm leading-6 text-[#596873]">
              PDF를 올리면 악보를 인식하고, 원본과 변환 결과를 나란히 확인할 수 있습니다.
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8" aria-labelledby="upload-heading">
          <Card className="rounded-none border-[#BCC7D0] bg-white shadow-none">
            <CardContent className="p-0">
              <div
                {...getRootProps()}
                className={cn(
                  "relative flex min-h-72 flex-col items-center justify-center border-l-4 px-4 py-10 text-center motion-safe:transition-colors sm:px-8 sm:py-12",
                  isDragActive ? "border-[#245C9E] bg-[#EEF4FA]" : "border-[#BCC7D0] bg-white",
                  !canUpload && "cursor-not-allowed",
                )}
              >
                <input {...getInputProps({ "aria-label": "PDF 악보 파일 선택" })} />
                <p id="upload-heading" className="absolute left-4 top-4 text-sm font-semibold text-[#245C9E] sm:left-6 sm:top-5">
                  새 악보 등록
                </p>
                <div className="flex h-14 w-14 items-center justify-center border border-[#245C9E] bg-[#EEF4FA] text-[#245C9E]">
                  {isUploading ? <Loader2 className="h-7 w-7 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileUp className="h-7 w-7" aria-hidden="true" />}
                </div>
                <p className="mt-5 text-lg font-semibold text-[#17232D] sm:text-xl">
                  {isDragActive ? "여기에 놓으면 업로드합니다" : "PDF 악보를 끌어다 놓으세요"}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#596873]">한 번에 5개 · 파일당 최대 30MB, 20쪽</p>
                <Button className="mt-6" onClick={open} disabled={isUploading || !canUpload}>
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  {isCheckingService && !serviceStatus ? "서버 확인 중" : "PDF 선택"}
                </Button>
                {uploadState ? (
                  <div className="mt-6 w-full max-w-md space-y-3" aria-live="polite" data-testid="upload-status">
                    <div className="flex min-w-0 flex-col gap-1 text-left text-sm text-[#596873] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="min-w-0 truncate">
                        {uploadState.current}/{uploadState.total} · {uploadState.fileName}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#245C9E]">
                        {uploadState.phase === "transferring" ? `${uploadState.percent}%` : "서버 확인 중"}
                      </span>
                    </div>
                    <Progress
                      value={uploadState.percent}
                      label={`${uploadState.fileName} 업로드`}
                      testId="upload-progress"
                    />
                    {uploadState.phase === "transferring" ? (
                      <Button type="button" variant="danger" size="sm" onClick={cancelUpload} data-testid="cancel-upload">
                        <X className="h-4 w-4" aria-hidden="true" />
                        업로드 취소
                      </Button>
                    ) : (
                      <p className="text-sm text-[#596873]">파일 전송을 마쳤습니다. PDF를 확인하고 있습니다.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-4 border-t-2 border-[#17232D] pt-4" aria-label="업로드 안내">
            <Alert tone="warning" className="rounded-none border-x-0 border-b-0 border-t-[#BCC7D0] bg-transparent px-0 py-4 text-[#17232D]">
              <div className="flex items-start gap-2">
                <Info className="mt-1 h-4 w-4 shrink-0 text-[#B1304A]" aria-hidden="true" />
                <ul className="space-y-2 leading-6">
                  {UPLOAD_NOTICES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </Alert>
            <Alert tone="info" className="rounded-none border-x-0 border-b-0 border-t-[#BCC7D0] bg-transparent px-0 py-4 text-[#17232D]">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[#245C9E]" aria-hidden="true" />
                <span>파일명은 저장 경로에 사용하지 않고, 결과는 24시간 후 자동 삭제됩니다.</span>
              </div>
            </Alert>
          </aside>
        </section>

        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

        <section className="space-y-5 border-t-2 border-[#17232D] pt-5" aria-labelledby="job-list-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="job-list-heading" className="text-xl font-semibold tracking-[-0.015em] text-[#17232D] sm:text-2xl">작업 목록</h2>
            {jobs.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setJobs([])}>
                목록 비우기
              </Button>
            ) : null}
          </div>

          {jobs.length === 0 ? (
            <Card className="rounded-none border-x-0 border-y border-[#BCC7D0] bg-transparent shadow-none">
              <CardContent className="px-0 py-6 text-sm leading-6 text-[#596873]">
                아직 변환 작업이 없습니다. PDF를 업로드하면 진행 상태가 여기에 표시됩니다.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {jobs.map((job) => (
                <JobCard key={job.jobId} job={job} clock={clock} onRemove={removeJob} onReplace={replaceJob} />
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-[#BCC7D0] pt-5 text-sm leading-6 text-[#596873]">
          OMR 엔진: Audiveris {serviceStatus?.engineVersion ?? "확인 중"} (AGPL-3.0) -{" "}
          <a className="font-semibold text-[#245C9E] underline-offset-4 hover:underline" href="https://github.com/Audiveris/audiveris" target="_blank" rel="noreferrer">
            소스 코드
          </a>
        </footer>
      </div>
    </main>
  );
}

function rejectionMessage(fileRejections: FileRejection[]) {
  if (fileRejections.length === 0) {
    return null;
  }

  return dropRejectionMessage(fileRejections.flatMap((rejection) => rejection.errors.map((error) => error.code)));
}

function useSharedClock(enabled: boolean) {
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return clock;
}

