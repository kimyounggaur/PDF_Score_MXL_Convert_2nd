import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import test from "node:test";
import { UploadError, uploadPdfWithXhr, type UploadRequest } from "./xhr-upload";

const DEFAULT_JOB_OPTIONS = { pageRange: null, language: "eng" } as const;

test("XHR 업로드가 FormData를 보내고 전송률과 작업 ID를 반환한다", async () => {
  const request = new FakeUploadRequest();
  const progress: number[] = [];
  let transferComplete = 0;
  const promise = uploadPdfWithXhr(pdfFile(), {
    pageRange: "2-5, 7",
    language: "kor+eng",
    createRequest: () => request,
    onProgress: (value) => progress.push(value.percent),
    onTransferComplete: () => {
      transferComplete += 1;
    },
  });

  request.upload.emitProgress(12, 40);
  request.upload.emitLoad();
  request.status = 201;
  request.responseText = JSON.stringify({ jobId: "job-123" });
  request.emit("load");

  assert.deepEqual(await promise, { jobId: "job-123" });
  assert.deepEqual(progress, [30]);
  assert.equal(transferComplete, 1);
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/api/jobs");
  assert.equal((request.body?.get("file") as { name?: string } | null)?.name, "score.pdf");
  assert.equal(request.body?.get("pageRange"), "2-5, 7");
  assert.equal(request.body?.get("language"), "kor+eng");
});

test("전체 쪽은 pageRange를 생략하고 기본 영어 언어는 항상 전송한다", async () => {
  const request = new FakeUploadRequest();
  const promise = uploadPdfWithXhr(pdfFile(), {
    ...DEFAULT_JOB_OPTIONS,
    createRequest: () => request,
  });

  request.status = 201;
  request.responseText = JSON.stringify({ jobId: "all-pages" });
  request.emit("load");

  assert.deepEqual(await promise, { jobId: "all-pages" });
  assert.equal(request.body?.has("pageRange"), false);
  assert.equal(request.body?.get("language"), "eng");
});

test("직접 입력의 빈 pageRange도 서버가 검증하도록 그대로 전송한다", async () => {
  const request = new FakeUploadRequest();
  const promise = uploadPdfWithXhr(pdfFile(), {
    pageRange: "",
    language: "kor",
    createRequest: () => request,
  });

  request.status = 201;
  request.responseText = JSON.stringify({ jobId: "empty-range" });
  request.emit("load");

  assert.deepEqual(await promise, { jobId: "empty-range" });
  assert.equal(request.body?.has("pageRange"), true);
  assert.equal(request.body?.get("pageRange"), "");
  assert.equal(request.body?.get("language"), "kor");
});

test("전송 중 AbortSignal은 XHR을 중단한다", async () => {
  const request = new FakeUploadRequest();
  const controller = new AbortController();
  const promise = uploadPdfWithXhr(pdfFile(), {
    ...DEFAULT_JOB_OPTIONS,
    createRequest: () => request,
    signal: controller.signal,
  });

  controller.abort();

  await assert.rejects(promise, (error: unknown) => error instanceof UploadError && error.kind === "aborted");
  assert.equal(request.abortCount, 1);
});

test("전송 완료 뒤 AbortSignal은 응답 연결을 끊지 않아 생성된 jobId를 잃지 않는다", async () => {
  const request = new FakeUploadRequest();
  const controller = new AbortController();
  const promise = uploadPdfWithXhr(pdfFile(), {
    ...DEFAULT_JOB_OPTIONS,
    createRequest: () => request,
    signal: controller.signal,
  });

  request.upload.emitLoad();
  controller.abort();
  request.status = 201;
  request.responseText = JSON.stringify({ jobId: "safe-job" });
  request.emit("load");

  assert.deepEqual(await promise, { jobId: "safe-job" });
  assert.equal(request.abortCount, 0);
});

test("서버 오류 코드와 한국어 문구를 보존한다", async () => {
  const request = new FakeUploadRequest();
  const promise = uploadPdfWithXhr(pdfFile(), { ...DEFAULT_JOB_OPTIONS, createRequest: () => request });

  request.status = 400;
  request.responseText = JSON.stringify({ error: { code: "ENCRYPTED_PDF", message: "보안 PDF입니다." } });
  request.emit("load");

  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof UploadError &&
      error.kind === "http" &&
      error.code === "ENCRYPTED_PDF" &&
      error.status === 400 &&
      error.message === "보안 PDF입니다.",
  );
});

class FakeUploadTarget {
  private readonly progressListeners: Array<(event: ProgressEvent) => void> = [];
  private readonly loadListeners: Array<() => void> = [];

  addEventListener(type: "progress" | "load", listener: ((event: ProgressEvent) => void) | (() => void)) {
    if (type === "progress") {
      this.progressListeners.push(listener as (event: ProgressEvent) => void);
    } else {
      this.loadListeners.push(listener as () => void);
    }
  }

  emitProgress(loaded: number, total: number) {
    const event = { lengthComputable: true, loaded, total } as ProgressEvent;
    for (const listener of this.progressListeners) {
      listener(event);
    }
  }

  emitLoad() {
    for (const listener of this.loadListeners) {
      listener();
    }
  }
}

class FakeUploadRequest implements UploadRequest {
  readonly upload = new FakeUploadTarget();
  status = 0;
  responseText = "";
  method = "";
  url = "";
  body: FormData | null = null;
  abortCount = 0;
  private readonly listeners = new Map<"load" | "error" | "abort", Array<() => void>>();

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }

  abort() {
    this.abortCount += 1;
    this.emit("abort");
  }

  addEventListener(type: "load" | "error" | "abort", listener: () => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emit(type: "load" | "error" | "abort") {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

function pdfFile() {
  return new NodeFile(["%PDF-1.7"], "score.pdf", { type: "application/pdf" }) as unknown as File;
}
