-- ============================================================================
-- 0047 · Cuánto espacio se usa (Panel → Datos)
-- ============================================================================
-- Pedido del cliente: ver cuánto espacio ocupa la app y cuánto queda, con un
-- gráfico. Supabase no le entrega estos números a la app directamente: esta
-- función los lee de la base (solo el administrador general).
--
--   - la base de datos completa (cuentas, publicaciones, métricas…);
--   - los archivos de cada carpeta del almacenamiento (logos, fotos de
--     productos, banners).
--
-- Los límites del plan (500 MB de base y 1 GB de archivos en el gratuito) los
-- pone la app.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

create or replace function public.espacio_usado()
returns table (tipo text, bytes bigint)
language plpgsql
security definer
stable
set search_path = public, storage
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador general.';
  end if;

  return query
  select 'base_de_datos'::text, pg_database_size(current_database())::bigint
  union all
  select o.bucket_id::text, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    from storage.objects o
   group by o.bucket_id;
end;
$$;

revoke execute on function public.espacio_usado() from public, anon;
grant  execute on function public.espacio_usado() to authenticated;
