-- SELECT-only verification of P0 metadata. No personal row contents.
SELECT c.relname, c.relrowsecurity AS rls,
       has_table_privilege('anon',c.oid,'TRUNCATE') AS anon_truncate,
       has_table_privilege('authenticated',c.oid,'TRUNCATE') AS authenticated_truncate,
       has_table_privilege('anon',c.oid,'TRIGGER') AS anon_trigger
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;
SELECT p.proname,p.prosecdef,p.proconfig FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' ORDER BY p.proname;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
SELECT pubname,schemaname,tablename FROM pg_publication_tables ORDER BY pubname,schemaname,tablename;
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
