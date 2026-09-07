-- ============================================================================
-- KHEEP v2 — Corrige bug real en la política de UPDATE de publicaciones
-- ============================================================================
-- La política original (0001) comparaba el estado así:
--
--   estado = (select estado from public.publicaciones where id = publicaciones.id)
--
-- El subquery usa la MISMA tabla sin alias que la fila externa que se está
-- actualizando. Postgres resuelve "publicaciones.id" dentro del subquery
-- contra el propio FROM del subquery (no contra la fila externa), así que
-- la condición terminaba siendo "id = id" — verdadera para TODAS las filas
-- de la tabla. Con 0 o 1 publicaciones en la tabla esto pasaba
-- desapercibido (el subquery "por accidente" devolvía a lo más una fila);
-- apenas hubo 2+ publicaciones reales, cualquier intento de editar una
-- publicación empezó a fallar con:
--   "more than one row returned by a subquery used as an expression"
--
-- La corrección es darle un alias al subquery para que la referencia a la
-- fila externa deje de ser ambigua.
-- ============================================================================

drop policy "publicaciones: el dueño edita contenido, no el estado" on public.publicaciones;

create policy "publicaciones: el dueño edita contenido, no el estado"
  on public.publicaciones for update
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and estado = (select p.estado from public.publicaciones p where p.id = publicaciones.id)
  );
