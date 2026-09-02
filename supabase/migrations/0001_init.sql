-- ============================================================================
-- KHEEP v2 — Esquema inicial + Row Level Security
-- ============================================================================
-- Notas de diseño:
-- - Login mixto: Supabase Auth admite alta/ingreso por correo o por teléfono
--   (este último requiere activar un proveedor SMS en el dashboard de Supabase:
--   Authentication > Providers > Phone). auth.users ya guarda email y phone;
--   `profiles` es la extensión 1:1 con los datos propios del negocio.
-- - El campo `nivel` (1=requiere revisión, 2=verificado/publicación directa)
--   SOLO lo puede cambiar un admin. El estado de una publicación se calcula
--   en un trigger a partir de `nivel`, nunca lo decide el cliente.
-- - Todas las tablas tienen RLS activado. Nada de "confiar en el frontend".
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- 1. COMUNAS (escalabilidad geográfica) — va primero: profiles la referencia
-- ----------------------------------------------------------------------------
create table public.comunas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. PROFILES (extiende auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text not null,
  telefono_contacto text,              -- teléfono comercial mostrado/usado para WhatsApp
  rol           text not null default 'comerciante'
                  check (rol in ('comerciante', 'admin')),
  nivel         smallint not null default 1
                  check (nivel in (1, 2)),
  logo_url      text,
  comuna_id     uuid references public.comunas(id),
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.nivel is
  '1 = requiere revisión de admin antes de publicar; 2 = verificado, publicación directa';
comment on column public.profiles.rol is
  'comerciante = usuario normal; admin = moderación total';

-- ----------------------------------------------------------------------------
-- 3. CATEGORIAS
-- ----------------------------------------------------------------------------
create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  icono      text,
  orden      int not null default 0,
  activa     boolean not null default true
);

-- ----------------------------------------------------------------------------
-- 4. PUBLICACIONES (comercio/vitrina)
-- ----------------------------------------------------------------------------
create table public.publicaciones (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.profiles(id) on delete cascade,
  titulo        text not null,
  descripcion   text,
  categoria_id  uuid references public.categorias(id),
  comuna_id     uuid references public.comunas(id),
  telefono      text not null,          -- puede diferir del de profiles
  logo_url      text,
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente', 'aprobado', 'rechazado')),
  destacado     boolean not null default false,
  orden_peso    numeric not null default random(), -- ver función de ordenamiento más abajo
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_publicaciones_comuna on public.publicaciones(comuna_id);
create index idx_publicaciones_categoria on public.publicaciones(categoria_id);
create index idx_publicaciones_estado on public.publicaciones(estado);

-- Búsqueda por texto libre (nombre de comercio)
create index idx_publicaciones_titulo_trgm on public.publicaciones
  using gin (titulo gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 5. PRODUCTOS (hasta 5 por publicación — límite forzado por trigger)
-- ----------------------------------------------------------------------------
create table public.productos (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  nombre         text not null,
  descripcion    text,
  precio         numeric not null check (precio >= 0),
  imagen_url     text,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);

create index idx_productos_publicacion on public.productos(publicacion_id);

-- Búsqueda por texto libre (nombre de producto)
create index idx_productos_nombre_trgm on public.productos
  using gin (nombre gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 6. BANNERS
-- ----------------------------------------------------------------------------
create table public.banners (
  id            uuid primary key default gen_random_uuid(),
  imagen_url    text not null,
  orden         int not null default 0,
  activo        boolean not null default true,
  fecha_inicio  timestamptz,
  fecha_fin     timestamptz,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. MODERACION_HISTORIAL (auditoría de aprobación/rechazo)
-- ----------------------------------------------------------------------------
create table public.moderacion_historial (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  admin_id       uuid not null references public.profiles(id),
  accion         text not null check (accion in ('aprobado', 'rechazado')),
  motivo         text,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. REPORTES (moderación comunitaria)
-- ----------------------------------------------------------------------------
create table public.reportes (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  usuario_id     uuid references public.profiles(id), -- null = reporte anónimo
  motivo         text not null,
  estado         text not null default 'abierto'
                   check (estado in ('abierto', 'revisado', 'descartado')),
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. WHATSAPP_CLICS (módulo de BI / métricas de conversión)
-- ----------------------------------------------------------------------------
create table public.whatsapp_clics (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  usuario_id     uuid references public.profiles(id), -- null = visitante no autenticado
  created_at     timestamptz not null default now()
);

create index idx_whatsapp_clics_publicacion on public.whatsapp_clics(publicacion_id);

-- Vista agregada para el panel de admin (clics por publicación)
create view public.vista_metricas_publicacion as
  select
    p.id as publicacion_id,
    p.titulo,
    count(w.id) as total_clics_whatsapp,
    count(distinct date_trunc('day', w.created_at)) as dias_con_actividad
  from public.publicaciones p
  left join public.whatsapp_clics w on w.publicacion_id = p.id
  group by p.id, p.titulo;

-- ============================================================================
-- TRIGGERS: reglas que NO deben decidirse en el cliente
-- ============================================================================

-- 1) Al crear una publicación, el estado se define por el nivel del autor,
--    ignorando cualquier valor que el cliente intente mandar.
create or replace function public.fn_set_estado_publicacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  autor_nivel smallint;
begin
  select nivel into autor_nivel from public.profiles where id = new.usuario_id;

  if autor_nivel = 2 then
    new.estado := 'aprobado';
  else
    new.estado := 'pendiente';
  end if;

  return new;
end;
$$;

create trigger trg_set_estado_publicacion
  before insert on public.publicaciones
  for each row execute function public.fn_set_estado_publicacion();

-- 2) Límite de 5 productos por publicación (regla de negocio del plan)
create or replace function public.fn_limitar_productos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
begin
  select count(*) into total from public.productos where publicacion_id = new.publicacion_id;
  if total >= 5 then
    raise exception 'Una publicación admite un máximo de 5 productos';
  end if;
  return new;
end;
$$;

create trigger trg_limitar_productos
  before insert on public.productos
  for each row execute function public.fn_limitar_productos();

-- 3) Registrar auditoría cuando un admin aprueba/rechaza
create or replace function public.fn_log_moderacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('aprobado', 'rechazado') and new.estado is distinct from old.estado then
    insert into public.moderacion_historial (publicacion_id, admin_id, accion)
    values (new.id, auth.uid(), new.estado);
  end if;
  return new;
end;
$$;

create trigger trg_log_moderacion
  after update on public.publicaciones
  for each row execute function public.fn_log_moderacion();

-- 4) updated_at automático
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.fn_touch_updated_at();
create trigger trg_touch_publicaciones before update on public.publicaciones
  for each row execute function public.fn_touch_updated_at();

-- ============================================================================
-- FUNCIÓN AUXILIAR: is_admin()
-- Evita repetir el subselect en cada policy y evita recursión RLS sobre profiles.
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.comunas enable row level security;
alter table public.categorias enable row level security;
alter table public.publicaciones enable row level security;
alter table public.productos enable row level security;
alter table public.banners enable row level security;
alter table public.moderacion_historial enable row level security;
alter table public.reportes enable row level security;
alter table public.whatsapp_clics enable row level security;

-- ---------- PROFILES ----------
create policy "profiles: cualquiera ve datos públicos básicos"
  on public.profiles for select
  using (true); -- nombre/logo del comercio deben ser visibles en la vitrina

create policy "profiles: el usuario edita su propio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and rol = (select rol from public.profiles where id = auth.uid()) -- no puede auto-ascenderse a admin
    and nivel = (select nivel from public.profiles where id = auth.uid()) -- no puede auto-verificarse
  );

create policy "profiles: admin edita cualquier perfil (rol/nivel incluidos)"
  on public.profiles for update
  using (public.is_admin());

create policy "profiles: el propio usuario se crea su fila al registrarse"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ---------- COMUNAS / CATEGORIAS / BANNERS (catálogo público, solo admin escribe) ----------
create policy "comunas: lectura pública" on public.comunas for select using (true);
create policy "comunas: solo admin escribe" on public.comunas for all
  using (public.is_admin()) with check (public.is_admin());

create policy "categorias: lectura pública" on public.categorias for select using (true);
create policy "categorias: solo admin escribe" on public.categorias for all
  using (public.is_admin()) with check (public.is_admin());

create policy "banners: lectura pública de banners activos" on public.banners
  for select using (activo = true or public.is_admin());
create policy "banners: solo admin escribe" on public.banners for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- PUBLICACIONES ----------
create policy "publicaciones: catálogo público solo muestra aprobadas"
  on public.publicaciones for select
  using (
    estado = 'aprobado'
    or usuario_id = auth.uid()   -- el dueño ve las suyas en cualquier estado
    or public.is_admin()         -- el admin ve todo (incluida la cola de pendientes)
  );

create policy "publicaciones: el dueño crea las suyas"
  on public.publicaciones for insert
  with check (usuario_id = auth.uid());

create policy "publicaciones: el dueño edita contenido, no el estado"
  on public.publicaciones for update
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and estado = (select estado from public.publicaciones where id = publicaciones.id)
  );

