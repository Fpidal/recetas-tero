-- =====================================================
-- FIX: el trigger de precios IGNORA el descuento del ítem
-- =====================================================
-- Problema: actualizar_precio_desde_factura() calcula el precio del insumo
-- como (precio_unitario / cantidad_por_paquete) y NUNCA aplica NEW.descuento.
-- Resultado: si cargás una factura con descuento (ej: café 98.500 con 27,27%),
-- el insumo queda con el precio de LISTA (98.500) en vez del real (71.639).
--
-- Verificado contra producción (09/07/26):
--   factura_item café: precio_unitario=98500, descuento=27.27
--   precios_insumo guardado: 98500  ← MAL (debía ser 71639.05)
--   Maíz pisado: 13898/5 = 2779.6 guardado, sin el 3% ← MAL
--
-- El divisor correcto es cantidad_por_paquete del insumo (confirmado con el
-- caso Mascarpone: contenido_override=3 pero se guardó /1 = cantidad_por_paquete).
--
-- Alcance: SOLO redefine la función. Corre en las facturas FUTURAS.
-- NO toca ningún precio ya cargado ni ningún costo de receta existente.
-- Los precios viejos (cargados sin descuento) se van corrigiendo solos a
-- medida que se cargan nuevas facturas de cada insumo.
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

  -- Insertar nuevo precio APLICANDO EL DESCUENTO (← el fix)
  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual, factura_item_id)
  SELECT NEW.insumo_id, fp.proveedor_id,
         NEW.precio_unitario * (1 - COALESCE(NEW.descuento, 0) / 100.0) / v_cantidad_por_paquete,
         fp.fecha, true, NEW.id
  FROM facturas_proveedor fp
  WHERE fp.id = NEW.factura_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
