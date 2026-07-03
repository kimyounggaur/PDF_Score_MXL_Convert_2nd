import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getConversionQueue, getConversionQueueEvents, closeQueueClients } from "../src/queue.js";
import { inputPdfPath, jobDir } from "../src/paths.js";

const source = process.argv[2];

if (!source) {
  console.error("Usage: pnpm enqueue -- <pdf-path>");
  process.exit(2);
}

const jobId = randomUUID();
const sourcePath = path.resolve(source);
const dir = jobDir(jobId);

await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
await copyFile(sourcePath, inputPdfPath(jobId));

const queue = getConversionQueue();
const events = getConversionQueueEvents();

await events.waitUntilReady();
await queue.add(
  "convert",
  { jobId },
  {
    jobId,
    attempts: 1,
    removeOnComplete: { age: 86_400 },
    removeOnFail: { age: 86_400 },
  },
);

console.log(JSON.stringify({ event: "enqueued", jobId, input: sourcePath }));

const timeout = setTimeout(() => {
  console.error(JSON.stringify({ event: "timeout_waiting_for_job", jobId }));
  void closeQueueClients().finally(() => process.exit(1));
}, 30 * 60 * 1000);

events.on("progress", ({ jobId: eventJobId, data }) => {
  if (eventJobId === jobId) {
    console.log(JSON.stringify({ event: "progress", jobId, data }));
  }
});

events.on("completed", ({ jobId: eventJobId, returnvalue }) => {
  if (eventJobId !== jobId) {
    return;
  }

  clearTimeout(timeout);
  console.log(JSON.stringify({ event: "completed", jobId, returnvalue }));
  void closeQueueClients().finally(() => process.exit(0));
});

events.on("failed", ({ jobId: eventJobId, failedReason }) => {
  if (eventJobId !== jobId) {
    return;
  }

  clearTimeout(timeout);
  console.error(JSON.stringify({ event: "failed", jobId, failedReason }));
  void closeQueueClients().finally(() => process.exit(1));
});

