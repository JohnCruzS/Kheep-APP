-- ============================================================================
-- KHEEP v2 — Fix: la vista de métricas no heredaba RLS (marcada "Unrestricted"
-- por el linter de Supabase). Postgres NO aplica RLS a vistas por defecto;
-- hay que forzar security_invoker para que corra con los permisos del
-- usuario que consulta, no con los del dueño de la vista.
-- ============================================================================

alter view public.vista_metricas_publicacion set (security_invoker = on);

-- Con security_invoker, las policies de las tablas base se evalúan con el
-- usuario real que hace la consulta:
--   - whatsapp_clics solo es legible por admin -> un no-admin ve conteos en 0
--   - publicaciones solo muestra aprobadas/propias/admin -> igual que siempre
-- Aun así, restringimos explícitamente el acceso a autenticados (no anónimos):
revoke all on public.vista_metricas_publicacion from anon;
grant select on public.vista_metricas_publicacion to authenticated;
