import { v5 as uuidv5 } from "uuid";
import { isSafeJobId } from "./paths";

const RETRY_ID_PREFIX = "urn:pdf-score-mxl:retry:";

/**
 * A source job gets exactly one direct retry job. Retrying that retry after it
 * fails forms a new link in the chain because its source UUID is different.
 */
export function retryJobIdFor(sourceJobId: string): string | null {
  if (!isSafeJobId(sourceJobId)) {
    return null;
  }

  return uuidv5(`${RETRY_ID_PREFIX}${sourceJobId.toLowerCase()}`, uuidv5.URL);
}

export function isExistingRetryDirectoryError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}
