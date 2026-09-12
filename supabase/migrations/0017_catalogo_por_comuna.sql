-- ============================================================================
-- KHEEP v2 — Administración por comuna: categorías propias y perfiles
-- ============================================================================
-- Hasta ahora las categorías eran las mismas para todo el país: el admin
-- definía una lista y un orden, y esa lista se veía igual en Arica que en
-- Punta Arenas. Pero el catálogo es hiperlocal, y lo que tiene sentido en una
-- comuna no lo tiene en otra ("Fletes" en una ciudad grande, "Pesca" en una
-- costera).
--
-- Desde acá, el admin entra a una comuna y arma SU catálogo: qué categorías
-- se muestran, en qué orden, cuáles oculta y cuáles quita, y puede crear
-- categorías que existan solo ahí.
--
-- Cómo se evita sembrar 346 comunas × N categorías:
--   Mientras `comunas.categorias_personalizadas` sea false, la comuna usa la
--   lista global de siempre (`categorias.activa` + `categorias.orden`). La
--   primera vez que el admin toca algo en esa comuna se copia la lista global
--   a `categorias_comuna` y recién ahí la comuna pasa a ser independiente.
--   Así, "quitar" una categoría es que no exista su fila, lo que solo puede
--   distinguirse de "todavía no configurada" gracias a esa marca.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catálogo de categorías propio de cada comuna
-- ----------------------------------------------------------------------------
alter table public.comunas
  add column categorias_personalizadas boolean not null default false;

comment on column public.comunas.categorias_personalizadas is
  'false = la comuna muestra la lista global de categorías; true = tiene su propia lista en categorias_comuna.';

create table public.categorias_comuna (
  comuna_id    uuid not null references public.comunas(id)    on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  -- Oculta y eliminada son cosas distintas, a propósito: ocultar la saca del
  -- catálogo pero la deja configurada (y se puede volver a mostrar con un
  -- toque); eliminarla borra la fila y hay que agregarla de nuevo.
  visible      boolean  not null default true,
  orden        smallint not null default 0,
  created_at   timestamptz not null default now(),
  primary key (comuna_id, categoria_id)
);

comment on table public.categorias_comuna is
  'Qué categorías muestra cada comuna, en qué orden y cuáles están ocultas. Sin filas para una comuna personalizada = esa comuna no muestra ninguna.';

create index categorias_comuna_por_comuna on public.categorias_comuna (comuna_id, orden);

alter table public.categorias_comuna enable row level security;

-- El catálogo es público, así que cualquiera (con o sin cuenta) necesita leer
-- esta tabla para saber qué categorías mostrarle.
create policy "categorias_comuna: lectura pública"
  on public.categorias_comuna for select
  using (true);

create policy "categorias_comuna: solo admin escribe"
  on public.categorias_comuna for all
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Copiar la lista global a una comuna la primera vez que se toca
-- ----------------------------------------------------------------------------
-- Se hace en la base y no en la app porque son varias escrituras que deben
-- ocurrir todas o ninguna: si se cortara a la mitad, la comuna quedaría
-- marcada como personalizada con media lista y perdería categorías.
create or replace function public.admin_personalizar_comuna(p_comuna uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede configurar las categorías de una comuna.';
  end if;

  if exists (select 1 from public.comunas where id = p_comuna and categorias_personalizadas) then
    return;   -- ya es independiente: no se pisa lo que el admin haya dejado
  end if;

  insert into public.categorias_comuna (comuna_id, categoria_id, visible, orden)
  select p_comuna, c.id, c.activa, c.orden
    from public.categorias c
  on conflict (comuna_id, categoria_id) do nothing;

  update public.comunas set categorias_personalizadas = true where id = p_comuna;
end;
$$;

revoke execute on function public.admin_personalizar_comuna(uuid) from public;
grant  execute on function public.admin_personalizar_comuna(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Eliminar un perfil de verdad
-- ----------------------------------------------------------------------------
-- "Ocultar" (profiles.activo = false) y "eliminar" son cosas distintas:
-- ocultar es reversible y la cuenta sigue existiendo; esto borra al usuario.
--
-- Va como función `security definer` porque borrar de `auth.users` no es algo
-- que la app pueda hacer desde el teléfono con la clave pública. Al borrarse
-- el usuario, sus publicaciones, productos y su perfil se van en cascada
-- (ver las claves foráneas de 0001), así que no quedan restos.
create or replace function public.admin_eliminar_perfil(p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede eliminar perfiles.';
  end if;

  if p_perfil = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta desde el panel.';
  end if;

  if exists (select 1 from public.profiles where id = p_perfil and rol = 'admin') then
    raise exception 'No se puede eliminar la cuenta de otro administrador.';
  end if;

  delete from auth.users where id = p_perfil;
end;
$$;

revoke execute on function public.admin_eliminar_perfil(uuid) from public;
grant  execute on function public.admin_eliminar_perfil(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Un perfil oculto desaparece del catálogo
-- ----------------------------------------------------------------------------
-- `profiles.activo` existía desde 0001 pero no lo miraba nadie: un perfil
-- "desactivado" seguía mostrando sus publicaciones. Ahora que el admin puede
-- ocultar perfiles, eso tiene que cumplirse en la base y no solo en la
-- consulta de la app — si no, bastaría con pedir los datos por fuera.
drop policy "publicaciones: catálogo público solo muestra aprobadas y no eliminadas" on public.publicaciones;
create policy "publicaciones: catálogo público, sin eliminadas ni de perfiles ocultos"
  on public.publicaciones for select
  using (
    (
      estado = 'aprobado'
      and deleted_at is null
      and exists (select 1 from public.profiles p where p.id = usuario_id and p.activo)
    )
    or usuario_id = auth.uid()   -- el dueño siempre ve las suyas
    or public.is_admin()
  );
