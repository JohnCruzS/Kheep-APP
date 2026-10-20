-- ============================================================================
-- 0045 · Métricas por región, comuna y categoría
-- ============================================================================
-- Pedido del cliente (Panel → Métricas): medir
--   1. Enlaces: WhatsApp, banners y toques a categorías.
--   2. Vistas: publicaciones vistas, vistas completas (todas sus fotos) y
--      vistas de banners.
--   4. Negocios: total, nuevos registrados e inicios de sesión.
--   5. Publicaciones: publicaciones, fotos subidas y banners publicados.
-- cada uno por región, comuna y categoría.
--
-- Para que no pese: en vez de guardar una fila por cada toque, se guarda UN
-- número por día, tipo, comuna y categoría que va sumando
-- (`metricas_diarias`). Mil vistas de un mismo día y lugar son una fila.
--
-- Los clics a WhatsApp ya se guardaban (whatsapp_clics y su resumen diario):
-- se leen de ahí. Negocios y publicaciones se cuentan de sus propias tablas.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

create table if not exists public.metricas_diarias (
  dia          date not null,
  tipo         text not null,
  -- Sin comuna o sin categoría se guarda el uuid "cero" (no puede ser null
  -- en una clave primaria).
  comuna_id    uuid not null default '00000000-0000-0000-0000-000000000000',
  categoria_id uuid not null default '00000000-0000-0000-0000-000000000000',
  total        integer not null default 0,
  primary key (dia, tipo, comuna_id, categoria_id)
);

comment on table public.metricas_diarias is
  'Totales por día, tipo de evento, comuna y categoría. Lo suma registrar_evento().';

alter table public.metricas_diarias enable row level security;

drop policy if exists "metricas diarias: admin lee" on public.metricas_diarias;
create policy "metricas diarias: admin lee"
  on public.metricas_diarias for select
  using (public.is_admin() or exists (select 1 from public.administradores_zona z where z.usuario_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- Sumar un evento. Si viene la publicación, su comuna y categoría salen de
-- ella (no se confía en lo que mande el teléfono).
-- ----------------------------------------------------------------------------
create or replace function public.registrar_evento(
  p_tipo        text,
  p_comuna      uuid default null,
  p_categoria   uuid default null,
  p_publicacion uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comuna    uuid := p_comuna;
  v_categoria uuid := p_categoria;
  cero        constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_tipo not in ('banner_clic', 'categoria', 'publicacion_vista', 'publicacion_completa', 'banner_vista') then
    return;
  end if;
  if p_publicacion is not null then
    select comuna_id, categoria_id into v_comuna, v_categoria from public.publicaciones where id = p_publicacion;
  end if;

  insert into public.metricas_diarias (dia, tipo, comuna_id, categoria_id, total)
  values ((now() at time zone 'America/Santiago')::date, p_tipo, coalesce(v_comuna, cero), coalesce(v_categoria, cero), 1)
  on conflict (dia, tipo, comuna_id, categoria_id) do update set total = metricas_diarias.total + 1;
end;
$$;

revoke execute on function public.registrar_evento(text, uuid, uuid, uuid) from public;
grant  execute on function public.registrar_evento(text, uuid, uuid, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Inicio de sesión de un negocio: se cuenta en cada comuna y categoría donde
-- publica (un negocio con dos publicaciones suma en las dos).
-- ----------------------------------------------------------------------------
create or replace function public.registrar_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cero constant uuid := '00000000-0000-0000-0000-000000000000';
  hoy  date := (now() at time zone 'America/Santiago')::date;
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and rol = 'comerciante') then return; end if;

  insert into public.metricas_diarias (dia, tipo, comuna_id, categoria_id, total)
  select hoy, 'login', coalesce(x.comuna_id, cero), coalesce(x.categoria_id, cero), 1
    from (
      select distinct comuna_id, categoria_id
        from public.publicaciones
       where usuario_id = auth.uid() and deleted_at is null
    ) x
  on conflict (dia, tipo, comuna_id, categoria_id) do update set total = metricas_diarias.total + 1;

  -- Sin publicaciones: se cuenta igual, sin comuna ni categoría.
  if not found then
    insert into public.metricas_diarias (dia, tipo, total) values (hoy, 'login', 1)
    on conflict (dia, tipo, comuna_id, categoria_id) do update set total = metricas_diarias.total + 1;
  end if;
end;
$$;

revoke execute on function public.registrar_login() from public, anon;
grant  execute on function public.registrar_login() to authenticated;

-- ----------------------------------------------------------------------------
-- Lo que lee el panel: una fila por tipo, comuna y categoría con su total
-- desde una fecha (null = desde siempre). Incluye WhatsApp y los conteos de
-- negocios y publicaciones. Solo administradores.
-- ----------------------------------------------------------------------------
create or replace function public.metricas_resumen(p_desde date default null)
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
begin
  if not (public.is_admin() or exists (select 1 from public.administradores_zona z where z.usuario_id = auth.uid())) then
    raise exception 'Solo administradores.';
  end if;

  return query
  -- Eventos sumados por día.
  select m.tipo, m.comuna_id, m.categoria_id, sum(m.total)::bigint
    from public.metricas_diarias m
   where p_desde is null or m.dia >= p_desde
   group by m.tipo, m.comuna_id, m.categoria_id

  -- WhatsApp: el detalle reciente y el resumen de lo antiguo.
  union all
  select 'whatsapp', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(*)::bigint
    from public.whatsapp_clics w join public.publicaciones p on p.id = w.publicacion_id
   where desde_ts is null or w.created_at >= desde_ts
   group by p.comuna_id, p.categoria_id
  union all
  select 'whatsapp', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), sum(d.clics)::bigint
    from public.whatsapp_clics_diarios d join public.publicaciones p on p.id = d.publicacion_id
   where p_desde is null or d.dia >= p_desde
   group by p.comuna_id, p.categoria_id

  -- Negocios: los que tienen al menos una publicación, por dónde publican.
  union all
  select 'negocios', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(distinct p.usuario_id)::bigint
    from public.publicaciones p
   where p.deleted_at is null
   group by p.comuna_id, p.categoria_id
  -- Negocios nuevos: cuentas registradas en el periodo, por dónde publican.
  union all
  select 'negocios_nuevos', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(distinct p.usuario_id)::bigint
    from public.publicaciones p join public.profiles pr on pr.id = p.usuario_id
   where p.deleted_at is null and pr.rol = 'comerciante' and (desde_ts is null or pr.created_at >= desde_ts)
   group by p.comuna_id, p.categoria_id

  -- Publicaciones, fotos y banners publicados en el periodo.
  union all
  select 'publicaciones', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero), count(*)::bigint
    from public.publicaciones p
   where p.deleted_at is null and (desde_ts is null or p.created_at >= desde_ts)
   group by p.comuna_id, p.categoria_id
  union all
  select 'fotos', coalesce(p.comuna_id, cero), coalesce(p.categoria_id, cero),
         (count(pr.imagen_url) + count(distinct case when p.logo_url is not null then p.id end))::bigint
    from public.publicaciones p left join public.productos pr on pr.publicacion_id = p.id
   where p.deleted_at is null and (desde_ts is null or p.created_at >= desde_ts)
   group by p.comuna_id, p.categoria_id
  union all
  select 'banners', coalesce(b.comuna_id, cero), cero, count(*)::bigint
    from public.banners b
   where b.estado = 'aprobado' and (desde_ts is null or b.created_at >= desde_ts)
   group by b.comuna_id;
end;
$$;

revoke execute on function public.metricas_resumen(date) from public, anon;
grant  execute on function public.metricas_resumen(date) to authenticated;
