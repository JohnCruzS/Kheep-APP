-- ============================================================================
-- KHEEP v2 — Endurecimiento según Security Advisor
-- ============================================================================

-- 1) fn_touch_updated_at no tenía search_path fijo (se me pasó al crearla)
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Mover pg_trgm fuera de "public" (relocatable: no rompe los índices
--    gin ya creados, solo reubica el esquema de la extensión).
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- 3) Quitar EXECUTE público sobre nuestras funciones y otorgar solo lo
--    necesario:
--    - is_admin() se evalúa dentro de policies que también corren para
--      anon (ej. el select público de publicaciones), así que anon Y
--      authenticated necesitan poder ejecutarla.
--    - Las funciones de trigger (fn_set_estado_publicacion,
--      fn_limitar_productos, fn_log_moderacion, fn_touch_updated_at) no
--      las llama ningún usuario directamente, solo el propio trigger; no
--      necesitan EXECUTE público ni siquiera para authenticated.
revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to anon, authenticated;

revoke execute on function public.fn_set_estado_publicacion() from public;
revoke execute on function public.fn_limitar_productos() from public;
revoke execute on function public.fn_log_moderacion() from public;
revoke execute on function public.fn_touch_updated_at() from public;
