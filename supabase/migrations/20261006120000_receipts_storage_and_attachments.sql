-- ==========================================================================
-- PocketFlow: Receipts Storage Bucket, Storage Policies & Movement Attachments
-- ==========================================================================

-- 1. Ampliación de transactions para soporte de metadatos de justificantes
alter table public.transactions
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 2. Ampliación de cash_transactions para soporte de metadatos de justificantes
alter table public.cash_transactions
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 3. Creación/configuración del bucket privado 'receipts' en Supabase Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760, -- 10MB límite máximo por archivo
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 4. Políticas de seguridad en storage.objects para el bucket 'receipts'
-- Los archivos se organizan bajo la ruta: <userId>/<year>/<attachmentId>.<ext>

-- 4.1 Lectura: Un usuario autenticado solo puede leer archivos de su propio directorio
drop policy if exists "Users can view own receipts" on storage.objects;
create policy "Users can view own receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4.2 Subida: Un usuario autenticado solo puede subir archivos a su propio directorio
drop policy if exists "Users can upload own receipts" on storage.objects;
create policy "Users can upload own receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4.3 Actualización: Un usuario autenticado solo puede actualizar archivos de su propio directorio
drop policy if exists "Users can update own receipts" on storage.objects;
create policy "Users can update own receipts"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4.4 Borrado: Un usuario autenticado solo puede borrar archivos de su propio directorio
drop policy if exists "Users can delete own receipts" on storage.objects;
create policy "Users can delete own receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
