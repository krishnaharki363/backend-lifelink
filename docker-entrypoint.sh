#!/bin/sh
# ════════════════════════════════════════════════════════════════════════════
# docker-entrypoint.sh — Production Container Startup Script
# ════════════════════════════════════════════════════════════════════════════
#
# This script runs inside the production container before starting the server.
#
# WHY RUN MIGRATIONS HERE?
#   Running `prisma migrate deploy` on every container start ensures the
#   database schema is always in sync with the deployed code. This is safe
#   because `migrate deploy` is idempotent — it only applies pending migrations
#   and never rolls back or resets data.
#
#   For zero-downtime deployments (Kubernetes rolling updates), you may want
#   to run migrations as a separate init container or job instead.
#
# set -e: Exit immediately if any command returns a non-zero exit code.
#         This prevents the server from starting with a broken schema.
# ════════════════════════════════════════════════════════════════════════════

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LifeLink Backend — Container Starting"
echo "  Environment: ${NODE_ENV:-production}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "▶ Running Prisma database migrations..."
npx prisma migrate deploy
echo "✔ Migrations applied successfully."

echo "▶ Starting LifeLink server..."
exec node dist/server.js
