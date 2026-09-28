"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ExternalLink, Loader2, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { JobFile, JobWarning } from "@/lib/client-types";
import { cn, resultFileLabel } from "@/lib/ui";
import { Alert } from "./ui/alert";
import { Button, buttonClassName } from "./ui/button";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;
const PREVIEW_ERROR = "미리보기를 렌더링할 수 없습니다. 파일은 정상일 수 있으니 다운로드하여 MuseScore 등에서 열어보세요.";

export type ScorePreviewTarget = {
  file: string;
  measure: number;
  requestId: number;
};

export function ScorePreview({
  jobId,
  files,
  sourcePages,
  warnings,
  measureTarget,
}: {
  jobId: string;
  files: JobFile[];
  sourcePages: number;
  warnings: JobWarning[];
  measureTarget: ScorePreviewTarget | null;
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
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [navigationStatus, setNavigationStatus] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceTabRef = useRef<HTMLButtonElement>(null);
  const convertedTabRef = useRef<HTMLButtonElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const loadVersionRef = useRef(0);
  const zoomRef = useRef(zoom);
  const selectedNameRef = useRef(selectedName);
  const activeTargetRef = useRef<ScorePreviewTarget | null>(null);
  const tabsId = useId();
  const pageCount = Number.isSafeInteger(sourcePages) && sourcePages > 0 ? sourcePages : 1;
  const selectedFile = files.find((file) => file.name === selectedName);
  const partEntries = Object.entries(selectedFile?.measuresPerPart ?? {});
  const skippedPages = skippedPagesFromWarnings(warnings);
  const sourceUrl = `/api/jobs/${jobId}/source#page=${sourcePage}&view=FitH`;
  const sourcePanelId = `${tabsId}-source-panel`;
  const convertedPanelId = `${tabsId}-converted-panel`;

  zoomRef.current = zoom;
  selectedNameRef.current = selectedName;

  const revealActiveTarget = useCallback((osmd: OpenSheetMusicDisplay, fileName: string) => {
    const target = activeTargetRef.current;
    if (!target || target.file !== fileName) {
      return;
    }

    if (revealSuspectMeasure(osmd, target.measure)) {
      setNavigationError(null);
      setNavigationStatus(`${target.measure}마디를 표시했습니다.`);
    } else {
      setNavigationStatus("");
      setNavigationError(`${target.measure}마디 위치를 표시하지 못했습니다. 악보에서 직접 확인해 주세요.`);
    }
  }, []);

  useEffect(() => {
    activeTargetRef.current = measureTarget;
  }, [measureTarget]);

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
          revealActiveTarget(osmdRef.current, selectedNameRef.current);
        }
      });
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.cancelAnimationFrame(renderFrame);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [revealActiveTarget]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !loadedKeyRef.current) {
      return;
    }

    try {
      osmd.Zoom = zoom / 100;
      osmd.renderAndScrollBack();
      revealActiveTarget(osmd, selectedNameRef.current);
      setError(null);
    } catch {
      setError(PREVIEW_ERROR);
    }
  }, [revealActiveTarget, zoom]);

  useEffect(() => {
    if ((!isDesktop && mobileTab !== "converted") || !loadedKeyRef.current || !osmdRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      try {
        osmdRef.current?.renderAndScrollBack();
        if (osmdRef.current) {
          revealActiveTarget(osmdRef.current, selectedNameRef.current);
        }
      } catch {
        setError(PREVIEW_ERROR);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isDesktop, mobileTab, revealActiveTarget]);

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
    setNavigationError(null);

    // Never leave the previously selected movement visible while the next
    // one is loading (or after its request fails), which could misidentify
    // stale notation as the newly selected result.
    if (osmdRef.current) {
      hideSuspectMeasure(osmdRef.current);
      try {
        osmdRef.current.clear();
      } catch {
        // Replacing the rendered nodes below is the authoritative cleanup.
      }
      containerRef.current.replaceChildren();
    }

    const renderScore = async () => {
      try {
        const [{ CursorType, OpenSheetMusicDisplay }, response] = await Promise.all([
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
            followCursor: false,
            pageBackgroundColor: "#FFFFFF",
            cursorsOptions: [
              {
                type: CursorType.CurrentArea,
                color: "#B1304A",
                alpha: 0.18,
                follow: false,
              },
            ],
          });
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
        revealActiveTarget(osmd, selectedName);
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
  }, [jobId, revealActiveTarget, selectedName]);

  useEffect(() => {
    if (!measureTarget || activeTargetRef.current?.requestId !== measureTarget.requestId) {
      return;
    }

    setMobileTab("converted");
    setNavigationError(null);
    setNavigationStatus("");

    if (!files.some((file) => file.name === measureTarget.file)) {
      activeTargetRef.current = null;
      if (osmdRef.current) {
        hideSuspectMeasure(osmdRef.current);
      }
      setNavigationError(`${measureTarget.measure}마디의 결과 파일을 찾지 못했습니다. 악보에서 직접 확인해 주세요.`);
      return;
    }

    if (selectedNameRef.current !== measureTarget.file) {
      setSelectedName(measureTarget.file);
      return;
    }

    if (loadedKeyRef.current !== `${jobId}:${measureTarget.file}` || !osmdRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (osmdRef.current) {
        revealActiveTarget(osmdRef.current, measureTarget.file);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [files, jobId, measureTarget, revealActiveTarget]);

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

  const selectResultFile = (name: string) => {
    activeTargetRef.current = null;
    setNavigationError(null);
    setNavigationStatus("");
    if (osmdRef.current) {
      hideSuspectMeasure(osmdRef.current);
    }
    setSelectedName(name);
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

  const moveMobileTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextTab: "source" | "converted" | null = null;

    if (event.key === "Home") {
      nextTab = "source";
    } else if (event.key === "End") {
      nextTab = "converted";
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextTab = mobileTab === "source" ? "converted" : "source";
    }

    if (!nextTab) {
      return;
    }

    event.preventDefault();
    setMobileTab(nextTab);
    (nextTab === "source" ? sourceTabRef : convertedTabRef).current?.focus();
  };

  return (
    <div
      ref={previewRef}
      className={cn(
        "mt-5 min-w-0 space-y-5 overflow-auto border-y border-[#BCC7D0] bg-[#F6F8FA] px-0 py-5 text-[#17232D]",
        isFullscreen && "h-screen w-screen border-0 bg-[#F6F8FA] p-4 sm:p-6",
      )}
      data-testid="score-preview"
      aria-busy={isLoading}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <Alert tone="warning" className="min-w-0 rounded-none border-x-0 border-y-[#BCC7D0] bg-transparent px-0 text-[#17232D] lg:flex-1">
          자동 인식 결과입니다. 잇단음표·꾸밈음 등은 원본과 다를 수 있으니 다운로드 후 편집 프로그램에서 확인하세요.
        </Alert>
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {files.length > 1 ? (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-[#596873] sm:flex-none">
              결과
              <select
                className="h-11 min-w-0 flex-1 border border-[#596873] bg-white px-3 text-sm text-[#17232D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245C9E] sm:max-w-48"
                value={selectedName}
                onChange={(event) => selectResultFile(event.target.value)}
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
        <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-[#BCC7D0] bg-white px-3 py-3 text-sm sm:px-4" data-testid="preview-summary">
          {typeof selectedFile?.measureCount === "number" ? (
            <div className="flex gap-1">
              <dt className="font-semibold text-[#596873]">총 마디:</dt>
              <dd className="tabular-nums text-[#17232D]">{selectedFile.measureCount}개</dd>
            </div>
          ) : null}
          {partEntries.length > 0 ? (
            <>
              <div className="flex gap-1">
                <dt className="font-semibold text-[#596873]">파트:</dt>
                <dd className="tabular-nums text-[#17232D]">{partEntries.length}개</dd>
              </div>
              <div className="flex min-w-0 flex-wrap gap-1">
                <dt className="font-semibold text-[#596873]">파트별 마디:</dt>
                <dd className="break-words text-[#17232D]">
                  {partEntries.map(([partId, count]) => `${partId} ${count}마디`).join(" · ")}
                </dd>
              </div>
            </>
          ) : null}
          {skippedPages.length > 0 ? (
            <div className="flex gap-1">
              <dt className="font-semibold text-[#596873]">인식 제외:</dt>
              <dd className="tabular-nums text-[#B1304A]">{skippedPages.join(", ")}쪽</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {controlError ? (
        <Alert tone="error" role="alert">
          {controlError}
        </Alert>
      ) : null}

      {navigationError ? (
        <Alert tone="warning" role="status" data-testid="measure-navigation-error">
          {navigationError}
        </Alert>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" data-testid="measure-navigation-status">
        {navigationStatus}
      </p>

      <div className="grid grid-cols-2 border-b border-[#BCC7D0] lg:hidden" role="tablist" aria-label="미리보기 선택">
        <Button
          ref={sourceTabRef}
          type="button"
          variant={mobileTab === "source" ? "primary" : "secondary"}
          role="tab"
          id={`${tabsId}-source-tab`}
          aria-selected={mobileTab === "source"}
          aria-controls={sourcePanelId}
          tabIndex={mobileTab === "source" ? 0 : -1}
          onClick={() => setMobileTab("source")}
          onKeyDown={moveMobileTab}
          className="rounded-none border-0 border-b-2"
        >
          원본
        </Button>
        <Button
          ref={convertedTabRef}
          type="button"
          variant={mobileTab === "converted" ? "primary" : "secondary"}
          role="tab"
          id={`${tabsId}-converted-tab`}
          aria-selected={mobileTab === "converted"}
          aria-controls={convertedPanelId}
          tabIndex={mobileTab === "converted" ? 0 : -1}
          onClick={() => setMobileTab("converted")}
          onKeyDown={moveMobileTab}
          className="rounded-none border-0 border-b-2"
        >
          변환 결과
        </Button>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:gap-0 lg:border-y lg:border-[#BCC7D0]">
        <section
          id={sourcePanelId}
          role="tabpanel"
          aria-labelledby={`${tabsId}-source-tab`}
          className={cn("min-w-0 space-y-3 lg:py-5 lg:pr-5", mobileTab === "source" ? "block" : "hidden", "lg:block")}
          data-testid="source-preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#17232D]">원본 PDF</h3>
            <label className="flex items-center gap-2 text-sm font-medium text-[#596873]">
              원본 쪽
              <select
                className="h-11 border border-[#596873] bg-white px-2 text-sm text-[#17232D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#245C9E]"
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
              className="h-[70vh] min-h-[620px] w-full border border-[#BCC7D0] bg-white"
              src={sourceUrl}
              title={`원본 PDF ${sourcePage}쪽`}
            />
          ) : (
            <div className="border border-[#BCC7D0] bg-white p-4 text-sm leading-6 text-[#596873] sm:p-5 lg:hidden">
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
          className={cn("min-w-0 space-y-3 lg:border-l lg:border-[#BCC7D0] lg:py-5 lg:pl-5", mobileTab === "converted" ? "block" : "hidden", "lg:block")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#17232D]">변환 결과</h3>
            <div className="flex w-full max-w-full items-center gap-1 sm:w-auto" aria-label="악보 확대·축소">
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
                className="min-h-11 min-w-0 flex-1 accent-[#245C9E] sm:w-32 sm:flex-none"
                aria-label="악보 확대 비율"
                aria-valuetext={`${zoom}%`}
              />
              <output className="w-12 text-center text-sm font-semibold tabular-nums text-[#245C9E]" aria-live="polite">
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
            <div className="flex h-48 items-center justify-center gap-2 border border-[#BCC7D0] bg-white text-sm text-[#596873]" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
              미리보기를 렌더링하는 중입니다.
            </div>
          ) : null}
          <div
            ref={containerRef}
            className="min-h-48 max-w-full overflow-auto border border-[#BCC7D0] bg-white p-3 sm:p-4"
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

function hideSuspectMeasure(osmd: OpenSheetMusicDisplay) {
  const cursor = osmd.cursor;
  if (!cursor) {
    return;
  }

  cursor.hide();
  cursor.cursorElement.removeAttribute("data-testid");
  cursor.cursorElement.removeAttribute("data-measure");
}

function revealSuspectMeasure(osmd: OpenSheetMusicDisplay, measure: number) {
  try {
    const cursor = osmd.cursor;
    if (!cursor) {
      return false;
    }

    hideSuspectMeasure(osmd);
    const sourceMeasure = osmd.Sheet.SourceMeasures[measure - 1];
    if (!sourceMeasure) {
      return false;
    }

    const iterator = osmd.Sheet.MusicPartManager.getIterator(sourceMeasure.AbsoluteTimestamp);
    if (iterator.CurrentMeasure?.measureListIndex !== sourceMeasure.measureListIndex) {
      return false;
    }

    cursor.iterator = iterator;
    cursor.show();
    cursor.cursorElement.setAttribute("data-testid", "suspect-measure-highlight");
    cursor.cursorElement.setAttribute("data-measure", String(measure));
    cursor.cursorElement.setAttribute("aria-hidden", "true");
    cursor.cursorElement.alt = "";
    cursor.cursorElement.style.minHeight = "44px";
    cursor.cursorElement.style.pointerEvents = "none";

    try {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      cursor.cursorElement.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
    } catch {
      // The highlight itself is still useful when scrolling is unavailable.
    }

    return true;
  } catch {
    return false;
  }
}
