-- ============================================================================
-- KHEEP v2 — El título se coloca por coordenadas dentro de un perímetro
-- ============================================================================
-- Reemplaza por completo la forma anterior de administrar el título (ancho en
-- % del ancho de pantalla + margen superior en % del alto, migraciones 0016 y
-- 0019). Ese modelo mezclaba dos referencias distintas y no permitía mover el
-- logo de lado.
--
-- Ahora son tres medidas, todas en la rejilla de 1000 del cliente, dentro de
-- un perímetro fijo:
--
--   * El perímetro HORIZONTAL es el ancho del banner (el bloque del catálogo).
--   * El perímetro VERTICAL es el espacio desde arriba hasta el banner: 340 de
--     1000 del alto de la pantalla.
--
--   logo_centro_x  Dónde queda el centro del logo de izquierda a derecha.
--                  0 = pegado a la izquierda, 500 = centrado, 1000 = derecha.
--   logo_ancho     Ancho del logo. La imagen escala completa y sin deformarse:
--                  el alto sale solo de la proporción de la imagen.
--   logo_centro_y  Dónde queda el centro del logo de arriba a abajo dentro de
--                  esos 340. 0 = arriba del todo, 1000 = pegado al banner.
--
-- Al ser proporciones y no píxeles, el título queda igual en cualquier
-- teléfono, que es la razón de usar la rejilla del cliente en vez de medidas
-- fijas.
--
-- Los nombres de las restricciones llevan el de su columna (…_logo_ancho_…, y
-- no …_ancho_…) porque la 0016 ya había usado el nombre corto para la columna
-- vieja, y dos restricciones no pueden llamarse igual en la misma tabla.
--
-- La migración se puede ejecutar más de una vez sin romper nada: cada paso
-- comprueba antes si ya está hecho.
-- ============================================================================

alter table public.configuracion_marca
  add column if not exists logo_centro_x smallint not null default 500,
  add column if not exists logo_ancho    smallint not null default 470,
  add column if not exists logo_centro_y smallint not null default 430;

alter table public.configuracion_marca
  drop constraint if exists configuracion_marca_logo_centro_x_rango,
  drop constraint if exists configuracion_marca_logo_ancho_rango,
  drop constraint if exists configuracion_marca_logo_centro_y_rango;

alter table public.configuracion_marca
  add constraint configuracion_marca_logo_centro_x_rango check (logo_centro_x between 0 and 1000),
  add constraint configuracion_marca_logo_ancho_rango    check (logo_ancho between 50 and 1000),
  add constraint configuracion_marca_logo_centro_y_rango check (logo_centro_y between 0 and 1000);

comment on column public.configuracion_marca.logo_centro_x is
  'Centro horizontal del título, 0-1000 sobre el ancho del banner (500 = centrado).';
comment on column public.configuracion_marca.logo_ancho is
  'Ancho del título, 0-1000 sobre el ancho del banner. La imagen escala entera, sin deformarse.';
comment on column public.configuracion_marca.logo_centro_y is
  'Centro vertical del título, 0-1000 dentro del espacio que va de arriba de la pantalla al banner.';

-- Las medidas viejas ya no las mira nadie. Se eliminan para que no queden dos
-- fuentes de verdad sobre cómo se ve el título; sus restricciones se van con
-- las columnas.
alter table public.configuracion_marca
  drop column if exists logo_ancho_pct,
  drop column if exists logo_margen_superior_pct;

-- El tamaño propio por logo temático también desaparece: la posición y el
-- tamaño son del título, no de cada imagen, y tener ambos obligaba a recordar
-- cuál mandaba en cada caso.
alter table public.logos_tematicos
  drop column if exists ancho_pct;
