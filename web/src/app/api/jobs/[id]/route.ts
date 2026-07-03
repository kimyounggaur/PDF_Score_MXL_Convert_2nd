import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getJobStatus } from "@/lib/jobs";
import { isSafeJobId } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!isSafeJobId(id)) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  const status = await getJobStatus(id);
  if (!status) {
    return jsonError("JOB_NOT_FOUND", 404);
  }

  return NextResponse.json(status);
}

