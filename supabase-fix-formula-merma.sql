-- =====================================================
-- FIX: fórmula de merma + IVA faltante en el RPC
-- =====================================================
-- Escrito sobre el estado REAL de la base (extraído con pg_get_functiondef),
-- no sobre supabase-trigger-actualizar-costos.sql, que describe funciones que
-- no existen en producción.
--
-- QUÉ CORRIGE
--
-- 1. Merma. Estaba como  precio × (1 + merma/100)  y debe ser
--    precio / (1 - merma/100). La merma es pérdida de aprovechamiento: si
--    comprás 1 kg y perdés el 10% al limpiarlo, te quedan 0,9 kg utilizables.
--    El error crecía con la merma: 1% con merma 10%, 19% con merma 40%.
--
-- 2. IVA faltante. calcular_costo_insumo() no aplicaba IVA. Como el frontend
--    la llama por RPC al guardar un plato (platos/[id]/page.tsx), cada guardado
--    le borraba el IVA a las líneas de ese plato. 37 de 83 platos activos
--    quedaron dañados, muchos en estado mixto (unas líneas con IVA y otras sin).
--
-- CRITERIO ÚNICO: C. Final = precio × (1 + IVA) / (1 - merma)
-- El precio ya viene normalizado a unidad base (el paquete de 3 kg se convirtió
-- a precio por kilo al cargar la factura). Ese criterio no cambia.
--
-- Espejo exacto de src/lib/costos.ts en el frontend. Si se toca acá, tocar allá.
-- =====================================================


-- =====================================================
-- 1. LA FÓRMULA — un solo lugar en toda la base
-- =====================================================
CREATE OR REPLACE FUNCTION costo_final_insumo(
  p_precio NUMERIC,
  p_iva NUMERIC,
  p_merma NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  -- Merma acotada a 99% para que nunca divida por cero
  SELECT COALESCE(p_precio, 0)
       * (1 + COALESCE(p_iva, 0) / 100.0)
       / (1 - LEAST(GREATEST(COALESCE(p_merma, 0), 0), 99) / 100.0);
$$;

COMMENT ON FUNCTION costo_final_insumo IS
  'C. Final de un insumo: precio x (1+IVA) / (1-merma). Única definición de la fórmula en la base. Espejo de src/lib/costos.ts';


-- Variante por id: toma precio vigente, IVA y merma del insumo
CREATE OR REPLACE FUNCTION costo_final_insumo_id(p_insumo_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT costo_final_insumo(
           get_precio_actual_insumo(p_insumo_id),
           i.iva_porcentaje,
           i.merma_porcentaje
         )
  FROM insumos i
  WHERE i.id = p_insumo_id;
$$;


-- =====================================================
-- 2. calcular_costo_insumo — ahora aplica IVA y la merma correcta
-- =====================================================
-- La llama recalcular_costo_plato(), que el frontend invoca por RPC al guardar
-- un plato. Al no aplicar IVA, ese guardado corrompía las líneas.
CREATE OR REPLACE FUNCTION calcular_costo_insumo(
  p_insumo_id UUID,
  p_cantidad NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN p_cantidad * costo_final_insumo_id(p_insumo_id);
END;
$function$;


-- =====================================================
-- 3. actualizar_costos_recetas_base — el trigger que propaga precios
-- =====================================================
-- Idéntica a la que corre hoy en producción; lo único que cambia es que la
-- fórmula ahora sale de costo_final_insumo() en vez de estar escrita inline.
CREATE OR REPLACE FUNCTION actualizar_costos_recetas_base()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_insumo_id UUID;
  v_costo_final DECIMAL(12,4);
  v_iva DECIMAL(5,2);
  v_merma DECIMAL(5,2);
BEGIN
  IF NEW.es_precio_actual = false THEN
    RETURN NEW;
  END IF;

  v_insumo_id := NEW.insumo_id;

  SELECT COALESCE(iva_porcentaje, 0), COALESCE(merma_porcentaje, 0)
  INTO v_iva, v_merma
  FROM insumos WHERE id = v_insumo_id;

  -- <<< ÚNICO CAMBIO: la fórmula sale de la función única >>>
  v_costo_final := costo_final_insumo(NEW.precio, v_iva, v_merma);

  UPDATE receta_base_ingredientes
  SET costo_linea = cantidad * v_costo_final
  WHERE insumo_id = v_insumo_id;

  UPDATE recetas_base rb
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0),
    costo_por_porcion = CASE WHEN rb.rendimiento_porciones > 0 THEN
      COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0) / rb.rendimiento_porciones
    ELSE 0 END,
    updated_at = NOW()
  WHERE rb.id IN (SELECT DISTINCT receta_base_id FROM receta_base_ingredientes WHERE insumo_id = v_insumo_id);

  UPDATE plato_ingredientes
  SET costo_linea = cantidad * v_costo_final
  WHERE insumo_id = v_insumo_id;

  UPDATE platos p
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM plato_ingredientes WHERE plato_id = p.id), 0),
    updated_at = NOW()
  WHERE p.id IN (SELECT DISTINCT plato_id FROM plato_ingredientes WHERE insumo_id = v_insumo_id);

  RETURN NEW;
