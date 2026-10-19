# P0 continuation — isolated regression results (2026-10-19)

No production SQL was executed. Both PRs remain drafts.

## Latest passed checks
- Enka: https://github.com/martaaterry-cloud/enka/actions/runs/39218043409
  - Authenticated user cannot TRUNCATE Enka activities in a synthetic PostgreSQL 17 fixture.
  - Synthetic records remain intact.
- PocketFlow: https://github.com/martaaterry-cloud/pocketflow/actions/runs/39218078060
  - Authenticated user cannot set their own profile role to admin through a synthetic trigger mirroring the existing application logic.

## Scope limitation
These tests operate on fixtures, NOT on a reconstructed production schema. They verify concrete regression scenarios; they do not prove production Auth, Storage, Realtime or the full migration ledger is safe.

## Remaining P0 acceptance gates
1. Reconcile shared migration history and rebuild a disposable database from all canonical schema files.
2. Run role and storage tests using faithful Supabase schemas and JWT claims.
3. Run cross-user authorization tests across actual Enka and PocketFlow tables.
4. Verify Realtime event delivery and reconnect reconciliation.
5. Keep draft PRs unmerged; require approval before deploying any schema or privilege changes.
