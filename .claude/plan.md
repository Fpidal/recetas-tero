# Plan: Agregar autenticación a Recetas Tero

## Objetivo
Agregar login con usuario/contraseña y control de roles (admin, editor, consulta) para 3-5 personas. Los usuarios se crean desde el dashboard de Supabase, no desde la app.

## Prerequisito (manual en Supabase Dashboard)
- Crear los usuarios en Authentication → Users (email + contraseña)
- Crear la tabla `perfiles` con los roles

## Paso 1: Crear tabla `perfiles` en Supabase
Ejecutar SQL en Supabase Dashboard:
```sql
CREATE TABLE perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'consulta' CHECK (rol IN ('admin', 'editor', 'consulta')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

-- Cada usuario puede leer su propio perfil
CREATE POLICY "Usuarios leen su perfil" ON perfiles
  FOR SELECT USING (auth.uid() = id);

-- Admins pueden leer todos los perfiles
CREATE POLICY "Admins leen todos" ON perfiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
  );
```

## Paso 2: Migrar cliente Supabase a @supabase/ssr
- **Archivo:** `src/lib/supabase.ts` → reemplazar con `createBrowserClient`
- **Nuevo archivo:** `src/lib/supabase-server.ts` → `createServerClient` para middleware
- El paquete `@supabase/ssr` ya está instalado (v0.4.0)

### src/lib/supabase.ts (browser)
```ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### src/lib/supabase-server.ts (server/middleware)
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

## Paso 3: Crear middleware de autenticación
- **Nuevo archivo:** `src/middleware.ts` (en raíz de src)
- Redirige a `/login` si no hay sesión activa
- Excluye rutas públicas: `/login`, `/_next`, `/favicon`, etc.

## Paso 4: Crear página de login
- **Nuevo archivo:** `src/app/login/page.tsx`
- Formulario simple: email + contraseña + botón "Ingresar"
- Estilo consistente con el resto de la app (Tailwind, tema oscuro/rojo)
- Después de login exitoso → redirect a `/`
- Mostrar errores de credenciales

## Paso 5: Actualizar Sidebar
- **Archivo:** `src/components/Sidebar.tsx`
- Agregar al fondo: nombre del usuario + rol + botón logout
- Ocultar secciones según rol:
  - `admin`: ve todo
  - `editor`: ve todo menos papelera
  - `consulta`: solo lectura (insumos, platos, recetas, carta, estadísticas)

## Paso 6: Proteger acciones de escritura por rol
- En las páginas que tienen formularios (nueva factura, nuevo plato, etc.):
  - Si el rol es `consulta` → ocultar botones de crear/editar/eliminar
  - No requiere cambiar la lógica de Supabase, solo condicionar la UI

## Archivos que se modifican
| Archivo | Cambio |
|---------|--------|
| `src/lib/supabase.ts` | Migrar a createBrowserClient |
| `src/lib/supabase-server.ts` | **Nuevo** — cliente servidor |
| `src/middleware.ts` | **Nuevo** — protección de rutas |
| `src/app/login/page.tsx` | **Nuevo** — pantalla de login |
| `src/components/Sidebar.tsx` | Agregar usuario + logout + roles |

## Archivos que NO se tocan
- Todas las páginas de contenido (insumos, platos, facturas, etc.)
- La lógica de negocio
- Los estilos globales
- Las funciones de PDF

## Orden de implementación
1. SQL en Supabase (manual)
2. Migrar cliente supabase (Paso 2)
3. Middleware (Paso 3)
4. Login page (Paso 4)
5. Sidebar con usuario (Paso 5)
6. Proteger UI por rol (Paso 6)

Probar después de cada paso con `npm run dev`.
