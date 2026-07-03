FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN chown -R node:node /app

USER node
EXPOSE 3000

FROM base AS dev

CMD ["npm", "run", "dev"]

FROM base AS build

USER node
RUN npm run build

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

CMD ["node", "server.js"]
