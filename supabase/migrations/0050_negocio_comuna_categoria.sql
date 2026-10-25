-- 0050 · El comercio tiene UNA comuna y UNA categoría (como una página de negocio)
--
-- Pedido del cliente, con la lógica de una página de negocio de Facebook:
--   - El comerciante elige en su perfil una comuna y una categoría (giro).
--     Sus publicaciones se muestran en esa comuna y, al publicar, la comuna
--     y la categoría ya vienen puestas: son las del perfil.
--   - Si cambia de comuna, TODAS sus publicaciones se mudan con él. Cada una
--     queda en su misma categoría si la nueva comuna la tiene; si no, en
--     "Otro". Su categoría se mantiene si la nueva comuna la tiene; si no,
--     queda vacía hasta que elija una con el botón "Categoría".
--   - Si cambia solo de categoría, sus publicaciones anteriores pasan a
--     "Otro"; las nuevas van a la categoría nueva.
--   - Límite: los 3 primeros cambios son libres; desde el cuarto hay que
--     esperar 7 días desde el anterior. Elegirlas por primera vez no cuenta.
--     La comuna y la categoría se cuentan por separado.
--
-- Las columnas solo se cambian con `cambiar_mi_negocio` (el dueño no puede
-- escribirlas directo: así se respetan los límites).

alter table public.profiles add column if not exists comuna_id uuid references public.comunas(id);
alter table public.profiles add column if not exists categoria_id uuid references public.categorias(id) on delete set null;
alter table public.profiles add column if not exists cambios_comuna integer not null default 0;
alter table public.profiles add column if not exists comuna_cambiada_en timestamptz;
alter table public.profiles add column if not exists cambios_categoria integer not null default 0;
alter table public.profiles add column if not exists categoria_cambiada_en timestamptz;

comment on column public.profiles.categoria_id is
  'Categoría (giro) del comercio en su comuna. Las publicaciones nuevas van acá.';

-- ----------------------------------------------------------------------------
-- El dueño no escribe estas columnas directo (misma función que 0038, con
-- el bloque nuevo al final).
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
    -- Comuna y categoría del comercio: solo con cambiar_mi_negocio.
    if coalesce(current_setting('kheep.cambio_negocio', true), '') <> '1' then
      new.comuna_id             := old.comuna_id;
      new.categoria_id          := old.categoria_id;
      new.cambios_comuna        := old.cambios_comuna;
      new.comuna_cambiada_en    := old.comuna_cambiada_en;
      new.cambios_categoria     := old.cambios_categoria;
      new.categoria_cambiada_en := old.categoria_cambiada_en;
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Si una categoría se muestra en una comuna.
-- ----------------------------------------------------------------------------
create or replace function public.categoria_en_comuna(p_comuna uuid, p_categoria uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.comunas where id = p_comuna and categorias_personalizadas) then
      exists (
        select 1 from public.categorias_comuna
         where comuna_id = p_comuna and categoria_id = p_categoria and visible
      )
    else
      exists (select 1 from public.categorias where id = p_categoria and activa)
  end;
$$;

-- ----------------------------------------------------------------------------
-- Cambiar la comuna y/o la categoría del comercio propio.
-- ----------------------------------------------------------------------------
-- p_categoria null = solo cambiar la comuna (se mantiene la categoría si la
-- nueva comuna la tiene).
drop function if exists public.cambiar_mi_negocio(uuid, uuid);
create or replace function public.cambiar_mi_negocio(p_comuna uuid, p_categoria uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo               public.profiles%rowtype;
  otro             uuid;
  cambia_comuna    boolean;
  cambia_categoria boolean;
  nueva_categoria  uuid;
  libres constant  integer  := 3;
  espera constant  interval := interval '7 days';
begin
  select * into yo from public.profiles where id = auth.uid();
  if yo.id is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if not exists (select 1 from public.comunas where id = p_comuna and activa) then
    raise exception 'Esa comuna no está disponible.';
  end if;
  if p_categoria is not null and not public.categoria_en_comuna(p_comuna, p_categoria) then
    raise exception 'Esa categoría no está en esa comuna.';
  end if;

  -- Sin categoría elegida: la de ahora, si la comuna la tiene; si no, vacía.
  nueva_categoria := coalesce(
    p_categoria,
    case when yo.categoria_id is not null and public.categoria_en_comuna(p_comuna, yo.categoria_id)
         then yo.categoria_id end
  );

  cambia_comuna    := yo.comuna_id is distinct from p_comuna;
  cambia_categoria := yo.categoria_id is distinct from nueva_categoria;
  if not cambia_comuna and not cambia_categoria then
    return;
  end if;

  -- Límites (elegirla por primera vez no cuenta).
  if cambia_comuna and yo.comuna_id is not null
     and yo.cambios_comuna >= libres
     and yo.comuna_cambiada_en > now() - espera then
    raise exception 'Podrás cambiar la comuna de nuevo el %.',
      to_char((yo.comuna_cambiada_en + espera) at time zone 'America/Santiago', 'DD/MM/YYYY');
  end if;
  if not cambia_comuna and cambia_categoria and yo.categoria_id is not null and nueva_categoria is not null
     and yo.cambios_categoria >= libres
     and yo.categoria_cambiada_en > now() - espera then
    raise exception 'Podrás cambiar la categoría de nuevo el %.',
      to_char((yo.categoria_cambiada_en + espera) at time zone 'America/Santiago', 'DD/MM/YYYY');
  end if;

  perform set_config('kheep.cambio_negocio', '1', true);
  update public.profiles
     set comuna_id    = p_comuna,
         categoria_id = nueva_categoria,
         cambios_comuna = cambios_comuna
           + case when cambia_comuna and yo.comuna_id is not null then 1 else 0 end,
         comuna_cambiada_en = case when cambia_comuna and yo.comuna_id is not null then now() else comuna_cambiada_en end,
         cambios_categoria = cambios_categoria
           + case when not cambia_comuna and cambia_categoria and yo.categoria_id is not null then 1 else 0 end,
         categoria_cambiada_en = case when not cambia_comuna and cambia_categoria and yo.categoria_id is not null
                                      then now() else categoria_cambiada_en end
   where id = yo.id;

  select id into otro from public.categorias where lower(nombre) = 'otro' limit 1;

  if cambia_comuna then
    -- Todas se mudan; cada una sigue en su categoría si la nueva comuna la
    -- tiene, y si no, a "Otro".
    update public.publicaciones
       set comuna_id = p_comuna,
           categoria_id = case
             when categoria_id is not null and public.categoria_en_comuna(p_comuna, categoria_id) then categoria_id
             else otro
           end
     where usuario_id = yo.id;
  elsif cambia_categoria and nueva_categoria is not null and otro is not null then
    -- Solo cambió el giro: lo ya publicado pasa a "Otro".
    update public.publicaciones
       set categoria_id = otro
     where usuario_id = yo.id
       and categoria_id is distinct from otro;
  end if;
end;
$$;

revoke execute on function public.cambiar_mi_negocio(uuid, uuid) from public;
grant  execute on function public.cambiar_mi_negocio(uuid, uuid) to authenticated;
revoke execute on function public.categoria_en_comuna(uuid, uuid) from public;
grant  execute on function public.categoria_en_comuna(uuid, uuid) to anon, authenticated;
