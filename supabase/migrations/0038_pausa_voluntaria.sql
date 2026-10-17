-- ============================================================================
-- 0038 · El comerciante puede pausar su perfil; el admin lo oculta aparte
-- ============================================================================
-- Pedido del cliente: dos interruptores distintos para dejar de mostrar un
-- perfil, con jerarquía:
--
--   - `pausado` (nuevo): lo maneja el propio comerciante desde su perfil, de
--     forma temporal y voluntaria (vacaciones, sin stock…).
--   - `activo` (el de siempre): lo maneja el administrador. Si el admin lo
--     oculta, el comerciante no puede volver a mostrarse por su cuenta.
--
-- El perfil se ve en el catálogo solo si los dos lo permiten.
--
-- Además se cierra un hueco: la policy de 0001 dejaba que el dueño cambiara
-- en su fila columnas que son del administrador (`activo`, la suspensión,
-- `puede_editar`). Ahora un trigger las deja como estaban cuando quien edita
-- es el propio dueño y no es admin.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.profiles add column if not exists pausado boolean not null default false;

comment on column public.profiles.pausado is
  'Pausa voluntaria del propio comerciante: mientras está en true, su perfil y sus publicaciones no se ven. Distinto de `activo`, que lo maneja el admin.';

-- Visible = el admin no lo ocultó, el dueño no lo pausó y no está suspendido.
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
       and not pausado
       and not (suspendida and (suspendida_hasta is null or suspendida_hasta > now()))
  );
$$;

-- ----------------------------------------------------------------------------
-- Lo que es del administrador, el dueño no lo toca.
-- ----------------------------------------------------------------------------
create or replace function public.fn_profiles_columnas_de_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.id and not public.is_admin() then
    new.activo            := old.activo;
    new.suspendida        := old.suspendida;
    new.suspension_motivo := old.suspension_motivo;
    new.suspendida_hasta  := old.suspendida_hasta;
    new.suspendida_por    := old.suspendida_por;
    new.suspendida_en     := old.suspendida_en;
    new.puede_editar      := old.puede_editar;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_columnas_de_admin on public.profiles;
create trigger trg_profiles_columnas_de_admin
  before update on public.profiles
  for each row execute function public.fn_profiles_columnas_de_admin();
