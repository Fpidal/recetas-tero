-- =====================================================
-- TRIGGER: Revertir precios al anular una factura
-- Ejecutar en Supabase SQL Editor
-- =====================================================
-- Cuando una factura se anula (activo = false), revertir
-- los precios de insumos al valor anterior
-- =====================================================

-- =====================================================
-- FUNCIÓN: Revertir precios de todos los items de una factura
-- =====================================================
CREATE OR REPLACE FUNCTION revertir_precios_factura_anulada()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_precio_anterior_id UUID;
  v_precio_factura_id UUID;
  v_insumo_id UUID;
BEGIN
  -- Solo actuar cuando la factura pasa de activa a inactiva
  IF OLD.activo = true AND NEW.activo = false THEN

    -- Iterar sobre cada item de la factura
    FOR v_item IN
      SELECT fi.id as factura_item_id, fi.insumo_id
      FROM factura_items fi
      WHERE fi.factura_id = NEW.id
        AND fi.insumo_id IS NOT NULL
    LOOP
      v_insumo_id := v_item.insumo_id;

      -- Buscar el precio creado por este item de factura
      SELECT id INTO v_precio_factura_id
      FROM precios_insumo
      WHERE factura_item_id = v_item.factura_item_id;

      -- Si existe el precio de esta factura
      IF v_precio_factura_id IS NOT NULL THEN
        -- Buscar el precio anterior para este insumo (que no sea el de esta factura)
        SELECT id INTO v_precio_anterior_id
        FROM precios_insumo
        WHERE insumo_id = v_insumo_id
          AND id != v_precio_factura_id
          AND es_precio_actual = false
        ORDER BY fecha DESC, created_at DESC
        LIMIT 1;

        -- Si hay precio anterior, marcarlo como actual
        IF v_precio_anterior_id IS NOT NULL THEN
          UPDATE precios_insumo
          SET es_precio_actual = true
          WHERE id = v_precio_anterior_id;
        END IF;

        -- Marcar el precio de esta factura como no actual
        UPDATE precios_insumo
        SET es_precio_actual = false
        WHERE id = v_precio_factura_id;
      END IF;
    END LOOP;

    -- Propagar cambios de precios a recetas y platos
    FOR v_item IN
      SELECT DISTINCT fi.insumo_id
      FROM factura_items fi
      WHERE fi.factura_id = NEW.id
        AND fi.insumo_id IS NOT NULL
    LOOP
      PERFORM propagar_cambio_precio_insumo(v_item.insumo_id);
    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Eliminar trigger si existe
-- =====================================================
DROP TRIGGER IF EXISTS trg_factura_anulada ON facturas_proveedor;

-- =====================================================
-- Crear trigger en UPDATE de facturas_proveedor
-- =====================================================
CREATE TRIGGER trg_factura_anulada
  AFTER UPDATE ON facturas_proveedor
  FOR EACH ROW
  WHEN (OLD.activo IS DISTINCT FROM NEW.activo)
  EXECUTE FUNCTION revertir_precios_factura_anulada();

-- =====================================================
-- COMENTARIO
-- =====================================================
COMMENT ON FUNCTION revertir_precios_factura_anulada IS
  'Revierte los precios de insumos al anular una factura, volviendo al precio anterior';

-- =====================================================
-- TRIGGER: Revertir precio al ELIMINAR un factura_item
-- =====================================================
-- Cuando se elimina un item de factura (DELETE), revertir
-- el precio del insumo al valor anterior
-- =====================================================

CREATE OR REPLACE FUNCTION revertir_precio_item_eliminado()
RETURNS TRIGGER AS $$
DECLARE
  v_precio_anterior_id UUID;
  v_precio_factura_id UUID;
BEGIN
  -- Solo procesar si es un insumo (no vino)
  IF OLD.insumo_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Buscar el precio creado por este item de factura
  SELECT id INTO v_precio_factura_id
  FROM precios_insumo
  WHERE factura_item_id = OLD.id;

  -- Si existe el precio de esta factura
  IF v_precio_factura_id IS NOT NULL THEN
    -- Buscar el precio anterior para este insumo (que no sea el de esta factura)
    SELECT id INTO v_precio_anterior_id
    FROM precios_insumo
    WHERE insumo_id = OLD.insumo_id
      AND id != v_precio_factura_id
      AND es_precio_actual = false
    ORDER BY fecha DESC, created_at DESC
    LIMIT 1;

    -- Si hay precio anterior, marcarlo como actual
    IF v_precio_anterior_id IS NOT NULL THEN
      UPDATE precios_insumo
      SET es_precio_actual = true
      WHERE id = v_precio_anterior_id;
    END IF;

    -- Eliminar el precio de esta factura (ya no tiene sentido mantenerlo)
    DELETE FROM precios_insumo
    WHERE id = v_precio_factura_id;

    -- Propagar cambio de precio a recetas y platos
    PERFORM propagar_cambio_precio_insumo(OLD.insumo_id);
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS trg_factura_item_eliminado ON factura_items;

-- Crear trigger BEFORE DELETE en factura_items
CREATE TRIGGER trg_factura_item_eliminado
  BEFORE DELETE ON factura_items
  FOR EACH ROW
  EXECUTE FUNCTION revertir_precio_item_eliminado();

COMMENT ON FUNCTION revertir_precio_item_eliminado IS
  'Revierte el precio de un insumo al eliminar el item de factura que lo creó';
