-- ============================================================================
-- KHEEP v2 — El alto del título es una medida propia (documento EDIT APP)
-- ============================================================================
-- Hasta ahora el alto salía del ancho y de la forma de la imagen: mover uno
-- movía el otro. El documento los trata como dos parámetros independientes:
--
--   "Ancho": distancia horizontal de extremos laterales de la imagen
--   "Alto":  distancia vertical desde el límite alto a la base de la imagen
--
-- Es decir, el admin estira la imagen a lo ancho y a lo alto por separado.
-- Por eso el alto pasa a guardarse, en las mismas unidades que el resto (el
-- ancho de la pantalla vale 1000).
-- ============================================================================

alter table public.configuracion_marca
  add column if not exists logo_alto integer not null default 110;

comment on column public.configuracion_marca.logo_alto is
  'Alto del título en unidades de la rejilla (el ancho de pantalla = 1000).';

-- Las filas que ya existían traen el default: 110, el alto de la plantilla
-- original del cliente.
update public.configuracion_marca set logo_alto = 110 where logo_alto is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracion_marca_logo_alto_rango') then
    alter table public.configuracion_marca
      add constraint configuracion_marca_logo_alto_rango
      -- No más alto que el perímetro (340): más allá, el título se metería
      -- dentro del banner.
      check (logo_alto between 10 and 340);
  end if;
end $$;
