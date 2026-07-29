### ============================================================
### Build NodeJS Application
### ============================================================
FROM node:24-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY shared ./shared
COPY packages ./packages
COPY server ./server

RUN npm run build \
    && npm prune --omit=dev

### ============================================================
### Runtime
### ============================================================
FROM node:24-slim AS runtime
ENV NODE_ENV=production

WORKDIR /app

RUN groupadd --system --gid 2000 nodejs \
    && useradd --system --uid 2000 --gid nodejs --create-home --shell /usr/sbin/nologin nodejs

RUN npm uninstall --global npm

COPY --chown=nodejs:nodejs --from=build /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs --from=build /app/dist ./dist
COPY --chown=nodejs:nodejs --from=build /app/package.json ./package.json

USER nodejs

EXPOSE 5003 5004

CMD ["node", "dist/janitor-runtime-entry.js"]
