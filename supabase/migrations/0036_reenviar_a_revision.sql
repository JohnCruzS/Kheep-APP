-- ============================================================================
-- 0036 · El dueño puede devolver su publicación a revisión
-- ============================================================================
-- En "Mis publicaciones" (pedido del cliente):
--   - una publicación APROBADA se puede editar solo en el texto (no las
--     fotos); si su dueño no tiene "Directo", al guardar vuelve a revisión;
--   - una RECHAZADA se puede corregir (también las fotos) y reenviar: vuelve
--     a revisión.
--
-- Hasta acá el dueño no podía cambiar el estado de su publicación (lo cambia
-- solo un administrador). Ahora puede, pero únicamente a "pendiente": nunca
-- aprobarse a sí mismo.
--
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

-- La anterior (0010) no dejaba cambiar el estado.
drop policy if exists "publicaciones: el dueño edita contenido, no el estado" on public.publicaciones;
drop policy if exists "publicaciones: el dueño edita las suyas (y puede devolverlas a revisión)" on public.publicaciones;

create policy "publicaciones: el dueño edita las suyas (y puede devolverlas a revisión)"
  on public.publicaciones for update
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and (
      -- sin tocar el estado...
      estado = (select p.estado from public.publicaciones p where p.id = publicaciones.id)
      -- ...o devolviéndola a revisión
      or estado = 'pendiente'
    )
  );
