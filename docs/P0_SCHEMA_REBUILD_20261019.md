# P0 migration reconstruction — isolated execution, 2026-10-19

## Confirmed Enka result
[GitHub Actions: real Enka SQL schema](https://github.com/martaaterry-cloud/enka/actions/runs/39231637653): **SUCCESS**.

- Uses `postgres:17-alpine` service in GitHub Actions, entirely disposable.
- Creates minimal synthetic `auth.users` and `auth.uid()`; it is NOT the actual hosted Supabase Auth schema.
- Runs the real `20260929143000_create_enka_core.sql` file from this branch.
- Verifies 11 public Enka tables, row-level security enabled on every table, and policy ownership checks.
- No Supabase keys, production SQL or personal records were used.

## Canonical migration discrepancy still open
The existing Enka core migration is not in the shared hosted migration ledger. This green result establishes basic compatibility with PostgreSQL 17 **but does not reconcile the ledger**. Do not replay Enka core in production.

PocketFlow still requires a faithful reproduction of its historical migrations, including shared Auth/Storage/Realtime dependencies. The existing synthetic P0 checks do not establish that reconstruction. A disposable Supabase local instance (or an equivalent isolated schema with all dependencies) must run the ordered canonical migrations before ledger changes are contemplated.

## Release gate
Keep Enka PR #48 and PocketFlow PR #6 draft until: canonical migration reconciliation, cross-user tests on real schemas, Auth and Storage integration tests, and explicit review. No schema production changes.
