-- ============================================================================
-- 0034 · Orden de los administradores de zona
-- ============================================================================
-- En Admins, el administrador general puede ordenar la lista arrastrando las
-- tarjetas. El orden se guarda acá para que se vea igual en cualquier
-- teléfono (antes salían por nombre).
--
-- Se puede ejecutar más de una vez sin problema. No depende de que la 0033
-- ya esté ejecutada.
-- ============================================================================

alter table public.administradores_zona add column if not exists orden  integer not null default 0;
alter table public.administradores_zona add column if not exists activo boolean not null default true;

-- La lista del panel, en el orden elegido (y por nombre entre los que aún no
-- tienen uno). Cambia el orden de lo que devuelve: se borra y se crea de nuevo.
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
     order by z.orden, p.nombre;
end;
$$;
revoke execute on function public.listar_admins_zona() from public;
grant  execute on function public.listar_admins_zona() to authenticated;

-- Guarda el orden: el primero de la lista queda en 0, el segundo en 1...
create or replace function public.ordenar_admins_zona(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede ordenar los administradores.';
  end if;
  update public.administradores_zona z
     set orden = o.posicion - 1, updated_at = now()
    from unnest(p_ids) with ordinality as o(usuario_id, posicion)
   where z.usuario_id = o.usuario_id;
end;
$$;
revoke execute on function public.ordenar_admins_zona(uuid[]) from public;
grant  execute on function public.ordenar_admins_zona(uuid[]) to authenticated;
