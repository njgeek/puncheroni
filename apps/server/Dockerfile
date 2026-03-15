FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/

RUN npm ci --workspace @puncheroni/shared --workspace @puncheroni/server --ignore-scripts
RUN npm run build:shared && npm run build:server

FROM node:22-slim
WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/apps/server/package.json apps/server/
COPY --from=builder /app/apps/server/dist/ apps/server/dist/

RUN npm ci --workspace @puncheroni/shared --workspace @puncheroni/server --omit=dev --ignore-scripts

EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
