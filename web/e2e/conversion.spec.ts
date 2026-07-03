import { expect, test } from "@playwright/test";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { validateMxl } from "../../worker/src/validate-mxl";

const root = path.resolve(__dirname, "..", "..");

test("simple.pdf 업로드 후 미리보기와 다운로드가 동작한다", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(path.join(root, "samples", "simple.pdf"));

  await expect(page.getByText("업로드가 완료되어 변환 대기열에 등록했습니다.")).toBeVisible();
  await expect(page.getByText("완료")).toBeVisible({ timeout: 20 * 60 * 1000 });

  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.locator(".osmdCanvas svg, svg").first()).toBeVisible({ timeout: 60_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /MXL 다운로드|악장|번째 파일/ }).first().click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();

  const validation = await validateMxl(downloadedPath!);
  expect(validation.ok).toBe(true);
});

test("텍스트 파일 업로드는 한국어 메시지로 거부된다", async ({ page }) => {
  const textPath = path.join(tmpdir(), `not-pdf-${Date.now()}.txt`);
  await writeFile(textPath, "hello");

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(textPath);
  await expect(page.getByText("PDF 파일만 업로드할 수 있으며 최대 크기는 30MB입니다.")).toBeVisible();
});

test("bad.pdf는 인식 실패 안내를 보여준다", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(path.join(root, "samples", "bad.pdf"));
  await expect(page.getByText(/악보를 인식하지 못했습니다|변환 엔진에서 오류가 발생했습니다/)).toBeVisible({
    timeout: 20 * 60 * 1000,
  });
});

