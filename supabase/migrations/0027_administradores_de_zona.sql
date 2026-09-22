-- ============================================================================
-- KHEEP v2 — Administradores de zona
-- ============================================================================
-- Hasta ahora había un solo tipo de administrador: el que puede todo, en todo
-- el país. Esta migración agrega el ADMINISTRADOR DE ZONA: una persona a la
-- que el administrador general le asigna una o varias comunas —o regiones
-- enteras— y le da algunos permisos para trabajar SOLO ahí.
--
-- Permisos que se pueden dar (y nada más):
--   moderar        aprobar o rechazar las publicaciones de su zona
--   categorias     ordenar, mostrar, ocultar y crear categorías en su zona
--   publicaciones  dar de baja publicaciones de su zona
--   banners        publicar/quitar banners en su zona y ver sus métricas
--
-- Lo que sigue siendo solo del administrador general: el título de la app,
-- la limpieza, crear o quitar administradores, eliminar cuentas, dar libre
-- publicación y mostrar u ocultar comunas enteras.
--
-- Todo se decide en la base, no en la app: aunque alguien modifique el
-- teléfono, fuera de su zona la base simplemente no le deja hacer nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. El rol
-- ----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles
  add constraint profiles_rol_check check (rol in ('comerciante', 'admin', 'admin_zona'));

-- ----------------------------------------------------------------------------
-- 2. Quién es administrador de qué
-- ----------------------------------------------------------------------------
-- Las regiones se guardan por nombre y no se expanden a comunas al asignar:
-- así, si mañana se agrega una comuna a esa región, ya queda cubierta.
create table if not exists public.administradores_zona (
  usuario_id  uuid primary key references public.profiles(id) on delete cascade,
  permisos    text[] not null default '{}',
  regiones    text[] not null default '{}',
  comunas     uuid[] not null default '{}',
  creado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint administradores_zona_permisos_validos
    check (permisos <@ array['moderar', 'categorias', 'publicaciones', 'banners']::text[])
);

comment on table public.administradores_zona is
  'Administradores con alcance limitado: qué comunas/regiones cubren y qué pueden hacer ahí.';

alter table public.administradores_zona enable row level security;

drop policy if exists "administradores_zona: el general ve todo, cada uno lo suyo" on public.administradores_zona;
create policy "administradores_zona: el general ve todo, cada uno lo suyo"
  on public.administradores_zona for select
  using (public.is_admin() or usuario_id = auth.uid());
-- Sin policies de escritura: solo se escribe con las funciones de abajo, que
-- comprueban que quien llama es el administrador general.

