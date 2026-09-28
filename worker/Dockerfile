# syntax=docker/dockerfile:1.7

ARG AUDIVERIS_VERSION=5.10.2

FROM eclipse-temurin:25-jdk AS audiveris-builder

ARG AUDIVERIS_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src/audiveris

RUN git clone --depth 1 --branch "${AUDIVERIS_VERSION}" https://github.com/Audiveris/audiveris.git .
RUN --mount=type=cache,target=/root/.gradle \
  ./gradlew --no-daemon :app:build -x test

FROM node:22-bookworm-slim AS worker-build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
COPY worker/package.json ./worker/package.json

RUN pnpm install --frozen-lockfile --filter @pdf-score-mxl/worker...

COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src ./worker/src
COPY worker/scripts ./worker/scripts

RUN pnpm --filter @pdf-score-mxl/worker run build

FROM node:22-bookworm-slim AS audiveris-runtime

ARG AUDIVERIS_VERSION

LABEL org.opencontainers.image.title="PDF Score MXL Worker" \
  org.opencontainers.image.version="${AUDIVERIS_VERSION}" \
  org.opencontainers.image.source="https://github.com/kimyounggaur/PDF_Score_MXL_Convert_2nd"

COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH=$JAVA_HOME/bin:$PATH

ENV TESSDATA_PREFIX=/usr/local/share/tessdata
ENV JAVA_TOOL_OPTIONS="-Xmx4g -Djava.awt.headless=true"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    libfreetype6 \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$TESSDATA_PREFIX" \
  && curl -fsSL https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata -o "$TESSDATA_PREFIX/eng.traineddata" \
  && curl -fsSL https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata -o "$TESSDATA_PREFIX/kor.traineddata"

COPY --from=audiveris-builder /src/audiveris/app/build/distributions/app-${AUDIVERIS_VERSION}.tar /tmp/audiveris.tar

RUN mkdir -p /opt/audiveris \
  && tar xf /tmp/audiveris.tar -C /opt/audiveris --strip-components=1 \
  && rm /tmp/audiveris.tar \
  && mkdir -p /data \
  && chown -R node:node /data

FROM audiveris-runtime AS worker

USER root
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
COPY worker/package.json ./worker/package.json

RUN pnpm install --frozen-lockfile --prod --filter @pdf-score-mxl/worker... \
  && chown -R node:node /app /data

COPY --from=worker-build --chown=node:node /app/worker/dist ./worker/dist

USER node
WORKDIR /app/worker

CMD ["node", "dist/src/worker.js"]
