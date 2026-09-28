import { rm, writeFile } from "node:fs/promises";

export const HEARTBEAT_PATH = "/tmp/worker-heartbeat";
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const CANCEL_POLL_INTERVAL_MS = 500;
export const CANCEL_REASON = "CANCELLED";

type RedisPingClient = {
  ping(): Promise<string>;
};

type RedisCancelClient = {
  get(key: string): Promise<string | null>;
};

type Timer = ReturnType<typeof setInterval>;

type IntervalScheduler = {
  set(callback: () => void, intervalMs: number): Timer;
  clear(timer: Timer): void;
};

const intervalScheduler: IntervalScheduler = {
  set(callback, intervalMs) {
    const timer = setInterval(callback, intervalMs);
    timer.unref();
    return timer;
  },
  clear(timer) {
    clearInterval(timer);
  },
};

export function cancellationKey(jobId: string) {
  return `job:${jobId}:cancel`;
}

export function watchForCancellation(options: {
  redis: RedisCancelClient;
  jobId: string;
  signal?: AbortSignal;
  cancel: (reason: string) => boolean;
  intervalMs?: number;
  scheduler?: IntervalScheduler;
  onError?: (error: unknown) => void;
}) {
  const scheduler = options.scheduler ?? intervalScheduler;
  let stopped = false;
  let polling = false;

  const poll = async () => {
    if (stopped || polling) {
      return;
    }

    polling = true;
    try {
      const requested = await options.redis.get(cancellationKey(options.jobId));
      if (!stopped && requested !== null) {
        options.cancel(CANCEL_REASON);
      }
    } catch (error) {
      if (!stopped) {
        options.onError?.(error);
      }
    } finally {
      polling = false;
    }
  };

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    scheduler.clear(timer);
    options.signal?.removeEventListener("abort", stop);
  };

  const timer = scheduler.set(() => void poll(), options.intervalMs ?? CANCEL_POLL_INTERVAL_MS);
  options.signal?.addEventListener("abort", stop, { once: true });

  if (options.signal?.aborted) {
    stop();
  } else {
    // Do not make a freshly activated job wait one full poll interval.
    void poll();
  }

  return { stop };
}

export function startWorkerHeartbeat(options: {
  redis: RedisPingClient;
  disabled?: boolean;
  filePath?: string;
  intervalMs?: number;
  scheduler?: IntervalScheduler;
  now?: () => Date;
  onError?: (error: unknown) => void;
}) {
  const scheduler = options.scheduler ?? intervalScheduler;
  const filePath = options.filePath ?? HEARTBEAT_PATH;
  let stopped = false;
  let pending: Promise<void> | null = null;

  const beat = async () => {
    if (stopped || pending) {
      return pending;
    }

    pending = (async () => {
      try {
        await options.redis.ping();
        if (!stopped) {
          await writeFile(filePath, (options.now ?? (() => new Date()))().toISOString(), "utf8");
        }
      } catch (error) {
        if (!stopped) {
          options.onError?.(error);
        }
      } finally {
        pending = null;
      }
    })();

    return pending;
  };

  if (options.disabled) {
    // A disabled heartbeat must not leave a stale healthy marker behind.
    const cleanup = rm(filePath, { force: true }).catch(() => undefined);
    return {
      async stop() {
        await cleanup;
      },
    };
  }

  const timer = scheduler.set(() => void beat(), options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  void beat();

  return {
    async stop() {
      stopped = true;
      scheduler.clear(timer);
      await pending;
    },
  };
}
