-- 0051 · Las publicaciones siguen siempre a la comuna y categoría del perfil
--
-- Cambio pedido por el cliente sobre 0050: al cambiar la comuna o la
-- categoría del comercio, TODAS sus publicaciones se mueven a lo elegido (ya
-- no pasan a "Otro").
--
-- Única excepción: si se muda a una comuna que no tiene su categoría, el
-- comercio queda sin categoría hasta que elija una con el botón; mientras
-- tanto sus publicaciones esperan en "Otro" (para no desaparecer del
-- catálogo) y, al elegirla, se mueven todas a ella.
--
-- Los límites no cambian: 3 cambios libres de cada uno y después 7 días.

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

  -- Límites (elegirla por primera vez, o después de quedar vacía, no cuenta).
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

  -- Todas sus publicaciones, a la comuna y categoría del comercio (sin
  -- categoría todavía: a "Otro", mientras elige una).
  select id into otro from public.categorias where lower(nombre) = 'otro' limit 1;
  update public.publicaciones
     set comuna_id    = p_comuna,
         categoria_id = coalesce(nueva_categoria, otro)
   where usuario_id = yo.id;
end;
$$;

revoke execute on function public.cambiar_mi_negocio(uuid, uuid) from public;
grant  execute on function public.cambiar_mi_negocio(uuid, uuid) to authenticated;
