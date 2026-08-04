-- =====================================================
-- FIX: triggers de factura_items rotos
-- =====================================================
-- Escrito sobre el estado REAL de la base (pg_get_functiondef, 04/08/26).
--
-- PROBLEMA 1 — borrar items de factura fallaba
-- revertir_precio_item_eliminado() llamaba a propagar_cambio_precio_insumo(),
-- que NO EXISTE en la base (solo está en el .sql obsoleto del repo).
-- Al editar una factura, la app borra los items y los reinserta
-- (facturas/[id]/editar/page.tsx). El borrado fallaba, el error se logueaba
-- pero no se chequeaba, y el insert seguía igual → ITEMS DUPLICADOS.
-- Caso detectado: factura 1001-00174837 (Morres) con 8 items en vez de 2.
--
-- PROBLEMA 2 — anular no recalculaba las recetas
-- revertir_precios_factura_anulada() restauraba el precio anterior pero no
-- propagaba: el insumo volvía al precio viejo y los platos seguían con el
-- costo de la factura anulada.
--
-- PROBLEMA 3 — actualizar_precio_insumo_on_update escribía en "precio_insumos"
-- (singular), tabla que no existe (404). Dormido porque la app nunca hace
-- UPDATE de factura_items, pero era una mina.
--
-- PROBLEMA 4 — al buscar el precio anterior se usaba factura_item_id != OLD.id.
-- Los precios cargados a mano tienen factura_item_id NULL, y NULL != x da NULL,
-- así que nunca se los encontraba. Son 90 de 302 precios vigentes.
-- =====================================================


-- =====================================================
-- 1. Propagación del costo de un insumo (reemplaza a la función fantasma)
-- =====================================================
-- Recalcula todo lo que depende del precio vigente de UN insumo.
-- Usa costo_final_insumo_id(), la fórmula única (ver docs/SISTEMA-COSTOS.md).
CREATE OR REPLACE FUNCTION propagar_costo_insumo(p_insumo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_costo NUMERIC;
BEGIN
  v_costo := COALESCE(costo_final_insumo_id(p_insumo_id), 0);

  -- Elaboraciones que usan el insumo
  UPDATE receta_base_ingredientes
  SET costo_linea = cantidad * v_costo
  WHERE insumo_id = p_insumo_id;

  UPDATE recetas_base rb
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0),
    costo_por_porcion = CASE WHEN rb.rendimiento_porciones > 0 THEN
      COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0) / rb.rendimiento_porciones
    ELSE 0 END,
    updated_at = NOW()
  WHERE rb.id IN (SELECT DISTINCT receta_base_id FROM receta_base_ingredientes WHERE insumo_id = p_insumo_id);

  -- Platos que usan el insumo directo
  UPDATE plato_ingredientes
  SET costo_linea = cantidad * v_costo
  WHERE insumo_id = p_insumo_id;

  -- Platos que lo usan a través de una elaboración
  UPDATE plato_ingredientes pi
  SET costo_linea = pi.cantidad * COALESCE(
        (SELECT rb.costo_por_porcion FROM recetas_base rb WHERE rb.id = pi.receta_base_id), 0)
  WHERE pi.receta_base_id IN (
    SELECT DISTINCT receta_base_id FROM receta_base_ingredientes WHERE insumo_id = p_insumo_id
  );

  UPDATE platos p
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM plato_ingredientes WHERE plato_id = p.id), 0),
    updated_at = NOW()
  WHERE p.id IN (
    SELECT DISTINCT plato_id FROM plato_ingredientes
    WHERE insumo_id = p_insumo_id
       OR receta_base_id IN (SELECT DISTINCT receta_base_id FROM receta_base_ingredientes WHERE insumo_id = p_insumo_id)
  );

  -- Carta
  UPDATE carta c
  SET
    food_cost_real  = CASE WHEN c.precio_carta > 0 THEN (p.costo_total / c.precio_carta) * 100 ELSE 0 END,
    precio_sugerido = CASE WHEN c.margen_objetivo > 0 THEN p.costo_total / (c.margen_objetivo / 100) ELSE 0 END
  FROM platos p
  WHERE c.plato_id = p.id
    AND p.id IN (
      SELECT DISTINCT plato_id FROM plato_ingredientes
      WHERE insumo_id = p_insumo_id
         OR receta_base_id IN (SELECT DISTINCT receta_base_id FROM receta_base_ingredientes WHERE insumo_id = p_insumo_id)
    );
END;
$function$;

COMMENT ON FUNCTION propagar_costo_insumo IS
  'Recalcula elaboraciones, platos y carta que dependen de un insumo. Reemplaza a propagar_cambio_precio_insumo(), que nunca existió en la base.';


-- =====================================================
-- 2. revertir_precio_item_eliminado — ya no llama a la función fantasma
-- =====================================================
CREATE OR REPLACE FUNCTION revertir_precio_item_eliminado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_precio_anterior_id UUID;
  v_precio_factura_id UUID;
