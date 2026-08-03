# ════════════════════════════════════════════════════════════════════════════
# LifeLink Backend — Production Dockerfile (Multi-Stage Build)
# ════════════════════════════════════════════════════════════════════════════
#
# STAGES:
#   1. deps     → Install production node_modules only
#   2. builder  → Install all deps, generate Prisma client, compile TypeScript
#   3. production → Lean final image (~180MB) with only what's needed to run
#
# WHY MULTI-STAGE?
#   devDependencies (typescript, tsx, jest, eslint...) add ~400MB to node_modules.
#   Multi-stage builds discard them from the final image automatically.
#   The production image only contains the compiled JS and prod deps.
#
# SECURITY:
#   Runs as a non-root user (node) — standard Docker security best practice.
#   Secrets are never baked into the image; they are passed at runtime via
#   environment variables or docker-compose env_file.
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Production Dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only package files first — Docker layer cache means this step is only
# re-run when package.json or package-lock.json change, not on every code change.
COPY package*.json ./

# Install production dependencies only.
# npm ci is preferred over npm install in CI/Docker: it is faster, reproducible,
# and fails if package-lock.json is out of sync with package.json.
RUN npm ci --omit=dev && npm cache clean --force


# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Install ALL dependencies (including devDeps: typescript, tsc-alias, prisma CLI)
RUN npm ci && npm cache clean --force

# Copy TypeScript config files
COPY tsconfig.json tsconfig.paths.json ./

# Copy Prisma schema (needed for prisma generate before compilation)
COPY prisma ./prisma

# Generate Prisma Client — creates type-safe query builder from schema.prisma.
# Must run before tsc because our source files import from '@prisma/client'.
RUN npx prisma generate

# Copy application source
COPY src ./src

# Compile TypeScript → dist/
# This step validates all types and emits the JavaScript output.
RUN npm run build

# Resolve TypeScript path aliases (@config/*, @middleware/*, etc.) in the
# compiled output. Without this step, `node dist/server.js` would fail with
# "Cannot find module '@config/database'" because Node.js doesn't know about
# TypeScript path mappings.
RUN npx tsc-alias -p tsconfig.json


# ── Stage 3: Production Image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Set NODE_ENV so libraries like Express enable production optimisations
# (e.g., view cache, stricter error handling, no stack traces in responses).
ENV NODE_ENV=production

# Install dumb-init: a lightweight init process that correctly forwards signals
# (SIGTERM, SIGINT) to Node.js. Without it, Docker's `docker stop` sends SIGTERM
# to PID 1 (shell), not to Node — breaking our graceful shutdown logic.
RUN apk add --no-cache dumb-init openssl libc6-compat

# ── Security: run as non-root ────────────────────────────────────────────────
# The node:alpine image ships with a built-in 'node' user (uid 1000).
# Switch to it so the process cannot write to system directories.
USER node

# Copy production node_modules from the deps stage
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy compiled JavaScript from the builder stage
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy Prisma schema and the generated client (needed at runtime for queries)
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --chown=node:node prisma ./prisma

# Copy the entrypoint script that runs migrations before starting the server
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

# Document which port the container listens on.
# This does NOT publish the port — that is done via docker-compose or -p flag.
EXPOSE 5000

# Use dumb-init as PID 1 so signals are forwarded correctly to Node.js.
ENTRYPOINT ["dumb-init", "--", "sh", "./docker-entrypoint.sh"]
