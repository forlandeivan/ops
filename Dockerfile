# Unica ops (janitor) — standalone-микросервис (J2.3c). Зеркало паттерна workflow-репо:
# node:24-slim, multi-stage, esbuild-бандл. @unica/* и @shared/* инлайнятся в бандл
# (esbuild читает tsconfig paths), npm-пакеты остаются external → нужны prod node_modules.

### ============================================================
### Base — полный npm ci (нужны devDeps: esbuild для сборки бандла)
### ============================================================
FROM node:24-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

### ============================================================
### Build — esbuild-бандл dist/janitor-runtime-entry.js
### ============================================================
FROM base AS build
COPY tsconfig.json ./
COPY shared ./shared
COPY packages ./packages
COPY server ./server
RUN npm run build

### ============================================================
### Prod-deps — только dependencies (без esbuild/tsx/vitest)
### ============================================================
FROM node:24-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

### ============================================================
### Runtime — прод node_modules + бандл
### ============================================================
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY --from=build /app/package.json ./package.json

# 5003 = health/readiness/metrics (k8s probes + Prometheus), 5004 = runtime-RPC (preview/run-now).
EXPOSE 5003 5004

# Схему заводят миграции монолита (общий PG); контейнер миграции НЕ применяет —
# entry ждёт готовности БД сам (to_regclass cleanup_policies) и стартует оркестратор.
CMD ["node", "dist/janitor-runtime-entry.js"]