create policy "publicaciones: admin aprueba/rechaza/edita cualquiera"
  on public.publicaciones for update
  using (public.is_admin());

create policy "publicaciones: el dueño elimina las suyas"
  on public.publicaciones for delete
  using (usuario_id = auth.uid() or public.is_admin());

-- ---------- PRODUCTOS (heredan visibilidad de su publicación) ----------
create policy "productos: visibles si la publicación es visible"
  on public.productos for select
  using (
    exists (
      select 1 from public.publicaciones p
      where p.id = productos.publicacion_id
        and (p.estado = 'aprobado' or p.usuario_id = auth.uid() or public.is_admin())
    )
  );

create policy "productos: solo el dueño de la publicación administra sus productos"
  on public.productos for all
  using (
    exists (
      select 1 from public.publicaciones p
      where p.id = productos.publicacion_id and p.usuario_id = auth.uid()
    )
    or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.publicaciones p
      where p.id = productos.publicacion_id and p.usuario_id = auth.uid()
    )
    or public.is_admin()
  );

-- ---------- MODERACION_HISTORIAL (solo admin) ----------
create policy "moderacion_historial: solo admin lee"
  on public.moderacion_historial for select using (public.is_admin());
-- el insert lo hace el trigger fn_log_moderacion (security definer), no hace falta policy de insert para usuarios.

-- ---------- REPORTES ----------
create policy "reportes: cualquier usuario autenticado reporta"
  on public.reportes for insert
  with check (auth.uid() is not null);

create policy "reportes: solo admin lee y gestiona"
  on public.reportes for select using (public.is_admin());
create policy "reportes: solo admin actualiza estado"
  on public.reportes for update using (public.is_admin());

-- ---------- WHATSAPP_CLICS (métrica de conversión) ----------
create policy "whatsapp_clics: cualquiera (incluido anónimo) puede registrar un clic"
  on public.whatsapp_clics for insert
  with check (true);

create policy "whatsapp_clics: solo admin lee el detalle"
  on public.whatsapp_clics for select using (public.is_admin());
