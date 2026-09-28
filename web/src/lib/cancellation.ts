import { rm } from "node:fs/promises";
import { getJob } from "./queue";
import { getRedisClient } from "./redis";
import { jobDir } from "./paths";
import { STATUS_QUERY_TIMEOUT_MS } from "./system-status";
import { withTimeout } from "./timeouts";

export const CANCEL_REQUEST_TTL_SECONDS = 120;

type CancellableJob = {
  getState: () => Promise<string>;
  remove: () => Promise<void>;
};

export type CancelJobDependencies = {
  getJob: (jobId: string) => Promise<CancellableJob | null>;
  setCancelRequest: (jobId: string) => Promise<void>;
  clearCancelRequest: (jobId: string) => Promise<void>;
  removeJobDirectory: (jobId: string) => Promise<void>;
};

export type CancelJobResult = "cancelled" | "cancel_requested" | "already_finished" | "not_found";

const REMOVABLE_STATES = new Set(["waiting", "delayed", "prioritized", "waiting-children"]);
const TERMINAL_STATES = new Set(["completed", "failed"]);

export function cancelRequestKey(jobId: string) {
  return `job:${jobId}:cancel`;
}

export async function cancelConversionJob(
  jobId: string,
  dependencies: CancelJobDependencies = defaultCancelJobDependencies(),
): Promise<CancelJobResult> {
  const job = await dependencies.getJob(jobId);
  if (!job) {
    return "not_found";
  }

  let state = await job.getState();

  // A job can be claimed between getState() and remove(). Re-check its state
  // and switch to the active cancellation signal instead of deleting its files.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (TERMINAL_STATES.has(state)) {
      return "already_finished";
    }

    if (state === "unknown") {
      return "not_found";
    }

    if (REMOVABLE_STATES.has(state)) {
      try {
        await job.remove();
        await dependencies.removeJobDirectory(jobId);
        await dependencies.clearCancelRequest(jobId).catch(() => undefined);
        return "cancelled";
      } catch (error) {
        const nextState = await job.getState();
        if (nextState === state) {
          throw error;
        }
        state = nextState;
        continue;
      }
    }

    if (state === "active") {
      await dependencies.setCancelRequest(jobId);
      const nextState = await job.getState();

      if (TERMINAL_STATES.has(nextState)) {
        await dependencies.clearCancelRequest(jobId).catch(() => undefined);
        return "already_finished";
      }

      if (nextState === "unknown") {
        await dependencies.clearCancelRequest(jobId).catch(() => undefined);
        return "not_found";
      }

      if (REMOVABLE_STATES.has(nextState)) {
        state = nextState;
        continue;
      }

      return "cancel_requested";
    }

    return "not_found";
  }

  throw new Error("Job state changed repeatedly while cancelling");
}

function defaultCancelJobDependencies(): CancelJobDependencies {
  return {
    getJob: async (jobId) => {
      const job = await withTimeout(() => getJob(jobId), STATUS_QUERY_TIMEOUT_MS);
      if (!job) {
        return null;
      }

      return {
        getState: async () => await withTimeout(() => job.getState(), STATUS_QUERY_TIMEOUT_MS),
        remove: async () => await withTimeout(() => job.remove(), STATUS_QUERY_TIMEOUT_MS),
      };
    },
    setCancelRequest: async (jobId) => {
      await withTimeout(
        async () => {
          await getRedisClient().set(cancelRequestKey(jobId), "1", "EX", CANCEL_REQUEST_TTL_SECONDS);
        },
        STATUS_QUERY_TIMEOUT_MS,
      );
    },
    clearCancelRequest: async (jobId) => {
      await withTimeout(async () => {
        await getRedisClient().del(cancelRequestKey(jobId));
      }, STATUS_QUERY_TIMEOUT_MS);
    },
    removeJobDirectory: async (jobId) => {
      await rm(jobDir(jobId), { recursive: true, force: true });
    },
  };
}
