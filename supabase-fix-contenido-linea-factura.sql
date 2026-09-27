-- =====================================================
-- FIX: el precio por kg ignoraba el contenido de la LÍNEA de factura
-- =====================================================
-- 26/09/26. Correr ENTERO en el SQL Editor de Supabase.
--
-- Problema: la pantalla de carga de facturas tiene una columna "Contenido"
-- (factura_items.contenido_override) para decir cuánto trae cada unidad
-- facturada: bolsa de arroz de 5 kg → 5; el mismo arroz suelto por kg → 1.
-- El trigger la ignoraba y dividía SIEMPRE por insumos.cantidad_por_paquete.
--
-- Cuando un proveedor vende suelto (Blancaluna factura la yerba por kg), poner
-- Contenido = 1 no servía de nada y el precio quedaba dividido por el paquete:
--   Yerba            5 kg × $3.689,20 → guardado $737,84/kg  (real $3.689,20)
--   Queso crema 44% 12 lt × $6.650,99 → guardado $3.325,50/lt (real $6.650,99)
--
-- Qué hace este archivo:
--   1. actualizar_precio_desde_factura(): usa el contenido de la línea y, si
--      no viene, el del insumo (lo de siempre). Sólo corre al INSERTAR.
--   2. actualizar_precio_insumo_on_update(): conserva el divisor con el que se
--      guardó el precio, salvo que se cambie explícitamente el contenido.
--      Hay líneas viejas con contenido_override = 1 que en realidad se
--      dividieron por 5 (la pantalla lo ponía en 1 sola); leerlo ahora les
--      cambiaría el precio.
--   3. Corrige los DOS precios VIGENTES de arriba. Los precios anteriores
--      (no vigentes) quedan como están: ver memoria "datos históricos".
--
-- No cambia ningún otro precio ya cargado: los triggers sólo corren cuando se
-- inserta o modifica una línea.
--
-- La cuenta del frontend es precioPorUnidadBase() en src/lib/costos.ts.
-- Si se toca una, se toca la otra.
-- =====================================================

-- 1. Al insertar una línea ------------------------------------------------

CREATE OR REPLACE FUNCTION public.actualizar_precio_desde_factura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contenido DECIMAL(10,3);
  v_tipo_factura TEXT;
BEGIN
  -- 🍷 Si no hay insumo_id, es un VINO → no toca precios_insumo
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si es nota de crédito, no actualizar precio
  SELECT tipo INTO v_tipo_factura
  FROM facturas_proveedor
  WHERE id = NEW.factura_id;

  IF v_tipo_factura = 'nota_credito' THEN
    RETURN NEW;
  END IF;

  -- Contenido de la LÍNEA (bolsa de 5 kg → 5; suelto → 1); si no viene, el del insumo
  SELECT COALESCE(NULLIF(NEW.contenido_override, 0), cantidad_por_paquete, 1) INTO v_contenido
  FROM insumos WHERE id = NEW.insumo_id;

  -- Marcar precios anteriores como no actuales
  UPDATE precios_insumo
  SET es_precio_actual = false
  WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;

  -- Precio por unidad base, con el descuento aplicado
  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual, factura_item_id)
  SELECT NEW.insumo_id, fp.proveedor_id,
         NEW.precio_unitario * (1 - COALESCE(NEW.descuento, 0) / 100.0) / v_contenido,
         fp.fecha, true, NEW.id
  FROM facturas_proveedor fp
  WHERE fp.id = NEW.factura_id;

  RETURN NEW;
END;
$function$;

-- 2. Al modificar una línea -----------------------------------------------

CREATE OR REPLACE FUNCTION public.actualizar_precio_insumo_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contenido DECIMAL(10,3);
  v_precio_guardado DECIMAL(12,2);
  v_tipo_factura TEXT;
BEGIN
  IF NEW.insumo_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.precio_unitario IS NOT DISTINCT FROM OLD.precio_unitario
     AND NEW.descuento IS NOT DISTINCT FROM OLD.descuento
     AND NEW.contenido_override IS NOT DISTINCT FROM OLD.contenido_override THEN
    RETURN NEW;
  END IF;

  SELECT tipo INTO v_tipo_factura FROM facturas_proveedor WHERE id = NEW.factura_id;
  IF v_tipo_factura = 'nota_credito' THEN
    RETURN NEW;
  END IF;

  IF NEW.contenido_override IS DISTINCT FROM OLD.contenido_override THEN
    -- Cambio explícito del contenido: manda el nuevo
    SELECT COALESCE(NULLIF(NEW.contenido_override, 0), cantidad_por_paquete, 1) INTO v_contenido
    FROM insumos WHERE id = NEW.insumo_id;
  ELSE
    -- Mismo divisor con el que se guardó (neto viejo ÷ precio guardado)
    SELECT precio INTO v_precio_guardado FROM precios_insumo WHERE factura_item_id = NEW.id LIMIT 1;
    IF v_precio_guardado > 0 AND OLD.precio_unitario > 0 THEN
      v_contenido := ROUND(OLD.precio_unitario * (1 - COALESCE(OLD.descuento, 0) / 100.0) / v_precio_guardado, 3);
    ELSE
      SELECT COALESCE(NULLIF(NEW.contenido_override, 0), cantidad_por_paquete, 1) INTO v_contenido
      FROM insumos WHERE id = NEW.insumo_id;
    END IF;
  END IF;

  UPDATE precios_insumo
  SET precio = NEW.precio_unitario * (1 - COALESCE(NEW.descuento, 0) / 100.0) / v_contenido
  WHERE factura_item_id = NEW.id;

  PERFORM propagar_costo_insumo(NEW.insumo_id);

  RETURN NEW;
END;
$function$;

-- 3. Los dos precios vigentes mal guardados ------------------------------
-- Las dos líneas ya tienen contenido_override = 1: con esto, línea y precio
-- quedan diciendo lo mismo. El UPDATE dispara actualizar_costos_recetas_base
-- (recetas base y platos); propagar_costo_insumo cubre el resto.

UPDATE precios_insumo SET precio = 3689.20
WHERE id = '41df21b7-a135-42d3-a90d-f975cf1dc302'   -- Yerba, Blancaluna 09/09/26
  AND es_precio_actual AND precio = 737.84;

UPDATE precios_insumo SET precio = 6650.99
WHERE id = 'e1d65c6a-5c27-4a94-bd42-150bf38456a5'   -- Queso crema 44%, Blancaluna 22/09/26
  AND es_precio_actual AND precio = 3325.50;

SELECT propagar_costo_insumo('9804956e-c69b-414a-9ef5-c4af7081ec52');  -- Yerba
SELECT propagar_costo_insumo('2e58be67-cb4b-4fcf-897b-77bc6dde7082');  -- Queso crema 44%

-- Verificación: tienen que dar 3689.20 y 6650.99
SELECT i.nombre, p.precio
FROM precios_insumo p JOIN insumos i ON i.id = p.insumo_id
WHERE p.id IN ('41df21b7-a135-42d3-a90d-f975cf1dc302', 'e1d65c6a-5c27-4a94-bd42-150bf38456a5');
