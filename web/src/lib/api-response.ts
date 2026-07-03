import { NextResponse } from "next/server";
import { errorMessage, type ErrorCode } from "./errors";

export function jsonError(code: ErrorCode, status = 400) {
  return NextResponse.json(
    {
      error: {
        code,
        message: errorMessage(code),
      },
    },
    { status },
  );
}

