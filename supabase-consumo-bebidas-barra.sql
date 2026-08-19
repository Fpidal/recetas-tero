-- =====================================================
-- CONSUMO: las bebidas cuentan como Barra, no como Cocina
-- =====================================================
--
-- EL PROBLEMA: el reparto Cocina/Barra se decidia solo por el tipo del item:
--
--     costo_barra  = tipo IN ('trago','vino')
--     costo_cocina = TODO LO DEMAS
--
-- Como el agua, la gaseosa, la cerveza y el cafe no son ni trago ni vino,
-- caian en Cocina. En el servicio del 08/08/26 eso puso $35.426 de agua y
-- cerveza dentro del costo de cocina, sobre $434.275 — un 8% del numero.
--
-- La division existe para poder mirar la bebida por un lado y la comida por
-- otro, que tienen margenes y rotacion distintos. Con las bebidas del lado de
-- la comida, no sirve para eso.
--
-- LA REGLA NUEVA: es Barra si es cualquiera de estas tres cosas.
--
--     1. tipo 'trago' o 'vino'                      (como antes)
--     2. una receta cuyo plato es de seccion Bebidas
--     3. un insumo suelto de categoria Bebidas
--
-- La 3 cubre lo historico: hasta hoy las aguas y la cerveza se cargaban como
-- insumo suelto. La 2 cubre lo que viene, ahora que existe la seccion Bebidas
-- y las gaseosas se cargan como receta.
--
-- QUE NO CAMBIA: ningun costo. `consumo_items.subtotal` es
-- GENERATED ALWAYS AS (cantidad * costo_unitario), y el costo_unitario quedo
-- congelado el dia de la carga. Este trigger solo SUMA esos subtotales en tres
-- columnas. Despues del recalculo, `costo_total` de cada servicio queda
-- identico al centavo: lo unico que se mueve es como se reparte entre las
-- otras dos.
--
-- OJO — ESTA LOGICA VIVE EN DOS LUGARES, Y SOLO DOS:
--
--     Base      -> esta funcion, actualizar_costos_consumo()
--     Frontend  -> areaDeItem() en src/types/analisis.ts
--
-- Si se toca una, se toca la otra. Es la misma convencion que la formula del
-- costo final (ver CLAUDE.md).
--
-- POR QUE EL COALESCE(..., false): si un plato tiene `seccion` en NULL, la
-- comparacion `p.seccion = 'Bebidas'` no da falso, da NULL. Y NOT NULL tambien
-- es NULL, asi que esa fila no entraria NI en cocina NI en barra: el servicio
-- quedaria con cocina + barra <> total, sin ningun error. El COALESCE fuerza
-- que lo desconocido cuente como cocina, que es el default correcto.
-- =====================================================

CREATE OR REPLACE FUNCTION actualizar_costos_consumo()
RETURNS TRIGGER AS $$
DECLARE
  consumo_id_target UUID;
BEGIN
  consumo_id_target := COALESCE(NEW.consumo_id, OLD.consumo_id);

  UPDATE consumo_diario
  SET
    costo_barra = COALESCE((
      SELECT SUM(ci.subtotal)
      FROM consumo_items ci
      LEFT JOIN platos  p ON p.id = ci.plato_id
      LEFT JOIN insumos i ON i.id = ci.insumo_id
      WHERE ci.consumo_id = consumo_id_target
        AND COALESCE(
            ci.tipo IN ('trago', 'vino')
            OR (ci.tipo = 'receta' AND p.seccion = 'Bebidas')
            OR (ci.tipo = 'insumo' AND i.categoria::text = 'Bebidas')
          , false)
    ), 0),
    costo_cocina = COALESCE((
      SELECT SUM(ci.subtotal)
      FROM consumo_items ci
      LEFT JOIN platos  p ON p.id = ci.plato_id
      LEFT JOIN insumos i ON i.id = ci.insumo_id
      WHERE ci.consumo_id = consumo_id_target
        AND NOT COALESCE(
            ci.tipo IN ('trago', 'vino')
            OR (ci.tipo = 'receta' AND p.seccion = 'Bebidas')
            OR (ci.tipo = 'insumo' AND i.categoria::text = 'Bebidas')
          , false)
    ), 0),
    costo_total = COALESCE((
      SELECT SUM(subtotal) FROM consumo_items
      WHERE consumo_id = consumo_id_target
    ), 0)
  WHERE id = consumo_id_target;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- PASO 1: MIRAR ANTES DE TOCAR
-- =====================================================
-- Que servicios cambian y cuanto se mueve. No modifica nada.

WITH nuevo AS (
  SELECT
    cd.id,
    cd.fecha,
    cd.servicio,
    cd.costo_cocina AS cocina_hoy,
    cd.costo_barra  AS barra_hoy,
    COALESCE(SUM(ci.subtotal) FILTER (WHERE COALESCE(
      ci.tipo IN ('trago','vino')
      OR (ci.tipo = 'receta' AND p.seccion = 'Bebidas')
      OR (ci.tipo = 'insumo' AND i.categoria::text = 'Bebidas')
    , false)), 0) AS barra_nueva
  FROM consumo_diario cd
  LEFT JOIN consumo_items ci ON ci.consumo_id = cd.id
  LEFT JOIN platos  p ON p.id = ci.plato_id
  LEFT JOIN insumos i ON i.id = ci.insumo_id
  GROUP BY cd.id, cd.fecha, cd.servicio, cd.costo_cocina, cd.costo_barra
)
SELECT
  fecha, servicio,
  cocina_hoy, barra_hoy,
  (cocina_hoy + barra_hoy - barra_nueva) AS cocina_nueva,
  barra_nueva,
  ROUND(barra_nueva - barra_hoy, 2) AS se_mueve
FROM nuevo
WHERE ROUND(barra_nueva - barra_hoy, 2) <> 0
ORDER BY fecha DESC, servicio;


-- =====================================================
-- PASO 2: RECALCULAR TODO
-- =====================================================
-- Recien despues de mirar el paso 1. Descomentar para correr.
--
-- Dispara el trigger fila por fila haciendo un UPDATE que no cambia nada:
-- es la forma de recalcular sin duplicar la logica de la funcion aca.
--
-- UPDATE consumo_items SET cantidad = cantidad;


-- =====================================================
-- PASO 3: VERIFICAR
-- =====================================================
-- Lo importante: cuantos servicios quedaron descuadrados. Tiene que dar 0.
-- Si costo_cocina + costo_barra no da costo_total, algo quedo mal repartido.
--
-- SELECT
--   COUNT(*) AS servicios,
--   COUNT(*) FILTER (WHERE ROUND(costo_cocina + costo_barra, 2) = ROUND(costo_total, 2)) AS cuadran,
--   COUNT(*) FILTER (WHERE ROUND(costo_cocina + costo_barra, 2) <> ROUND(costo_total, 2)) AS descuadrados
-- FROM consumo_diario;
