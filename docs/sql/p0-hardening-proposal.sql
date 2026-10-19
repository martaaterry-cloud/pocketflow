-- REVIEW ONLY. NOT AN APPLIED MIGRATION.
-- Prototype in disposable staging with fictional data. Do not run on production.
BEGIN;
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT format('%I.%I',n.nspname,c.relname) AS qualified
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p')
             AND c.relname <> 'payroll_events'
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER ON TABLE %s FROM anon, authenticated', t.qualified);
  END LOOP;
END $$;
-- Fix resolution context without changing function bodies.
-- protect_profile_role calls auth.role() already schema-qualified.
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.protect_profile_role() SET search_path = '';
-- SECURITY: trigger function execution privileges should not be publicly granted by default.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_role() FROM PUBLIC;
-- Do not alter auth settings or migration ledger in SQL.
COMMIT;