-- ----------------------------------------------------------------------------
-- 3. La pregunta que se hace en todas partes
-- ----------------------------------------------------------------------------
-- ¿Quien llama es administrador de zona de esta comuna, con este permiso?
create or replace function public.comuna_en_mi_zona(p_comuna uuid, p_permiso text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_comuna is not null and exists (
    select 1
      from public.administradores_zona z
      join public.profiles pr on pr.id = z.usuario_id and pr.rol = 'admin_zona'
     where z.usuario_id = auth.uid()
       and p_permiso = any (z.permisos)
       and (
         p_comuna = any (z.comunas)
         or exists (
           select 1 from public.comunas c
            where c.id = p_comuna and c.region = any (z.regiones)
         )
       )
  );
$$;

-- ¿Puede hacerlo? El general siempre; el de zona, solo en la suya.
create or replace function public.puede_en_comuna(p_comuna uuid, p_permiso text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or public.comuna_en_mi_zona(p_comuna, p_permiso);
$$;

-- Lo que la app necesita saber para armar sus pantallas.
create or replace function public.mis_permisos_admin()
returns table (es_general boolean, permisos text[], comunas uuid[])
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_admin(),
    coalesce((select z.permisos from public.administradores_zona z where z.usuario_id = auth.uid()), '{}'),
    coalesce((
      select array_agg(distinct c.id)
        from public.administradores_zona z
        join public.comunas c on c.id = any (z.comunas) or c.region = any (z.regiones)
       where z.usuario_id = auth.uid()
    ), '{}');
$$;

revoke execute on function public.comuna_en_mi_zona(uuid, text) from public;
revoke execute on function public.puede_en_comuna(uuid, text)   from public;
revoke execute on function public.mis_permisos_admin()           from public;
grant  execute on function public.comuna_en_mi_zona(uuid, text) to anon, authenticated;
grant  execute on function public.puede_en_comuna(uuid, text)   to anon, authenticated;
grant  execute on function public.mis_permisos_admin()           to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Administrarlos (solo el administrador general)
-- ----------------------------------------------------------------------------
create or replace function public.asignar_admin_zona(
  p_usuario  uuid,
  p_permisos text[],
  p_regiones text[],
  p_comunas  uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede asignar administradores.';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;
  if exists (select 1 from public.profiles where id = p_usuario and rol = 'admin') then
    raise exception 'Esa cuenta ya es administrador general.';
  end if;
  if coalesce(array_length(p_regiones, 1), 0) = 0 and coalesce(array_length(p_comunas, 1), 0) = 0 then
    raise exception 'Asígnale al menos una comuna o una región.';
  end if;
  if coalesce(array_length(p_permisos, 1), 0) = 0 then
    raise exception 'Dale al menos un permiso.';
  end if;

  insert into public.administradores_zona (usuario_id, permisos, regiones, comunas, creado_por)
  values (p_usuario, p_permisos, coalesce(p_regiones, '{}'), coalesce(p_comunas, '{}'), auth.uid())
  on conflict (usuario_id) do update
    set permisos   = excluded.permisos,
        regiones   = excluded.regiones,
        comunas    = excluded.comunas,
        updated_at = now();

  update public.profiles set rol = 'admin_zona' where id = p_usuario;
end;
$$;

create or replace function public.quitar_admin_zona(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede quitar administradores.';
  end if;
  delete from public.administradores_zona where usuario_id = p_usuario;
  -- Vuelve a ser una cuenta normal: sus publicaciones, si tiene, siguen.
  update public.profiles set rol = 'comerciante' where id = p_usuario and rol = 'admin_zona';
end;
$$;

-- La lista del panel, con el correo (vive en auth.users, fuera de la API).
create or replace function public.listar_admins_zona()
returns table (
  usuario_id uuid, nombre text, email text,
  permisos text[], regiones text[], comunas uuid[], created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede ver los administradores.';
  end if;
  return query
    select z.usuario_id, p.nombre, u.email::text, z.permisos, z.regiones, z.comunas, z.created_at
      from public.administradores_zona z
      join public.profiles p on p.id = z.usuario_id
      join auth.users u on u.id = z.usuario_id
     order by p.nombre;
end;
$$;

-- Para cuando el correo que se escribe ya tiene cuenta: se asciende esa.
create or replace function public.buscar_cuenta_por_correo(p_email text)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede buscar cuentas.';
  end if;
  return (select id from auth.users where lower(email) = lower(trim(p_email)) limit 1);
end;
$$;

revoke execute on function public.asignar_admin_zona(uuid, text[], text[], uuid[]) from public, anon;
revoke execute on function public.quitar_admin_zona(uuid)                           from public, anon;
revoke execute on function public.listar_admins_zona()                              from public, anon;
revoke execute on function public.buscar_cuenta_por_correo(text)                    from public, anon;
grant  execute on function public.asignar_admin_zona(uuid, text[], text[], uuid[]) to authenticated;
grant  execute on function public.quitar_admin_zona(uuid)                           to authenticated;
grant  execute on function public.listar_admins_zona()                              to authenticated;
grant  execute on function public.buscar_cuenta_por_correo(text)                    to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Lo que pueden hacer en su zona
-- ----------------------------------------------------------------------------

-- Publicaciones: ver las de su zona en cualquier estado (para aprobar las
-- pendientes) y actualizarlas (aprobar, dar de baja, o moverlas a "Otro" al
-- quitar una categoría). El `with check` impide sacarlas de su zona.
drop policy if exists "publicaciones: admin de zona ve las de su zona" on public.publicaciones;
create policy "publicaciones: admin de zona ve las de su zona"
  on public.publicaciones for select
  using (
    public.comuna_en_mi_zona(comuna_id, 'moderar')
    or public.comuna_en_mi_zona(comuna_id, 'publicaciones')
    or public.comuna_en_mi_zona(comuna_id, 'categorias')
  );

drop policy if exists "publicaciones: admin de zona actualiza las de su zona" on public.publicaciones;
create policy "publicaciones: admin de zona actualiza las de su zona"
  on public.publicaciones for update
  using (
    public.comuna_en_mi_zona(comuna_id, 'moderar')
    or public.comuna_en_mi_zona(comuna_id, 'publicaciones')
    or public.comuna_en_mi_zona(comuna_id, 'categorias')
  )
  with check (
    public.comuna_en_mi_zona(comuna_id, 'moderar')
    or public.comuna_en_mi_zona(comuna_id, 'publicaciones')
    or public.comuna_en_mi_zona(comuna_id, 'categorias')
  );

-- Categorías de su comuna.
drop policy if exists "categorias_comuna: admin de zona gestiona su zona" on public.categorias_comuna;
create policy "categorias_comuna: admin de zona gestiona su zona"
  on public.categorias_comuna for all
  using (public.comuna_en_mi_zona(comuna_id, 'categorias'))
  with check (public.comuna_en_mi_zona(comuna_id, 'categorias'));

-- Crear una categoría nueva para su comuna: nace APAGADA en la lista general,
-- así no aparece en ninguna otra comuna. Renombrar o borrar categorías, que
-- afecta a todo el país, sigue siendo del administrador general.
drop policy if exists "categorias: admin de zona crea para su zona" on public.categorias;
create policy "categorias: admin de zona crea para su zona"
  on public.categorias for insert
  with check (
    activa = false
    and exists (
      select 1 from public.administradores_zona z
       where z.usuario_id = auth.uid() and 'categorias' = any (z.permisos)
    )
  );

-- Independizar la lista de categorías de su comuna (la primera vez que la toca).
create or replace function public.admin_personalizar_comuna(p_comuna uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_en_comuna(p_comuna, 'categorias') then
    raise exception 'No puedes configurar las categorías de esta comuna.';
  end if;

  if exists (select 1 from public.comunas where id = p_comuna and categorias_personalizadas) then
    return;   -- ya es independiente: no se pisa lo que se haya dejado
  end if;

  insert into public.categorias_comuna (comuna_id, categoria_id, visible, orden)
  select p_comuna, c.id, c.activa, c.orden
    from public.categorias c
  on conflict (comuna_id, categoria_id) do nothing;

  update public.comunas set categorias_personalizadas = true where id = p_comuna;
end;
$$;

-- Banners de su zona: quitarlos o editarlos. Nunca los de "todas las
-- comunas" (comuna_id null), que son del administrador general.
drop policy if exists "banners: admin de zona administra los de su zona" on public.banners;
create policy "banners: admin de zona administra los de su zona"
  on public.banners for all
  using (public.comuna_en_mi_zona(comuna_id, 'banners'))
  with check (public.comuna_en_mi_zona(comuna_id, 'banners'));

-- Y publicarlos sin pasar por el cobro, igual que el general, pero solo en
-- una comuna de su zona. Si no, el banner nace sin pagar, como el de
-- cualquier comerciante.
create or replace function public.fn_banner_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  autor_es_admin boolean;
  autor_de_zona  boolean;
begin
  select (rol = 'admin') into autor_es_admin from public.profiles where id = new.usuario_id;

  select exists (
    select 1
      from public.administradores_zona z
      join public.profiles pr on pr.id = z.usuario_id and pr.rol = 'admin_zona'
     where z.usuario_id = new.usuario_id
       and 'banners' = any (z.permisos)
       and new.comuna_id is not null
       and (
         new.comuna_id = any (z.comunas)
         or exists (select 1 from public.comunas c where c.id = new.comuna_id and c.region = any (z.regiones))
       )
  ) into autor_de_zona;

  if coalesce(autor_es_admin, false) or coalesce(autor_de_zona, false) then
    new.fecha_inicio := coalesce(new.fecha_inicio, now());
    if new.dias is not null then
      new.fecha_fin := new.fecha_inicio + make_interval(days => new.dias);
    end if;
    -- La prioridad en el carrusel es solo del general.
    if not coalesce(autor_es_admin, false) then
      new.orden := greatest(new.orden, 0);
    end if;
  else
    new.activo := false;
    new.pagado := false;
    new.fecha_inicio := null;
    new.fecha_fin := null;
    new.orden := greatest(new.orden, 0);
  end if;

  return new;
end;
$$;

-- Métricas de su zona: los clics de las publicaciones de sus comunas.
drop policy if exists "whatsapp_clics: admin de zona lee los de su zona" on public.whatsapp_clics;
create policy "whatsapp_clics: admin de zona lee los de su zona"
  on public.whatsapp_clics for select
  using (exists (
    select 1 from public.publicaciones p
     where p.id = publicacion_id and public.comuna_en_mi_zona(p.comuna_id, 'banners')
  ));

drop policy if exists "clics_diarios: admin de zona lee los de su zona" on public.whatsapp_clics_diarios;
create policy "clics_diarios: admin de zona lee los de su zona"
  on public.whatsapp_clics_diarios for select
  using (exists (
    select 1 from public.publicaciones p
     where p.id = publicacion_id and public.comuna_en_mi_zona(p.comuna_id, 'banners')
  ));

-- La vista de métricas gana la comuna al final, para que la app pueda
-- mostrarle a cada administrador de zona solo lo suyo.
create or replace view public.vista_metricas_publicacion as
  with clics_por_dia as (
    select w.publicacion_id, w.created_at::date as dia, count(*)::bigint as clics
      from public.whatsapp_clics w
     group by w.publicacion_id, w.created_at::date
    union all
    select d.publicacion_id, d.dia, d.clics::bigint
      from public.whatsapp_clics_diarios d
  )
  select
    p.id as publicacion_id,
    p.titulo,
    coalesce(sum(c.clics), 0)::bigint as total_clics_whatsapp,
    count(distinct c.dia)::bigint as dias_con_actividad,
    p.comuna_id
  from public.publicaciones p
  left join clics_por_dia c on c.publicacion_id = p.id
  group by p.id, p.titulo, p.comuna_id;

alter view public.vista_metricas_publicacion set (security_invoker = on);
revoke all on public.vista_metricas_publicacion from anon;
grant select on public.vista_metricas_publicacion to authenticated;
