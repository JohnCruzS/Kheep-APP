-- ============================================================================
-- KHEEP v2 — Agrupar comunas por región (solo estructural/visual)
-- ============================================================================
-- El cliente pidió que la lista de Comunas se vea agrupada por región (con
-- un subtítulo por región, a modo de orden) — a diferencia de Categorías,
-- las comunas NO se pueden crear ni editar desde el admin, solo activar o
-- desactivar cada una. `region` es puramente para agrupar visualmente, no
-- para filtrar el catálogo.
-- ============================================================================

alter table public.comunas add column region text not null default 'Región Metropolitana';

-- Las 5 comunas actuales son todas de la Región Metropolitana — se deja
-- explícito por si más adelante se agregan comunas de otras regiones.
update public.comunas set region = 'Región Metropolitana'
  where nombre in ('Ñuñoa', 'Providencia', 'La Florida', 'Maipú', 'San Miguel');
