import type { ConversionLanguage } from "./conversion-options";

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type UploadResult = {
  jobId: string;
};

export type UploadLanguage = ConversionLanguage;

export type UploadJobOptions = {
  /** null means every page; an empty string is a deliberate direct-entry value. */
  pageRange: string | null;
  language: UploadLanguage;
};

export type UploadPdfOptions = UploadJobOptions & {
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  onTransferComplete?: () => void;
  createRequest?: () => UploadRequest;
};

type UploadEventTarget = {
  addEventListener(type: "progress", listener: (event: ProgressEvent) => void): void;
  addEventListener(type: "load", listener: () => void): void;
};

export type UploadRequest = {
  upload: UploadEventTarget;
  status: number;
  responseText: string;
  open(method: string, url: string): void;
  send(body: FormData): void;
  abort(): void;
  addEventListener(type: "load" | "error" | "abort", listener: () => void): void;
};

export class UploadError extends Error {
  constructor(
    message: string,
    readonly kind: "http" | "network" | "aborted" | "invalid-response",
    readonly code: string | null = null,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export function uploadPdfWithXhr(
  file: File,
  options: UploadPdfOptions,
): Promise<UploadResult> {
  const createRequest: () => UploadRequest = options.createRequest ?? (() => new XMLHttpRequest());

  return new Promise((resolve, reject) => {
    const request = createRequest();
    let settled = false;
    let transferComplete = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      options.signal?.removeEventListener("abort", abortRequest);
      callback();
    };

    const abortRequest = () => {
      if (!transferComplete) {
        request.abort();
      }
    };

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))),
      });
    });

    request.upload.addEventListener("load", () => {
      transferComplete = true;
      options.onTransferComplete?.();
    });

    request.addEventListener("load", () => {
      const data = parseJson(request.responseText);

      if (request.status < 200 || request.status >= 300) {
        finish(() =>
          reject(
            new UploadError(
              readApiErrorMessage(data) ?? "업로드에 실패했습니다.",
              "http",
              readApiErrorCode(data),
              request.status,
            ),
          ),
        );
        return;
      }

      if (!isUploadResult(data)) {
        finish(() => reject(new UploadError("서버 응답을 확인할 수 없습니다. 다시 시도해 주세요.", "invalid-response")));
        return;
      }

      finish(() => resolve(data));
    });

    request.addEventListener("error", () => {
      finish(() => reject(new UploadError("업로드 중 네트워크 문제가 발생했습니다. 다시 시도해 주세요.", "network")));
    });

    request.addEventListener("abort", () => {
      finish(() => reject(new UploadError("업로드를 취소했습니다.", "aborted")));
    });

    if (options.signal?.aborted) {
      finish(() => reject(new UploadError("업로드를 취소했습니다.", "aborted")));
      return;
    }

    options.signal?.addEventListener("abort", abortRequest, { once: true });
    request.open("POST", "/api/jobs");
    const formData = new FormData();
    formData.append("file", file);
    if (options.pageRange !== null) {
      formData.append("pageRange", options.pageRange);
    }
    formData.append("language", options.language);
    request.send(formData);
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isUploadResult(value: unknown): value is UploadResult {
  return typeof value === "object" && value !== null && "jobId" in value && typeof (value as { jobId: unknown }).jobId === "string";
}

function readApiError(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }

  const error = (value as { error?: unknown }).error;
  return typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
}

function readApiErrorMessage(value: unknown) {
  const message = readApiError(value)?.message;
  return typeof message === "string" ? message : null;
}

function readApiErrorCode(value: unknown) {
  const code = readApiError(value)?.code;
  return typeof code === "string" ? code : null;
}
