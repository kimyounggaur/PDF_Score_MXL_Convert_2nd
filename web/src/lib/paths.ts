import path from "node:path";
import { getDataDir } from "./env";

export function jobsRoot() {
  return path.join(getDataDir(), "jobs");
}

export function jobDir(jobId: string) {
  return path.join(jobsRoot(), jobId);
}

export function inputPdfPath(jobId: string) {
  return path.join(jobDir(jobId), "input.pdf");
}

export function outputDir(jobId: string) {
  return path.join(jobDir(jobId), "out");
}

export function metadataPath(jobId: string) {
  return path.join(jobDir(jobId), "metadata.json");
}

export function assertInside(parent: string, child: string) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  const relative = path.relative(parentResolved, childResolved);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return childResolved;
  }

  throw new Error("Path escapes root");
}

export function isSafeJobId(jobId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId);
}

