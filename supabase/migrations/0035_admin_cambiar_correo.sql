-- ============================================================================
-- 0035 · Cambiar el correo de un administrador
-- ============================================================================
-- En Admins, tocar el correo de una tarjeta abre la ventana para cambiarlo:
-- el de un administrador de zona o el propio del administrador general.
--
-- El correo vive en auth.users (fuera de la API): lo cambia esta función,
-- solo para el administrador general. El cambio es inmediato —sin el correo
-- de confirmación que manda Supabase cuando cada uno cambia el suyo—, porque
-- lo hace quien administra las cuentas.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

create or replace function public.admin_cambiar_correo(p_usuario uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general puede cambiar correos.';
  end if;
  -- El propio, o el de un administrador de zona. El de otro general, no.
  if p_usuario <> auth.uid()
     and not exists (select 1 from public.profiles where id = p_usuario and rol = 'admin_zona') then
    raise exception 'Solo se puede cambiar el correo propio o el de un administrador de zona.';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ese correo no es válido.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_usuario) then
    raise exception 'Ese correo ya lo usa otra cuenta.';
  end if;

  update auth.users
     set email = v_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = p_usuario;

  -- La identidad de "correo y clave" guarda también el correo: se actualiza
  -- para que el acceso siga funcionando con el nuevo.
  update auth.identities
     set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)),
         updated_at = now()
   where user_id = p_usuario and provider = 'email';
end;
$$;
revoke execute on function public.admin_cambiar_correo(uuid, text) from public;
grant  execute on function public.admin_cambiar_correo(uuid, text) to authenticated;
