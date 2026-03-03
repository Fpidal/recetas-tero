-- =====================================================
-- AGREGAR SOPORTE PARA NOTAS DE CRÉDITO
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Agregar columna tipo a facturas_proveedor
ALTER TABLE facturas_proveedor
ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'factura';

-- 2. Agregar constraint para valores válidos
ALTER TABLE facturas_proveedor
DROP CONSTRAINT IF EXISTS facturas_proveedor_tipo_check;

ALTER TABLE facturas_proveedor
ADD CONSTRAINT facturas_proveedor_tipo_check
CHECK (tipo IN ('factura', 'nota_credito'));

-- 3. Índice para filtrar por tipo
CREATE INDEX IF NOT EXISTS idx_facturas_tipo ON facturas_proveedor(tipo);

-- 4. Comentario explicativo
COMMENT ON COLUMN facturas_proveedor.tipo IS 'Tipo de comprobante: factura o nota_credito. Las NC no actualizan precios de insumos.';

-- =====================================================
-- MODIFICAR TRIGGER DE ACTUALIZACIÓN DE PRECIOS
-- Para que NO actualice precios cuando es Nota de Crédito
-- =====================================================

-- Reemplazar la función del trigger existente
CREATE OR REPLACE FUNCTION actualizar_precio_desde_factura()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo VARCHAR(20);
    v_proveedor_id UUID;
    v_fecha DATE;
    v_cantidad_por_paquete DECIMAL;
    v_precio_unitario DECIMAL;
BEGIN
    -- Obtener el tipo de comprobante y proveedor
    SELECT tipo, proveedor_id, fecha
    INTO v_tipo, v_proveedor_id, v_fecha
    FROM facturas_proveedor
    WHERE id = NEW.factura_id;

    -- Si es nota de crédito, NO actualizar precios
    IF v_tipo = 'nota_credito' THEN
        RETURN NEW;
    END IF;

    -- Obtener cantidad_por_paquete del insumo
    SELECT COALESCE(cantidad_por_paquete, 1)
    INTO v_cantidad_por_paquete
    FROM insumos
    WHERE id = NEW.insumo_id;

    -- Calcular precio unitario (precio del paquete / cantidad por paquete)
    v_precio_unitario := NEW.precio_unitario / v_cantidad_por_paquete;

    -- Marcar precios anteriores como no actuales
    UPDATE precios_insumo
    SET es_precio_actual = false
    WHERE insumo_id = NEW.insumo_id
    AND es_precio_actual = true;

    -- Insertar nuevo precio
    INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual)
    VALUES (NEW.insumo_id, v_proveedor_id, v_precio_unitario, v_fecha, true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear el trigger (por si no existe)
DROP TRIGGER IF EXISTS trg_factura_item_actualizar_precio ON factura_items;
CREATE TRIGGER trg_factura_item_actualizar_precio
AFTER INSERT ON factura_items
FOR EACH ROW
EXECUTE FUNCTION actualizar_precio_desde_factura();
