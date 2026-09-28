#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-pdf-score-mxl-worker:audiveris}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR"
SAMPLE="$PROJECT_DIR/samples/simple.pdf"
OUT_DIR="$PROJECT_DIR/.smoke-out"
LOG_FILE="$OUT_DIR/audiveris.log"

if [ ! -f "$SAMPLE" ]; then
  echo "FAIL sample: samples/simple.pdf not found"
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "image=$IMAGE"
echo "sample=$SAMPLE"
echo "out=$OUT_DIR"

set +e
docker run --rm \
  -v "$PROJECT_DIR/samples:/data/in:ro" \
  -v "$OUT_DIR:/data/out" \
  "$IMAGE" \
  /opt/audiveris/bin/Audiveris \
    -batch \
    -export \
    -save \
    -output /data/out \
    -- /data/in/simple.pdf \
  >"$LOG_FILE" 2>&1
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  echo "PASS exit-code"
else
  echo "FAIL exit-code: $STATUS"
  tail -n 80 "$LOG_FILE" || true
  exit "$STATUS"
fi

MXL_COUNT="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.mxl' | wc -l | tr -d ' ')"
if [ "$MXL_COUNT" -ge 1 ]; then
  echo "PASS mxl-count: $MXL_COUNT"
else
  echo "FAIL mxl-count: no .mxl files"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

FIRST_MXL="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.mxl' | head -n 1)"
if unzip -l "$FIRST_MXL" | grep -q 'META-INF/container.xml'; then
  echo "PASS mxl-container: META-INF/container.xml"
else
  echo "FAIL mxl-container: META-INF/container.xml missing"
  exit 1
fi

if grep -qi 'collection of supported languages is empty' "$LOG_FILE"; then
  echo "FAIL tessdata: supported languages warning found"
  exit 1
else
  echo "PASS tessdata: no supported languages warning"
fi

if unzip -p "$FIRST_MXL" META-INF/container.xml >/tmp/container.xml \
  && ROOTFILE="$(grep -o 'full-path="[^"]*"' /tmp/container.xml | head -n 1 | sed 's/full-path="//;s/"//')" \
  && [ -n "$ROOTFILE" ] \
  && unzip -p "$FIRST_MXL" "$ROOTFILE" | grep -Eq '<score-(partwise|timewise)'; then
  echo "PASS musicxml-root: <score-partwise|score-timewise>"
else
  echo "FAIL musicxml-root: score root not found"
  exit 1
fi

echo "smoke test completed"

