-- ============================================================================
-- KHEEP v2 — El teléfono de WhatsApp de una publicación es SIEMPRE el del
-- perfil del dueño, no uno aparte por publicación.
-- ============================================================================
-- Antes (migración 0001) `publicaciones.telefono` era un campo propio que el
-- comerciante tipeaba al publicar/editar, pensado para poder "diferir del de
-- profiles". Pedido del cliente: el teléfono que se pide al crear la cuenta
-- (profiles.telefono_contacto) es el único que debe usarse para el botón de
-- WhatsApp — nunca uno distinto por publicación, y si el comerciante cambia
-- su teléfono en el perfil, sus publicaciones existentes deben reflejarlo
-- de inmediato sin tener que volver a editarlas una por una.
--
-- Se resuelve con triggers, no solo confiando en que la app deje de mandar
-- el campo: así ninguna llamada directa a la API (o un bug futuro en el
-- cliente) puede dejar una publicación con un teléfono distinto al del
-- perfil — misma filosofía que "estado" en publicaciones o "activo/pagado"
-- en banners.
-- ============================================================================

-- 1) Al insertar o editar una publicación, el teléfono SIEMPRE se reemplaza
--    por el del perfil del dueño, sin importar qué mande el cliente.
create or replace function public.fn_publicacion_telefono_desde_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  telefono_perfil text;
begin
  select telefono_contacto into telefono_perfil
  from public.profiles where id = new.usuario_id;

  if telefono_perfil is null then
    raise exception 'Tu perfil no tiene un teléfono de contacto. Complétalo antes de publicar.';
  end if;

  new.telefono := telefono_perfil;
  return new;
end;
$$;

create trigger trg_publicacion_telefono_desde_perfil
  before insert or update on public.publicaciones
  for each row execute function public.fn_publicacion_telefono_desde_perfil();

-- 2) Si el comerciante cambia su teléfono en el perfil, se propaga altiro a
--    todas sus publicaciones existentes — nadie tiene que volver a editarlas.
create or replace function public.fn_propagar_telefono_a_publicaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.telefono_contacto is distinct from old.telefono_contacto and new.telefono_contacto is not null then
    update public.publicaciones
      set telefono = new.telefono_contacto
      where usuario_id = new.id
        and telefono is distinct from new.telefono_contacto;
  end if;
  return new;
end;
$$;

create trigger trg_propagar_telefono_a_publicaciones
  after update on public.profiles
  for each row execute function public.fn_propagar_telefono_a_publicaciones();

-- 3) Backfill: deja las publicaciones que ya existen al día con el teléfono
--    actual del perfil de su dueño (antes de este cambio podían diferir).
update public.publicaciones p
set telefono = pr.telefono_contacto
from public.profiles pr
where pr.id = p.usuario_id
  and pr.telefono_contacto is not null
  and p.telefono is distinct from pr.telefono_contacto;

comment on column public.publicaciones.telefono is
  'Copia del teléfono de contacto del perfil dueño, mantenida en sincronía por
   trigger (fn_publicacion_telefono_desde_perfil / fn_propagar_telefono_a_publicaciones).
   No editable por publicación: cambia solo si el dueño cambia su perfil.';
