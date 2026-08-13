-- =====================================================
-- ABC DE INSUMOS: dónde se va la plata de las compras
-- =====================================================
--
-- PARA QUÉ: hay más de 300 insumos activos. Nadie puede vigilar 300 precios.
-- Pero si 60 de ellos son el 80% del gasto, esa lista sí es manejable, y es la
-- única que vale la pena mirar todas las semanas.
--
-- El valor no está tanto en la lista A —esa se intuye— como en la C: dice en
-- qué DEJAR de gastar atención. Si alguien está comparando tres proveedores de
-- servilletas, este informe se lo saca de encima.
--
-- CLASIFICACIÓN (Pareto clásico, sobre el acumulado):
--   A  hasta el 80% del gasto
--   B  del 80% al 95%
--   C  el 5% restante
--
-- ⚠️ MISMAS REGLAS QUE `cierre_mes()`, y por los mismos motivos:
--   · `activo = true`, o se suman comprobantes de la papelera.
--   · Las notas de crédito tienen total NEGATIVO: no filtrar por tipo.
--   · Las compras salen de FACTURAS, nunca de órdenes de compra.
--   · El monto por insumo se PRORRATEA contra el total real de su factura,
--     porque los ítems no conocen el descuento del pie ni las percepciones.
--     Sin eso, la suma del ABC no daría el total de compras del período.
--
-- Además devuelve la volatilidad del precio en el período: un insumo A con
-- precio estable no necesita atención; uno que además se mueve es donde está
-- el problema de hoy.
-- =====================================================


CREATE OR REPLACE FUNCTION public.abc_insumos(p_desde date, p_hasta date)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
facturas AS (
  SELECT f.id, f.total
  FROM facturas_proveedor f
  WHERE f.activo = true
    AND f.fecha BETWEEN p_desde AND p_hasta
),

-- Prorrateo: el peso de cada línea dentro de su factura
items AS (
  SELECT fi.factura_id,
         fi.insumo_id,
         fi.cantidad,
         fi.cantidad * fi.precio_unitario
           * (1 - COALESCE(fi.descuento, 0) / 100.0) AS importe_linea
  FROM factura_items fi
  WHERE fi.insumo_id IS NOT NULL
),
items_pesados AS (
  SELECT i.*,
         f.total AS total_factura,
         SUM(i.importe_linea) OVER (PARTITION BY i.factura_id) AS suma_lineas
  FROM items i
  JOIN facturas f ON f.id = i.factura_id
),
gasto AS (
  SELECT ip.insumo_id,
         SUM(CASE WHEN ip.suma_lineas > 0
                  THEN ip.total_factura * (ip.importe_linea / ip.suma_lineas)
                  ELSE 0 END)                       AS monto,
         SUM(ip.cantidad)                           AS cantidad,
         COUNT(DISTINCT ip.factura_id)              AS compras
  FROM items_pesados ip
  GROUP BY ip.insumo_id
  HAVING SUM(CASE WHEN ip.suma_lineas > 0
                  THEN ip.total_factura * (ip.importe_linea / ip.suma_lineas)
                  ELSE 0 END) > 0
),

-- Volatilidad: cuánto se movió el precio dentro del período
precios AS (
  SELECT pi.insumo_id,
         pi.precio,
         pi.fecha,
         LAG(pi.precio) OVER (PARTITION BY pi.insumo_id ORDER BY pi.fecha) AS anterior
  FROM precios_insumo pi
  WHERE pi.fecha BETWEEN p_desde AND p_hasta
    AND pi.precio > 0
),
volatilidad AS (
  SELECT insumo_id,
         COUNT(*) FILTER (WHERE anterior IS NOT NULL AND precio > anterior) AS subas,
         MIN(precio) AS precio_min,
         MAX(precio) AS precio_max,
         -- Variación entre el primer y el último precio del período
         (MAX(precio) FILTER (WHERE fecha = ultima) - MIN(precio) FILTER (WHERE fecha = primera))
           / NULLIF(MIN(precio) FILTER (WHERE fecha = primera), 0) * 100 AS variacion
  FROM (
    SELECT p.*,
           MIN(fecha) OVER (PARTITION BY insumo_id) AS primera,
           MAX(fecha) OVER (PARTITION BY insumo_id) AS ultima
    FROM precios p
  ) x
  GROUP BY insumo_id
),

