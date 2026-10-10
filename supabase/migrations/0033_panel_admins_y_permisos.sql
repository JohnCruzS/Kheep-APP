-- ============================================================================
-- 0033 · Panel de administradores y permisos por usuario
-- ============================================================================
-- Lo que necesitan las pantallas nuevas del panel:
--
--   1. Pausar un administrador de zona sin quitarlo: el interruptor junto a
--      su nombre. Pausado, conserva su zona y sus permisos guardados, pero no
--      puede hacer nada en el panel hasta que se lo vuelva a activar.
--   2. Cambiar la clave de un administrador de zona: las contraseñas se
--      guardan cifradas y nadie puede verlas, así que el administrador
--      general le fija una nueva.
--   3. Permiso "Editar" por usuario: apagado, el comerciante ya no puede
--      cambiar sus publicaciones ni sus productos (los ve, pero no los toca).
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pausar administradores de zona
-- ----------------------------------------------------------------------------
alter table public.administradores_zona add column if not exists activo boolean not null default true;

-- La pregunta que hacen todas las reglas: ahora, además, tiene que estar activo.
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
       and z.activo
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

-- Lo que la app usa para armar el panel: pausado, sin permisos ni comunas.
create or replace function public.mis_permisos_admin()
returns table (es_general boolean, permisos text[], comunas uuid[])
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_admin(),
    coalesce((select z.permisos from public.administradores_zona z where z.usuario_id = auth.uid() and z.activo), '{}'),
    coalesce((
      select array_agg(distinct c.id)
        from public.administradores_zona z
        join public.comunas c on c.id = any (z.comunas) or c.region = any (z.regiones)
       where z.usuario_id = auth.uid() and z.activo
    ), '{}');
$$;

-- La lista del panel devuelve también si está activo (cambia lo que devuelve,
-- así que hay que borrarla y crearla de nuevo).
drop function if exists public.listar_admins_zona();
create or replace function public.listar_admins_zona()
returns table (
  usuario_id uuid, nombre text, email text,
  permisos text[], regiones text[], comunas uuid[], created_at timestamptz, activo boolean
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
    select z.usuario_id, p.nombre, u.email::text, z.permisos, z.regiones, z.comunas, z.created_at, z.activo
      from public.administradores_zona z
      join public.profiles p on p.id = z.usuario_id
      join auth.users u on u.id = z.usuario_id
     order by p.nombre;
end;
$$;
revoke execute on function public.listar_admins_zona() from public;
grant  execute on function public.listar_admins_zona() to authenticated;

create or replace function public.pausar_admin_zona(p_usuario uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede pausar administradores.';
  end if;
  update public.administradores_zona
     set activo = p_activo, updated_at = now()
   where usuario_id = p_usuario;
  if not found then
    raise exception 'Esa cuenta no es administrador de zona.';
  end if;
end;
$$;
revoke execute on function public.pausar_admin_zona(uuid, boolean) from public;
grant  execute on function public.pausar_admin_zona(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Cambiar la clave de un administrador de zona
-- ----------------------------------------------------------------------------
-- Solo el general, y solo a administradores de zona: la propia se cambia
-- desde la app con la sesión (sin pasar por acá), y a otro general no.
create or replace function public.admin_cambiar_clave(p_usuario uuid, p_clave text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede cambiar claves.';
  end if;
  if not exists (select 1 from public.profiles where id = p_usuario and rol = 'admin_zona') then
    raise exception 'Solo se puede cambiar la clave de un administrador de zona.';
  end if;
  if p_clave is null or length(p_clave) < 6 then
    raise exception 'La clave debe tener al menos 6 caracteres.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_usuario;
end;
$$;
revoke execute on function public.admin_cambiar_clave(uuid, text) from public;
grant  execute on function public.admin_cambiar_clave(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Permiso "Editar" de cada usuario
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists puede_editar boolean not null default true;

comment on column public.profiles.puede_editar is
  'Si el usuario puede cambiar sus propias publicaciones y productos. Lo apaga un administrador.';

-- ¿Quien llama puede editar lo suyo? Los administradores siempre.
create or replace function public.puedo_editar()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select puede_editar or rol in ('admin', 'admin_zona') from public.profiles where id = auth.uid()), true);
$$;
revoke execute on function public.puedo_editar() from public;
grant  execute on function public.puedo_editar() to authenticated;

-- Reglas RESTRICTIVAS: se suman a las demás. Con "Editar" apagado no cambia
-- ni sus publicaciones ni sus productos; un administrador (que no es el
-- dueño) sigue pudiendo aprobar, rechazar o dar de baja.
drop policy if exists "sin permiso de editar: no cambian publicaciones" on public.publicaciones;
create policy "sin permiso de editar: no cambian publicaciones"
  on public.publicaciones as restrictive for update to authenticated
  using (usuario_id <> auth.uid() or public.puedo_editar());

-- Productos: solo cambiar y borrar. Leer no se toca (si no, ni siquiera
-- vería los suyos), y agregar tampoco, para que pueda seguir publicando
-- comercios nuevos.
drop policy if exists "sin permiso de editar: no tocan productos" on public.productos;
drop policy if exists "sin permiso de editar: no cambian productos" on public.productos;
create policy "sin permiso de editar: no cambian productos"
  on public.productos as restrictive for update to authenticated
  using (public.puedo_editar());

drop policy if exists "sin permiso de editar: no borran productos" on public.productos;
create policy "sin permiso de editar: no borran productos"
  on public.productos as restrictive for delete to authenticated
  using (public.puedo_editar());
