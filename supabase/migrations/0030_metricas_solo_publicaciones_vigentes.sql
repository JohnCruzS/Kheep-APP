-- ============================================================================
-- 0030 — Las métricas solo cuentan publicaciones vigentes
-- ============================================================================
-- Hasta ahora `vista_metricas_publicacion` listaba TODAS las filas de
-- `publicaciones`: las dadas de baja por el admin (que se marcan con
-- `deleted_at` en vez de borrarse, para no perder el historial), las
-- rechazadas y las que todavía esperan aprobación. En el panel se veían
-- comercios que ya no están en la app, y sus clics seguían sumando al total.
--
-- Desde acá la vista muestra solo lo que de verdad está publicado: aprobado y
-- sin dar de baja. Una publicación eliminada del todo ya desaparecía sola,
-- porque sus clics se borran en cascada.
--
-- Los clics de lo que se da de baja no se borran: si la publicación se
-- restablece, sus números vuelven con ella.
-- ============================================================================

create or replace view public.vista_metricas_publicacion as
  with clics_por_dia as (
    select w.publicacion_id, w.created_at::date as dia, count(*)::bigint as clics
      from public.whatsapp_clics w
     group by w.publicacion_id, w.created_at::date
    union all
    select d.publicacion_id, d.dia, d.clics::bigint
      from public.whatsapp_clics_diarios d
  )
  select
    p.id as publicacion_id,
    p.titulo,
    coalesce(sum(c.clics), 0)::bigint as total_clics_whatsapp,
    count(distinct c.dia)::bigint as dias_con_actividad,
    p.comuna_id
  from public.publicaciones p
  left join clics_por_dia c on c.publicacion_id = p.id
 where p.deleted_at is null
   and p.estado = 'aprobado'
  group by p.id, p.titulo, p.comuna_id;

alter view public.vista_metricas_publicacion set (security_invoker = on);
revoke all on public.vista_metricas_publicacion from anon;
grant select on public.vista_metricas_publicacion to authenticated;
