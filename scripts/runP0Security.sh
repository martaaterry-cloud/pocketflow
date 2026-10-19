#!/usr/bin/env bash
set -euo pipefail
: "${P0_TEST_CONTAINER:?Requires an isolated PostgreSQL service container ID}"
[[ "$P0_TEST_CONTAINER" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid container ID' >&2; exit 2; }
docker exec -i "$P0_TEST_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/p0Security.sql | grep -q 'P0_SECURITY_OK'
echo 'P0 isolated PostgreSQL checks passed'
