-- =====================================================
-- CIERRE DE MES: agregación para el informe mensual
-- =====================================================
--
-- Devuelve, ya agregado, todo lo que necesita la pestaña "Cierre de Mes"
-- de /estadisticas. La app corre entera en el browser, así que traer filas
-- crudas para sumarlas del lado del cliente no escala: esto agrega en la base
-- y devuelve un solo JSON.
--
-- SECURITY INVOKER (el default, explícito acá para que quede dicho):
-- la función corre con los permisos de quien la llama, así que respeta RLS.
-- NUNCA ponerla en SECURITY DEFINER: el día que exista un rol de consulta
-- con permisos recortados, un DEFINER se los saltearía.
--
-- =====================================================
-- REGLAS DE NEGOCIO QUE VIVEN ACÁ ADENTRO
-- =====================================================
--
-- 1. `activo = true` siempre. El borrado es lógico: sin este filtro se suman
--    comprobantes que están en la papelera, y no da error en ningún lado.
--
-- 2. Las notas de crédito se guardan con `total` NEGATIVO, así que `sum(total)`
--    ya da el neto. NO filtrar `tipo = 'factura'`: eso infla las compras porque
--    deja afuera las devoluciones.
--
-- 3. Las compras salen SIEMPRE de facturas, nunca de órdenes de compra. El
--    precio de la OC es el precio esperado; el real lo fija la factura.
--
-- 4. El total del mes es `sum(facturas_proveedor.total)`, que ya viene neto de
--    descuentos y con percepciones. Pero el desglose por rubro hay que armarlo
--    desde los ítems, y la suma de los ítems NO da el total de la factura
--    (los ítems no conocen el descuento del pie ni las percepciones).
--    Por eso cada rubro se PRORRATEA contra el total real de su factura: así
--    los rubros suman exactamente el total del mes.
--
-- 5. Las semanas se cortan por semana calendario (lunes a domingo) pero solo
--    cuentan los días que caen dentro del mes, para que la suma de las semanas
--    dé igual al total mensual.
-- =====================================================


CREATE OR REPLACE FUNCTION public.cierre_mes(p_mes date)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
-- Rango del mes pedido y del anterior
rangos AS (
  SELECT
    date_trunc('month', p_mes)::date                        AS ini_mes,
    (date_trunc('month', p_mes) + interval '1 month - 1 day')::date AS fin_mes,
    (date_trunc('month', p_mes) - interval '1 month')::date  AS ini_prev,
    (date_trunc('month', p_mes) - interval '1 day')::date    AS fin_prev
),

-- Facturas activas del mes y del anterior, marcadas
facturas AS (
  SELECT f.id, f.fecha, f.total,
         CASE WHEN f.fecha BETWEEN r.ini_mes  AND r.fin_mes  THEN 'actual'
              WHEN f.fecha BETWEEN r.ini_prev AND r.fin_prev THEN 'previo'
         END AS periodo
  FROM facturas_proveedor f, rangos r
  WHERE f.activo = true
    AND f.fecha BETWEEN r.ini_prev AND r.fin_mes
),

-- Peso de cada ítem dentro de su factura, para prorratear (regla 4).
-- El peso usa el importe del ítem con su descuento de línea aplicado.
items AS (
  SELECT fi.factura_id,
         fi.insumo_id,
         fi.cantidad,
         fi.precio_unitario,
         fi.cantidad * fi.precio_unitario
           * (1 - COALESCE(fi.descuento, 0) / 100.0) AS importe_linea
  FROM factura_items fi
  WHERE fi.insumo_id IS NOT NULL          -- los vinos no tienen rubro de insumo
),
items_pesados AS (
  SELECT i.*,
         f.periodo,
         f.total AS total_factura,
         SUM(i.importe_linea) OVER (PARTITION BY i.factura_id) AS suma_lineas
  FROM items i
  JOIN facturas f ON f.id = i.factura_id
  WHERE f.periodo IS NOT NULL
),
items_prorrateados AS (
  SELECT ip.insumo_id,
         ip.periodo,
         ip.cantidad,
         ip.precio_unitario,
         -- Si la factura no tiene líneas con importe, no se puede prorratear
         CASE WHEN ip.suma_lineas > 0
              THEN ip.total_factura * (ip.importe_linea / ip.suma_lineas)
              ELSE 0
         END AS monto
  FROM items_pesados ip
),

