-- ============================================================================
-- KHEEP v2 — Posición del título (margen superior) + corrección del ancho
-- ============================================================================
-- Dos cosas en esta migración:
--
-- 1) Se agrega `logo_margen_superior_pct`: el espacio desde arriba de la
--    pantalla hasta donde empieza el título, como PORCENTAJE DEL ALTO de la
--    pantalla (no del ancho: el ancho ya lo controla logo_ancho_pct, ver
--    0016). 12 % es el margen superior del diseño original (120 de 1000 en
--    la rejilla del cliente). Es siempre general: a diferencia del ancho, no
--    tiene sentido que cada logo temático tenga su propia posición.
--
-- 2) Se corrige el valor por defecto del ancho (`logo_ancho_pct`), que quedó
--    mal calculado en la migración 0016: el comentario de esa migración
--    dividió 120 (que en la rejilla del cliente es el margen superior, una
--    medida vertical) por 400, y no correspondía. El ancho real de la
--    imagen, tal como lo confirmó el cliente, es 400 de 1000 = 40 %, no
--    30 %. Se corrige el default de la columna y, solo si la fila única
--    todavía tiene el valor viejo (30 — es decir, nadie la cambió a mano
--    todavía desde el panel admin), se actualiza el dato ya guardado.
-- ============================================================================

alter table public.configuracion_marca
  alter column logo_ancho_pct set default 40;

update public.configuracion_marca
  set logo_ancho_pct = 40
  where id = true and logo_ancho_pct = 30;

alter table public.configuracion_marca
  add column logo_margen_superior_pct smallint not null default 12
    constraint configuracion_marca_margen_rango check (logo_margen_superior_pct between 0 and 30);

comment on column public.configuracion_marca.logo_margen_superior_pct is
  'Margen superior del título como % del alto de la pantalla (medida vertical, no confundir con logo_ancho_pct que es % del ancho).';
