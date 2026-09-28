import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMxl } from "../../worker/src/validate-mxl";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const conversionTimeout = 20 * 60 * 1000;
const previewTimeout = 60_000;

test("A. simple.pdf는 쪽 진행률, 완료, 실제 악보 미리보기와 유효한 다운로드를 제공한다", async ({ page }, testInfo) => {
  await page.goto("/");
  const card = await uploadPdf(page, "simple.pdf");

  const progress = card.getByTestId("job-progress");
  await expect(progress).toBeVisible({ timeout: conversionTimeout });
  await expect(progress).toHaveAttribute("role", "progressbar");
  await expect(progress).toHaveAttribute("aria-valuetext", /^[12]\/2쪽 · .+ · \d+%$/);
  await expect(card.getByText(/^[12]\/2쪽 · .+$/)).toBeVisible();

  await expectCompleted(card);
  await openPreviewAndExpectNotes(card);

  const downloadPromise = page.waitForEvent("download");
  await card.getByTestId("download-link").first().click();
  const download = await downloadPromise;
  const downloadedPath = testInfo.outputPath("simple-result.mxl");
  await download.saveAs(downloadedPath);

  const validation = await validateMxl(downloadedPath);
  expect(validation.ok).toBe(true);
});

test("B. 텍스트 파일은 정확한 한국어 문구로 거부한다", async ({ page }) => {
  const textPath = path.join(tmpdir(), `not-pdf-${Date.now()}.txt`);
  await writeFile(textPath, "hello");

  try {
    await page.goto("/");
    await waitForUploadReady(page);
    await page.locator('input[type="file"]').setInputFiles(textPath);
    await expect(page.getByText("PDF가 아닙니다", { exact: true })).toBeVisible();
    await expect(page.getByTestId("job-card")).toHaveCount(0);
  } finally {
    await unlink(textPath).catch(() => undefined);
  }
});

test("C. bad.pdf는 ENGINE_ERROR가 아닌 정확한 NO_OUTPUT 실패를 보여 준다", async ({ page }) => {
  await page.goto("/");
  const card = await uploadPdf(page, "bad.pdf");
  const failure = card.getByTestId("job-error");

  await expect(failure).toHaveAttribute("data-error-code", "NO_OUTPUT", { timeout: conversionTimeout });
  await expect(failure).toHaveText(
    "악보를 인식하지 못했습니다. 표지만 있거나 악보가 아닌 PDF일 수 있습니다. 300DPI 이상의 선명한 인쇄 악보인지 확인해 주세요.",
  );
  await expect(card.getByTestId("job-status")).toHaveText("실패");
});

test("D. cover.pdf는 1쪽 제외 경고와 실제 악보 미리보기를 제공한다", async ({ page }) => {
  await page.goto("/");
  const card = await uploadPdf(page, "cover.pdf");

  await expectCompleted(card);
  const warning = card.getByTestId("job-warning");
  await expect(warning).toHaveAttribute("data-warning-code", "SKIPPED_PAGES");
  await expect(warning).toHaveText("1쪽은 악보로 인식되지 않아 제외했습니다.");
  await openPreviewAndExpectNotes(card);
});

test("D-2. cover.pdf의 2-3쪽만 고르면 제외 경고 없이 바로 완료된다", async ({ page }) => {
  await page.goto("/");
  await waitForUploadReady(page);
  await page.getByTestId("page-mode-custom").check();
  await page.getByTestId("page-range-input").fill("2-3");
  const card = await uploadPdf(page, "cover.pdf");

  await expectCompleted(card);
  await expect(card.getByTestId("job-warning")).toHaveCount(0);
  await openPreviewAndExpectNotes(card);
});

test("E. 연속 두 작업에서 두 번째 작업은 대기 순번을 거쳐 완료된다", async ({ page }) => {
  await page.goto("/");
  const firstCard = await uploadPdf(page, "simple.pdf");
  await expect(firstCard.getByTestId("job-status")).toHaveText("변환 중", { timeout: conversionTimeout });

  const secondCard = await uploadPdf(page, "multi.pdf");
  await expect(secondCard.getByTestId("job-status")).toHaveText("대기 중 · 1번째 순서", {
    timeout: conversionTimeout,
  });

  await expectCompleted(firstCard);
  await expectCompleted(secondCard);
});

