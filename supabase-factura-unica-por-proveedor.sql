-- =====================================================
-- FACTURAS: un número de factura único por proveedor
-- =====================================================
--
-- ⚠️ YA APLICADO EN PRODUCCIÓN, a mano, el 13/08/26.
-- Este archivo existe para que el repo no mienta: la regla de que toda
-- función o índice que se toca en el dashboard vuelve al repo el mismo día
-- (ver CLAUDE.md). No hace falta volver a correrlo; si se corre, no rompe.
--
-- QUÉ IMPIDE: cargar dos veces la misma factura del mismo proveedor.
-- Antes esto solo lo frenaba el criterio de quien cargaba. Una factura
-- duplicada no da error en ningún lado: infla el gasto del período y mete
-- un precio repetido en `precios_insumo`, que es de donde sale el costo de
-- todas las recetas.
--
-- POR QUÉ ES PARCIAL (`where activo = true`):
-- Las facturas anuladas quedan con `activo = false` (borrado lógico, no se
-- borra la fila). Si el índice fuera total, una factura anulada bloquearía
-- para siempre su propio número, y una anulación por error de carga no se
-- podría volver a cargar bien. El índice parcial deja convivir N versiones
-- anuladas con una sola activa, que es exactamente la regla del negocio.
--
-- Verificado antes de crearlo (13/08/26): 476 comprobantes activos, ningún
-- par (proveedor_id, numero_factura) repetido. El índice entró sin conflictos.
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS facturas_proveedor_unica
  ON public.facturas_proveedor (proveedor_id, numero_factura)
  WHERE activo = true;


-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- 1. El índice existe y es el parcial correcto
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'facturas_proveedor'
  AND indexname = 'facturas_proveedor_unica';

-- 2. No hay duplicados activos (tiene que dar cero filas)
SELECT proveedor_id, numero_factura, COUNT(*) AS veces
FROM public.facturas_proveedor
WHERE activo = true
GROUP BY proveedor_id, numero_factura
HAVING COUNT(*) > 1;