BEGIN
  -- Vinos: no tocan precios_insumo
  IF OLD.insumo_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id INTO v_precio_factura_id
  FROM precios_insumo
  WHERE factura_item_id = OLD.id;

  IF v_precio_factura_id IS NOT NULL THEN
    SELECT id INTO v_precio_anterior_id
    FROM precios_insumo
    WHERE insumo_id = OLD.insumo_id
      AND id != v_precio_factura_id
      AND es_precio_actual = false
    ORDER BY fecha DESC, created_at DESC
    LIMIT 1;

    IF v_precio_anterior_id IS NOT NULL THEN
      UPDATE precios_insumo SET es_precio_actual = true WHERE id = v_precio_anterior_id;
    END IF;

    DELETE FROM precios_insumo WHERE id = v_precio_factura_id;

    -- <<< ANTES: propagar_cambio_precio_insumo() -> no existía -> ERROR >>>
    PERFORM propagar_costo_insumo(OLD.insumo_id);
  END IF;

  RETURN OLD;
END;
$function$;


-- =====================================================
-- 3. revertir_precio_al_eliminar_factura — arregla el NULL != x
-- =====================================================
CREATE OR REPLACE FUNCTION revertir_precio_al_eliminar_factura()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_precio_anterior_id UUID;
BEGIN
  IF OLD.insumo_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- IS DISTINCT FROM en vez de != : los precios cargados a mano tienen
  -- factura_item_id NULL, y con != nunca se los encontraba
  SELECT id INTO v_precio_anterior_id
  FROM precios_insumo
  WHERE insumo_id = OLD.insumo_id
    AND factura_item_id IS DISTINCT FROM OLD.id
    AND es_precio_actual = false
  ORDER BY fecha DESC, created_at DESC
  LIMIT 1;

  IF v_precio_anterior_id IS NOT NULL THEN
    UPDATE precios_insumo SET es_precio_actual = true WHERE id = v_precio_anterior_id;
  END IF;

  DELETE FROM precios_insumo WHERE factura_item_id = OLD.id;

  RETURN OLD;
END;
$function$;


-- =====================================================
-- 4. revertir_precios_factura_anulada — ahora sí propaga
-- =====================================================
CREATE OR REPLACE FUNCTION revertir_precios_factura_anulada()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_precio_anterior_id UUID;
  v_precio_factura_id UUID;
  v_insumo_id UUID;
BEGIN
  IF OLD.activo = true AND NEW.activo = false THEN
    FOR v_item IN
      SELECT fi.id as factura_item_id, fi.insumo_id
      FROM factura_items fi
      WHERE fi.factura_id = NEW.id AND fi.insumo_id IS NOT NULL
    LOOP
      v_insumo_id := v_item.insumo_id;

      SELECT id INTO v_precio_factura_id
      FROM precios_insumo
      WHERE factura_item_id = v_item.factura_item_id;

      IF v_precio_factura_id IS NOT NULL THEN
        SELECT id INTO v_precio_anterior_id
        FROM precios_insumo
        WHERE insumo_id = v_insumo_id
          AND id != v_precio_factura_id
          AND es_precio_actual = false
        ORDER BY fecha DESC, created_at DESC
        LIMIT 1;

        IF v_precio_anterior_id IS NOT NULL THEN
          UPDATE precios_insumo SET es_precio_actual = true WHERE id = v_precio_anterior_id;
        END IF;

        UPDATE precios_insumo SET es_precio_actual = false WHERE id = v_precio_factura_id;

        -- <<< NUEVO: sin esto, anular dejaba las recetas con el costo viejo >>>
        PERFORM propagar_costo_insumo(v_insumo_id);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;


-- =====================================================
-- 5. actualizar_precio_insumo_on_update — apuntaba a una tabla inexistente
-- =====================================================
-- Escribía en "precio_insumos" (singular) con columnas fuente/referencia_id.
-- La tabla real es "precios_insumo". Reescrita para actualizar el precio que
-- ese mismo item de factura había creado.
CREATE OR REPLACE FUNCTION actualizar_precio_insumo_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_cantidad_por_paquete DECIMAL(10,3);
  v_tipo_factura TEXT;
BEGIN
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.precio_unitario IS NOT DISTINCT FROM OLD.precio_unitario
     AND NEW.descuento IS NOT DISTINCT FROM OLD.descuento THEN
    RETURN NEW;
  END IF;

  SELECT tipo INTO v_tipo_factura FROM facturas_proveedor WHERE id = NEW.factura_id;
  IF v_tipo_factura = 'nota_credito' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cantidad_por_paquete, 1) INTO v_cantidad_por_paquete
  FROM insumos WHERE id = NEW.insumo_id;

  -- Mismo criterio que actualizar_precio_desde_factura: con descuento y por unidad base
  UPDATE precios_insumo
  SET precio = NEW.precio_unitario * (1 - COALESCE(NEW.descuento, 0) / 100.0) / v_cantidad_por_paquete
  WHERE factura_item_id = NEW.id;

  PERFORM propagar_costo_insumo(NEW.insumo_id);

  RETURN NEW;
END;
$function$;
