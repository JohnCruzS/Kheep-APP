-- ============================================================================
-- KHEEP v2 — Tamaño del título (logo) administrable
-- ============================================================================
-- El admin ya puede reemplazar el título "Kheep" por una imagen y programarla
-- por fechas (ver 0015). Ahora además puede ajustar de qué tamaño se ve, y el
-- cambio lo ven todos los usuarios — no es una preferencia de su teléfono.
--
-- El tamaño se guarda como PORCENTAJE DEL ANCHO DE LA PANTALLA, no en
-- píxeles: la app corre en teléfonos de anchos muy distintos y un valor fijo
-- se vería enorme en uno y diminuto en otro. 30 % es el tamaño actual (120 de
-- 400 en la rejilla del diseño).
--
-- Dos niveles, de más específico a más general:
--   1. logos_tematicos.ancho_pct — tamaño propio de ese logo especial. Cada
--      imagen tiene su propia forma (una más ancha, otra más cuadrada), así
--      que el tamaño que le queda bien no es el mismo para todas. Si queda en
--      NULL, ese logo usa el general.
--   2. configuracion_marca.logo_ancho_pct — el general, que aplica al logo
--      normal de la app y a los temáticos que no definieron el suyo.
-- ============================================================================

alter table public.logos_tematicos
  add column ancho_pct smallint
    constraint logos_tematicos_ancho_pct_rango check (ancho_pct is null or (ancho_pct between 15 and 70));

comment on column public.logos_tematicos.ancho_pct is
  'Ancho del logo como % del ancho de la pantalla. NULL = usar configuracion_marca.logo_ancho_pct.';

-- Tabla de una sola fila: `id` solo puede valer true, así que un segundo
-- INSERT choca con la clave primaria y nunca puede haber dos configuraciones
-- contradictorias dando vueltas.
create table public.configuracion_marca (
  id              boolean primary key default true,
  logo_ancho_pct  smallint not null default 30,
  updated_at      timestamptz not null default now(),
  constraint configuracion_marca_fila_unica check (id),
  constraint configuracion_marca_ancho_rango check (logo_ancho_pct between 15 and 70)
);

comment on table public.configuracion_marca is
  'Ajustes visuales de la marca que el admin cambia para todos los usuarios. Siempre tiene exactamente una fila.';

insert into public.configuracion_marca (id) values (true);

alter table public.configuracion_marca enable row level security;

-- Lectura para todos (incluidos los visitantes sin cuenta: el catálogo es
-- público y también muestra el título).
create policy "configuracion_marca: lectura pública"
  on public.configuracion_marca for select
  using (true);

create policy "configuracion_marca: solo admin escribe"
  on public.configuracion_marca for all
  using (public.is_admin())
  with check (public.is_admin());