test("F. 새로고침 후에도 등록된 작업 카드가 남는다", async ({ page }) => {
  await page.goto("/");
  await uploadPdf(page, "simple.pdf");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("pdf-score-mxl:jobs")))
    .toContain("simple.pdf");

  await page.reload();
  await expect(jobCardFor(page, "simple.pdf")).toBeVisible();
});

test("G. API는 21쪽 PDF와 존재하지 않는 작업을 정확한 코드로 거부한다", async ({ request }) => {
  const tooManyPages = await request.post("/api/jobs", {
    multipart: {
      file: {
        name: "pages21.pdf",
        mimeType: "application/pdf",
        buffer: await readFile(samplePath("pages21.pdf")),
      },
    },
  });

  expect(tooManyPages.status()).toBe(400);
  expect(await tooManyPages.json()).toEqual({
    error: {
      code: "TOO_MANY_PAGES",
      message: "전체 변환은 20쪽까지 가능합니다. 20쪽 이하의 범위를 선택하거나 파일을 나눠 주세요.",
    },
  });

  const unknown = await request.get("/api/jobs/00000000-0000-4000-8000-000000000000");
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toEqual({
    error: {
      code: "JOB_NOT_FOUND",
      message: "존재하지 않거나 만료된 작업입니다.",
    },
  });
});

