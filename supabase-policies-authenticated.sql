-- =====================================================
-- UNIFICAR LAS POLICIES: todas `to authenticated`
-- =====================================================
--
-- EL PROBLEMA: convivian dos criterios. Las tablas viejas tienen policies
-- `to public` y las nuevas `to authenticated`. En Postgres, `public` no
-- significa "cualquier usuario del sistema": incluye a `anon`, o sea al
-- visitante sin login.
--
-- POR QUE RECIEN AHORA: hasta V.41 habia un menu digital publico (/menu, el
-- del QR) que leia `carta` y `platos` con la clave anonima, y funcionaba
-- justamente porque esas policies eran `to public`. Cambiarlas antes habria
-- dejado el menu en blanco para los clientes, sin error visible del lado de la
-- app. Al sacarse el menu y revocarle todo a `anon`, el obstaculo desaparecio.
--
-- QUE APORTA: es la SEGUNDA PARED. Hoy lo unico que frena a `anon` es no tener
-- GRANT. Si algun dia un GRANT se le escapa —que es exactamente lo que paso y
-- dejo 22 tablas legibles sin login el 13/08/26— con la policy en
-- `authenticated` igual no veria nada.
--
-- El GRANT se evalua ANTES que la policy, asi que ninguno de los dos alcanza
-- solo. Con los dos, hacen falta dos errores para abrir una tabla.
--
-- Y deja las 31 tablas con un criterio unico antes de la migracion a
-- multiusuario, donde hay que reescribirlas todas para agregar el filtro por
-- restaurante. Una convencion en vez de dos.
--
-- QUE NO CAMBIA: nada de la app. Todas las pantallas corren con sesion
-- iniciada —desde V.41 el middleware solo deja pasar /login sin usuario— asi
-- que sus consultas van como `authenticated` y las policies les aplican igual.
-- =====================================================

ALTER POLICY "allow_all" ON public.carta TO authenticated;
ALTER POLICY "Allow all" ON public.carta_vinos TO authenticated;
ALTER POLICY "Allow all on comparacion_items" ON public.comparacion_items TO authenticated;
ALTER POLICY "Allow all on comparacion_proveedores" ON public.comparacion_proveedores TO authenticated;
ALTER POLICY "Allow all on comparaciones_precios" ON public.comparaciones_precios TO authenticated;
ALTER POLICY "allow_all" ON public.factura_items TO authenticated;
ALTER POLICY "allow_all" ON public.facturas_historial TO authenticated;
ALTER POLICY "allow_all" ON public.facturas_proveedor TO authenticated;
ALTER POLICY "allow_all" ON public.insumos TO authenticated;
ALTER POLICY "allow_all" ON public.menu_ejecutivo_items TO authenticated;
ALTER POLICY "allow_all" ON public.menu_especial_opciones TO authenticated;
ALTER POLICY "allow_all" ON public.menus_ejecutivos TO authenticated;
ALTER POLICY "allow_all" ON public.menus_especiales TO authenticated;
ALTER POLICY "allow_all" ON public.orden_compra_items TO authenticated;
ALTER POLICY "allow_all" ON public.ordenes_compra TO authenticated;
ALTER POLICY "allow_all" ON public.plato_ingredientes TO authenticated;
ALTER POLICY "allow_all" ON public.platos TO authenticated;
ALTER POLICY "allow_all" ON public.precios_insumo TO authenticated;
ALTER POLICY "allow_all" ON public.proveedores TO authenticated;
ALTER POLICY "allow_all" ON public.receta_base_ingredientes TO authenticated;
ALTER POLICY "allow_all" ON public.recetas_base TO authenticated;
ALTER POLICY "Allow all for vinos" ON public.vinos TO authenticated;

-- `perfiles` va aparte: su policy ya filtra con auth.uid() = id, que para un
-- visitante sin login es NULL y no matchea nada. Se pasa igual para que quede
-- una sola convencion, pero no cambia lo que hace.
ALTER POLICY "Leer propio perfil" ON public.perfiles TO authenticated;


-- =====================================================
-- VERIFICAR
-- =====================================================
-- Tiene que devolver CERO filas: ninguna policy apuntando a `public`.

SELECT tablename, policyname, roles::text
  FROM pg_policies
 WHERE schemaname = 'public' AND roles::text = '{public}'
 ORDER BY tablename;


-- =====================================================
-- Y DESPUES, PROBAR LA APP
-- =====================================================
-- El riesgo de este cambio no es de datos: es que alguna pantalla deje de
-- mostrar cosas. Entrar con el usuario de siempre y revisar que carguen
-- Insumos, Facturas, Recetas, Carta y Analisis. Si algo aparece vacio, esa
-- tabla quedo sin policy que le aplique.
--
-- Para volver atras, si hiciera falta:
--     ALTER POLICY "allow_all" ON public.insumos TO public;
