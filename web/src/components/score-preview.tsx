"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { JobFile } from "@/lib/client-types";
import { resultFileLabel } from "@/lib/ui";
import { Alert } from "./ui/alert";

type OsmdInstance = {
  load(input: Blob): Promise<unknown>;
  render(): void;
  clear(): void;
};

export function ScorePreview({ jobId, files }: { jobId: string; files: JobFile[] }) {
  const [selectedName, setSelectedName] = useState(files[0]?.name ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OsmdInstance | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedName || !containerRef.current) {
      return;
    }

    let cancelled = false;
    const key = `${jobId}:${selectedName}`;

    const renderScore = async () => {
      if (loadedKeyRef.current === key && osmdRef.current) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");

        if (cancelled || !containerRef.current) {
          return;
        }

        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
            backend: "svg",
            autoResize: true,
            drawTitle: true,
          }) as OsmdInstance;
        } else {
          osmdRef.current.clear();
          containerRef.current.replaceChildren();
        }

        const response = await fetch(`/api/jobs/${jobId}/files/${encodeURIComponent(selectedName)}`);
        if (!response.ok) {
          throw new Error("preview_fetch_failed");
        }

        const blob = await response.blob();
        await osmdRef.current.load(blob);

        if (cancelled) {
          return;
        }

        osmdRef.current.render();
        loadedKeyRef.current = key;
      } catch {
        if (!cancelled) {
          setError("미리보기를 렌더링할 수 없습니다. 파일은 정상일 수 있으니 다운로드하여 MuseScore 등에서 열어보세요.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void renderScore();

    return () => {
      cancelled = true;
    };
  }, [jobId, selectedName]);

  return (
    <div
      className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
      data-testid="score-preview"
      aria-busy={isLoading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Alert tone="warning" className="sm:flex-1">
          자동 인식 결과입니다. 잇단음표·꾸밈음 등은 원본과 다를 수 있으니 다운로드 후 편집 프로그램에서 확인하세요.
        </Alert>
        {files.length > 1 ? (
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
            파일
            <select
              className="h-10 min-w-36 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={selectedName}
              onChange={(event) => {
                loadedKeyRef.current = null;
                setSelectedName(event.target.value);
              }}
            >
              {files.map((file, index) => (
                <option key={file.name} value={file.name}>
                  {resultFileLabel(file.name, index, files.length)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center gap-2 rounded-md bg-white text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          미리보기를 렌더링하는 중입니다.
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="min-h-48 overflow-auto rounded-md bg-white p-4"
        role="region"
        aria-label="변환된 악보 미리보기"
      />
    </div>
  );
}
