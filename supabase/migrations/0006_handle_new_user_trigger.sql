-- ============================================================================
-- KHEEP v2 — Crear profiles automáticamente al registrarse
-- ============================================================================
-- Patrón recomendado por Supabase: un trigger en auth.users crea la fila de
-- public.profiles en el mismo instante en que se crea la cuenta, sin
-- depender de que el cliente tenga sesión activa (lo cual NO está garantizado
-- si el proyecto exige confirmación de correo antes de emitir sesión).
-- El trigger corre como dueño de la tabla (SECURITY DEFINER), por lo que
-- Postgres lo exime de RLS automáticamente — no necesita la policy de
-- insert que ya existía para profiles (esa queda como respaldo, sin uso).
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre, telefono_contacto)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    new.raw_user_meta_data->>'telefono_contacto'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
