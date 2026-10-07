-- =====================================================
-- FIX: una factura vieja cargada tarde pisaba el precio vigente
-- =====================================================
-- 07/10/26. Correr ENTERO en el SQL Editor de Supabase.
--
-- Problema: actualizar_precio_desde_factura() marcaba como vigente la ÚLTIMA
-- LÍNEA CARGADA, sin mirar la fecha de la factura. Una factura atrasada se
-- convertía en el precio actual aunque hubiera otra más nueva.
--
-- Caso real, Fiambre c. paleta de cerdo (INS-059):
--   30/09  Blancaluna  $9.382,97   cargada el 30/09
--   10/09  Los calvos  $11.661,33  cargada el 05/10  ← quedó como vigente
-- Insumos mostraba +82% (contra El Nahuel del 20/08, $6.401,82) cuando lo
-- último que se compró fue más barato: −19,5% contra Los calvos.
--
-- Qué hace este archivo:
--   1. actualizar_precio_desde_factura(): la línea nueva queda vigente sólo si
--      su factura es de la misma fecha o posterior a la del vigente. Si es más
--      vieja, entra al historial con es_precio_actual = false y no toca nada.
--      A igual fecha gana la que se carga después, como hasta ahora.
--      El resto (vinos, notas de crédito, contenido de la línea, descuento)
--      queda idéntico a supabase-fix-contenido-linea-factura.sql.
--   2. Corrige el VIGENTE de INS-059, el único insumo donde el desfase cambió
--      el precio (medido el 07/10/26). Los precios no vigentes quedan como
--      están: ver memoria "datos históricos".
--
-- INS-059 no está en ninguna receta ni plato activo, así que el cambio de
-- vigente no mueve ningún costo.
-- =====================================================

-- 1. Al insertar una línea ------------------------------------------------

CREATE OR REPLACE FUNCTION public.actualizar_precio_desde_factura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contenido DECIMAL(10,3);
  v_tipo_factura TEXT;
  v_fecha_factura DATE;
  v_fecha_vigente DATE;
  v_es_mas_nueva BOOLEAN;
BEGIN
  -- 🍷 Si no hay insumo_id, es un VINO → no toca precios_insumo
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si es nota de crédito, no actualizar precio
  SELECT tipo, fecha INTO v_tipo_factura, v_fecha_factura
  FROM facturas_proveedor
  WHERE id = NEW.factura_id;

  IF v_tipo_factura = 'nota_credito' THEN
    RETURN NEW;
  END IF;

  -- Contenido de la LÍNEA (bolsa de 5 kg → 5; suelto → 1); si no viene, el del insumo
  SELECT COALESCE(NULLIF(NEW.contenido_override, 0), cantidad_por_paquete, 1) INTO v_contenido
  FROM insumos WHERE id = NEW.insumo_id;

  -- ¿Esta factura es igual o más nueva que el precio vigente? Sin vigente, sí.
  SELECT fecha INTO v_fecha_vigente
  FROM precios_insumo
  WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;

  v_es_mas_nueva := v_fecha_vigente IS NULL OR v_fecha_factura >= v_fecha_vigente;

  -- Sólo si pasa a ser el vigente se desmarca el anterior
  IF v_es_mas_nueva THEN
    UPDATE precios_insumo
    SET es_precio_actual = false
    WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;
  END IF;

  -- Precio por unidad base, con el descuento aplicado
  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual, factura_item_id)
  SELECT NEW.insumo_id, fp.proveedor_id,
         NEW.precio_unitario * (1 - COALESCE(NEW.descuento, 0) / 100.0) / v_contenido,
         fp.fecha, v_es_mas_nueva, NEW.id
  FROM facturas_proveedor fp
  WHERE fp.id = NEW.factura_id;

  RETURN NEW;
END;
$function$;

-- 2. Vigente de INS-059: Blancaluna 30/09 en lugar de Los calvos 10/09 -----
-- Primero se desmarca y después se marca: el índice único de vigente no
-- admite dos a la vez.

UPDATE precios_insumo
SET es_precio_actual = false
WHERE insumo_id = (SELECT id FROM insumos WHERE codigo = 'INS-059')
  AND es_precio_actual = true;

UPDATE precios_insumo
SET es_precio_actual = true
WHERE id = (
  SELECT id FROM precios_insumo
  WHERE insumo_id = (SELECT id FROM insumos WHERE codigo = 'INS-059')
  ORDER BY fecha DESC, created_at DESC
  LIMIT 1
);

-- Verificación: tiene que devolver Blancaluna, 2026-09-30, 9382.97
SELECT pi.fecha, pi.precio, p.nombre
FROM precios_insumo pi
LEFT JOIN proveedores p ON p.id = pi.proveedor_id
WHERE pi.insumo_id = (SELECT id FROM insumos WHERE codigo = 'INS-059')
  AND pi.es_precio_actual;
