-- ============================================================================
-- KHEEP v2 — Suspender cuentas
-- ============================================================================
-- "Ocultar" (profiles.activo = false) solo saca un comercio del catálogo: la
-- persona sigue entrando, publicando y pidiendo banners. SUSPENDER es más:
--
--   1. No puede iniciar sesión. Se usa el bloqueo propio de Supabase Auth
--      (`auth.users.banned_until`), así que se rechaza en el servidor de
--      acceso, no en la app.
--   2. Sus publicaciones desaparecen del catálogo.
--   3. Aunque tuviera una sesión abierta de antes, la base le rechaza crear
--      o editar publicaciones, productos y banners.
--
-- Puede ser por unos días (vuelve sola al vencer) o indefinida. Siempre queda
-- anotado quién la suspendió, cuándo y por qué.
--
-- La suspende el administrador general, o un administrador de zona con el
-- permiso nuevo "suspender", solo si la cuenta publica en su zona.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. El estado de la cuenta
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists suspendida       boolean not null default false;
alter table public.profiles add column if not exists suspension_motivo text;
alter table public.profiles add column if not exists suspendida_hasta  timestamptz;
alter table public.profiles add column if not exists suspendida_por    uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists suspendida_en     timestamptz;

comment on column public.profiles.suspendida_hasta is
  'Hasta cuándo dura la suspensión; null = indefinida. Pasada la fecha, la cuenta vuelve sola.';

-- ¿Está suspendida AHORA? (una suspensión con fecha vencida ya no cuenta)
create or replace function public.cuenta_suspendida(p_usuario uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = p_usuario
       and suspendida
       and (suspendida_hasta is null or suspendida_hasta > now())
  );
$$;

revoke execute on function public.cuenta_suspendida(uuid) from public;
grant  execute on function public.cuenta_suspendida(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. El permiso nuevo para los administradores de zona
-- ----------------------------------------------------------------------------
alter table public.administradores_zona drop constraint if exists administradores_zona_permisos_validos;
alter table public.administradores_zona
  add constraint administradores_zona_permisos_validos
  check (permisos <@ array['moderar', 'categorias', 'publicaciones', 'banners', 'suspender']::text[]);

-- ¿Esa cuenta publica en mi zona? Es lo que le da al administrador de zona
-- algo que decir sobre ella.
create or replace function public.cuenta_en_mi_zona(p_usuario uuid, p_permiso text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.publicaciones p
     where p.usuario_id = p_usuario
       and public.comuna_en_mi_zona(p.comuna_id, p_permiso)
  );
$$;

revoke execute on function public.cuenta_en_mi_zona(uuid, text) from public;
grant  execute on function public.cuenta_en_mi_zona(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Suspender y reactivar
-- ----------------------------------------------------------------------------
create or replace function public.suspender_cuenta(p_usuario uuid, p_motivo text, p_dias integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta timestamptz := case when p_dias is not null and p_dias > 0 then now() + make_interval(days => p_dias) end;
  v_rol   text;
begin
  if not (public.is_admin() or public.cuenta_en_mi_zona(p_usuario, 'suspender')) then
    raise exception 'No puedes suspender esta cuenta.';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puedes suspender tu propia cuenta.';
  end if;

  select rol into v_rol from public.profiles where id = p_usuario;
  if v_rol = 'admin' then
    raise exception 'No se puede suspender a un administrador general.';
  end if;
  if v_rol = 'admin_zona' and not public.is_admin() then
    raise exception 'Solo el administrador general puede suspender a otro administrador.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la suspensión.';
  end if;

  update public.profiles
     set suspendida        = true,
         suspension_motivo = trim(p_motivo),
         suspendida_hasta  = v_hasta,
         suspendida_por    = auth.uid(),
         suspendida_en     = now()
   where id = p_usuario;

  -- El bloqueo de acceso de verdad: Supabase Auth rechaza el inicio de
  -- sesión y la renovación de la sesión mientras dure.
  update auth.users
     set banned_until = coalesce(v_hasta, 'infinity'::timestamptz)
   where id = p_usuario;
end;
$$;

create or replace function public.reactivar_cuenta(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.cuenta_en_mi_zona(p_usuario, 'suspender')) then
    raise exception 'No puedes reactivar esta cuenta.';
  end if;

  update public.profiles
     set suspendida        = false,
         suspension_motivo = null,
         suspendida_hasta  = null,
         suspendida_por    = null,
         suspendida_en     = null
   where id = p_usuario;

  update auth.users set banned_until = null where id = p_usuario;
end;
$$;

revoke execute on function public.suspender_cuenta(uuid, text, integer) from public, anon;
revoke execute on function public.reactivar_cuenta(uuid)               from public, anon;
grant  execute on function public.suspender_cuenta(uuid, text, integer) to authenticated;
grant  execute on function public.reactivar_cuenta(uuid)               to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Sus publicaciones salen del catálogo
-- ----------------------------------------------------------------------------
-- `perfil_visible` es lo que usa la policy del catálogo (0018): un perfil
-- suspendido deja de ser visible igual que uno oculto.
create or replace function public.perfil_visible(p_perfil uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = p_perfil
       and activo
       and not (suspendida and (suspendida_hasta is null or suspendida_hasta > now()))
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. Con una sesión vieja tampoco puede hacer nada
-- ----------------------------------------------------------------------------
-- Una sesión ya abierta dura hasta que vence su token (alrededor de una hora).
-- Estas policies RESTRICTIVAS se suman a todas las demás: aunque otra regla lo
-- permita, una cuenta suspendida no crea ni edita nada.
drop policy if exists "suspendidas: no crean publicaciones" on public.publicaciones;
create policy "suspendidas: no crean publicaciones"
  on public.publicaciones as restrictive for insert to authenticated
  with check (not public.cuenta_suspendida(auth.uid()));

drop policy if exists "suspendidas: no editan publicaciones" on public.publicaciones;
create policy "suspendidas: no editan publicaciones"
  on public.publicaciones as restrictive for update to authenticated
  using (not public.cuenta_suspendida(auth.uid()));

drop policy if exists "suspendidas: no tocan productos" on public.productos;
create policy "suspendidas: no tocan productos"
  on public.productos as restrictive for all to authenticated
  using (not public.cuenta_suspendida(auth.uid()))
  with check (not public.cuenta_suspendida(auth.uid()));

drop policy if exists "suspendidas: no crean banners" on public.banners;
create policy "suspendidas: no crean banners"
  on public.banners as restrictive for insert to authenticated
  with check (not public.cuenta_suspendida(auth.uid()));

drop policy if exists "suspendidas: no editan banners" on public.banners;
create policy "suspendidas: no editan banners"
  on public.banners as restrictive for update to authenticated
  using (not public.cuenta_suspendida(auth.uid()));
