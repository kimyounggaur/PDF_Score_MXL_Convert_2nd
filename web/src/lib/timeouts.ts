export class OperationTimedOutError extends Error {
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = "OperationTimedOutError";
  }
}

export async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new OperationTimedOutError(timeoutMs)), timeoutMs);
    timer.unref?.();
  });

  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export type SettledProbe<T> =
  | { ok: true; value: T }
  | { ok: false };

export async function settleWithin<T>(operation: () => Promise<T>, timeoutMs: number): Promise<SettledProbe<T>> {
  try {
    return { ok: true, value: await withTimeout(operation, timeoutMs) };
  } catch {
    return { ok: false };
  }
}
