-- ============================================================================
-- 0040 · Banners: además de las vistas, cuántas personas distintas lo vieron
-- ============================================================================
-- Pedido del cliente: dos contadores por banner.
--   - `vistas`: cuántas veces se mostró (ya existía, 0025).
--   - `vistas_unicas` (nuevo): cuántas personas distintas lo vieron. Cada
--     teléfono manda un identificador propio (al azar, guardado en el
--     teléfono; no es un dato personal) y se cuenta una sola vez por banner,
--     tenga o no cuenta.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.banners add column if not exists vistas_unicas integer not null default 0;

comment on column public.banners.vistas_unicas is
  'Cuántas personas (teléfonos) distintas vieron el banner. Lo suma registrar_vista_banner.';

-- Quién ya lo vio (solo para no contar dos veces a la misma persona).
create table if not exists public.banner_vistas_unicas (
  banner_id  uuid not null references public.banners(id) on delete cascade,
  visitante  text not null check (char_length(visitante) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (banner_id, visitante)
);

-- Nadie la lee ni la escribe directo: solo la función de abajo.
alter table public.banner_vistas_unicas enable row level security;

-- La de 0025 recibía solo el banner; ahora también quién lo ve (opcional,
-- así las versiones viejas de la app siguen sumando vistas).
drop function if exists public.registrar_vista_banner(uuid);
drop function if exists public.registrar_vista_banner(uuid, text);

create function public.registrar_vista_banner(p_banner uuid, p_visitante text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.banners set vistas = vistas + 1 where id = p_banner and activo;
  if not found or p_visitante is null or char_length(p_visitante) not between 8 and 64 then
    return;
  end if;

  insert into public.banner_vistas_unicas (banner_id, visitante)
  values (p_banner, p_visitante)
  on conflict do nothing;

  -- Primera vez que esta persona lo ve.
  if found then
    update public.banners set vistas_unicas = vistas_unicas + 1 where id = p_banner;
  end if;
end;
$$;

revoke execute on function public.registrar_vista_banner(uuid, text) from public;
grant  execute on function public.registrar_vista_banner(uuid, text) to anon, authenticated;
