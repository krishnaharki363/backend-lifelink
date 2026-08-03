# ════════════════════════════════════════════════════════════════════════════
# LifeLink Backend — Unified Dockerfile (Multi-Stage Build)
# ════════════════════════════════════════════════════════════════════════════
#
# STAGES:
#   1. development → Dev environment with hot-reloading (used by docker-compose)
#   2. deps        → Install production node_modules only
#   3. builder     → Install all deps, generate Prisma client, compile TypeScript
#   4. production  → Lean production runtime image (~180MB)
#
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Development ──────────────────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

RUN apk add --no-cache dumb-init openssl libc6-compat

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY tsconfig.json tsconfig.paths.json ./
COPY prisma ./prisma
COPY docs ./docs
RUN npx prisma generate

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "tsx", "watch", "--tsconfig", "tsconfig.json", "src/server.ts"]


# ── Stage 2: Production Dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force


# ── Stage 3: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY tsconfig.json tsconfig.paths.json ./
COPY prisma ./prisma

RUN npx prisma generate

COPY src ./src
COPY docs ./docs

RUN npm run build
RUN npx tsc-alias -p tsconfig.json


# ── Stage 4: Production Image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init openssl libc6-compat

USER node

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --chown=node:node prisma ./prisma
COPY --from=builder --chown=node:node /app/docs ./docs

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
