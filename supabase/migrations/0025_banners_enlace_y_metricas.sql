-- ============================================================================
-- KHEEP v2 — Banners: enlace propio y métricas (documento EDIT APP)
-- ============================================================================
-- El documento pide tres cosas que hoy no existen:
--   1. Tocar un banner lleva a un enlace ("Click sobre banner a enlace
--      directo"): hasta ahora el banner era una imagen y nada más.
--   2. Cada banner muestra cuántas veces se vio y cuántas se tocó
--      ("Vistas 250 · Enlace 25"), para que el comerciante sepa qué pagó.
--   3. Un cupo de banners por comuna ("3/5"): el carrusel no puede crecer
--      sin freno o deja de verse ninguno.
--
-- Los contadores viven en la propia fila del banner, no en una tabla de
-- eventos: acá solo interesa el total, y una fila por vista sería el mismo
-- problema de crecimiento que ya resolvimos con los clics de WhatsApp (0022).
-- ============================================================================

alter table public.banners add column if not exists enlace text;
alter table public.banners add column if not exists vistas integer not null default 0;
alter table public.banners add column if not exists clics  integer not null default 0;

comment on column public.banners.enlace is
  'A dónde lleva tocar el banner. Solo http/https; null = el banner no lleva a ninguna parte.';

-- Un enlace mal escrito no abre nada y no hay forma de notarlo desde la app:
-- se rechaza al guardar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'banners_enlace_valido') then
    alter table public.banners
      add constraint banners_enlace_valido
      check (enlace is null or enlace ~* '^https?://[^\s]+$');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Contadores
-- ----------------------------------------------------------------------------
-- Cualquiera puede sumar (el catálogo es público y lo ve gente sin cuenta),
-- pero NADIE puede escribir el número directamente: las dos funciones suman
-- de a uno sobre banners activos, y las policies de la tabla siguen dejando
-- escribir solo a su dueño y al admin.

create or replace function public.registrar_vista_banner(p_banner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.banners set vistas = vistas + 1 where id = p_banner and activo;
$$;

create or replace function public.registrar_clic_banner(p_banner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.banners set clics = clics + 1 where id = p_banner and activo;
$$;

revoke execute on function public.registrar_vista_banner(uuid) from public;
revoke execute on function public.registrar_clic_banner(uuid)  from public;
grant  execute on function public.registrar_vista_banner(uuid) to anon, authenticated;
grant  execute on function public.registrar_clic_banner(uuid)  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Cupo por comuna
-- ----------------------------------------------------------------------------
-- Cuántos banners vigentes hay hoy en una comuna. La app lo muestra como
-- "3/5" antes de publicar, y con él decide si todavía queda espacio.
-- Cuenta también los de "todas las comunas", porque ocupan el mismo carrusel.
create or replace function public.banners_vigentes_en_comuna(p_comuna uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
    from public.banners b
   where b.activo
     and b.pagado
     and (b.fecha_inicio is null or b.fecha_inicio <= now())
     and (b.fecha_fin    is null or b.fecha_fin    >= now())
     and (p_comuna is null or b.comuna_id is null or b.comuna_id = p_comuna);
$$;

revoke execute on function public.banners_vigentes_en_comuna(uuid) from public;
grant  execute on function public.banners_vigentes_en_comuna(uuid) to anon, authenticated;
