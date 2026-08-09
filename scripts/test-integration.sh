#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f .env.test ]]; then
  echo "Missing .env.test. Copy .env.test.example to .env.test first." >&2
  exit 1
fi

set -a
source .env.test
set +a

expected_database_prefix='postgresql://postgres:postgres@localhost:5433/lifelink_test'
if [[ "${DATABASE_URL:-}" != "${expected_database_prefix}"* ]] ||
  [[ "${DIRECT_URL:-}" != "${expected_database_prefix}"* ]]; then
  echo "Refusing to run: .env.test must target the dedicated local lifelink_test database on port 5433." >&2
  exit 1
fi

compose=(docker compose -f docker-compose.test.yml)
cleanup() {
  "${compose[@]}" down
}
trap cleanup EXIT

"${compose[@]}" up -d postgres

until [[ "$("${compose[@]}" ps -q postgres)" != "" ]] && \
  "${compose[@]}" exec -T postgres pg_isready -U postgres -d lifelink_test >/dev/null 2>&1; do
  sleep 1
done

npx prisma migrate deploy
npm test -- --runInBand "$@"