test("H. mock 완료 작업의 확인 필요 마디는 파일 미리보기를 열고 해당 마디를 강조한다", async ({ page }, testInfo) => {
  const jobId = "11111111-1111-4111-8111-111111111111";
  const resultName = "mock-score.mxl";
  const createdAt = new Date().toISOString();
  const completedStatus = {
    status: "completed",
    progress: { pct: 100, stage: "completed", sheet: null },
    queuePosition: null,
    meta: {
      originalName: "mock-score.pdf",
      bytes: 1024,
      pages: 1,
      createdAt,
    },
    timing: {
      createdAt: Date.now() - 2_000,
      startedAt: Date.now() - 1_500,
      finishedAt: Date.now() - 500,
      elapsedMs: 1_000,
    },
    estimate: null,
    files: [
      {
        name: resultName,
        bytes: Buffer.byteLength(twoMeasureMusicXml),
        measureCount: 2,
        measuresPerPart: { P1: 2 },
      },
    ],
    warnings: [],
    suspectMeasures: [
      { file: resultName, part: "P1", measure: 2, reason: "DURATION_MISMATCH" },
      { file: resultName, part: "P2", measure: 2, reason: "DURATION_MISMATCH" },
      { file: resultName, part: "P1", measure: 9, reason: "DURATION_MISMATCH" },
    ],
    error: null,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ storedJob }) => {
      window.localStorage.setItem("pdf-score-mxl:jobs", JSON.stringify([storedJob]));
    },
    { storedJob: { jobId, fileName: "mock-score.pdf", createdAt } },
  );
  await page.route((url) => url.pathname === "/api/status", async (route) => {
    await route.fulfill({
      json: {
        redis: "ok",
        workers: 1,
        waiting: 0,
        active: 0,
        diskFreeBytes: 1_000_000_000,
        engineVersion: "mock",
      },
    });
  });
  await page.route((url) => url.pathname === `/api/jobs/${jobId}`, async (route) => {
    await route.fulfill({ json: completedStatus });
  });
  await page.route((url) => url.pathname === `/api/jobs/${jobId}/events`, async (route) => {
    await route.fulfill({
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: `retry: 60000\nevent: status\ndata: ${JSON.stringify(completedStatus)}\n\n`,
    });
  });
  await page.route((url) => url.pathname === `/api/jobs/${jobId}/files/${resultName}`, async (route) => {
    await route.fulfill({
      contentType: "application/vnd.recordare.musicxml+xml",
      body: twoMeasureMusicXml,
    });
  });

  await page.goto("/");
  const card = jobCardFor(page, "mock-score.pdf");
  const suspects = card.getByTestId("suspect-measures");
  await expect(card.getByTestId("job-status")).toHaveText("완료");
  await expect(suspects).toContainText("확인이 필요한 마디 2곳: 2, 9");
  await expect(suspects).toContainText("자동 점검 결과입니다. 표시된 마디는 원본과 비교해 보세요.");

  const measureButton = suspects.getByRole("button", { name: "2마디 미리보기로 이동" });
  await measureButton.click();
  const preview = card.getByTestId("score-preview");
  const convertedTab = preview.getByRole("tab", { name: "변환 결과" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: previewTimeout });
  await expect(convertedTab).toHaveAttribute("aria-selected", "true");
  await expect(preview.getByTestId("measure-navigation-status")).toHaveText("2마디를 표시했습니다.");

  const marker = preview.getByTestId("suspect-measure-highlight");
  await expect(marker).toHaveAttribute("data-measure", "2");
  await expect(marker).toBeVisible();
  await expect(marker).toHaveCSS("z-index", "1");
  const markerEvidence = await marker.evaluate((element) => {
    const image = element as HTMLImageElement;
    const bounds = image.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth);
    canvas.height = Math.max(1, image.naturalHeight);
    const context = canvas.getContext("2d");
    context?.drawImage(image, 0, 0);
    const pixel = context?.getImageData(canvas.width - 1, 0, 1, 1).data;
    return {
      width: bounds.width,
      height: bounds.height,
      opacity: Number(window.getComputedStyle(image).opacity),
      source: image.currentSrc,
      pixel: pixel ? [...pixel] : [],
    };
  });
  expect(markerEvidence.width).toBeGreaterThan(20);
  expect(markerEvidence.height).toBeGreaterThan(20);
  expect(markerEvidence.opacity).toBeGreaterThan(0);
  expect(markerEvidence.source).toMatch(/^data:image\/png/);
  expect(markerEvidence.pixel[3]).toBeGreaterThan(0);
  expect(markerEvidence.pixel[0]).toBeGreaterThan(markerEvidence.pixel[1]);

  await preview.getByRole("tab", { name: "원본" }).click();
  await expect(convertedTab).toHaveAttribute("aria-selected", "false");
  await measureButton.click();
  await expect(convertedTab).toHaveAttribute("aria-selected", "true");
  await expect(marker).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("suspect-measure-highlight.png"), fullPage: true });

  await suspects.getByRole("button", { name: "9마디 미리보기로 이동" }).click();
  await expect(preview.getByTestId("measure-navigation-error")).toContainText("9마디 위치를 표시하지 못했습니다.");
  await expect(preview.getByTestId("suspect-measure-highlight")).toHaveCount(0);
});

async function uploadPdf(page: Page, fileName: string) {
  await waitForUploadReady(page);
  await page.locator('input[type="file"]').setInputFiles(samplePath(fileName));
  const card = jobCardFor(page, fileName);
  await expect(card).toBeVisible();
  return card;
}

async function waitForUploadReady(page: Page) {
  await expect(page.getByRole("button", { name: "PDF 선택", exact: true })).toBeEnabled();
}

function jobCardFor(page: Page, fileName: string) {
  return page.getByTestId("job-card").filter({
    has: page.getByRole("heading", { name: fileName, exact: true }),
  });
}

async function expectCompleted(card: Locator) {
  await expect(card.getByTestId("job-status")).toHaveText("완료", { timeout: conversionTimeout });
}

async function openPreviewAndExpectNotes(card: Locator) {
  await card.getByRole("button", { name: "미리보기", exact: true }).click();
  const preview = card.getByTestId("score-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: previewTimeout });
  await expect.poll(() => preview.locator(".vf-notehead").count(), { timeout: previewTimeout }).toBeGreaterThan(0);
  await expect(preview.locator(".vf-notehead").first()).toBeVisible();
}

function samplePath(fileName: string) {
  return path.join(root, "samples", fileName);
}

const twoMeasureMusicXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <work><work-title>Two Measure Mock</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
