-- ============================================================================
-- 0031 — El administrador general puede descontar clics de WhatsApp
-- ============================================================================
-- `whatsapp_clics` solo tenía permiso de INSERT (cualquiera registra su clic)
-- y de SELECT (solo el admin lo lee). Borrar una fila era imposible: la base
-- respondía "sin error" pero no borraba nada, porque no existía ninguna
-- policy de DELETE.
--
-- Se detectó al querer quitar de las métricas los clics de una prueba: la app
-- decía que estaban borrados y seguían ahí, inflando el número de una
-- publicación.
--
-- Desde acá, SOLO el administrador general puede borrar clics, de a uno. Es
-- para corregir datos de prueba o un clic claramente falso, no para maquillar
-- métricas: el resumen diario (`whatsapp_clics_diarios`) ya tenía su propia
-- policy de borrado desde la 0023, así que esto deja las dos tablas parejas.
-- ============================================================================

drop policy if exists "whatsapp_clics: solo el admin general borra" on public.whatsapp_clics;
create policy "whatsapp_clics: solo el admin general borra"
  on public.whatsapp_clics for delete
  using (public.is_admin());
