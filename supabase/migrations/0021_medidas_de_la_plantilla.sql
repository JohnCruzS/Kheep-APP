-- ============================================================================
-- KHEEP v2 — Las medidas del título, en la unidad de la plantilla del cliente
-- ============================================================================
-- La 0020 guardó el ancho del título en milésimas del ancho del BANNER y la
-- posición vertical en milésimas del ALTO de la pantalla. Eran dos unidades
-- distintas, y ninguna de las dos es la de la plantilla del cliente.
--
-- En su plantilla, TODO —incluido lo vertical— se mide contra el ancho de la
-- pantalla, que vale 1000:
--
--     400  ancho del título
--     120  desde arriba de la pantalla hasta el título
--     110  alto del título (sale solo del ancho y de la proporción de la
--          imagen: 400 ÷ (483/143) = 118 ≈ 110)
--     110  del título hasta el banner
--     ---
--     340  el perímetro dentro del cual se mueve
--
-- Que el alto se mida contra el ancho es lo que mantiene el bloque
-- proporcionado: medido contra el alto de la pantalla, el título se estiraría
-- en un teléfono alargado y se aplastaría en uno ancho.
--
-- Valores que quedan: ancho 400 y centro vertical 175 (los 120 de margen más
-- la mitad de los 110 de alto). El centro horizontal sigue en 500.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.configuracion_marca
  alter column logo_ancho    set default 400,
  alter column logo_centro_y set default 175;

-- El orden importa: primero se pasan los valores a la unidad nueva y recién
-- después se estrecha la restricción. Al revés, la fila todavía guarda el
-- valor viejo (733, que era una medida contra el alto de la pantalla) y la
-- restricción lo rechaza antes de que el update alcance a arreglarlo.
update public.configuracion_marca
   set logo_ancho = 400,
       logo_centro_y = 175
 where id = true;

-- El centro vertical ahora se cuenta dentro del perímetro de 340.
alter table public.configuracion_marca
  drop constraint if exists configuracion_marca_logo_centro_y_rango;
alter table public.configuracion_marca
  add constraint configuracion_marca_logo_centro_y_rango check (logo_centro_y between 0 and 340);
