# P0 security and migration rollout — PROPOSAL ONLY

**Scope:** shared Supabase project `xcarqzopfaozxugfhslo`, used by PocketFlow and Enka.
**State:** review-only; SQL in `docs/sql/` is NOT a migration and MUST NOT be run on production without separate approval.

## Verified baseline (2026-10-19)
- 29 public tables have RLS. Most policies use `auth.uid() = user_id` and target `PUBLIC`.
- 28/29 public tables grant `TRUNCATE` and `TRIGGER` to `anon` and `authenticated`; payroll_events is the exception.
- Functions `public.set_updated_at` and `public.protect_profile_role` lack fixed search_path. No public-schema SECURITY DEFINER functions were found.
- `supabase_realtime` publishes 16 public tables, but no `enka_*` tables.
- Payroll and Enka tables exist but canonical migration history does not contain their corresponding repository migration versions.

## Rollout order (STOP after any failure)
1. Snapshot **schema and migration history only**. Verify production backups and restore process without copying personal records to AI tools.
2. Reconcile migration drift in a **separate disposable DB**, by comparing catalog definitions, constraints, policy SQL, triggers and publication membership. Do not mark migrations applied or replay them in production.
3. Run `docs/sql/p0-preflight-readonly.sql` on production (SELECT-only), capture metadata output.
4. In an isolated staging instance with fictional users, apply `docs/sql/p0-hardening-proposal.sql` manually. Run UI/API CRUD and isolation tests as anon, user A, user B.
5. Review impact: no client needs TRUNCATE/TRIGGER, and profile role remains immutable for ordinary users; service/admin migration flows still function.
6. Obtain explicit authorization for a separately authored, versioned production migration, with scheduled monitoring and rollback.

## Acceptance criteria
- Anon user cannot read or change any user-owned records.
- User A cannot read/update/delete User B's rows; cannot reassign `user_id`.
- Authenticated users retain permitted CRUD on their own rows and storage.
- Both users cannot TRUNCATE tables or create triggers.
- Profile `role` cannot be elevated by an authenticated client; administrative service workflows remain functional.
- No difference in row counts, financial balances, or calendar activities across upgrade tests.
- Migration comparison documents explain Enka core, payroll and shortcuts versions without relying on blind replay.

## Rollback (staging first)
- Capture grants via `information_schema.role_table_grants` and function configs via `pg_proc.proconfig` *before* any stage change.
- Restore only grants actually removed using a reviewed `GRANT TRUNCATE, TRIGGER ON TABLE ... TO anon,authenticated` script if urgently needed.
- Restore original function configs with `ALTER FUNCTION ... RESET search_path` only if verified safe and necessary.
- Never use a data-destructive rollback or restore an entire production database for these metadata-only changes.
- Require explicit human approval before production writes.

## Migration drift — do not auto-fix
- Enka repo: `20260929143000_create_enka_core.sql` exists; version absent from live migration ledger while tables exist.
- PocketFlow repo: `20261013120000_payroll_events.sql` exists; version absent while table exists.
- PocketFlow repo: `20261016_quick_expense_shortcuts.sql` differs from live version `20261016075901`.
- Treat PocketFlow repo as candidate canonical home for *shared* DB migrations; Enka should not independently replay copies of PocketFlow foundation migrations. Decide ownership after comparing live schemas.
