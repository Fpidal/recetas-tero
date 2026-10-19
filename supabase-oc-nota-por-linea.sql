-- =====================================================
-- Órdenes de compra: una nota por línea, para el proveedor
-- =====================================================
-- 19/10/26. Correr en el SQL Editor de Supabase.
--
-- POR QUÉ. Hay pedidos que necesitan una aclaración que no entra en la
-- cantidad ni en la unidad: "bola de lomo → feteada", "dulce de leche →
-- marca La Serenísima". Hasta ahora iba en las observaciones generales de la
-- orden, lejos del renglón, y el proveedor la tenía que emparejar a ojo.
--
-- QUÉ HACE. Agrega `nota` a orden_compra_items. Se carga al armar o editar la
-- OC y sale en el PDF debajo del insumo. No entra en ninguna cuenta: ni el
-- subtotal, ni el objetivo semanal, ni la comparación contra la factura.
--
-- No hace falta GRANT ni policy nuevos: es una columna de una tabla que ya los
-- tiene.
-- =====================================================

ALTER TABLE public.orden_compra_items
  ADD COLUMN IF NOT EXISTS nota text;

-- Verificación: tiene que devolver una fila, data_type = text
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orden_compra_items' AND column_name = 'nota';
