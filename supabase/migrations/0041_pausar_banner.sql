-- ============================================================================
-- 0041 · Pausar un banner sin perder su tiempo
-- ============================================================================
-- Pedido del cliente: en vez de "Visible", un botón de pausa. Pausado, el
-- banner deja de mostrarse y su tiempo se congela; al reanudarlo sigue con lo
-- que le quedaba (la fecha de término se corre lo que duró la pausa).
--
--   pausar:   activo = false, pausado_en = now()
--   reanudar: fecha_fin += now() - pausado_en, activo = true, pausado_en = null
--
-- Se hace en funciones de la base para que el cálculo use la hora del
-- servidor (no la del teléfono) y solo lo pueda hacer quien administra el
-- banner (el general o un admin de zona de esa comuna).
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.banners add column if not exists pausado_en timestamptz;

comment on column public.banners.pausado_en is
  'Desde cuándo está en pausa (null = no pausado). Al reanudar, fecha_fin se corre lo que duró la pausa.';

create or replace function public.puede_administrar_banner(p_banner uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1 from public.banners b
         where b.id = p_banner
           and public.comuna_en_mi_zona(b.comuna_id, 'banners')
      );
$$;

create or replace function public.pausar_banner(p_banner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_administrar_banner(p_banner) then
    raise exception 'No tienes permiso para pausar este banner.';
  end if;
  update public.banners
     set activo = false, pausado_en = coalesce(pausado_en, now())
   where id = p_banner;
end;
$$;

create or replace function public.reanudar_banner(p_banner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_administrar_banner(p_banner) then
    raise exception 'No tienes permiso para reanudar este banner.';
  end if;
  update public.banners
     set fecha_fin = case
                       when fecha_fin is not null and pausado_en is not null
                         then fecha_fin + (now() - pausado_en)
                       else fecha_fin
                     end,
         activo = true,
         pausado_en = null
   where id = p_banner;
end;
$$;

revoke execute on function public.puede_administrar_banner(uuid) from public, anon;
revoke execute on function public.pausar_banner(uuid)            from public, anon;
revoke execute on function public.reanudar_banner(uuid)          from public, anon;
grant  execute on function public.puede_administrar_banner(uuid) to authenticated;
grant  execute on function public.pausar_banner(uuid)            to authenticated;
grant  execute on function public.reanudar_banner(uuid)          to authenticated;
