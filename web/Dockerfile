# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
COPY worker/package.json ./worker/package.json

RUN pnpm install --frozen-lockfile --filter @pdf-score-mxl/web...

FROM dependencies AS source

COPY --chown=node:node web ./web
WORKDIR /app/web

USER node
EXPOSE 3000

FROM source AS dev

CMD ["node", "node_modules/next/dist/bin/next", "dev"]

FROM source AS build

USER root
RUN pnpm run build \
  && test -f .next/standalone/web/server.js

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static
COPY --from=build --chown=node:node /app/web/public ./web/public

USER node
EXPOSE 3000

CMD ["node", "web/server.js"]
