# Kheep v2 — Documento de Avances

> Última actualización: 2026-09-02
> Estado general: **Semana 1 del plan (Base de datos + Auth) completa y verificada en producción (Supabase real).**

Este documento resume **qué se hizo, para qué y cómo**, en orden cronológico, para que cualquiera (incluido tú mismo en unos meses) pueda retomar el proyecto sin tener que releer todo el chat.

---

## 1. Punto de partida

Kheep es un marketplace hiperlocal: conecta comerciantes/emprendedores locales con compradores, y el contacto final se hace por WhatsApp (no hay pagos ni checkout dentro de la app). Existía una versión vieja (Ionic/Angular) documentada en specs técnicas; esta v2 se construye desde cero con:

- **App**: React Native + Expo (SDK 57), Expo Router, TypeScript.
- **Backend**: Supabase (Postgres + Auth + Storage + Row Level Security).
- **Identidad visual**: tema negro/rojo/blanco, según mockups entregados.

El repo `Kheep-APP` estaba vacío al iniciar.

---

## 2. Base de datos (Supabase / Postgres)

### 2.1 Para qué
Es el corazón de la app: guarda comerciantes, sus publicaciones y productos, categorías, banners promocionados, reportes de abuso y el historial de moderación. Como se va a subir a Play Store con datos reales de personas (teléfonos, fotos), se diseñó pensando en **seguridad por defecto**, no solo en que "funcione".

### 2.2 Cómo — esquema (`supabase/migrations/0001_init.sql`)
Tablas creadas:
- `comunas` — catálogo de comunas (ubicación).
- `profiles` — datos del usuario/comerciante (nombre, teléfono, logo, `rol`: comerciante/admin, `nivel`: 1 = necesita revisión manual, 2 = publica directo).
- `categorias` — categorías de publicaciones.
- `publicaciones` — la oferta de un comerciante (título, descripción, teléfono de contacto, estado de moderación).
- `productos` — hasta 5 productos por publicación.
- `banners` — promociones destacadas, con vigencia por fecha.
- `moderacion_historial` — auditoría de cada aprobación/rechazo.
- `reportes` — reportes de abuso hechos por usuarios.
- `whatsapp_clics` — métrica de cuántas veces se hizo clic para contactar por WhatsApp.

Automatizaciones (triggers), para que nada dependa de que el cliente "se porte bien":
- `fn_set_estado_publicacion`: al crear una publicación, decide automáticamente si queda pendiente de revisión o aprobada directa, según el `nivel` del autor.
- `fn_limitar_productos`: impide agregar un 6º producto a una publicación.
- `fn_log_moderacion`: cada vez que un admin aprueba/rechaza, queda registrado en `moderacion_historial` sin que el cliente tenga que hacerlo manualmente.
- `fn_touch_updated_at`: mantiene `updated_at` al día en cualquier tabla que lo tenga.

**Row Level Security (RLS)** activada en todas las tablas desde el día uno: cada política dice explícitamente quién puede ver/crear/editar/borrar qué fila, en vez de confiar en que el frontend filtre bien.

### 2.3 Endurecimiento posterior (migraciones 0002 a 0007)

| Migración | Problema que resolvía | Solución |
|---|---|---|
| `0002_fix_vista_metricas_rls.sql` | Una vista de métricas (solo para admin) aparecía como "sin restricciones" en el Advisor de seguridad de Supabase — las vistas no heredan RLS por defecto. | `security_invoker = on` en la vista, para que sí respete los permisos de quien consulta. |
| `0003_storage_policies.sql` | Los buckets de Storage (`logos`, `productos`, `banners`) no tenían reglas de quién puede subir/leer archivos. | Política: cada usuario solo puede escribir dentro de su propia carpeta (`bucket/{su-uid}/archivo.jpg`); lectura pública; banners solo los sube un admin. |
| `0004_hardening_advisors.sql` | Varias funciones de la base sin `search_path` fijo (riesgo de inyección de esquema) y una extensión (`pg_trgm`) instalada en el esquema público. | Se fijó `search_path` en las funciones; se movió la extensión a un esquema dedicado (`extensions`). |
| `0005_fix_function_grants.sql` | Los warnings de "cualquiera puede ejecutar esta función interna" seguían apareciendo aunque ya se había revocado el permiso de `public`. | Se descubrió que Supabase da permiso de ejecución directo a `anon`/`authenticated`, no solo a `public` — se revocó explícitamente de los tres. |
| `0006_handle_new_user_trigger.sql` | Crear el perfil del usuario desde la app (después del registro) era frágil: dependía del timing de la sesión y de las políticas RLS desde el cliente. | Trigger `handle_new_user()` en el propio Postgres: cuando Supabase Auth crea un usuario nuevo, automáticamente se crea su fila en `profiles` con los datos que mandó en el registro. Cero lógica de creación de perfil del lado del cliente. |
| `0007_production_hardening.sql` | Petición explícita: "es una app profesional para Play Store, hay info sensible, revisa bien la base de datos". Ver detalle abajo. | — |

