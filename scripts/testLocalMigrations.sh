#!/usr/bin/env bash
set -euo pipefail
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID DATABASE_URL PGHOST PGUSER PGPASSWORD
echo "P0: local-only Supabase migration replay. No cloud credentials."
supabase --version
supabase start --help >/dev/null
supabase db reset --help >/dev/null
supabase start
supabase db reset --local --yes
echo 'POCKETFLOW_LOCAL_MIGRATIONS_OK'