END;
$function$;


-- =====================================================
-- 4. RECÁLCULO TOTAL — no existía en la base
-- =====================================================
-- Cambiar la definición de una función no recalcula lo ya guardado. Esta pasada
-- reescribe todos los costos con la fórmula correcta y repara, de una vez, tanto
-- la merma como las líneas a las que el RPC les había borrado el IVA.
--
-- Ejecutar:  SELECT recalcular_todos_los_costos();
CREATE OR REPLACE FUNCTION recalcular_todos_los_costos()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_elab INT; v_platos INT; v_menus INT; v_carta INT;
BEGIN
  -- 1) Elaboraciones: líneas y totales
  UPDATE receta_base_ingredientes
  SET costo_linea = cantidad * costo_final_insumo_id(insumo_id)
  WHERE insumo_id IS NOT NULL;

  UPDATE recetas_base rb
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0),
    costo_por_porcion = CASE WHEN rb.rendimiento_porciones > 0 THEN
      COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0) / rb.rendimiento_porciones
    ELSE 0 END,
    updated_at = NOW()
  WHERE rb.id IS NOT NULL;
  GET DIAGNOSTICS v_elab = ROW_COUNT;

  -- 2) Platos: primero las líneas de insumo, después las de elaboración
  --    (estas últimas dependen del costo_por_porcion recién calculado arriba)
  UPDATE plato_ingredientes
  SET costo_linea = cantidad * costo_final_insumo_id(insumo_id)
  WHERE insumo_id IS NOT NULL;

  UPDATE plato_ingredientes pi
  SET costo_linea = pi.cantidad * COALESCE(
        (SELECT rb.costo_por_porcion FROM recetas_base rb WHERE rb.id = pi.receta_base_id), 0)
  WHERE pi.receta_base_id IS NOT NULL;

  UPDATE platos p
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM plato_ingredientes WHERE plato_id = p.id), 0),
    updated_at = NOW()
  WHERE p.id IS NOT NULL;
  GET DIAGNOSTICS v_platos = ROW_COUNT;

  -- 3) Menús ejecutivos: ítems por insumo, elaboración o plato
  UPDATE menu_ejecutivo_items
  SET costo_linea = cantidad * costo_final_insumo_id(insumo_id)
  WHERE insumo_id IS NOT NULL;

  UPDATE menu_ejecutivo_items mei
  SET costo_linea = mei.cantidad * COALESCE(
        (SELECT rb.costo_por_porcion FROM recetas_base rb WHERE rb.id = mei.receta_base_id), 0)
  WHERE mei.receta_base_id IS NOT NULL;

  UPDATE menu_ejecutivo_items mei
  SET costo_linea = mei.cantidad * COALESCE(
        (SELECT p.costo_total FROM platos p WHERE p.id = mei.plato_id), 0)
  WHERE mei.plato_id IS NOT NULL;

  UPDATE menus_ejecutivos m
  SET costo_total = COALESCE((SELECT SUM(costo_linea) FROM menu_ejecutivo_items WHERE menu_ejecutivo_id = m.id), 0)
  WHERE m.id IS NOT NULL;
  GET DIAGNOSTICS v_menus = ROW_COUNT;

  -- 4) Carta: food cost y precio sugerido sobre el costo corregido
  UPDATE carta c
  SET
    food_cost_real  = CASE WHEN c.precio_carta > 0 THEN (p.costo_total / c.precio_carta) * 100 ELSE 0 END,
    precio_sugerido = CASE WHEN c.margen_objetivo > 0 THEN p.costo_total / (c.margen_objetivo / 100) ELSE 0 END
  FROM platos p
  WHERE c.plato_id = p.id;
  GET DIAGNOSTICS v_carta = ROW_COUNT;

  RETURN 'Recalculados: ' || v_elab || ' elaboraciones, ' || v_platos || ' platos, '
      || v_menus || ' menus, ' || v_carta || ' items de carta';
END;
$function$;

COMMENT ON FUNCTION recalcular_todos_los_costos IS
  'Recalcula todos los costos con la fórmula correcta. Ejecutar tras cambiar costo_final_insumo(): SELECT recalcular_todos_los_costos();';
