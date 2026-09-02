-- ============================================================================
-- KHEEP v2 — Endurecimiento para producción (Play Store)
-- ============================================================================
-- Cubre: exposición mínima de datos personales, límites reales de tamaño de
-- archivo a nivel de Storage, baja lógica (soft delete) para preservar
-- auditoría, auto-vencimiento de banners, límites de longitud de texto y
-- validación básica de URLs de imagen.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES: dejar de exponer la fila completa al público
-- ----------------------------------------------------------------------------
-- Antes: cualquiera (incluso sin cuenta) podía leer rol/nivel/activo de
-- cualquier usuario. Ahora: la tabla profiles solo la lee el propio dueño
-- o un admin. La vitrina pública usa una vista aparte con solo lo necesario.
drop policy "profiles: cualquiera ve datos públicos básicos" on public.profiles;

create policy "profiles: el dueño o un admin ven la fila completa"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Vista pública: SOLO los campos que un comprador necesita ver de un
-- comercio. Se crea SIN security_invoker a propósito (caso inverso al de
-- vista_metricas_publicacion): esta vista SÍ debe saltarse la nueva RLS
-- restrictiva de profiles para poder mostrar la vitrina a cualquiera.
-- Es el patrón estándar de Supabase para "columnas públicas de una tabla
-- privada". El Security Advisor puede marcarla como "unrestricted" — es
-- intencional, no un descuido; no le agregues security_invoker.
create view public.comercios_publicos as
  select id, nombre, logo_url, telefono_contacto, comuna_id
  from public.profiles
  where activo = true;

revoke all on public.comercios_publicos from anon, authenticated;
grant select on public.comercios_publicos to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. STORAGE: límites reales de tamaño y tipo de archivo
-- ----------------------------------------------------------------------------
-- Esto es la defensa de verdad — la app puede comprimir antes de subir, pero
-- alguien podría saltarse la app y llamar a la API directo. El límite duro
-- vive en el servidor.
update storage.buckets
  set file_size_limit = 2097152, -- 2 MB
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id in ('logos', 'productos');

update storage.buckets
  set file_size_limit = 5242880, -- 5 MB (banners los sube solo el admin)
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'banners';

-- ----------------------------------------------------------------------------
-- 3. PUBLICACIONES: baja lógica en vez de borrado físico
-- ----------------------------------------------------------------------------
alter table public.publicaciones add column deleted_at timestamptz;

drop policy "publicaciones: catálogo público solo muestra aprobadas" on public.publicaciones;
create policy "publicaciones: catálogo público solo muestra aprobadas y no eliminadas"
  on public.publicaciones for select
  using (
    (estado = 'aprobado' and deleted_at is null)
    or usuario_id = auth.uid()
    or public.is_admin()
  );

-- El dueño ya no puede borrar físicamente (perdería el rastro de auditoría);
-- solo puede "eliminar" marcando deleted_at (ya permitido por la policy de
-- update existente, que no restringe esa columna). El borrado físico real
-- queda reservado a admin (ej. para retirar contenido ilegal por ley).
drop policy "publicaciones: el dueño elimina las suyas" on public.publicaciones;
create policy "publicaciones: solo admin borra físicamente"
  on public.publicaciones for delete
  using (public.is_admin());

-- Los productos de una publicación eliminada tampoco deben verse en público
drop policy "productos: visibles si la publicación es visible" on public.productos;
create policy "productos: visibles si la publicación es visible"
  on public.productos for select
  using (
    exists (
      select 1 from public.publicaciones p
      where p.id = productos.publicacion_id
        and (
          (p.estado = 'aprobado' and p.deleted_at is null)
          or p.usuario_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. BANNERS: auto-vencimiento por fecha (sin que el admin tenga que acordarse)
-- ----------------------------------------------------------------------------
drop policy "banners: lectura pública de banners activos" on public.banners;
create policy "banners: lectura pública solo si está activo y vigente"
  on public.banners for select
  using (
    public.is_admin()
    or (
      activo = true
      and (fecha_inicio is null or fecha_inicio <= now())
      and (fecha_fin is null or fecha_fin >= now())
    )
  );

-- ----------------------------------------------------------------------------
-- 5. LÍMITES DE LONGITUD (evitar abuso / bloat de la base de datos)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_nombre_len check (char_length(nombre) <= 100);

alter table public.publicaciones
  add constraint publicaciones_titulo_len check (char_length(titulo) <= 200),
  add constraint publicaciones_descripcion_len check (descripcion is null or char_length(descripcion) <= 1000);

alter table public.productos
  add constraint productos_nombre_len check (char_length(nombre) <= 100),
  add constraint productos_descripcion_len check (descripcion is null or char_length(descripcion) <= 300);

alter table public.categorias
  add constraint categorias_nombre_len check (char_length(nombre) <= 50);

alter table public.reportes
  add constraint reportes_motivo_len check (char_length(motivo) <= 500);

-- ----------------------------------------------------------------------------
-- 6. VALIDACIÓN BÁSICA DE FORMATO (teléfono y URLs de imagen)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_telefono_formato check (
    telefono_contacto is null or telefono_contacto ~ '^\+569\d{8}$'
  );

alter table public.publicaciones
  add constraint publicaciones_telefono_formato check (telefono ~ '^\+569\d{8}$');

alter table public.profiles
  add constraint profiles_logo_url_formato check (logo_url is null or logo_url ~ '^https?://');
alter table public.publicaciones
  add constraint publicaciones_logo_url_formato check (logo_url is null or logo_url ~ '^https?://');
alter table public.productos
  add constraint productos_imagen_url_formato check (imagen_url is null or imagen_url ~ '^https?://');
alter table public.banners
  add constraint banners_imagen_url_formato check (imagen_url ~ '^https?://');
