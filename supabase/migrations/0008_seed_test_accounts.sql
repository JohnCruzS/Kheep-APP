-- ============================================================================
-- KHEEP v2 — Cuentas de prueba para revisar las 3 vistas del catálogo
-- ============================================================================
-- Las 3 cuentas ya fueron creadas vía el endpoint público de registro
-- (igual que lo hace la app), así que ya existen en auth.users y en
-- public.profiles con los valores por defecto (rol='comerciante', nivel=1).
-- Esta migración solo eleva rol/nivel de 2 de las 3, algo que normalmente
-- solo puede hacer un admin desde la app — se hace acá una única vez para
-- arrancar (bootstrap), porque todavía no existe ningún admin.
--
-- Credenciales (contraseña igual para las tres): Kheep2026!
--   comerciante.nivel1@kheep.test  -> sin cambios (comerciante / nivel 1)
--   comerciante.nivel2@kheep.test  -> nivel 2 (verificado)
--   admin@kheep.test               -> rol admin (nivel 2)
-- ============================================================================

update public.profiles
  set nivel = 2
  where id = (select id from auth.users where email = 'comerciante.nivel2@kheep.test');

update public.profiles
  set rol = 'admin', nivel = 2
  where id = (select id from auth.users where email = 'admin@kheep.test');





-- comerciante.nivel1@kheep.test  Kheep2026!
-- comerciante.nivel2@kheep.test   Kheep2026!
-- admin@kheep.test  Kheep2026!