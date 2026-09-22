-- ============================================================================
-- KHEEP v2 — El historial de moderación ya no impide eliminar una cuenta
-- ============================================================================
-- `moderacion_historial.admin_id` apuntaba a la cuenta que aprobó o rechazó,
-- sin decir qué hacer si esa cuenta desaparece. Resultado: una cuenta que
-- moderó aunque sea una vez NO se podía eliminar nunca; la base lo rechazaba
-- ("still referenced from table moderacion_historial").
--
-- Se detectó al probar los administradores de zona (0027), que aprueban
-- publicaciones y pueden ser eliminados después.
--
-- Ahora, si la cuenta se elimina, su historial se queda —sigue diciendo qué
-- se aprobó o rechazó y cuándo— pero sin autor.
-- ============================================================================

alter table public.moderacion_historial alter column admin_id drop not null;

alter table public.moderacion_historial
  drop constraint if exists moderacion_historial_admin_id_fkey;

alter table public.moderacion_historial
  add constraint moderacion_historial_admin_id_fkey
  foreign key (admin_id) references public.profiles(id) on delete set null;
