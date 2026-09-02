-- ============================================================================
-- KHEEP v2 — Fix real de los grants de EXECUTE
-- ============================================================================
-- Supabase otorga EXECUTE a `anon` y `authenticated` de forma explícita en
-- cada función nueva del schema public (default privileges del proyecto),
-- no solo al rol PUBLIC. La migración 0004 solo revocó de PUBLIC, así que
-- los grants directos a anon/authenticated seguían vivos. Aquí se revocan
-- de los tres roles y se re-otorga solo lo estrictamente necesario.
-- ============================================================================

-- Funciones de trigger: nadie las llama directamente, solo el propio trigger.
revoke execute on function public.fn_set_estado_publicacion() from public, anon, authenticated;
revoke execute on function public.fn_limitar_productos()      from public, anon, authenticated;
revoke execute on function public.fn_log_moderacion()          from public, anon, authenticated;
revoke execute on function public.fn_touch_updated_at()        from public, anon, authenticated;

-- is_admin(): SÍ debe poder ejecutarse, porque se evalúa dentro de policies
-- de RLS que corren tanto para anon como para authenticated.
revoke execute on function public.is_admin() from public, anon, authenticated;
grant  execute on function public.is_admin() to anon, authenticated;

-- NOTA: public.rls_auto_enable() no se toca — no es una función nuestra,
-- parece ser interna de la infraestructura de Supabase; revocarle permisos
-- a ciegas podría romper automatizaciones del propio dashboard.
