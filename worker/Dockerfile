# syntax=docker/dockerfile:1.7

FROM eclipse-temurin:25-jdk AS audiveris-builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src/audiveris

RUN git clone --depth 1 --branch 5.10.2 https://github.com/Audiveris/audiveris.git .
RUN ./gradlew --no-daemon :app:build -x test

FROM node:22-bookworm-slim AS audiveris-runtime

COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH=$JAVA_HOME/bin:$PATH

ENV TESSDATA_PREFIX=/usr/local/share/tessdata
ENV JAVA_OPTS="-Xmx4g -Djava.awt.headless=true"

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

COPY --from=audiveris-builder /src/audiveris/app/build/distributions/app-5.10.2.tar /tmp/audiveris.tar

RUN mkdir -p /opt/audiveris \
  && tar xf /tmp/audiveris.tar -C /opt/audiveris --strip-components=1 \
  && rm /tmp/audiveris.tar \
  && mkdir -p /data \
  && chown -R node:node /data

USER node
WORKDIR /app

CMD ["node", "--version"]

