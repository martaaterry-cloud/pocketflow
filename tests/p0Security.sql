\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 fixture. NEVER connect to Supabase production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$f$;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE TABLE public.accounts (id uuid PRIMARY KEY, user_id uuid NOT NULL, label text);
CREATE TABLE public.enka_activities (id uuid PRIMARY KEY, user_id uuid NOT NULL, title text);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enka_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_accounts ON public.accounts FOR ALL USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY own_enka ON public.enka_activities FOR ALL USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER ON public.accounts,public.enka_activities TO anon,authenticated;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
CREATE FUNCTION public.protect_profile_role() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
\ir ../../docs/sql/p0-hardening-proposal.sql
DO $t$
DECLARE a uuid := '11111111-1111-4111-8111-111111111111'; b uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
 INSERT INTO accounts VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',a,'A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',b,'B');
 INSERT INTO enka_activities VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc',a,'A'),('bbbbbbbb-bbbb-4bbb-8bbb-dddddddddddd',b,'B');
END $t$;
DO $t$
BEGIN
 IF has_table_privilege('anon','public.accounts','TRUNCATE') OR has_table_privilege('authenticated','public.accounts','TRUNCATE') OR has_table_privilege('anon','public.enka_activities','TRIGGER') THEN RAISE EXCEPTION 'P0_GRANTS_FAILED'; END IF;
 IF NOT has_table_privilege('authenticated','public.accounts','SELECT') THEN RAISE EXCEPTION 'CRUD_REVOKED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.set_updated_at()'::regprocedure AND proconfig IS NULL) THEN RAISE EXCEPTION 'SEARCH_PATH_NOT_SET'; END IF;
END $t$;
SET ROLE anon;
DO $t$ BEGIN IF (SELECT count(*) FROM public.accounts)<>0 THEN RAISE EXCEPTION 'ANON_ACCESS'; END IF; END $t$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $t$
BEGIN
 IF (SELECT count(*) FROM public.accounts)<>1 OR (SELECT count(*) FROM public.enka_activities)<>1 THEN RAISE EXCEPTION 'USER_A_READ'; END IF;
 IF EXISTS(SELECT 1 FROM public.accounts WHERE label='B') THEN RAISE EXCEPTION 'CROSS_USER_READ'; END IF;
END $t$;
UPDATE public.accounts SET label='A updated' WHERE label='A';
RESET ROLE;
DO $t$ BEGIN IF (SELECT label FROM accounts WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'A updated' OR (SELECT label FROM accounts WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>'B' THEN RAISE EXCEPTION 'USER_CROSS_UPDATE'; END IF; END $t$;
SELECT 'P0_SECURITY_OK' AS result;