total AS (SELECT COALESCE(SUM(monto), 0) AS gasto_total FROM gasto),

-- El acumulado es lo que define la letra
ranking AS (
  SELECT g.insumo_id,
         ins.nombre,
         COALESCE(ins.categoria::text, 'Sin categoría') AS rubro,
         ins.unidad_medida,
         g.monto,
         g.cantidad,
         g.compras,
         v.subas,
         v.variacion,
         SUM(g.monto) OVER (ORDER BY g.monto DESC, g.insumo_id) / NULLIF(t.gasto_total, 0) * 100
           AS acumulado,
         g.monto / NULLIF(t.gasto_total, 0) * 100 AS porcentaje,
         ROW_NUMBER() OVER (ORDER BY g.monto DESC, g.insumo_id) AS posicion
  FROM gasto g
  JOIN insumos ins ON ins.id = g.insumo_id
  LEFT JOIN volatilidad v ON v.insumo_id = g.insumo_id
  CROSS JOIN total t
),
clasificado AS (
  SELECT r.*,
         CASE WHEN r.acumulado <= 80 THEN 'A'
              WHEN r.acumulado <= 95 THEN 'B'
              ELSE 'C'
         END AS clase
  FROM ranking r
)

SELECT json_build_object(
  'desde', p_desde,
  'hasta', p_hasta,
  'gasto_total', (SELECT gasto_total FROM total),
  'resumen', COALESCE((
    SELECT json_agg(json_build_object(
      'clase', clase,
      'insumos', cantidad_insumos,
      'monto', monto,
      'porcentaje', porcentaje
    ) ORDER BY clase)
    FROM (
      SELECT clase,
             COUNT(*)   AS cantidad_insumos,
             SUM(monto) AS monto,
             SUM(monto) / NULLIF((SELECT gasto_total FROM total), 0) * 100 AS porcentaje
      FROM clasificado GROUP BY clase
    ) s), '[]'::json),
  'items', COALESCE((
    SELECT json_agg(json_build_object(
      'insumo_id', insumo_id,
      'nombre', nombre,
      'rubro', rubro,
      'unidad', unidad_medida,
      'monto', monto,
      'cantidad', cantidad,
      'compras', compras,
      'porcentaje', porcentaje,
      'acumulado', acumulado,
      'clase', clase,
      'subas', COALESCE(subas, 0),
      'variacion', variacion,
      'posicion', posicion
    ) ORDER BY posicion) FROM clasificado), '[]'::json)
);
$$;


-- =====================================================
-- PERMISOS
-- =====================================================

REVOKE ALL ON FUNCTION public.abc_insumos(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.abc_insumos(date, date) TO authenticated;


-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- 1. Corre y devuelve algo
SELECT public.abc_insumos('2026-07-01', '2026-07-31');

-- 2. El ABC tiene que sumar el total de compras del período, igual que
--    cierre_mes(). Si no cierra, el prorrateo está mal.
WITH d AS (SELECT public.abc_insumos('2026-07-01', '2026-07-31') AS j)
SELECT
  (j->>'gasto_total')::numeric AS gasto_total,
  (SELECT SUM((i->>'monto')::numeric) FROM json_array_elements(j->'items') i) AS suma_items,
  (SELECT COUNT(*) FROM json_array_elements(j->'items')) AS insumos,
  (SELECT string_agg(s->>'clase' || ': ' || (s->>'insumos'), ' | ')
     FROM json_array_elements(j->'resumen') s) AS distribucion
FROM d;
