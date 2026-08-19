-- =====================================================
-- CERRAR `anon` POR COMPLETO
-- =====================================================
--
-- QUE CAMBIO: hasta V.41 existia un menu digital publico (/menu, el del QR de
-- las mesas) que se abria sin login. Para que funcionara, en V.24 se le
-- concedieron a `anon` ocho columnas:
--
--     platos → id, nombre, seccion, descripcion
--     carta  → id, plato_id, precio_carta, activo
--
-- Ese menu se saco: la carta impresa la manda a diseñar cada restaurante a su
-- estilo, y el QR estaba atado a ese PDF. **Ya no hay ninguna pantalla que
-- muestre datos sin sesion**, asi que `anon` no necesita absolutamente nada.
--
-- POR QUE VALE LA PENA: la clave anonima viaja dentro del JavaScript publico de
-- la app, o sea que cualquiera la saca del navegador. Mientras tenga permisos
-- —aunque sean ocho columnas— hay una superficie que atender. Sin permisos, esa
-- clave deja de dar acceso a un solo dato.
--
-- Es el ultimo paso de lo que empezo el 13/08/26, cuando habia 22 tablas
-- legibles sin login: 3.539 precios, 476 facturas, hasta los margenes.
--
-- Y DE PASO SIMPLIFICA EL MULTIUSUARIO: `platos` y `carta` eran las dos unicas
-- tablas que necesitaban una policy especial para `anon`. Sin esa excepcion,
-- las 31 tablas se pueden tratar todas igual cuando haya que agregarles el
-- filtro por restaurante.
-- =====================================================

-- 1. Revocar lo que quedaba
REVOKE ALL ON public.platos FROM anon;
REVOKE ALL ON public.carta  FROM anon;

-- 2. Y por las dudas, todo el esquema
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA public FROM anon;

-- 3. Que las tablas nuevas tampoco le den nada
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;


-- =====================================================
-- VERIFICAR
-- =====================================================
-- Tiene que devolver CERO filas. Si aparece alguna, quedo un permiso suelto.

SELECT table_name, privilege_type, column_name
  FROM information_schema.column_privileges
 WHERE grantee = 'anon' AND table_schema = 'public'
 ORDER BY table_name, column_name;

-- El mismo chequeo corre solo con:
--     npm run consultar -- anon-sin-permisos
