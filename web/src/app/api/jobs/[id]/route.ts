import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getJobStatus } from "@/lib/jobs";
import { isSafeJobId } from "@/lib/paths";
import { cancelConversionJob } from "@/lib/cancellation";
import { STATUS_QUERY_TIMEOUT_MS } from "@/lib/system-status";
import { withTimeout } from "@/lib/timeouts";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!isSafeJobId(id)) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  let status;
  try {
    status = await withTimeout(() => getJobStatus(id), STATUS_QUERY_TIMEOUT_MS);
  } catch {
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }

  if (!status) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  return NextResponse.json(status);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!isSafeJobId(id)) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  // The unguessable UUIDv4 job ID is intentionally the capability needed to
  // cancel a job. Do not replace it with a short or sequential public ID.
  try {
    const result = await cancelConversionJob(id);

    if (result === "not_found") {
      return jsonError("JOB_NOT_FOUND", 404);
    }

    if (result === "already_finished") {
      return jsonError("JOB_ALREADY_FINISHED", 409);
    }

    return NextResponse.json(
      { status: result },
      { status: result === "cancel_requested" ? 202 : 200 },
    );
  } catch {
    return jsonError("SERVICE_UNAVAILABLE", 503);
  }
}

