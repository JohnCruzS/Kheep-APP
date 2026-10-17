-- ============================================================================
-- 0042 · Banners del admin: modo Principal y duración en horas
-- ============================================================================
-- Pedido del cliente (pantalla "Nuevo" de banners del admin):
--
--   - Modo "Principal" (solo administradores): el banner va primero en el
--     carrusel, pero UNA sola vez por teléfono — la primera vez que se abre
--     la app después de publicarlo. Al salir y volver a entrar queda en el
--     orden normal con los demás. Eso lo decide la app (recuerda en el
--     teléfono cuáles ya mostró primero); acá solo se guarda la marca.
--     Varios principales van entre sí en su orden (el más reciente primero).
--   - Duración en horas además de días: `horas` (si viene, manda sobre
--     `dias`).
--   - `dias` aceptaba de 1 a 30, pero el formulario deja hasta 365: se
--     amplía para que un banner largo no falle al publicarse.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.banners add column if not exists principal boolean not null default false;
alter table public.banners add column if not exists horas integer;

alter table public.banners drop constraint if exists banners_horas_valido;
alter table public.banners
  add constraint banners_horas_valido check (horas is null or horas between 1 and 8760);

alter table public.banners drop constraint if exists banners_dias_check;
alter table public.banners drop constraint if exists banners_dias_valido;
alter table public.banners
  add constraint banners_dias_valido check (dias is null or dias between 1 and 365);

comment on column public.banners.principal is
  'Solo admins: sale primero en el carrusel una vez por teléfono (la primera vez que se abre la app); después, orden normal.';
comment on column public.banners.horas is
  'Duración en horas. Si viene, manda sobre `dias`.';

-- La duración del banner como intervalo.
create or replace function public.duracion_banner(p_dias smallint, p_horas integer)
returns interval
language sql
immutable
as $$
  select case
           when p_horas is not null then make_interval(hours => p_horas)
           else make_interval(days => coalesce(p_dias, 7))
         end;
$$;

-- ----------------------------------------------------------------------------
-- Al crearlo (misma función que 0037, con horas y principal).
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
    if new.dias is not null or new.horas is not null then
      new.fecha_fin := new.fecha_inicio + public.duracion_banner(new.dias, new.horas);
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
    -- "Principal" es solo de los administradores.
    new.principal := false;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Pagar / aprobar (misma función que 0037, con horas y principal).
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
  es_revisor := public.is_admin()
    or public.comuna_en_mi_zona(new.comuna_id, 'banners')
    or public.comuna_en_mi_zona(new.comuna_id, 'moderar');

  if not es_revisor then
    new.activo := old.activo;
    new.fecha_inicio := old.fecha_inicio;
    new.fecha_fin := old.fecha_fin;
    new.orden := old.orden;
    new.principal := old.principal;
    new.pagado := old.pagado or new.pagado;
    if new.estado = 'aprobado' and (
         new.imagen_url is distinct from old.imagen_url
         or new.comuna_id is distinct from old.comuna_id
         or new.dias is distinct from old.dias
         or new.horas is distinct from old.horas
       ) then
      raise exception 'Un banner aprobado no se puede cambiar.';
    end if;
  end if;

  if new.pagado and not old.pagado and new.estado <> 'aprobado' then
    raise exception 'El banner tiene que estar aprobado antes de pagarlo.';
  end if;

  if new.pagado and new.estado = 'aprobado'
     and (not old.pagado or old.estado <> 'aprobado') then
    new.fecha_inicio := now();
    new.fecha_fin := now() + public.duracion_banner(new.dias, new.horas);
    new.activo := true;
  end if;

  if new.estado <> 'aprobado' then
    new.activo := false;
  end if;

  return new;
end;
$$;
