-- ============================================================================
-- 0048 · Métricas por rango de fechas
-- ============================================================================
-- Pedido del cliente: las métricas parten en el día en curso y se puede elegir
-- en un calendario otro día o un lapso (desde–hasta). La función de 0045 solo
-- recibía "desde"; ahora recibe también "hasta" (los dos días incluidos, en
-- hora de Chile).
--
-- Además, "Publicados" cuenta NEGOCIOS que publicaron en el lapso (no
-- publicaciones), como pidió el cliente.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

drop function if exists public.metricas_resumen(date);
drop function if exists public.metricas_resumen(date, date);

create function public.metricas_resumen(p_desde date default null, p_hasta date default null)
returns table (tipo text, comuna_id uuid, categoria_id uuid, total bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  cero constant uuid := '00000000-0000-0000-0000-000000000000';
  desde_ts timestamptz := case when p_desde is null then null else (p_desde::timestamp at time zone 'America/Santiago') end;
  -- Hasta el final del día "hasta".
  hasta_ts timestamptz := case when p_hasta is null then null else ((p_hasta + 1)::timestamp at time zone 'America/Santiago') end;
begin
  if not (public.is_admin() or exists (select 1 from public.administradores_zona z where z.usuario_id = auth.uid())) then
    raise exception 'Solo administradores.';
  end if;

  return query
  -- Eventos sumados por día (banners, categorías, inicios de sesión…).
  select m.tipo, m.comuna_id, m.categoria_id, sum(m.total)::bigint
    from public.metricas_diarias m
   where (p_desde is null or m.dia >= p_desde) and (p_hasta is null or m.dia <= p_hasta)
   group by m.tipo, m.comuna_id, m.categoria_id

  -- WhatsApp: el detalle reciente y el resumen de lo antiguo.
  union all
  select 'whatsapp', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(*)::bigint
    from public.whatsapp_clics w join public.publicaciones p on p.id = w.publicacion_id
   where (desde_ts is null or w.created_at >= desde_ts) and (hasta_ts is null or w.created_at < hasta_ts)
   group by p.comuna_id, p.categoria_id
  union all
  select 'whatsapp', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), sum(d.clics)::bigint
    from public.whatsapp_clics_diarios d join public.publicaciones p on p.id = d.publicacion_id
   where (p_desde is null or d.dia >= p_desde) and (p_hasta is null or d.dia <= p_hasta)
   group by p.comuna_id, p.categoria_id

  -- Negocios (total): los que tienen publicaciones hoy, sin importar el lapso.
  union all
  select 'negocios', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(distinct p.usuario_id)::bigint
    from public.publicaciones p
   where p.deleted_at is null
   group by p.comuna_id, p.categoria_id
  -- Registros: cuentas nuevas en el lapso, por dónde publican.
  union all
  select 'negocios_nuevos', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(distinct p.usuario_id)::bigint
    from public.publicaciones p join public.profiles pr on pr.id = p.usuario_id
   where p.deleted_at is null and pr.rol = 'comerciante'
     and (desde_ts is null or pr.created_at >= desde_ts) and (hasta_ts is null or pr.created_at < hasta_ts)
   group by p.comuna_id, p.categoria_id

  -- Publicados: negocios que publicaron en el lapso.
  union all
  select 'publicaciones', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(distinct p.usuario_id)::bigint
    from public.publicaciones p
   where p.deleted_at is null
     and (desde_ts is null or p.created_at >= desde_ts) and (hasta_ts is null or p.created_at < hasta_ts)
   group by p.comuna_id, p.categoria_id
  -- Fotos subidas en el lapso (la del comercio y las de sus productos).
  union all
  select 'fotos', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero),
         (count(pr.imagen_url) + count(distinct case when p.logo_url is not null then p.id end))::bigint
    from public.publicaciones p left join public.productos pr on pr.publicacion_id = p.id
   where p.deleted_at is null
     and (desde_ts is null or p.created_at >= desde_ts) and (hasta_ts is null or p.created_at < hasta_ts)
   group by p.comuna_id, p.categoria_id
  -- Banners publicados en el lapso.
  union all
  select 'banners', coalesce(b.comuna_id, cero), cero, count(*)::bigint
    from public.banners b
   where b.estado = 'aprobado'
     and (desde_ts is null or b.created_at >= desde_ts) and (hasta_ts is null or b.created_at < hasta_ts)
   group by b.comuna_id;
end;
$$;

revoke execute on function public.metricas_resumen(date, date) from public, anon;
grant  execute on function public.metricas_resumen(date, date) to authenticated;
