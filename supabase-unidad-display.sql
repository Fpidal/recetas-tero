-- Agregar campo unidad_display a orden_compra_items
-- Este campo es informativo para el proveedor (ej: mostrar "unidad" en vez de "kg")
-- Ejecutar en Supabase SQL Editor

ALTER TABLE orden_compra_items
ADD COLUMN IF NOT EXISTS unidad_display TEXT;

-- Comentario explicativo
COMMENT ON COLUMN orden_compra_items.unidad_display IS 'Unidad visual para mostrar al proveedor (puede diferir de la unidad del insumo)';