-- =====================================================
-- 1. TOTALES DE COMPRAS
-- =====================================================
compras AS (
  SELECT
    COALESCE(SUM(total) FILTER (WHERE periodo = 'actual'), 0) AS mes,
    COALESCE(SUM(total) FILTER (WHERE periodo = 'previo'), 0) AS previo
  FROM facturas
  WHERE periodo IS NOT NULL
),

-- =====================================================
-- 2. COMPRAS POR RUBRO (categoría del insumo, no del proveedor)
-- =====================================================
rubros AS (
  SELECT COALESCE(ins.categoria::text, 'Sin categoría') AS rubro,
         COALESCE(SUM(ip.monto) FILTER (WHERE ip.periodo = 'actual'), 0) AS monto,
         COALESCE(SUM(ip.monto) FILTER (WHERE ip.periodo = 'previo'), 0) AS monto_previo
  FROM items_prorrateados ip
  JOIN insumos ins ON ins.id = ip.insumo_id
  GROUP BY 1
  HAVING COALESCE(SUM(ip.monto) FILTER (WHERE ip.periodo = 'actual'), 0) <> 0
      OR COALESCE(SUM(ip.monto) FILTER (WHERE ip.periodo = 'previo'), 0) <> 0
),

-- =====================================================
-- 3. COMPRAS SEMANALES DEL MES (regla 5)
-- =====================================================
-- La semana se identifica por su lunes, pero el rango que se muestra se
-- recorta al mes, y `dias_en_mes` dice cuántos días de esa semana cuentan.
semanas AS (
  SELECT
    GREATEST(date_trunc('week', f.fecha)::date, r.ini_mes)                       AS desde,
    LEAST((date_trunc('week', f.fecha) + interval '6 days')::date, r.fin_mes)    AS hasta,
    date_trunc('week', f.fecha)::date                                           AS lunes,
    SUM(f.total)                                                                AS monto
  FROM facturas f, rangos r
  WHERE f.periodo = 'actual'
  GROUP BY 1, 2, 3
),
semanas_num AS (
  SELECT desde, hasta, monto,
         (hasta - desde + 1)                       AS dias_en_mes,
         (lunes <> desde OR (lunes + 6) <> hasta)  AS cortada,
         ROW_NUMBER() OVER (ORDER BY desde)        AS orden
  FROM semanas
),

-- =====================================================
-- 4. TOP 10 INSUMOS POR GASTO DEL MES
-- =====================================================
top_insumos AS (
  SELECT ip.insumo_id,
         ins.nombre,
         COALESCE(ins.categoria::text, 'Sin categoría') AS rubro,
         SUM(ip.monto)    AS monto,
         SUM(ip.cantidad) AS cantidad
  FROM items_prorrateados ip
  JOIN insumos ins ON ins.id = ip.insumo_id
  WHERE ip.periodo = 'actual'
  GROUP BY 1, 2, 3
  ORDER BY SUM(ip.monto) DESC
  LIMIT 10
),
-- Variación de precio DENTRO del mes: primer precio contra último
precios_mes AS (
  SELECT DISTINCT ON (pi.insumo_id, orden.dir)
         pi.insumo_id, orden.dir, pi.precio
  FROM precios_insumo pi, rangos r,
       (VALUES ('primero'), ('ultimo')) AS orden(dir)
  WHERE pi.insumo_id IN (SELECT insumo_id FROM top_insumos)
    AND pi.fecha BETWEEN r.ini_mes AND r.fin_mes
    AND pi.precio > 0
  ORDER BY pi.insumo_id, orden.dir,
           CASE WHEN orden.dir = 'primero' THEN pi.fecha END ASC,
           CASE WHEN orden.dir = 'ultimo'  THEN pi.fecha END DESC
),
top_con_variacion AS (
  SELECT t.*,
         pp.precio AS precio_inicial,
         pu.precio AS precio_final,
         CASE WHEN pp.precio > 0 AND pu.precio IS NOT NULL
              THEN (pu.precio - pp.precio) / pp.precio * 100
         END AS variacion_precio
  FROM top_insumos t
  LEFT JOIN precios_mes pp ON pp.insumo_id = t.insumo_id AND pp.dir = 'primero'
  LEFT JOIN precios_mes pu ON pu.insumo_id = t.insumo_id AND pu.dir = 'ultimo'
),

