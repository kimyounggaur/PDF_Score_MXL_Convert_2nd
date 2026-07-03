FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN chown -R node:node /app

USER node
EXPOSE 3000

CMD ["npm", "run", "dev"]

