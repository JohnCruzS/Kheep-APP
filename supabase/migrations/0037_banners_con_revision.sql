-- ============================================================================
-- 0037 · Los banners de los comerciantes pasan por revisión
-- ============================================================================
-- Igual que las publicaciones (pedido del cliente):
--
--   1. El comerciante crea su banner → queda "pendiente" (no se ve).
--   2. Un administrador lo aprueba o lo rechaza desde Aprobar.
--   3. Aprobado, el comerciante lo paga y recién ahí se activa por sus días.
--      (Se revisa antes de pagar: nadie paga por un banner que después se
--      rechaza.)
--   4. Rechazado, el comerciante cambia la imagen y lo reenvía → vuelve a
--      "pendiente".
--
-- Los banners de los administradores no pasan por revisión: nacen aprobados.
-- Los que ya existían quedan aprobados (no cambia nada para ellos).
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.banners add column if not exists estado text not null default 'aprobado';
alter table public.banners drop constraint if exists banners_estado_valido;
alter table public.banners
  add constraint banners_estado_valido check (estado in ('pendiente', 'aprobado', 'rechazado'));

comment on column public.banners.estado is
  'Revisión del banner: pendiente (recién creado o reenviado), aprobado o rechazado.';

-- ----------------------------------------------------------------------------
-- Al crearlo: el de un comerciante nace pendiente; el de un admin, aprobado.
-- (Misma función que 0027, con el estado agregado.)
-- ----------------------------------------------------------------------------
create or replace function public.fn_banner_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  autor_es_admin boolean;
  autor_de_zona  boolean;
begin
  select (rol = 'admin') into autor_es_admin from public.profiles where id = new.usuario_id;

  select exists (
    select 1
      from public.administradores_zona z
      join public.profiles pr on pr.id = z.usuario_id and pr.rol = 'admin_zona'
     where z.usuario_id = new.usuario_id
       and 'banners' = any (z.permisos)
       and new.comuna_id is not null
       and (
         new.comuna_id = any (z.comunas)
         or exists (select 1 from public.comunas c where c.id = new.comuna_id and c.region = any (z.regiones))
       )
  ) into autor_de_zona;

  if coalesce(autor_es_admin, false) or coalesce(autor_de_zona, false) then
    new.estado := 'aprobado';
    new.fecha_inicio := coalesce(new.fecha_inicio, now());
    if new.dias is not null then
      new.fecha_fin := new.fecha_inicio + make_interval(days => new.dias);
    end if;
    -- La prioridad en el carrusel es solo del general.
    if not coalesce(autor_es_admin, false) then
      new.orden := greatest(new.orden, 0);
    end if;
  else
    new.estado := 'pendiente';
    new.activo := false;
    new.pagado := false;
    new.fecha_inicio := null;
    new.fecha_fin := null;
    new.orden := greatest(new.orden, 0);
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Pagar y aprobar: se activa cuando está aprobado Y pagado.
-- ----------------------------------------------------------------------------
create or replace function public.fn_banner_activar_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  es_revisor boolean;
begin
  -- Quien revisa (el general o un admin de zona de esa comuna) puede tocar
  -- todo. El dueño comerciante no: ni las fechas ni el "activo" (eso lo
  -- calcula esta función), ni cambiar un banner ya aprobado (tendría que
  -- volver a revisión).
  es_revisor := public.is_admin()
    or public.comuna_en_mi_zona(new.comuna_id, 'banners')
    or public.comuna_en_mi_zona(new.comuna_id, 'moderar');

  if not es_revisor then
    new.activo := old.activo;
    new.fecha_inicio := old.fecha_inicio;
    new.fecha_fin := old.fecha_fin;
    new.orden := old.orden;
    new.pagado := old.pagado or new.pagado;
    if new.estado = 'aprobado' and (
         new.imagen_url is distinct from old.imagen_url
         or new.comuna_id is distinct from old.comuna_id
         or new.dias is distinct from old.dias
       ) then
      raise exception 'Un banner aprobado no se puede cambiar.';
    end if;
  end if;

  -- Pagar antes de la aprobación no se puede: se revisa primero.
  if new.pagado and not old.pagado and new.estado <> 'aprobado' then
    raise exception 'El banner tiene que estar aprobado antes de pagarlo.';
  end if;

  -- Se activa al quedar aprobado y pagado (lo que pase último: el pago o la
  -- aprobación), por sus días contados desde ese momento.
  if new.pagado and new.estado = 'aprobado'
     and (not old.pagado or old.estado <> 'aprobado') then
    new.fecha_inicio := now();
    new.fecha_fin := now() + make_interval(days => coalesce(new.dias, 7));
    new.activo := true;
  end if;

  -- Rechazado o reenviado a revisión: deja de verse.
  if new.estado <> 'aprobado' then
    new.activo := false;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- El dueño edita el suyo, pero el estado solo puede devolverlo a revisión
-- (nunca aprobarse a sí mismo).
-- ----------------------------------------------------------------------------
drop policy if exists "banners: el dueño paga/edita el suyo mientras no esté pagado" on public.banners;
drop policy if exists "banners: el dueño edita el suyo (y puede reenviarlo a revisión)" on public.banners;
create policy "banners: el dueño edita el suyo (y puede reenviarlo a revisión)"
  on public.banners for update
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and (
      estado = (select b.estado from public.banners b where b.id = banners.id)
      or estado = 'pendiente'
    )
  );

-- ----------------------------------------------------------------------------
-- Los admins de zona con "Aprobación" revisan los banners de su zona (igual
-- que las publicaciones), aunque no tengan el permiso de banners.
-- ----------------------------------------------------------------------------
drop policy if exists "banners: admin de zona con aprobación los ve" on public.banners;
create policy "banners: admin de zona con aprobación los ve"
  on public.banners for select
  using (public.comuna_en_mi_zona(comuna_id, 'moderar'));

drop policy if exists "banners: admin de zona con aprobación los revisa" on public.banners;
create policy "banners: admin de zona con aprobación los revisa"
  on public.banners for update
  using (public.comuna_en_mi_zona(comuna_id, 'moderar'))
  with check (public.comuna_en_mi_zona(comuna_id, 'moderar'));

create index if not exists idx_banners_pendientes
  on public.banners (created_at)
  where estado = 'pendiente';
