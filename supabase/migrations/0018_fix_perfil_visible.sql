-- ============================================================================
-- KHEEP v2 — Arreglo de 0017: el catálogo público volvió a quedar vacío
-- ============================================================================
-- La migración 0017 agregó a la policy de lectura de publicaciones la
-- condición de que el autor estuviera visible:
--
--     exists (select 1 from public.profiles p where p.id = usuario_id and p.activo)
--
-- El problema es que las políticas NO son `security definer`: ese subquery se
-- evalúa con los permisos de quien consulta. Y desde 0007 la tabla `profiles`
-- solo la puede leer su dueño o un admin, así que para un visitante sin
-- cuenta el EXISTS siempre daba falso y el catálogo se quedaba sin ninguna
-- publicación.
--
-- La comprobación pasa a una función `security definer`, que sí puede mirar
-- la tabla, y que devuelve únicamente un booleano — no expone ningún dato del
-- perfil. Es el mismo patrón que ya usa `public.is_admin()`.
-- ============================================================================

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
  );
$$;

comment on function public.perfil_visible(uuid) is
  'true si el perfil existe y el admin no lo tiene oculto. Devuelve solo un booleano: no expone datos del perfil.';

revoke execute on function public.perfil_visible(uuid) from public;
grant  execute on function public.perfil_visible(uuid) to anon, authenticated;

drop policy "publicaciones: catálogo público, sin eliminadas ni de perfiles ocultos" on public.publicaciones;
create policy "publicaciones: catálogo público, sin eliminadas ni de perfiles ocultos"
  on public.publicaciones for select
  using (
    (estado = 'aprobado' and deleted_at is null and public.perfil_visible(usuario_id))
    or usuario_id = auth.uid()   -- el dueño siempre ve las suyas
    or public.is_admin()
  );
