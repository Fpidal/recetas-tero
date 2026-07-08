-- =====================================================
-- TABLA: Presentaciones de Insumos
-- Permite definir múltiples presentaciones por insumo
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Crear tabla de presentaciones
CREATE TABLE IF NOT EXISTS insumo_presentaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  descripcion VARCHAR(100) NOT NULL,  -- Ej: "Pote 3kg", "Pack 6x500gr"
  cantidad_por_paquete DECIMAL(10,3) NOT NULL,  -- Contenido en unidad base
  es_default BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_presentaciones_insumo ON insumo_presentaciones(insumo_id);

-- Agregar campo a insumos para indicar que tiene múltiples presentaciones
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS multiples_presentaciones BOOLEAN DEFAULT false;

-- Agregar campos a factura_items para guardar la presentación usada
ALTER TABLE factura_items ADD COLUMN IF NOT EXISTS presentacion_id UUID REFERENCES insumo_presentaciones(id);
ALTER TABLE factura_items ADD COLUMN IF NOT EXISTS cantidad_por_paquete DECIMAL(10,3);

-- =====================================================
-- ACTUALIZAR TRIGGER: Usar cantidad_por_paquete del item si está presente
-- =====================================================
CREATE OR REPLACE FUNCTION actualizar_precio_insumo_desde_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_fecha DATE;
  v_proveedor_id UUID;
  v_cantidad_por_paquete DECIMAL(10,3);
  v_precio_unitario DECIMAL(15,4);
BEGIN
  -- Solo procesar si es un insumo (no vino)
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener fecha y proveedor de la factura
  SELECT fecha, proveedor_id INTO v_fecha, v_proveedor_id
  FROM facturas_proveedor WHERE id = NEW.factura_id;

  -- Usar cantidad_por_paquete del item si está presente, sino del insumo
  IF NEW.cantidad_por_paquete IS NOT NULL AND NEW.cantidad_por_paquete > 0 THEN
    v_cantidad_por_paquete := NEW.cantidad_por_paquete;
  ELSE
    SELECT COALESCE(cantidad_por_paquete, 1) INTO v_cantidad_por_paquete
    FROM insumos WHERE id = NEW.insumo_id;
  END IF;

  -- Calcular precio unitario (dividir por cantidad_por_paquete)
  v_precio_unitario := NEW.precio_unitario / v_cantidad_por_paquete;

  -- Marcar precios anteriores como no actuales
  UPDATE precios_insumo
  SET es_precio_actual = false
  WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;

  -- Insertar nuevo precio
  INSERT INTO precios_insumo (
    insumo_id,
    proveedor_id,
    precio,
    fecha,
    es_precio_actual,
    factura_item_id
  ) VALUES (
    NEW.insumo_id,
    v_proveedor_id,
    v_precio_unitario,
    v_fecha,
    true,
    NEW.id
  );

  -- Propagar cambio de precio
  PERFORM propagar_cambio_precio_insumo(NEW.insumo_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ACTUALIZAR VISTA: Incluir multiples_presentaciones
-- =====================================================
-- DISTINCT ON (i.id) garantiza UNA sola fila por insumo aunque exista más de un
-- precio marcado como es_precio_actual = true (toma el más reciente por fecha).
CREATE OR REPLACE VIEW v_insumos_con_precio AS
SELECT DISTINCT ON (i.id)
  i.id,
  i.codigo,
  i.nombre,
  i.categoria,
  i.unidad_medida,
  i.cantidad,
  i.cantidad_por_paquete,
  i.merma_porcentaje,
  i.iva_porcentaje,
  i.activo,
  i.inventario,
  i.multiples_presentaciones,
  i.presentaciones_csv,
  p.precio as precio_actual,
  p.fecha as fecha_precio,
  p.proveedor_id,
  pr.nombre as proveedor_nombre
FROM insumos i
LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
ORDER BY i.id, p.fecha DESC NULLS LAST;

-- =====================================================
-- EJEMPLO: Ricotta con 2 presentaciones
-- =====================================================

-- Primero obtener el ID de ricotta
DO $$
DECLARE
  v_ricotta_id UUID;
BEGIN
  SELECT id INTO v_ricotta_id FROM insumos WHERE nombre ILIKE '%ricotta%' LIMIT 1;

  IF v_ricotta_id IS NOT NULL THEN
    -- Marcar que tiene múltiples presentaciones
    UPDATE insumos SET multiples_presentaciones = true WHERE id = v_ricotta_id;

    -- Agregar presentaciones
    INSERT INTO insumo_presentaciones (insumo_id, descripcion, cantidad_por_paquete, es_default)
    VALUES
      (v_ricotta_id, 'Pote 3kg', 3, true),
      (v_ricotta_id, 'Pack 6x500gr', 3, false),  -- 6 potes de 500gr = 3kg total
      (v_ricotta_id, 'Pote 1kg', 1, false)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Ricotta configurada con presentaciones. ID: %', v_ricotta_id;
  ELSE
    RAISE NOTICE 'No se encontró ricotta en la base de datos';
  END IF;
END $$;

-- Verificar
SELECT i.nombre, p.descripcion, p.cantidad_por_paquete, p.es_default
FROM insumo_presentaciones p
JOIN insumos i ON i.id = p.insumo_id
WHERE i.nombre ILIKE '%ricotta%';
