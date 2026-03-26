-- =====================================================
-- FIX: Trigger de precios debe ignorar Notas de Crédito
-- =====================================================

-- PASO 1: Actualizar la función para ignorar NC
CREATE OR REPLACE FUNCTION actualizar_precio_desde_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_cantidad_por_paquete DECIMAL(10,3);
  v_tipo_factura TEXT;
BEGIN
  -- Si no hay insumo_id, salir (es un vino)
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verificar si es nota de crédito - si es NC, no actualizar precio
  SELECT tipo INTO v_tipo_factura
  FROM facturas_proveedor
  WHERE id = NEW.factura_id;

  IF v_tipo_factura = 'nota_credito' THEN
    RETURN NEW; -- Salir sin hacer nada para NC
  END IF;

  -- Obtener cantidad_por_paquete del insumo
  SELECT COALESCE(cantidad_por_paquete, 1) INTO v_cantidad_por_paquete
  FROM insumos WHERE id = NEW.insumo_id;

  -- Marcar precios anteriores como no actuales
  UPDATE precios_insumo
  SET es_precio_actual = false
  WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;

  -- Insertar nuevo precio (dividir por cantidad_por_paquete para precio por unidad de medida)
  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual, factura_item_id)
  SELECT NEW.insumo_id, fp.proveedor_id, NEW.precio_unitario / v_cantidad_por_paquete, fp.fecha, true, NEW.id
  FROM facturas_proveedor fp
  WHERE fp.id = NEW.factura_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- PASO 2: Limpiar precios duplicados (de NC anteriores)
-- =====================================================

-- Primero veamos cuántos duplicados hay (solo consulta, no modifica)
-- SELECT insumo_id, COUNT(*) as cantidad
-- FROM precios_insumo
-- WHERE es_precio_actual = true
-- GROUP BY insumo_id
-- HAVING COUNT(*) > 1;

-- Eliminar precios creados por Notas de Crédito
DELETE FROM precios_insumo
WHERE factura_item_id IN (
  SELECT fi.id
  FROM factura_items fi
  JOIN facturas_proveedor fp ON fi.factura_id = fp.id
  WHERE fp.tipo = 'nota_credito'
);

-- =====================================================
-- PASO 3: Corregir insumos que quedaron sin precio actual
-- =====================================================

-- Para cada insumo sin precio actual, marcar el más reciente como actual
UPDATE precios_insumo p1
SET es_precio_actual = true
WHERE p1.id IN (
  SELECT DISTINCT ON (insumo_id) id
  FROM precios_insumo
  WHERE insumo_id IN (
    -- Insumos que no tienen ningún precio marcado como actual
    SELECT i.id
    FROM insumos i
    LEFT JOIN precios_insumo pi ON i.id = pi.insumo_id AND pi.es_precio_actual = true
    WHERE pi.id IS NULL
    AND i.activo = true
  )
  ORDER BY insumo_id, fecha DESC
);

-- =====================================================
-- PASO 4: Verificar que no queden duplicados
-- =====================================================

-- Esta consulta debe devolver 0 filas si todo está bien
-- SELECT insumo_id, COUNT(*) as cantidad
-- FROM precios_insumo
-- WHERE es_precio_actual = true
-- GROUP BY insumo_id
-- HAVING COUNT(*) > 1;
