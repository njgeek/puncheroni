FROM node:22-slim AS builder
WORKDIR /app

ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

RUN npm ci --workspace @puncheroni/shared --workspace @puncheroni/web --ignore-scripts
RUN npm run build:shared && npm run build:web

FROM node:22-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 3000
CMD ["serve", "dist", "-l", "3000", "-s"]
