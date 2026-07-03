import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { jobsRoot, assertInside } from "./paths.js";

const TTL_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = {
  scanned: number;
  removed: number;
};

export async function cleanupExpiredJobs(now = Date.now()): Promise<CleanupResult> {
  const root = jobsRoot();
  let entries: string[];

  try {
    entries = await readdir(root);
  } catch {
    return { scanned: 0, removed: 0 };
  }

  let removed = 0;

  for (const entry of entries) {
    const target = assertInside(root, path.join(root, entry));
    const entryStat = await stat(target).catch(() => null);

    if (!entryStat?.isDirectory()) {
      continue;
    }

    if (now - entryStat.mtimeMs <= TTL_MS) {
      continue;
    }

    await rm(target, { recursive: true, force: true });
    removed += 1;
  }

  return { scanned: entries.length, removed };
}

