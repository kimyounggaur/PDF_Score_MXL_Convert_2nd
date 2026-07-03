import path from "node:path";
import { getDataDir } from "./config.js";

export function dataRoot() {
  return path.resolve(getDataDir());
}

export function jobsRoot() {
  return path.join(dataRoot(), "jobs");
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

export function assertInside(parent: string, child: string) {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  const relative = path.relative(parentResolved, childResolved);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return childResolved;
  }

  throw new Error(`Path escapes root: ${child}`);
}