-- =====================================================
-- 5. VENTAS POR SERVICIO
-- =====================================================
-- ventas_diarias guarda los turnos como COLUMNAS de una fila por fecha.
-- Hay que desarmarlas, no joinear por fecha (eso multiplicaría las ventas).
ventas AS (
  SELECT v.fecha, t.servicio, t.venta, t.cubiertos,
         CASE WHEN v.fecha BETWEEN r.ini_mes  AND r.fin_mes  THEN 'actual'
              WHEN v.fecha BETWEEN r.ini_prev AND r.fin_prev THEN 'previo'
         END AS periodo
  FROM ventas_diarias v, rangos r,
  LATERAL (VALUES
    ('mediodia', v.venta_mediodia, v.cubiertos_mediodia),
    ('noche',    v.venta_noche,    v.cubiertos_noche),
    ('eventos',  v.venta_eventos,  v.cubiertos_eventos)
  ) AS t(servicio, venta, cubiertos)
  WHERE v.fecha BETWEEN r.ini_prev AND r.fin_mes
),
ventas_servicio AS (
  SELECT servicio,
         COALESCE(SUM(venta)     FILTER (WHERE periodo = 'actual'), 0) AS venta,
         COALESCE(SUM(cubiertos) FILTER (WHERE periodo = 'actual'), 0) AS cubiertos
  FROM ventas
  WHERE periodo IS NOT NULL
  GROUP BY servicio
),
ventas_totales AS (
  SELECT
    COALESCE(SUM(venta)     FILTER (WHERE periodo = 'actual'), 0) AS venta_mes,
    COALESCE(SUM(venta)     FILTER (WHERE periodo = 'previo'), 0) AS venta_previo,
    COALESCE(SUM(cubiertos) FILTER (WHERE periodo = 'actual'), 0) AS cubiertos_mes,
    COALESCE(SUM(cubiertos) FILTER (WHERE periodo = 'previo'), 0) AS cubiertos_previo
  FROM ventas
  WHERE periodo IS NOT NULL
)

-- =====================================================
-- SALIDA
-- =====================================================
SELECT json_build_object(
  'mes',        (SELECT ini_mes  FROM rangos),
  'mes_previo', (SELECT ini_prev FROM rangos),

  'compras', (SELECT json_build_object('mes', mes, 'previo', previo) FROM compras),

  'ventas', (SELECT json_build_object(
      'mes', venta_mes, 'previo', venta_previo,
      'cubiertos', cubiertos_mes, 'cubiertos_previo', cubiertos_previo
    ) FROM ventas_totales),

  'rubros', COALESCE((
    SELECT json_agg(json_build_object(
      'rubro', rubro, 'monto', monto, 'monto_previo', monto_previo
    ) ORDER BY monto DESC) FROM rubros), '[]'::json),

  'semanas', COALESCE((
    SELECT json_agg(json_build_object(
      'desde', desde, 'hasta', hasta,
      'dias_en_mes', dias_en_mes, 'cortada', cortada,
      'monto', monto
    ) ORDER BY orden) FROM semanas_num), '[]'::json),

  'top_insumos', COALESCE((
    SELECT json_agg(json_build_object(
      'insumo_id', insumo_id, 'nombre', nombre, 'rubro', rubro,
      'monto', monto, 'cantidad', cantidad,
      'variacion_precio', variacion_precio
    ) ORDER BY monto DESC) FROM top_con_variacion), '[]'::json),

  'ventas_por_servicio', COALESCE((
    SELECT json_agg(json_build_object(
      'servicio', servicio, 'venta', venta, 'cubiertos', cubiertos
    ) ORDER BY servicio) FROM ventas_servicio), '[]'::json)
);
$$;


-- =====================================================
-- PERMISOS
-- =====================================================
-- Solo usuarios con sesión. `anon` no la puede ejecutar: la carta pública no
-- necesita esto, y todo lo que se le concede a anon queda expuesto en internet.

REVOKE ALL ON FUNCTION public.cierre_mes(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cierre_mes(date) TO authenticated;


-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- 1. Corre y devuelve algo
SELECT public.cierre_mes('2026-07-01');

-- 2. Los rubros tienen que sumar el total de compras del mes (regla 4).
--    La diferencia esperada es cero, salvo redondeo de centavos.
WITH d AS (SELECT public.cierre_mes('2026-07-01') AS j)
SELECT
  (j->'compras'->>'mes')::numeric AS total_compras,
  (SELECT SUM((r->>'monto')::numeric) FROM json_array_elements(j->'rubros') r) AS suma_rubros,
  (SELECT SUM((s->>'monto')::numeric) FROM json_array_elements(j->'semanas') s) AS suma_semanas
FROM d;
