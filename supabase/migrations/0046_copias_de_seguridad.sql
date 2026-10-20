-- ============================================================================
-- 0046 · Copias de seguridad de la configuración
-- ============================================================================
-- Pedido del cliente: un botón para guardar cómo está configurada la app en
-- una fecha y otro para volver a esa versión si algo se desordena.
--
-- Se guarda la CONFIGURACIÓN (pesa poco):
--   - las categorías (nombre, icono, orden, si están activas);
--   - qué categorías tiene cada comuna, en qué orden y cuáles ocultas;
--   - qué comunas se ven y si tienen lista propia de categorías;
--   - los precios de los banners por región y por comuna.
-- NO se guardan publicaciones, fotos ni cuentas: restaurarlas borraría lo
-- que los comerciantes publicaron después.
--
-- Al restaurar se guarda antes, sola, una copia "Antes de restaurar": así
-- un error también se puede deshacer. Solo el administrador general.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

create table if not exists public.copias_seguridad (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  datos      jsonb not null
);

alter table public.copias_seguridad enable row level security;

drop policy if exists "copias: el general las ve y borra" on public.copias_seguridad;
create policy "copias: el general las ve y borra"
  on public.copias_seguridad for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Guardar una copia de cómo está todo ahora.
-- ----------------------------------------------------------------------------
create or replace function public.crear_copia_seguridad(p_nombre text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede guardar copias.';
  end if;

  insert into public.copias_seguridad (nombre, creado_por, datos)
  values (
    coalesce(nullif(trim(p_nombre), ''), 'Copia'),
    auth.uid(),
    jsonb_build_object(
      'categorias', coalesce((select jsonb_agg(jsonb_build_object(
          'id', c.id, 'nombre', c.nombre, 'icono', c.icono, 'orden', c.orden, 'activa', c.activa))
        from public.categorias c), '[]'::jsonb),
      'categorias_comuna', coalesce((select jsonb_agg(jsonb_build_object(
          'comuna_id', cc.comuna_id, 'categoria_id', cc.categoria_id, 'visible', cc.visible, 'orden', cc.orden))
        from public.categorias_comuna cc), '[]'::jsonb),
      'comunas', coalesce((select jsonb_agg(jsonb_build_object(
          'id', co.id, 'activa', co.activa, 'categorias_personalizadas', co.categorias_personalizadas,
          'precio_banner', co.precio_banner))
        from public.comunas co), '[]'::jsonb),
      'precios_region', coalesce((select jsonb_agg(jsonb_build_object('region', p.region, 'precio', p.precio))
        from public.precios_banner_region p), '[]'::jsonb)
    )
  )
  returning id into nueva;
  return nueva;
end;
$$;

-- ----------------------------------------------------------------------------
-- Volver a una copia. Las categorías creadas después quedan (pueden tener
-- publicaciones), pero fuera de las listas de las comunas, como estaban; las
-- que se borraron después no se pueden recrear.
-- ----------------------------------------------------------------------------
create or replace function public.restaurar_copia_seguridad(p_copia uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede restaurar copias.';
  end if;
  select datos into d from public.copias_seguridad where id = p_copia;
  if d is null then
    raise exception 'No se encontró esa copia.';
  end if;

  -- Por si hay que deshacer.
  perform public.crear_copia_seguridad('Antes de restaurar');

  -- Categorías: nombre, icono, orden y si están activas.
  update public.categorias c
     set nombre = x.nombre, icono = x.icono, orden = x.orden, activa = x.activa
    from jsonb_to_recordset(d->'categorias') as x(id uuid, nombre text, icono text, orden int, activa boolean)
   where c.id = x.id
     and not exists (select 1 from public.categorias o where o.nombre = x.nombre and o.id <> x.id);

  -- Comunas: si se ven, si tienen lista propia y su precio.
  update public.comunas co
     set activa = x.activa,
         categorias_personalizadas = x.categorias_personalizadas,
         precio_banner = x.precio_banner
    from jsonb_to_recordset(d->'comunas')
         as x(id uuid, activa boolean, categorias_personalizadas boolean, precio_banner integer)
   where co.id = x.id;

  -- Categorías de cada comuna: se reemplazan enteras.
  delete from public.categorias_comuna where true; -- "where true": Supabase bloquea DELETE sin WHERE
  insert into public.categorias_comuna (comuna_id, categoria_id, visible, orden)
  select x.comuna_id, x.categoria_id, x.visible, x.orden
    from jsonb_to_recordset(d->'categorias_comuna')
         as x(comuna_id uuid, categoria_id uuid, visible boolean, orden smallint)
   where exists (select 1 from public.comunas where id = x.comuna_id)
     and exists (select 1 from public.categorias where id = x.categoria_id);

  -- Precios por región: se reemplazan enteros.
  delete from public.precios_banner_region where true;
  insert into public.precios_banner_region (region, precio)
  select x.region, x.precio from jsonb_to_recordset(d->'precios_region') as x(region text, precio integer);
end;
$$;

revoke execute on function public.crear_copia_seguridad(text)      from public, anon;
revoke execute on function public.restaurar_copia_seguridad(uuid)  from public, anon;
grant  execute on function public.crear_copia_seguridad(text)      to authenticated;
grant  execute on function public.restaurar_copia_seguridad(uuid)  to authenticated;
