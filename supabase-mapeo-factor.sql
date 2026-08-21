-- =====================================================
-- MAPEO DE VENTAS: cuanto vale una unidad del sistema de ventas
-- =====================================================
--
-- EL CASO: el salon vende la copa de vino, que son 250 ml de una botella. En el
-- sistema no existe "copa" como producto, y no puede existir: `vinos` se maneja
-- por botella, y `plato_ingredientes` no acepta vino —solo insumos y
-- elaboraciones— asi que tampoco se puede armar una receta.
--
-- LA SALIDA: no crear un producto nuevo, sino guardar la equivalencia.
-- `consumo_items` ya acepta vino y su cantidad es decimal, asi que una copa es
-- 0,333 de botella. Nueve copas cargan 3 botellas, con el costo real.
--
-- Sirve para cualquier caso donde una unidad de venta sea una fraccion de una
-- unidad del recetario: media porcion, un pocillo de una lata, una copa.
--
-- DEFAULT 1: todo lo que ya esta mapeado sigue igual, una unidad por unidad.
-- =====================================================

ALTER TABLE public.mapeo_ventas
  ADD COLUMN IF NOT EXISTS factor NUMERIC(8,4) NOT NULL DEFAULT 1;

ALTER TABLE public.mapeo_ventas
  DROP CONSTRAINT IF EXISTS mapeo_ventas_factor_positivo;

ALTER TABLE public.mapeo_ventas
  ADD CONSTRAINT mapeo_ventas_factor_positivo CHECK (factor > 0);

COMMENT ON COLUMN public.mapeo_ventas.factor IS
  'Cuantas unidades del producto del recetario equivalen a UNA unidad del '
  'sistema de ventas. 1 en la mayoria; 0,333 para una copa de vino sobre una '
  'botella de 750 ml.';

SELECT codigo, nombre_origen, factor FROM public.mapeo_ventas ORDER BY codigo;
