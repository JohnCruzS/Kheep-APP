-- ============================================================================
-- 0043 · Precio de los banners por región y por comuna (por día)
-- ============================================================================
-- Pedido del cliente: cada región tiene su precio por día, y una comuna
-- puede tener uno propio que manda sobre el de su región. Lo que cuesta un
-- banner en una comuna:
--   1. el precio de la comuna, si tiene;
--   2. si no, el de su región;
--   3. si tampoco, el precio base de la app ($500 por día).
-- El comerciante paga los días por la suma de las comunas que elige.
--
-- Todos pueden leer los precios (el comerciante ve el total antes de
-- enviar); solo el administrador general los cambia.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.comunas add column if not exists precio_banner integer;
alter table public.comunas drop constraint if exists comunas_precio_banner_valido;
alter table public.comunas
  add constraint comunas_precio_banner_valido check (precio_banner is null or precio_banner between 1 and 100000000);

comment on column public.comunas.precio_banner is
  'Precio por día de un banner en esta comuna. Null = usa el de su región.';

create table if not exists public.precios_banner_region (
  region text primary key,
  precio integer not null check (precio between 1 and 100000000),
  updated_at timestamptz not null default now()
);

comment on table public.precios_banner_region is
  'Precio por día de un banner en las comunas de cada región que no tengan uno propio.';

alter table public.precios_banner_region enable row level security;

drop policy if exists "precios banner region: lectura pública" on public.precios_banner_region;
create policy "precios banner region: lectura pública"
  on public.precios_banner_region for select using (true);

drop policy if exists "precios banner region: solo el general escribe" on public.precios_banner_region;
create policy "precios banner region: solo el general escribe"
  on public.precios_banner_region for all
  using (public.is_admin()) with check (public.is_admin());
