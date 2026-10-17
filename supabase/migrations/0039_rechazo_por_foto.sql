-- ============================================================================
-- 0039 · Al rechazar una publicación se guarda por cuál foto fue
-- ============================================================================
-- Pedido del cliente: el administrador aprueba una publicación foto por foto.
-- Si una foto está mal, rechaza la publicación entera y al comerciante se le
-- dice cuál fue ("rechazada por la imagen 3"), para que sepa qué cambiar.
--
-- `rechazo_foto` es el número de la foto (1, 2, 3…, en el orden de los
-- productos). Se borra solo cuando la publicación deja de estar rechazada
-- (al reenviarla o al aprobarla).
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

alter table public.publicaciones add column if not exists rechazo_foto smallint;

comment on column public.publicaciones.rechazo_foto is
  'Por cuál foto (1, 2, 3…) se rechazó la publicación. Null si no está rechazada o no se indicó.';

create or replace function public.fn_publicacion_limpiar_rechazo_foto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado <> 'rechazado' then
    new.rechazo_foto := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_publicacion_limpiar_rechazo_foto on public.publicaciones;
create trigger trg_publicacion_limpiar_rechazo_foto
  before update on public.publicaciones
  for each row execute function public.fn_publicacion_limpiar_rechazo_foto();
