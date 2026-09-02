-- ============================================================================
-- KHEEP v2 — Policies de Storage (bucket: logos, productos, banners)
-- ============================================================================
-- Convención de rutas que la app DEBE respetar al subir archivos:
--   logos/{auth.uid()}/logo.jpg
--   productos/{auth.uid()}/{producto_id}.jpg
--   banners/{banner_id}.jpg              (solo admin sube aquí)
--
-- Los tres buckets son públicos para LECTURA (se marcó "Public bucket" al
-- crearlos), pero storage.objects sigue teniendo RLS propio para insert/
-- update/delete, que es lo que controla quién puede escribir dónde.
-- ============================================================================

-- ---------- LOGOS ----------
create policy "logos: lectura pública"
  on storage.objects for select
  using (bucket_id = 'logos');

create policy "logos: el dueño sube solo dentro de su propia carpeta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logos: el dueño actualiza solo su propia carpeta"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos: el dueño borra solo su propia carpeta"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- PRODUCTOS ----------
create policy "productos: lectura pública"
  on storage.objects for select
  using (bucket_id = 'productos');

create policy "productos: el dueño sube solo dentro de su propia carpeta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'productos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "productos: el dueño actualiza solo su propia carpeta"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "productos: el dueño borra solo su propia carpeta"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- BANNERS (solo admin escribe, lectura pública) ----------
create policy "banners: lectura pública"
  on storage.objects for select
  using (bucket_id = 'banners');

create policy "banners: solo admin sube"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'banners' and public.is_admin());

create policy "banners: solo admin actualiza"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'banners' and public.is_admin());

create policy "banners: solo admin borra"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'banners' and public.is_admin());
