-- =====================================================
-- SEGURIDAD: cerrar el acceso anónimo al esquema público
-- =====================================================
--
-- EL PROBLEMA (verificado el 13/08/26 con la clave anónima, sin login):
--
--   insumos              311 filas      proveedores          81
--   platos                84            facturas_proveedor  476
--   factura_items      2.316            precios_insumo    3.539
--   ordenes_compra       390            carta                63
--
-- La clave anónima viaja dentro del JavaScript público de la app, así que
-- cualquiera que abra el sitio podía bajarse toda la estructura de costos,
-- los proveedores y las 476 facturas. Peor todavía: `carta` expone
-- margen_objetivo y food_cost_real, y `platos` expone costo_total.
--
-- POR QUÉ PASABA: 22 tablas tienen políticas `allow_all` con rol `public`,
-- que en Postgres incluye a `anon`, y además `anon` tenía el GRANT de SELECT.
--
-- POR QUÉ ESTE ARREGLO Y NO TOCAR LAS POLÍTICAS:
-- En Postgres el GRANT se evalúa ANTES que la política de RLS. Sin el GRANT,
-- da igual lo que diga la policy. Entonces alcanza con sacarle el permiso a
-- `anon` y devolverle solo lo mínimo. Ventajas:
--   · no toca `authenticated`, así que la app logueada no cambia en nada
--   · no toca ninguna policy, así que no hay que adivinar sus nombres
--   · se revierte con una sola línea (ver el final del archivo)
--
-- QUÉ NECESITA SEGUIR FUNCIONANDO: la ruta pública `/menu`, el QR de la carta
-- para clientes. Es la única página que corre sin login (además de `/login`,
-- que no consulta la base). Hace exactamente esta consulta:
--
--     supabase.from('carta')
--       .select('precio_carta, platos(nombre, seccion, descripcion)')
--       .eq('activo', true)
--
-- O sea: 6 columnas de 2 tablas. Nada más.
-- =====================================================


-- =====================================================
-- 1. CORTAR TODO PARA `anon`
-- =====================================================
-- Incluye tablas y vistas. No afecta a `authenticated` ni a `service_role`.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;


-- =====================================================
-- 2. DEVOLVER SOLO LO QUE NECESITA /menu
-- =====================================================
-- Permiso a nivel COLUMNA, no a nivel tabla. Así `platos` sigue siendo
-- legible para la carta pública sin exponer `costo_total`, y `carta` sin
-- exponer `margen_objetivo`, `food_cost_real` ni `precio_sugerido`.
--
-- `id` y `plato_id` hacen falta para que PostgREST pueda resolver el embed
-- `platos(...)`; `activo` para el filtro `.eq('activo', true)`.

GRANT SELECT (id, nombre, seccion, descripcion) ON public.platos TO anon;
GRANT SELECT (id, plato_id, precio_carta, activo) ON public.carta  TO anon;


-- =====================================================
-- 3. QUE LAS TABLAS NUEVAS NO NAZCAN ABIERTAS
-- =====================================================
-- Esta es la causa de raíz. La plantilla de "tabla nueva" del CLAUDE.md
-- global arranca con `grant select on public.nombre_tabla to anon;`, así que
-- cada tabla que se creó siguiendo la convención quedó pública.
-- Esto corta el default; la plantilla hay que corregirla aparte.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;


-- =====================================================
-- 4. VERIFICACIÓN
-- =====================================================

-- 4.1 Qué le queda a `anon`. Tiene que devolver SOLO las 6 filas de arriba.
SELECT table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name, column_name;

-- 4.2 Ninguna tabla entera debe quedar accesible para `anon`
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name;

-- 4.3 Después de correr esto, probar DOS cosas desde afuera:
--     a) que /menu siga mostrando la carta con precios
--     b) que la app logueada siga funcionando igual
--     Y desde la terminal, que esto devuelva vacío o error de permisos:
--       curl "$URL/rest/v1/facturas_proveedor?select=id" -H "apikey: $ANON"


-- =====================================================
-- CÓMO REVERTIR, si algo se rompe
-- =====================================================
-- Deja todo como estaba antes (vuelve a abrir el acceso, ojo):
--
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
--
-- Nota: el estado original tenía SELECT para anon en todo el esquema. Si solo
-- se rompe /menu, no hace falta revertir: revisar el paso 2, que es donde
-- están los permisos que la carta pública necesita.
