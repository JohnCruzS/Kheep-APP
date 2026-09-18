-- ============================================================================
-- KHEEP v2 — Fix: comprimir los clics hacía DESAPARECER las métricas
-- ============================================================================
-- La 0022 mueve los clics viejos de `whatsapp_clics` a `whatsapp_clics_diarios`
-- prometiendo que el panel sigue mostrando lo mismo. No era cierto:
-- `vista_metricas_publicacion` solo lee el detalle, así que cada compresión le
-- restaba al comerciante todos los contactos anteriores a 90 días.
--
-- Se detectó comprimiendo 3 clics de prueba y mirando la vista después.
--
-- La vista pasa a sumar las dos fuentes. Un mismo día puede estar en ambas
-- (los clics de hoy en el detalle, los de hace meses ya resumidos): sumar los
-- totales es correcto, y `count(distinct dia)` no lo cuenta dos veces.
-- ============================================================================

create or replace view public.vista_metricas_publicacion as
  with clics_por_dia as (
    -- Detalle todavía sin comprimir
    select w.publicacion_id, w.created_at::date as dia, count(*)::bigint as clics
      from public.whatsapp_clics w
     group by w.publicacion_id, w.created_at::date
    union all
    -- Lo que ya se resumió y se borró del detalle
    select d.publicacion_id, d.dia, d.clics::bigint
      from public.whatsapp_clics_diarios d
  )
  select
    p.id as publicacion_id,
    p.titulo,
    coalesce(sum(c.clics), 0)::bigint as total_clics_whatsapp,
    count(distinct c.dia)::bigint as dias_con_actividad
  from public.publicaciones p
  left join clics_por_dia c on c.publicacion_id = p.id
  group by p.id, p.titulo;

-- `create or replace view` no conserva estas dos cosas de forma fiable, y sin
-- ellas la vista volvería a quedar "Unrestricted" (ver 0002).
alter view public.vista_metricas_publicacion set (security_invoker = on);
revoke all on public.vista_metricas_publicacion from anon;
grant select on public.vista_metricas_publicacion to authenticated;

-- ----------------------------------------------------------------------------
-- Poder corregir el resumen a mano
-- ----------------------------------------------------------------------------
-- La 0022 creó la tabla con policy de select y nada más: una fila mal contada
-- quedaba ahí para siempre, sin forma de tocarla desde la app ni desde la API.
create policy "clics_diarios: el admin corrige el resumen"
  on public.whatsapp_clics_diarios for delete
  using (public.is_admin());
