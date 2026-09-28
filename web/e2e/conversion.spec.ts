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
      message: "20쪽 이하의 PDF만 변환할 수 있습니다. 파일을 나눠서 시도해 주세요.",
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