### 2.4 Detalle de `0007_production_hardening.sql` (el más importante)

Este es el que responde directamente a: *"guardamos información sensible", "las imágenes no deberían pesar tanto", "todo se debe poder editar/eliminar/añadir manual y automáticamente"*.

1. **Dejar de exponer datos privados por accidente.**
   Antes, cualquiera (incluso sin cuenta) podía leer la fila completa de `profiles` de cualquier comerciante — incluyendo columnas internas como `rol` y `nivel`, que no son de nadie más que del dueño y de un admin.
   → Se restringió `profiles` a "solo el dueño o un admin la ven completa".
   → Se creó una vista `comercios_publicos` con **solo** las columnas que un comprador necesita ver de un negocio (nombre, logo, teléfono de contacto, comuna) — el resto queda oculto. La vitrina pública de la app se arma a partir de esta vista, nunca de la tabla `profiles` directa.
   *Verificado en vivo*: una consulta anónima a `profiles` devuelve `[]`; la misma consulta a `comercios_publicos` devuelve los datos públicos correctos.

2. **Imágenes que no pesen.**
   La compresión en la app (ver sección 3) es una ayuda, pero alguien podría saltarse la app y subir directo a la API. Por eso el límite real vive en el servidor:
   - Buckets `logos` y `productos`: máximo **2 MB** por archivo, solo `image/jpeg`, `image/png`, `image/webp`.
   - Bucket `banners` (lo sube un admin): máximo 5 MB.
   Esto es innegociable — ni un bug ni un usuario malicioso puede subir un archivo de 20 MB.

3. **Borrado seguro (soft delete) en vez de borrado físico.**
   Antes, un comerciante podía borrar una publicación para siempre, perdiendo cualquier rastro (mal para disputas o auditoría legal).
   → Se agregó `publicaciones.deleted_at`. El dueño ahora "elimina" marcando esta fecha (la publicación deja de mostrarse en el catálogo), pero el registro sigue existiendo. El borrado físico real quedó reservado solo a un admin (por ejemplo, para retirar contenido ilegal cuando la ley lo exige).

4. **Banners que se vencen solos.**
   Se agregó lógica para que un banner con `fecha_fin` vencida (o que aún no llegó a `fecha_inicio`) deje de mostrarse automáticamente, sin que el admin tenga que acordarse de desactivarlo a mano.

5. **Límites de longitud de texto** en nombre, título, descripción, motivo de reporte, etc. — para que nadie pueda mandar un texto de 500.000 caracteres y llenar la base de datos (abuso / bloat).

6. **Validación de formato** por constraint de base de datos (no solo en el frontend):
   - Teléfonos: deben calzar con el formato chileno `+569XXXXXXXX`.
   - URLs de imagen: deben empezar con `http://` o `https://`.
   Esto es una segunda barrera: aunque alguien llame a la API sin pasar por la app, la base de datos rechaza datos con formato inválido.

### 2.5 Lo de "editable/agregable/eliminable, manual y automático"

Esto no es una funcionalidad aparte, sino una propiedad que ya quedó incorporada en el diseño:
- **Manual**: cualquier fila de cualquier tabla (categorías, comunas, publicaciones, productos, banners) se puede crear/editar/borrar en cualquier momento vía la app o directamente desde el Table Editor de Supabase — no hay nada "hardcodeado" en el código de la app.
- **Automático**: los triggers (`fn_set_estado_publicacion`, `fn_limitar_productos`, `fn_log_moderacion`, `handle_new_user`) y las políticas dependientes de fecha (banners) hacen que la base de datos reaccione sola a cambios, sin depender de que alguien recuerde hacerlo a mano.
- Como todo vive en migraciones SQL versionadas (`supabase/migrations/000X_*.sql`), agregar una tabla o columna nueva en el futuro es simplemente escribir la migración `0008_...sql` siguiente — el historial completo queda documentado y es reversible.

---

## 3. App móvil (Expo / React Native)

### 3.1 Para qué
Es lo que ve el usuario final: login, registro, y (a futuro) el catálogo y panel de publicación.

### 3.2 Cómo — piezas construidas

