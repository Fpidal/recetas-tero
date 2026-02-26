-- Agregar campos de precio y margen a menus_ejecutivos
-- Ejecutar en Supabase SQL Editor

ALTER TABLE menus_ejecutivos
ADD COLUMN IF NOT EXISTS precio_carta DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS margen_objetivo DECIMAL(5,2) DEFAULT 30,
ADD COLUMN IF NOT EXISTS precio_sugerido DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS food_cost_real DECIMAL(5,2) DEFAULT 0;

-- Comentarios
COMMENT ON COLUMN menus_ejecutivos.precio_carta IS 'Precio de venta en carta';
COMMENT ON COLUMN menus_ejecutivos.margen_objetivo IS 'Margen objetivo en porcentaje (ej: 30 = 30%)';
COMMENT ON COLUMN menus_ejecutivos.precio_sugerido IS 'Precio sugerido calculado según margen objetivo';
COMMENT ON COLUMN menus_ejecutivos.food_cost_real IS 'Food cost real en porcentaje (costo/precio_carta*100)';
