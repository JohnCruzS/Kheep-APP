-- ============================================================================
-- KHEEP v2 — Ficha de usuario: el admin ve el correo de cada cuenta
-- ============================================================================
-- El correo no está en `profiles`: vive en `auth.users`, que la API no expone
-- a nadie (ni siquiera a un admin). Esta función es la única puerta, y solo
-- se abre para un administrador.
--
-- Devuelve también cuándo se creó la cuenta y su último ingreso: ayudan a
-- decidir si una cuenta está abandonada antes de eliminarla.
--
-- La contraseña NO está ni puede estar aquí: Supabase solo guarda su hash, y
-- no hay forma de recuperarla. Para ayudar a alguien que la olvidó está el
-- restablecimiento por correo (ver docs/CORREOS.md).
-- ============================================================================

create or replace function public.admin_datos_de_cuenta(p_perfil uuid)
returns table (email text, creado timestamptz, ultimo_acceso timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los datos de una cuenta.';
  end if;

  return query
    select u.email::text, u.created_at, u.last_sign_in_at
      from auth.users u
     where u.id = p_perfil;
end;
$$;

revoke execute on function public.admin_datos_de_cuenta(uuid) from public, anon;
grant  execute on function public.admin_datos_de_cuenta(uuid) to authenticated;
