# P0 isolated CI execution report — 2026-10-19

**Read-only with respect to live Supabase.** All SQL execution took place in GitHub Actions disposable PostgreSQL 17 containers.

## PocketFlow
- Failed runs: [39217247345](https://github.com/martaaterry-cloud/pocketflow/actions/runs/39217247345), [39217268248](https://github.com/martaaterry-cloud/pocketflow/actions/runs/39217268248).
- Root cause observed in logs: `docs/sql/p0-hardening-proposal.sql: No such file or directory` because psql was running inside the service container, not the checkout filesystem.
- Fix: expand the SQL include using Python on the runner before piping to container psql; preserve complete stdout and fail on SQL errors.
- Verified successful run: [39217380286](https://github.com/martaaterry-cloud/pocketflow/actions/runs/39217380286).
- Scope: synthetic accounts and Enka activities plus grant/search_path checks. The **entire live schema is NOT reproduced**; future integration tests must use a clean database built from reconciled migrations.

## Enka
- Initial failed run: [39217307404](https://github.com/martaaterry-cloud/enka/actions/runs/39217307404).
- Cause: the anon test attempted a SELECT without SELECT privileges, so the query raised `permission denied` before RLS could return zero rows.
- Fix: grant anonymous SELECT to the synthetic fixture table; its policy still denies rows.
- Follow-up run: [39217412042](https://github.com/martaaterry-cloud/enka/actions/runs/39217412042). Check final CI status before merging.

## Unfinished checks
- Test UPDATE ownership reassignment and attempt TRUNCATE as actual client roles, not only metadata privilege checks.
- Test profile-role guard and storage policy against a faithful Supabase environment.
- Test migrations from a clean database, idempotence, and schema drift; use only fake users.
- Test realtime delivery, disconnection/reconnect and calendar financial invariants.
- Keep both PRs **draft** and unmerged until explicit approval after all required checks.
