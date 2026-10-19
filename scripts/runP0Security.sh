#!/usr/bin/env bash
set -euo pipefail
: "${P0_TEST_CONTAINER:?Requires an isolated PostgreSQL container ID}"
[[ "$P0_TEST_CONTAINER" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid container ID' >&2; exit 2; }
# psql executes *inside* Docker, so expand the repository SQL include on the host.
python3 -c "from pathlib import Path; print(Path('tests/p0Security.sql').read_text().replace(r'\\i docs/sql/p0-hardening-proposal.sql', Path('docs/sql/p0-hardening-proposal.sql').read_text()))" \
  | docker exec -i "$P0_TEST_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  | tee /tmp/p0-postgres-test-output.txt
grep -q 'P0_SECURITY_OK' /tmp/p0-postgres-test-output.txt
echo 'P0 isolated PostgreSQL checks passed'
