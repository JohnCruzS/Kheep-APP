-- ============================================================================
-- KHEEP v2 — Retención: que las tablas que crecen sin freno dejen de hacerlo
-- ============================================================================
-- Hasta ahora nada se borraba nunca. Las cascadas limpian lo que cuelga de algo
-- borrado (los productos de una publicación, las publicaciones de un usuario),
-- pero hay cosas que se quedan para siempre aunque ya no sirvan.
--
-- La que de verdad importa es `whatsapp_clics`: una fila por cada contacto,
-- sin techo. Con la app en marcha son decenas de miles al mes, y las métricas
-- del panel las recorren enteras cada vez.
--
-- La solución no es borrarlos —las métricas dejarían de cuadrar— sino
-- COMPRIMIRLOS: del detalle viejo se guarda cuántos clics hubo cada día en cada
-- publicación, que es lo único que el panel muestra. Un mes de tráfico pasa de
-- miles de filas a una por publicación y día.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Resumen diario de clics
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_clics_diarios (
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  dia            date not null,
  clics          integer not null default 0,
  primary key (publicacion_id, dia)
);

comment on table public.whatsapp_clics_diarios is
  'Totales por publicación y día. Sustituye al detalle de whatsapp_clics una vez que envejece.';

alter table public.whatsapp_clics_diarios enable row level security;

-- Mismo criterio que la vista de métricas: son datos de negocio, solo admin.
create policy "clics_diarios: solo admin"
  on public.whatsapp_clics_diarios for select
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Comprimir el detalle viejo
-- ----------------------------------------------------------------------------
-- Todo en una transacción: si se resumiera y fallara el borrado, los clics se
-- contarían dos veces; si se borrara antes de resumir, se perderían.
create or replace function public.comprimir_clics_antiguos(p_dias integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte timestamptz := now() - make_interval(days => greatest(p_dias, 30));
  v_comprimidos integer;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede comprimir las métricas.';
  end if;

  insert into public.whatsapp_clics_diarios (publicacion_id, dia, clics)
  select publicacion_id, created_at::date, count(*)
    from public.whatsapp_clics
   where created_at < v_corte
   group by publicacion_id, created_at::date
  on conflict (publicacion_id, dia) do update
    set clics = public.whatsapp_clics_diarios.clics + excluded.clics;

  delete from public.whatsapp_clics where created_at < v_corte;
  get diagnostics v_comprimidos = row_count;
  return v_comprimidos;
end;
$$;

revoke execute on function public.comprimir_clics_antiguos(integer) from public;
grant  execute on function public.comprimir_clics_antiguos(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Contar lo que ya se puede purgar, sin borrar nada
-- ----------------------------------------------------------------------------
-- La app lo usa para MOSTRAR cuánto se iría antes de que el admin confirme.
create or replace function public.contar_purgables(p_meses integer default 6)
returns table (clics_a_comprimir bigint, banners_vencidos bigint, publicaciones_borradas bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.whatsapp_clics
      where created_at < now() - interval '90 days'),
    (select count(*) from public.banners
      where fecha_fin is not null
        and fecha_fin < now() - make_interval(months => greatest(p_meses, 1))),
    (select count(*) from public.publicaciones
      where deleted_at is not null
        and deleted_at < now() - make_interval(months => greatest(p_meses, 1)));
$$;

revoke execute on function public.contar_purgables(integer) from public;
grant  execute on function public.contar_purgables(integer) to authenticated;
