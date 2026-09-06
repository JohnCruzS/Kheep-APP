-- ============================================================================
-- KHEEP v2 — Datos de demostración para probar el Catálogo (Semana 2)
-- ============================================================================
-- Solo datos de prueba: comunas, categorías, banners y un par de
-- publicaciones reales colgadas de las cuentas de prueba de la migración
-- 0008, para poder ver la pantalla de Catálogo con contenido real en vez de
-- una lista vacía. Las imágenes son placeholders (placehold.co) — se
-- reemplazan solas en cuanto un comerciante suba su propia foto (Semana 3).
-- ============================================================================

insert into public.comunas (nombre) values
  ('Ñuñoa'), ('Providencia'), ('La Florida'), ('Maipú'), ('San Miguel')
on conflict (nombre) do nothing;

insert into public.categorias (nombre, icono, orden) values
  ('Comida', '🍲', 1),
  ('Ropa', '👕', 2),
  ('Tecnología', '💻', 3),
  ('Hogar', '🪴', 4),
  ('Belleza', '💇', 5)
on conflict (nombre) do nothing;

insert into public.banners (imagen_url, orden) values
  ('https://placehold.co/800x400/FF3B00/FFFFFF/png?text=Feria+de+Otoño', 1),
  ('https://placehold.co/800x400/111111/FFFFFF/png?text=Kheep+Local', 2);

-- Publicación de la cuenta nivel 1: nace "pendiente" automáticamente
-- (fn_set_estado_publicacion) — solo la ve su dueño hasta que un admin la
-- apruebe. Sirve para probar justamente esa vista.
insert into public.publicaciones (usuario_id, titulo, descripcion, categoria_id, comuna_id, telefono, logo_url)
select
  (select id from auth.users where email = 'comerciante.nivel1@kheep.test'),
  'Empanadas Doña Rosa',
  'Empanadas de horno hechas al momento. Pino, queso y napolitanas.',
  (select id from public.categorias where nombre = 'Comida'),
  (select id from public.comunas where nombre = 'Ñuñoa'),
  '+56911111111',
  'https://placehold.co/300x300/FF8A3D/FFFFFF/png?text=DR';

-- Publicaciones de la cuenta nivel 2: aprobadas al instante.
insert into public.publicaciones (usuario_id, titulo, descripcion, categoria_id, comuna_id, telefono, logo_url, destacado)
select
  (select id from auth.users where email = 'comerciante.nivel2@kheep.test'),
  'Ropa Urbana SPA',
  'Ropa de calle y accesorios. Nuevas colecciones cada mes.',
  (select id from public.categorias where nombre = 'Ropa'),
  (select id from public.comunas where nombre = 'Providencia'),
  '+56922222222',
  'https://placehold.co/300x300/5B7BFF/FFFFFF/png?text=RU',
  true;

insert into public.publicaciones (usuario_id, titulo, descripcion, categoria_id, comuna_id, telefono, logo_url)
select
  (select id from auth.users where email = 'comerciante.nivel2@kheep.test'),
  'TecnoFix Reparaciones',
  'Reparación de celulares y notebooks. Diagnóstico gratis.',
  (select id from public.categorias where nombre = 'Tecnología'),
  (select id from public.comunas where nombre = 'Ñuñoa'),
  '+56922222222',
  'https://placehold.co/300x300/33B56C/FFFFFF/png?text=TF';

-- Productos de ejemplo — uno por publicación como mínimo, para que cada
-- tarjeta del catálogo se vea completa (foto + nombre + precio), y varios
-- en la destacada para probar también la ficha de detalle.
insert into public.productos (publicacion_id, nombre, descripcion, precio, imagen_url, orden)
select
  (select id from public.publicaciones where titulo = 'Ropa Urbana SPA'),
  nombre, descripcion, precio, imagen_url, orden
from (values
  ('Polerón oversize', 'Algodón grueso, unisex.', 19990, 'https://placehold.co/300x300/5B7BFF/FFFFFF/png?text=1', 1),
  ('Jockey bordado', 'Bordado a mano.', 8990, 'https://placehold.co/300x300/5B7BFF/FFFFFF/png?text=2', 2),
  ('Bolso cruzado', 'Impermeable.', 14990, 'https://placehold.co/300x300/5B7BFF/FFFFFF/png?text=3', 3)
) as productos_demo(nombre, descripcion, precio, imagen_url, orden);

insert into public.productos (publicacion_id, nombre, descripcion, precio, imagen_url, orden)
values
  (
    (select id from public.publicaciones where titulo = 'Empanadas Doña Rosa'),
    'Empanada de pino', 'La clásica.', 1200, 'https://placehold.co/300x300/FF8A3D/FFFFFF/png?text=Pino', 1
  ),
  (
    (select id from public.publicaciones where titulo = 'TecnoFix Reparaciones'),
    'Cambio de pantalla', 'Incluye vidrio templado.', 39990, 'https://placehold.co/300x300/33B56C/FFFFFF/png?text=Fix', 1
  );
