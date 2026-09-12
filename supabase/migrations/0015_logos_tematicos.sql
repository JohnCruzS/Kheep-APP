-- ============================================================================
-- KHEEP v2 — Logos temáticos por fecha ("estilo Google Doodle")
-- ============================================================================
-- El título "Kheep" de la app ahora es una imagen. Por defecto se usa la que
-- viene dentro de la app (assets/images/logo-kheep.png), pero el admin puede
-- programar logos especiales para fechas concretas — Fiestas Patrias,
-- Navidad, un aniversario — desde Panel Admin → Logo de la app.
--
-- Regla: si hoy hay algún logo activo cuya fecha de inicio ya llegó y cuya
-- fecha de término no pasó, se muestra ese (el de inicio más reciente gana si
-- se superponen). Si no hay ninguno, la app vuelve sola al logo normal.
-- Fechas vacías = sin límite por ese lado; ambas vacías = permanente.
--
-- Las imágenes se suben al bucket "banners" (ya acepta PNG y el admin ya
-- tiene permiso de escritura ahí, ver 0003/0007/0012), así que no hace falta
-- tocar Storage.
-- ============================================================================

create table public.logos_tematicos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  imagen_url    text not null,
  fecha_inicio  date,
  fecha_fin     date,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint logos_tematicos_rango_valido
    check (fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio)
);

comment on table public.logos_tematicos is
  'Logos especiales por fecha que reemplazan al logo normal de la app mientras están vigentes.';

alter table public.logos_tematicos enable row level security;

-- Lectura: cualquiera ve solo los vigentes hoy (fecha de Chile, no UTC, para
-- que un logo del 18/09 no aparezca a las 21:00 del 17/09). El admin ve
-- todos, incluidos programados y vencidos, para poder administrarlos.
create policy "logos_tematicos: lectura pública solo vigentes"
  on public.logos_tematicos for select
  using (
    public.is_admin()
    or (
      activo = true
      and (fecha_inicio is null or fecha_inicio <= (now() at time zone 'America/Santiago')::date)
      and (fecha_fin    is null or fecha_fin    >= (now() at time zone 'America/Santiago')::date)
    )
  );

create policy "logos_tematicos: solo admin escribe"
  on public.logos_tematicos for all
  using (public.is_admin())
  with check (public.is_admin());
