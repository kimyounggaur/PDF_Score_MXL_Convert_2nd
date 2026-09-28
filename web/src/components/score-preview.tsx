"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import type { JobFile, JobWarning } from "@/lib/client-types";
import { cn, resultFileLabel } from "@/lib/ui";
import { Alert } from "./ui/alert";
import { Button, buttonClassName } from "./ui/button";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const PREVIEW_ERROR = "미리보기를 렌더링할 수 없습니다. 파일은 정상일 수 있으니 다운로드하여 MuseScore 등에서 열어보세요.";

type OsmdInstance = {
  Zoom: number;
  load(input: Blob): Promise<unknown>;
  render(): void;
  renderAndScrollBack(): void;
  clear(): void;
};

export function ScorePreview({
  jobId,
  files,
  sourcePages,
  warnings,
}: {
  jobId: string;
  files: JobFile[];
  sourcePages: number;
  warnings: JobWarning[];
}) {
  const [selectedName, setSelectedName] = useState(files[0]?.name ?? "");
  const [sourcePage, setSourcePage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [mobileTab, setMobileTab] = useState<"source" | "converted">("converted");
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OsmdInstance | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const loadVersionRef = useRef(0);
  const zoomRef = useRef(zoom);
  const tabsId = useId();
  const pageCount = Number.isSafeInteger(sourcePages) && sourcePages > 0 ? sourcePages : 1;
  const selectedFile = files.find((file) => file.name === selectedName);
  const partEntries = Object.entries(selectedFile?.measuresPerPart ?? {});
  const skippedPages = skippedPagesFromWarnings(warnings);
  const sourceUrl = `/api/jobs/${jobId}/source#page=${sourcePage}&view=FitH`;
  const sourcePanelId = `${tabsId}-source-panel`;
  const convertedPanelId = `${tabsId}-converted-panel`;

  zoomRef.current = zoom;

  useEffect(() => {
    if (files.some((file) => file.name === selectedName)) {
      return;
    }

    setSelectedName(files[0]?.name ?? "");
  }, [files, selectedName]);

  useEffect(() => {
    setSourcePage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncViewport = () => setIsDesktop(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    setCanFullscreen(Boolean(document.fullscreenEnabled && preview?.requestFullscreen));
    let renderFrame = 0;

    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === preview);
      renderFrame = window.requestAnimationFrame(() => {
        if (loadedKeyRef.current && osmdRef.current) {
          osmdRef.current.renderAndScrollBack();
        }
      });
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.cancelAnimationFrame(renderFrame);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !loadedKeyRef.current) {
      return;
    }

    try {
      osmd.Zoom = zoom / 100;
      osmd.renderAndScrollBack();
      setError(null);
    } catch {
      setError(PREVIEW_ERROR);
    }
  }, [zoom]);

  useEffect(() => {
    if ((!isDesktop && mobileTab !== "converted") || !loadedKeyRef.current || !osmdRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      try {
        osmdRef.current?.renderAndScrollBack();
      } catch {
        setError(PREVIEW_ERROR);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isDesktop, mobileTab]);

  useEffect(() => {
    if (!selectedName || !containerRef.current) {
      return;
    }

    const version = ++loadVersionRef.current;
    const controller = new AbortController();
    const key = `${jobId}:${selectedName}`;
    loadedKeyRef.current = null;
    setIsLoading(true);
    setError(null);

    // Never leave the previously selected movement visible while the next
    // one is loading (or after its request fails), which could misidentify
    // stale notation as the newly selected result.
    if (osmdRef.current) {
      try {
        osmdRef.current.clear();
      } catch {
        // Replacing the rendered nodes below is the authoritative cleanup.
      }
      containerRef.current.replaceChildren();
    }

    const renderScore = async () => {
      try {
        const [{ OpenSheetMusicDisplay }, response] = await Promise.all([
          import("opensheetmusicdisplay"),
          fetch(`/api/jobs/${jobId}/files/${encodeURIComponent(selectedName)}`, { signal: controller.signal }),
        ]);
        if (!response.ok) {
          throw new Error("preview_fetch_failed");
        }

        const blob = await response.blob();
        if (controller.signal.aborted || loadVersionRef.current !== version || !containerRef.current) {
          return;
        }

        let osmd = osmdRef.current;
        if (!osmd) {
          osmd = new OpenSheetMusicDisplay(containerRef.current, {
            backend: "svg",
            autoResize: true,
            drawTitle: true,
          }) as OsmdInstance;
          osmdRef.current = osmd;
        }
        await osmd.load(blob);

        if (controller.signal.aborted || loadVersionRef.current !== version || osmdRef.current !== osmd) {
          return;
        }

        // The user can move the slider while load() is pending. Apply the
        // latest value after loading so the displayed percentage and score
        // scale cannot diverge.
        osmd.Zoom = zoomRef.current / 100;
        osmd.render();
        loadedKeyRef.current = key;
      } catch (caught) {
        if (!controller.signal.aborted && loadVersionRef.current === version && !isAbortError(caught)) {
          setError(PREVIEW_ERROR);
        }
      } finally {
        if (loadVersionRef.current === version) {
          setIsLoading(false);
        }
      }
    };

    void renderScore();
    return () => controller.abort();
  }, [jobId, selectedName]);

  useEffect(
    () => () => {
      loadVersionRef.current += 1;
      osmdRef.current?.clear();
      osmdRef.current = null;
      loadedKeyRef.current = null;
    },
    [],
  );

  const changeZoom = (value: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)));
  };

  const toggleFullscreen = async () => {
    setControlError(null);

    try {
      if (document.fullscreenElement === previewRef.current) {
        await document.exitFullscreen();
      } else if (previewRef.current?.requestFullscreen) {
        await previewRef.current.requestFullscreen();
      }
    } catch {
      setControlError("전체 화면을 열 수 없습니다. 브라우저 설정을 확인해 주세요.");
    }
  };

  return (
    <div
      ref={previewRef}
      className={cn(
        "mt-4 min-w-0 space-y-4 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4",
        isFullscreen && "h-screen w-screen rounded-none border-0 bg-white",
      )}
      data-testid="score-preview"
      aria-busy={isLoading}
    >
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <Alert tone="warning" className="min-w-0 lg:flex-1">
          자동 인식 결과입니다. 잇단음표·꾸밈음 등은 원본과 다를 수 있으니 다운로드 후 편집 프로그램에서 확인하세요.
        </Alert>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {files.length > 1 ? (
            <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
              결과
              <select
                className="h-10 min-w-0 max-w-48 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={selectedName}
                onChange={(event) => setSelectedName(event.target.value)}
                disabled={isLoading}
              >
                {files.map((file, index) => (
                  <option key={file.name} value={file.name}>
                    {resultFileLabel(file.name, index, files.length)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void toggleFullscreen()}
            disabled={!canFullscreen}
            aria-pressed={isFullscreen}
            data-testid="preview-fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            {isFullscreen ? "전체 화면 닫기" : "전체 화면"}
          </Button>
        </div>
      </div>

      {typeof selectedFile?.measureCount === "number" || partEntries.length > 0 || skippedPages.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm" data-testid="preview-summary">
          {typeof selectedFile?.measureCount === "number" ? (
            <div className="flex gap-1">
              <dt className="font-medium text-slate-600">총 마디:</dt>
              <dd className="text-slate-950">{selectedFile.measureCount}개</dd>
            </div>
          ) : null}
          {partEntries.length > 0 ? (
            <>
              <div className="flex gap-1">
                <dt className="font-medium text-slate-600">파트:</dt>
                <dd className="text-slate-950">{partEntries.length}개</dd>
              </div>
              <div className="flex min-w-0 flex-wrap gap-1">
                <dt className="font-medium text-slate-600">파트별 마디:</dt>
                <dd className="break-words text-slate-950">
                  {partEntries.map(([partId, count]) => `${partId} ${count}마디`).join(" · ")}
                </dd>
              </div>
            </>
          ) : null}
          {skippedPages.length > 0 ? (
            <div className="flex gap-1">
              <dt className="font-medium text-slate-600">인식 제외:</dt>
              <dd className="text-slate-950">{skippedPages.join(", ")}쪽</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {controlError ? (
        <Alert tone="error" role="alert">
          {controlError}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:hidden" role="tablist" aria-label="미리보기 선택">
        <Button
          type="button"
          variant={mobileTab === "source" ? "primary" : "secondary"}
          role="tab"
          id={`${tabsId}-source-tab`}
          aria-selected={mobileTab === "source"}
          aria-controls={sourcePanelId}
          onClick={() => setMobileTab("source")}
        >
          원본
        </Button>
        <Button
          type="button"
          variant={mobileTab === "converted" ? "primary" : "secondary"}
          role="tab"
          id={`${tabsId}-converted-tab`}
          aria-selected={mobileTab === "converted"}
          aria-controls={convertedPanelId}
          onClick={() => setMobileTab("converted")}
        >
          변환 결과
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section
          id={sourcePanelId}
          role="tabpanel"
          aria-labelledby={`${tabsId}-source-tab`}
          className={cn("min-w-0 space-y-3", mobileTab === "source" ? "block" : "hidden", "lg:block")}
          data-testid="source-preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-950">원본 PDF</h3>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              원본 쪽
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                value={sourcePage}
                onChange={(event) => setSourcePage(Number(event.target.value))}
                aria-label="원본 PDF 쪽"
              >
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                  <option key={page} value={page}>
                    {page}쪽
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isDesktop ? (
            <iframe
              className="h-[70vh] min-h-[620px] w-full rounded-md border border-slate-200 bg-white"
              src={sourceUrl}
              title={`원본 PDF ${sourcePage}쪽`}
            />
          ) : (
            <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600 lg:hidden">
              <p>모바일 브라우저에서는 원본 PDF를 새 탭에서 확인해 주세요.</p>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonClassName({ variant: "secondary", className: "mt-4 max-w-full" })}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                원본 {sourcePage}쪽 새 탭에서 열기
              </a>
            </div>
          )}
        </section>

        <section
          id={convertedPanelId}
          role="tabpanel"
          aria-labelledby={`${tabsId}-converted-tab`}
          className={cn("min-w-0 space-y-3", mobileTab === "converted" ? "block" : "hidden", "lg:block")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-950">변환 결과</h3>
            <div className="flex max-w-full items-center gap-1" aria-label="악보 확대·축소">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => changeZoom(zoom - ZOOM_STEP)}
                disabled={zoom <= MIN_ZOOM}
                aria-label="악보 축소"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                onChange={(event) => changeZoom(Number(event.target.value))}
                className="w-24 sm:w-32"
                aria-label="악보 확대 비율"
                aria-valuetext={`${zoom}%`}
              />
              <output className="w-12 text-center font-mono text-xs text-slate-600" aria-live="polite">
                {zoom}%
              </output>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => changeZoom(zoom + ZOOM_STEP)}
                disabled={zoom >= MAX_ZOOM}
                aria-label="악보 확대"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {error ? <Alert tone="error">{error}</Alert> : null}
          {isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 rounded-md bg-white text-sm text-slate-500" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              미리보기를 렌더링하는 중입니다.
            </div>
          ) : null}
          <div
            ref={containerRef}
            className="min-h-48 max-w-full overflow-auto rounded-md bg-white p-3 sm:p-4"
            role="region"
            aria-label="변환된 악보 미리보기"
            data-testid="converted-score"
          />
        </section>
      </div>
    </div>
  );
}

function skippedPagesFromWarnings(warnings: JobWarning[]) {
  return [...new Set(warnings.flatMap((warning) => warning.pages))].sort((left, right) => left - right);
}

function isAbortError(value: unknown) {
  return value instanceof DOMException && value.name === "AbortError";
}
