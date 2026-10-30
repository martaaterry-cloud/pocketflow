# P0 Security extended regression — 2026-10-19

This change runs **only** against disposable GitHub Actions PostgreSQL 17 service containers with fictional users and tables; it has no Supabase production credentials.

## Verified successful CI runs
- PocketFlow: https://github.com/martaaterry-cloud/pocketflow/actions/runs/39217756936
- Enka: https://github.com/martaaterry-cloud/enka/actions/runs/39217759909

## Added
- Both fixtures: assert an authenticated user cannot reassign the user_id of a record to another account.
- PocketFlow: execute an actual TRUNCATE attempt as authenticated and expect insufficient_privilege.
- Ensure fictional rows remain unmodified after blocked operations.
- Existing tests check SELECT isolation and basic CRUD, and PocketFlow's proposed function search_path and grant changes.

## Failures and fixes from earlier CI iterations
- PocketFlow earlier test failed because an included SQL file was searched inside Docker. Fixed by expanding include on runner. See prior report.
- Enka earlier test failed because anonymous SELECT wasn't granted in synthetic fixture, preventing RLS evaluation. Fixed by granting SELECT, with zero visible rows still enforced by policy.

## Not yet validated (gate before any production deployment)
- Full real schema migration application and historical ledger reconciliation.
- Storage and auth integration tests in faithful Supabase staging.
- Profile role trigger behavior with real JWT role contexts.
- Explicit Enka TRUNCATE denial fixture and Realtime reconnect/DELETE delivery.
- No PR merge or production SQL until these gaps are addressed and approved.