- **`src/lib/supabase.ts`** — cliente de Supabase configurado con `AsyncStorage`, para que la sesión persista aunque se cierre la app.
- **`src/constants/theme.ts`** — paleta de marca fija (negro/rojo/blanco), según mockups.
- **Componentes UI reutilizables** (`src/components/ui/`): `Button`, `TextField` (con ayuda visual y mostrar/ocultar contraseña), `AuthCard` (layout compartido de las pantallas de autenticación).
- **`src/lib/validation.ts`** — validación de email y normalización de teléfono chileno a formato `+56XXXXXXXXX`.
- **`src/lib/authErrors.ts`** — traduce los errores en inglés de Supabase Auth a mensajes en español entendibles para el usuario.
- **`src/providers/SessionProvider.tsx`** — quién está logueado, como estado único compartido por toda la app (ver "bug importante resuelto" abajo).
- **Pantallas** (`src/app/(auth)/`): `login.tsx`, `register.tsx`, `forgot-password.tsx`.
- **`src/app/(app)/dashboard.tsx`** — pantalla placeholder post-login, ya conectada a la sesión real.
- **`src/lib/images.ts`** — utilidad de selección + compresión de imágenes: redimensiona a máx. 1280px de ancho y comprime a JPEG calidad 0.7 **antes** de subir, para que casi nunca se llegue a rozar el límite de 2MB del servidor. Lista para conectarse a la pantalla de "publicar" (Semana 3), aún no está en uso.

### 3.3 Bug importante resuelto: loop infinito de redirección

**Síntoma**: después de iniciar sesión, la pantalla quedaba en blanco/gris indefinidamente.

**Causa real**: cada pantalla (login, dashboard, layouts) tenía su propio hook `useSession()` independiente. Como Expo Router destruye y vuelve a montar árboles de pantallas al navegar entre grupos de rutas, cada hook volvía a partir desde cero (`sesión = null`) antes de terminar de consultarla — dos pantallas "peleaban" constantemente sobre si había sesión o no. Se midieron **252 renders en 9 segundos**.

**Solución**: se creó `SessionProvider` como única fuente de verdad, montado una sola vez en la raíz de la app (`_layout.tsx`); todas las pantallas ahora leen la misma sesión compartida en vez de consultarla cada una por su cuenta.

### 3.4 Entorno de desarrollo (Android)

- Se configuró Android Studio + emulador (`Medium_Phone`) en Windows.
- Se generó una **APK debug** funcional (`./gradlew assembleDebug`, build exitoso).
- Se resolvió una inestabilidad del emulador (ANR / cuelgues) causada por dos features experimentales del proyecto (`expo-router/unstable-native-tabs` y `experiments.reactCompiler`) — se quitaron y el emulador quedó estable.
- Flujo de trabajo diario verificado: `npx expo start` + `adb reverse tcp:8081 tcp:8081` para cargar el bundle de JS en la app instalada.

---

## 4. Verificación en vivo (no solo "debería funcionar")

Se probó contra el proyecto real de Supabase (no un mock), incluyendo llamadas directas a la API REST:

```
GET {SUPABASE_URL}/rest/v1/profiles?select=id,nombre,rol,nivel   (sin sesión)
→ []                                     ✅ ya no se puede leer directo

GET {SUPABASE_URL}/rest/v1/comercios_publicos?select=*           (sin sesión)
→ [{ nombre, logo_url, telefono_contacto, comuna_id }, ...]      ✅ vitrina pública funciona
```

Además, extremo a extremo desde la app real, en el emulador Android:
- Registro de usuario nuevo → crea perfil automáticamente (trigger) → sesión activa.
- Login con credenciales reales.
- Sesión persiste al cerrar y reabrir la app.
- Cerrar sesión funciona.

---

## 5. Qué queda pendiente

No pertenece a "base de datos" — son los siguientes bloques del plan original:

- [ ] Probar el flujo de "olvidé mi contraseña" de punta a punta (requiere revisar el correo real).
- [ ] **Semana 2 — Catálogo**: pantalla de inicio con banners, carrusel de categorías, buscador y tarjetas de publicaciones (usando la vista `comercios_publicos`).
- [ ] **Semana 3 — Módulo del Emprendedor**: publicar/editar ofertas con carga de fotos (aquí se conecta `src/lib/images.ts`, que ya está listo).
- [ ] **Semana 4 — Panel de Administración y Métricas**.
- [ ] **Semana 5-6 — Pruebas, pulido, y build de release (AAB) para Play Store**.

---

## 6. Estructura de archivos clave (referencia rápida)

```
supabase/migrations/          → historial completo y versionado de la base de datos
  0001_init.sql                 esquema base + RLS + triggers
  0002_fix_vista_metricas_rls.sql
  0003_storage_policies.sql
  0004_hardening_advisors.sql
  0005_fix_function_grants.sql
  0006_handle_new_user_trigger.sql
  0007_production_hardening.sql  ← endurecimiento para producción/Play Store

src/lib/supabase.ts            → cliente Supabase
src/lib/images.ts              → compresión de imágenes antes de subir
src/lib/validation.ts          → validaciones (email, teléfono)
src/lib/authErrors.ts          → mensajes de error en español
src/providers/SessionProvider.tsx → sesión compartida (fix del loop infinito)
src/constants/theme.ts         → colores de marca
src/components/ui/             → Button, TextField, AuthCard
src/app/(auth)/                → login, register, forgot-password
src/app/(app)/dashboard.tsx    → pantalla post-login (placeholder de Semana 2)
```
