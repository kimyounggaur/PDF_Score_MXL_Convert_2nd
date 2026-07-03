"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Info, Loader2, Music2, ShieldCheck } from "lucide-react";
import { useDropzone } from "react-dropzone";
import type { StoredJob } from "@/lib/client-types";
import { cn } from "@/lib/ui";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { JobCard } from "./job-card";

const STORAGE_KEY = "pdf-score-mxl:jobs";

export function UploadApp() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [message, setMessage] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setJobs(JSON.parse(raw) as StoredJob[]);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage({ tone: "error", text: data?.error?.message ?? "업로드에 실패했습니다." });
        return;
      }

      const nextJob: StoredJob = {
        jobId: data.jobId,
        fileName: file.name,
        createdAt: new Date().toISOString(),
      };
      setJobs((current) => [nextJob, ...current.filter((job) => job.jobId !== nextJob.jobId)]);
      setMessage({ tone: "info", text: "업로드가 완료되어 변환 대기열에 등록했습니다." });
    } catch {
      setMessage({ tone: "error", text: "업로드 중 문제가 발생했습니다. 다시 시도해 주세요." });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    multiple: false,
    maxSize: 30 * 1024 * 1024,
    accept: {
      "application/pdf": [".pdf"],
    },
    onDropRejected: () => {
      setMessage({ tone: "error", text: "PDF 파일만 업로드할 수 있으며 최대 크기는 30MB입니다." });
    },
  });

  const notice = useMemo(
    () => [
      "인쇄 악보 전용입니다. 손글씨 악보는 지원하지 않습니다.",
      "300DPI 이상의 선명한 스캔본을 권장합니다.",
      "최대 30MB, 20쪽까지 변환할 수 있습니다.",
    ],
    [],
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8 lg:py-12">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-700">
              <Music2 className="h-4 w-4" aria-hidden="true" />
              PDF Score to MXL
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              PDF 악보 MXL 변환
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              인쇄 악보 PDF를 MusicXML(MXL)로 변환합니다.
            </p>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardContent>
              <div
                {...getRootProps()}
                className={cn(
                  "flex min-h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                  isDragActive ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-white",
                )}
              >
                <input {...getInputProps()} />
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-800">
                  {isUploading ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /> : <FileUp className="h-7 w-7" aria-hidden="true" />}
                </div>
                <p className="mt-5 text-lg font-semibold text-slate-950">
                  {isDragActive ? "여기에 놓으면 업로드합니다" : "PDF 악보를 끌어다 놓으세요"}
                </p>
                <p className="mt-2 text-sm text-slate-500">최대 30MB, 20쪽</p>
                <Button className="mt-6" onClick={open} disabled={isUploading}>
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  PDF 선택
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Alert tone="warning">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <ul className="space-y-1">
                  {notice.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </Alert>
            <Alert tone="info">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>파일명은 저장 경로에 사용하지 않고, 결과는 24시간 후 자동 삭제됩니다.</span>
              </div>
            </Alert>
          </div>
        </section>

        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-950">작업 목록</h2>
            {jobs.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setJobs([])}>
                목록 비우기
              </Button>
            ) : null}
          </div>

          {jobs.length === 0 ? (
            <Card>
              <CardContent className="text-sm leading-6 text-slate-500">
                아직 변환 작업이 없습니다. PDF를 업로드하면 진행 상태가 여기에 표시됩니다.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <JobCard key={job.jobId} job={job} onRemove={(jobId) => setJobs((current) => current.filter((item) => item.jobId !== jobId))} />
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-slate-200 pt-5 text-sm text-slate-500">
          OMR 엔진: Audiveris 5.10.2 (AGPL-3.0) -{" "}
          <a className="font-medium text-teal-700 underline-offset-4 hover:underline" href="https://github.com/Audiveris/audiveris" target="_blank" rel="noreferrer">
            소스 코드
          </a>
        </footer>
      </div>
    </main>
  );
}

