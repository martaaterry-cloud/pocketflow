-- Solo para PostgreSQL de pruebas: usuarios y datos ficticios, sin conexión al proyecto real.
create schema auth;
create role anon nologin;
create role authenticated nologin;
grant usage on schema auth, public to anon, authenticated;
create table auth.users(id uuid primary key);
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
create table public.transactions(id integer, amount numeric);
insert into public.transactions values(1, 99);

-- APPLY_PAYROLL_MIGRATION
-- APPLY_PAYROLL_MIGRATION

-- APPLY_PAYROLL_NET_FIRST

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at, created_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), '2026-09', 'save', 1000, 65, 10, 835, now(), '1900-01-01');
-- Reintento de la misma operación: no crea otro registro ni sobrescribe importes.
insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), '2026-09', 'save', 2000, 130, 10, 1670, now())
on conflict(user_id, id) do nothing;
do $$
begin
  if (select count(*) from public.payroll_events) <> 1 then raise exception 'Duplicación de eventos'; end if;
  if (select gross from public.payroll_events limit 1) <> 1000 then raise exception 'Reintento sobrescribió datos'; end if;
  if (select created_at from public.payroll_events limit 1) < '2020-01-01' then raise exception 'Cliente controla orden del servidor'; end if;
  begin
    insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', '2026-09', 'save', 1000, 65, 10, 835, now());
    raise exception 'Se pudo escribir para otro usuario';
  exception when insufficient_privilege then null; end;
  begin
    update public.payroll_events set user_id = '22222222-2222-4222-8222-222222222222';
    raise exception 'Se pudo transferir propiedad';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.payroll_events;
    raise exception 'Se pudo borrar el historial';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), '2026-13', 'save', 1000, 65, 10, 835, now());
    raise exception 'Se aceptó mes inválido';
  exception when check_violation then null; end;
  begin
    insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), '2026-09', 'save', 1000, 65, 101, 835, now());
    raise exception 'Se aceptó IRPF inválido';
  exception when check_violation then null; end;
  begin
    insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), '2026-09', 'save', 1000, 65, 10, null, now());
    raise exception 'Se aceptó importe nulo';
  exception when check_violation then null; end;
  begin
    insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), '2026-09', 'save', 1000, 65, 10, 1000, now());
    raise exception 'Se aceptó neto incoherente';
  exception when check_violation then null; end;
  begin
    insert into public.payroll_events(id, user_id, month, kind, client_created_at, sequence)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), '2026-09', 'delete', now(), 9999);
    raise exception 'Se pudo falsificar secuencia';
  exception when sqlstate '428C9' then null; end;
end;
$$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  if (select count(*) from public.payroll_events) <> 0 then raise exception 'Fuga de datos entre usuarios'; end if;
end;
$$;
insert into public.payroll_events(id, user_id, month, kind, gross, social_security, irpf, net, client_created_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), '2026-09', 'save', 2000, 130, 10, 1670, now());
do $$
begin
  if (select count(*) from public.payroll_events) <> 1 then raise exception 'IDs colisionan entre usuarios'; end if;
end;
$$;
commit;

begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.payroll_events;
    raise exception 'Usuario anónimo puede leer';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.payroll_events(id, user_id, month, kind, client_created_at)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', '2026-09', 'delete', now());
    raise exception 'Usuario anónimo puede escribir';
  exception when insufficient_privilege then null; end;
end;
$$;
commit;

do $$
begin
  if (select count(*) from public.payroll_events) <> 2 then raise exception 'Se modificaron registros válidos'; end if;
  if (select sum(amount) from public.transactions) <> 99 then raise exception 'Se alteraron movimientos financieros'; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payroll_events') then
    raise exception 'Realtime no incluye nóminas';
  end if;
end;
$$;
select 'PAYROLL_RLS_OK' as result;

-- Partial salary: same user's net-only record is allowed; no unauthorized reads or financial writes.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.payroll_events(id,user_id,month,kind,gross,social_security,irpf,net,client_created_at)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',auth.uid(),'2026-10','save',null,null,null,1234.56,now());
do $$ begin
  if (select count(*) from public.payroll_events where net=1234.56 and gross is null) <> 1 then
    raise exception 'No se guardó el neto sin PDF';
  end if;
  begin
    insert into public.payroll_events(id,user_id,month,kind,gross,social_security,irpf,net,client_created_at)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',auth.uid(),'2026-10','save',1500,null,null,1200,now());
    raise exception 'Se aceptó una nómina parcialmente rellenada';
  exception when check_violation then null; end;
end $$;
commit;
select 'PAYROLL_NET_FIRST_OK' as result;
