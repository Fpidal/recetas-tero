-- =====================================================
-- CIERRE DE MES: comparar el mismo tramo de los dos meses
-- =====================================================
--
-- EL PROBLEMA: la tarjeta "Cifras del mes" del Dashboard compara el mes EN
-- CURSO contra el anterior. Hasta ahora tomaba los dos meses completos, o sea
-- agosto hasta el dia 16 contra julio entero: el mes en curso siempre salia
-- muy por debajo y marcaba caidas que no existen.
--
-- LA CORRECCION: un parametro opcional `p_hasta_dia` que corta LOS DOS
-- periodos el mismo dia. Agosto 1-16 contra julio 1-16.
--
-- Es DEFAULT NULL, asi que `cierre_mes('2026-07-01')` sigue devolviendo los
-- meses completos y la solapa Cierre de Mes no cambia — ahi se mira un mes
-- cerrado y corresponde el mes entero.
--
-- LEAST() cubre el caso de meses de distinto largo: si hoy es 31 y el mes
-- anterior tuvo 30 dias, corta en el ultimo dia que existe.
--
-- Hay que borrar primero la version de un solo parametro: si quedaran las dos,
-- una llamada con un argumento seria ambigua.
-- =====================================================

DROP FUNCTION IF EXISTS public.cierre_mes(date);

CREATE OR REPLACE FUNCTION public.cierre_mes(p_mes date, p_hasta_dia int DEFAULT NULL)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH
-- Rango del mes pedido y del anterior
rangos AS (
  -- p_hasta_dia corta LOS DOS periodos el mismo dia del mes.
  -- Sin eso, un mes en curso se compara contra un mes entero y siempre parece
  -- mas bajo: no es una caida, es que tiene menos dias. Con NULL (el default)
  -- toma los meses completos, que es lo que necesita el Cierre de Mes.
  SELECT
    ini_mes,
    CASE WHEN p_hasta_dia IS NULL THEN fin_mes
         ELSE LEAST(fin_mes, ini_mes + (p_hasta_dia - 1)) END   AS fin_mes,
    ini_prev,
    CASE WHEN p_hasta_dia IS NULL THEN fin_prev
         ELSE LEAST(fin_prev, ini_prev + (p_hasta_dia - 1)) END AS fin_prev
  FROM (
    SELECT
      date_trunc('month', p_mes)::date                                  AS ini_mes,
      (date_trunc('month', p_mes) + interval '1 month - 1 day')::date    AS fin_mes,
      (date_trunc('month', p_mes) - interval '1 month')::date            AS ini_prev,
      (date_trunc('month', p_mes) - interval '1 day')::date              AS fin_prev
  ) base
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

REVOKE ALL ON FUNCTION public.cierre_mes(date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cierre_mes(date, int) TO authenticated;


-- =====================================================
-- VERIFICACION
-- =====================================================

-- 1. Sin el parametro: meses completos, como antes
WITH d AS (SELECT public.cierre_mes('2026-07-01') AS j)
SELECT 'julio completo' AS caso,
       (j->'compras'->>'mes')::numeric    AS compras_mes,
       (j->'compras'->>'previo')::numeric AS compras_previo
FROM d;

-- 2. Con el parametro: los dos meses hasta el mismo dia.
--    compras_previo tiene que ser MENOR que en la consulta 1, porque ahora
--    junio se corta el dia 16 en vez de tomarse entero.
WITH d AS (SELECT public.cierre_mes('2026-07-01', 16) AS j)
SELECT 'julio hasta el 16' AS caso,
       (j->'compras'->>'mes')::numeric    AS compras_mes,
       (j->'compras'->>'previo')::numeric AS compras_previo
FROM d;
