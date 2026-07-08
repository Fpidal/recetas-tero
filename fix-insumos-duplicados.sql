-- =====================================================
-- FIX: insumos duplicados en el dropdown de nueva receta
-- =====================================================
-- Causa: algunos insumos tienen MÁS DE UN precio marcado con
-- es_precio_actual = true (el flag del precio anterior no se
-- desmarcó al cargar el nuevo). La vista v_insumos_con_precio
-- hace JOIN con esa condición y devuelve una fila por cada
-- precio "actual" → el insumo aparece repetido.
--
-- Correr en: Supabase → SQL Editor. Ejecutar los 3 pasos en orden.
-- =====================================================

-- -----------------------------------------------------
-- PASO 1 (diagnóstico): ver qué insumos tienen >1 precio actual
-- -----------------------------------------------------
SELECT i.id, i.nombre, count(*) AS precios_actuales
FROM precios_insumo p
JOIN insumos i ON i.id = p.insumo_id
WHERE p.es_precio_actual = true
GROUP BY i.id, i.nombre
HAVING count(*) > 1
ORDER BY i.nombre;

-- -----------------------------------------------------
-- PASO 2 (limpieza de datos): dejar UN solo precio actual por
-- insumo, conservando el más reciente por fecha. Los demás
-- quedan en el historial pero con es_precio_actual = false.
-- -----------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY insumo_id
      ORDER BY fecha DESC, id DESC
    ) AS rn
  FROM precios_insumo
  WHERE es_precio_actual = true
)
UPDATE precios_insumo p
SET es_precio_actual = false
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- -----------------------------------------------------
-- PASO 3 (robustez de la vista): que aunque en el futuro se
-- vuelva a colar un precio actual duplicado, la vista devuelva
-- SIEMPRE una fila por insumo (la del precio más reciente).
-- -----------------------------------------------------
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

-- -----------------------------------------------------
-- VERIFICACIÓN: total de filas de la vista debe igualar
-- el total de insumos activos (ya sin duplicados).
-- -----------------------------------------------------
SELECT
  (SELECT count(*) FROM v_insumos_con_precio) AS filas_vista,
  (SELECT count(*) FROM insumos)              AS total_insumos;

-- -----------------------------------------------------
-- (OPCIONAL / AVANZADO) Prevenir el problema de raíz con un
-- índice único parcial: como máximo un precio actual por insumo.
-- ⚠️ Solo si el proceso de carga de precios PRIMERO desmarca el
-- anterior y DESPUÉS inserta el nuevo. Si inserta antes de
-- desmarcar, este índice haría fallar la carga. Dejar comentado
-- hasta confirmar ese orden.
-- -----------------------------------------------------
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_precio_actual_por_insumo
--   ON precios_insumo (insumo_id)
--   WHERE es_precio_actual = true;
