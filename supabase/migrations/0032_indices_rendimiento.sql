-- ============================================================================
-- 0032 · Índices para las consultas que más se usan
-- ============================================================================
-- Con pocos datos no se nota, pero cuando haya miles de publicaciones estas
-- consultas pasarían a recorrer la tabla entera en cada apertura de la app.
-- Cada índice está pensado para una consulta concreta de la app (ver el
-- comentario de cada uno) y la mayoría son PARCIALES: solo guardan las filas
-- que esa consulta puede devolver, así ocupan poco y se mantienen rápidos.
--
-- Ya existían (0001) y no se repiten: productos por publicación, clics de
-- WhatsApp por publicación y los índices simples de publicaciones por comuna,
-- categoría y estado.
--
-- Se puede ejecutar más de una vez sin problema (if not exists).
-- ============================================================================

-- Catálogo del inicio (fetchIndiceCatalogo / fetchPublicacionesPorIds):
--   where comuna_id = ? and estado = 'aprobado' and deleted_at is null
--   order by destacado desc, orden_peso desc
-- Con este índice la base va directo a las publicaciones vigentes de la
-- comuna y ya ordenadas, sin ordenar nada al responder.
create index if not exists idx_publicaciones_catalogo
  on public.publicaciones (comuna_id, destacado desc, orden_peso desc)
  where estado = 'aprobado' and deleted_at is null;

-- "Aprobar" del panel (fetchPublicacionesPendientes):
--   where estado = 'pendiente' and deleted_at is null order by created_at
create index if not exists idx_publicaciones_pendientes
  on public.publicaciones (created_at)
  where estado = 'pendiente' and deleted_at is null;

-- "Mis publicaciones" del comerciante (fetchMisPublicaciones):
--   where usuario_id = ? and deleted_at is null order by created_at desc
create index if not exists idx_publicaciones_usuario
  on public.publicaciones (usuario_id, created_at desc)
  where deleted_at is null;

-- Productos de cada tarjeta, en su orden (el catálogo los pide por
-- publicación y los muestra por `orden`).
create index if not exists idx_productos_publicacion_orden
  on public.productos (publicacion_id, orden);

-- Banners del inicio (fetchBanners): activos, pagados, de la comuna o de
-- todas, ordenados por `orden`.
create index if not exists idx_banners_vigentes
  on public.banners (comuna_id, orden)
  where activo and pagado;

-- Que el planificador de consultas conozca los índices nuevos desde ya.
analyze public.publicaciones;
analyze public.productos;
analyze public.banners;
