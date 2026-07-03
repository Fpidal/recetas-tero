-- =====================================================
-- FIX: el trigger de precios debe IGNORAR los vinos
-- =====================================================
-- Problema: actualizar_precio_desde_factura() corre al insertar cada
-- item de factura. Para los vinos (insumo_id NULL) intentaba insertar
-- en precios_insumo con insumo_id NULL → viola NOT NULL (error 23502)
-- y aborta el insert de TODOS los items de la factura.
--
-- Solución: salir temprano si el item es un vino (no tiene insumo_id).
-- Los vinos no actualizan precios de insumo (tienen su propio maestro).
--
-- Solo redefine la función (el trigger trg_factura_item_actualizar_precio
-- ya existe y usa esta función). No toca datos ni otros triggers.
-- =====================================================

CREATE OR REPLACE FUNCTION actualizar_precio_desde_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_cantidad_por_paquete DECIMAL(10,3);
  v_tipo_factura TEXT;
BEGIN
  -- 🍷 Si no hay insumo_id, es un VINO → no toca precios_insumo
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si es nota de crédito, no actualizar precio
  SELECT tipo INTO v_tipo_factura
  FROM facturas_proveedor
  WHERE id = NEW.factura_id;

  IF v_tipo_factura = 'nota_credito' THEN
    RETURN NEW;
  END IF;

  -- cantidad_por_paquete del insumo (para precio por unidad de medida)
  SELECT COALESCE(cantidad_por_paquete, 1) INTO v_cantidad_por_paquete
  FROM insumos WHERE id = NEW.insumo_id;

  -- Marcar precios anteriores como no actuales
  UPDATE precios_insumo
  SET es_precio_actual = false
  WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;

  -- Insertar nuevo precio (con factura_item_id para poder revertirlo)
  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual, factura_item_id)
  SELECT NEW.insumo_id, fp.proveedor_id, NEW.precio_unitario / v_cantidad_por_paquete, fp.fecha, true, NEW.id
  FROM facturas_proveedor fp
  WHERE fp.id = NEW.factura_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
