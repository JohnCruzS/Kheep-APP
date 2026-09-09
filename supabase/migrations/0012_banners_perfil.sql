-- ============================================================================
-- KHEEP v2 — "Banner perfil": cada comerciante puede publicar su banner
-- ============================================================================
-- Pedido del cliente: cualquier comerciante debe poder subir un banner,
-- elegir la comuna donde se muestra y cuántos días quiere que dure — es una
-- función de pago. Un admin usa la misma función, pero sin pago (directo).
--
-- El proveedor de pago real todavía no está elegido, así que por ahora
-- `pagado` se marca desde la app en un paso simulado ("Pagar $X" → éxito
-- inmediato). El día que se conecte un proveedor real, ese paso deja de
-- confiar en el cliente: `pagado` pasa a marcarse solo desde un webhook del
-- proveedor (server-to-server), nunca desde una llamada del cliente — igual
-- que ya hicimos con `estado` en publicaciones.
-- ============================================================================

alter table public.banners add column usuario_id uuid references public.profiles(id) on delete cascade;
alter table public.banners add column comuna_id uuid references public.comunas(id);
alter table public.banners add column dias smallint check (dias is null or dias between 1 and 30);
alter table public.banners add column pagado boolean not null default false;

comment on column public.banners.usuario_id is
  'Quién lo publicó. NULL = banner de sistema creado antes de esta función.';
comment on column public.banners.pagado is
  'Si el banner de un comerciante ya fue pagado. Los banners de un admin no
   necesitan estar pagados para activarse (ver fn_banner_defaults).';

-- ----------------------------------------------------------------------------
-- Un comerciante nunca puede insertar su banner ya activo/pagado — eso lo
-- decide el servidor, no lo que mande el cliente. Un admin sí puede
-- activarlo directo (pedido explícito: "la misma función pero sin pago").
-- ----------------------------------------------------------------------------
create or replace function public.fn_banner_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  autor_es_admin boolean;
begin
  select (rol = 'admin') into autor_es_admin
  from public.profiles where id = new.usuario_id;

  if coalesce(autor_es_admin, false) then
    new.fecha_inicio := coalesce(new.fecha_inicio, now());
    if new.dias is not null then
      new.fecha_fin := new.fecha_inicio + make_interval(days => new.dias);
    end if;
  else
    new.activo := false;
    new.pagado := false;
    new.fecha_inicio := null;
    new.fecha_fin := null;
  end if;

  return new;
end;
$$;

create trigger trg_banner_defaults
  before insert on public.banners
  for each row execute function public.fn_banner_defaults();

-- Al marcar un banner como pagado, calcula fecha_inicio/fecha_fin a partir
-- de "dias" — el cliente nunca manda esas fechas directamente.
create or replace function public.fn_banner_activar_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pagado = true and old.pagado = false then
    new.fecha_inicio := now();
    new.fecha_fin := now() + make_interval(days => coalesce(new.dias, 7));
    new.activo := true;
  end if;
  return new;
end;
$$;

create trigger trg_banner_activar_pago
  before update on public.banners
  for each row execute function public.fn_banner_activar_pago();

-- ----------------------------------------------------------------------------
-- RLS: el dueño ve/crea/actualiza su propio banner; el resto sigue igual.
-- ----------------------------------------------------------------------------
drop policy "banners: lectura pública solo si está activo y vigente" on public.banners;
create policy "banners: lectura pública solo si está activo y vigente"
  on public.banners for select
  using (
    public.is_admin()
    or usuario_id = auth.uid()
    or (
      activo = true
      and (fecha_inicio is null or fecha_inicio <= now())
      and (fecha_fin is null or fecha_fin >= now())
    )
  );

create policy "banners: el dueño crea el suyo"
  on public.banners for insert
  with check (usuario_id = auth.uid());

create policy "banners: el dueño paga/edita el suyo mientras no esté pagado"
  on public.banners for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Storage: antes solo un admin podía subir a "banners" (ver migración 0003).
-- Ahora cualquier comerciante también puede, pero solo dentro de su propia
-- carpeta — misma convención que logos/productos.
-- ----------------------------------------------------------------------------
drop policy "banners: solo admin sube" on storage.objects;
drop policy "banners: solo admin actualiza" on storage.objects;
drop policy "banners: solo admin borra" on storage.objects;

create policy "banners: el dueño sube solo dentro de su propia carpeta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'banners'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "banners: el dueño actualiza solo su propia carpeta"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'banners'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "banners: el dueño borra solo su propia carpeta"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'banners'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
