-- Crear 2 platos de prueba con ingredientes
-- Ejecutar en Supabase SQL Editor

DO $$
DECLARE
  v_plato_id UUID;
  v_insumo_id UUID;
  v_precio NUMERIC;
  v_iva NUMERIC;
  v_merma NUMERIC;
  v_costo_final NUMERIC;
  v_costo_linea NUMERIC;
  v_costo_total NUMERIC;
  v_missing TEXT := '';
BEGIN

  -- ============================================
  -- VALIDAR QUE TODOS LOS INSUMOS EXISTAN
  -- ============================================
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Bife De Chorizo' AND activo = true) THEN
    v_missing := v_missing || 'Bife De Chorizo, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Papa' AND activo = true) THEN
    v_missing := v_missing || 'Papa, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Salsa de Pimienta' AND activo = true) THEN
    v_missing := v_missing || 'Salsa de Pimienta, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Espinaca A La Crema' AND activo = true) THEN
    v_missing := v_missing || 'Espinaca A La Crema, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Punta de Asado' AND activo = true) THEN
    v_missing := v_missing || 'Punta de Asado, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Leche Entera' AND activo = true) THEN
    v_missing := v_missing || 'Leche Entera, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Fondo oscuro' AND activo = true) THEN
    v_missing := v_missing || 'Fondo oscuro, ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'INSUMOS FALTANTES: %', LEFT(v_missing, LENGTH(v_missing) - 2);
  END IF;

  RAISE NOTICE 'Todos los insumos encontrados OK';

  -- ============================================
  -- PLATO 1: Bife de Chorizo a la Pimienta
  -- ============================================
  INSERT INTO platos (nombre, seccion, descripcion, paso_a_paso, rendimiento_porciones, version_receta, costo_total, activo)
  VALUES ('Bife de Chorizo a la Pimienta', 'Principales', NULL, NULL, 1, '1.0', 0, true)
  RETURNING id INTO v_plato_id;

  v_costo_total := 0;

  -- Ingrediente 1.1: Bife De Chorizo - 0.35 kg
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Bife De Chorizo' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.35 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.35, v_costo_linea);

  RAISE NOTICE 'P1 - Bife De Chorizo: 0.35 kg x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 1.2: Papa - 0.30 kg
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Papa' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.30 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.30, v_costo_linea);

  RAISE NOTICE 'P1 - Papa: 0.30 kg x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 1.3: Salsa de Pimienta - 1.00 porcion
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Salsa de Pimienta' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 1.00 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 1.00, v_costo_linea);

  RAISE NOTICE 'P1 - Salsa de Pimienta: 1.00 porc x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 1.4: Espinaca A La Crema - 0.50 kg
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Espinaca A La Crema' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.50 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.50, v_costo_linea);

  RAISE NOTICE 'P1 - Espinaca A La Crema: 0.50 kg x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Actualizar costo total del plato 1
  UPDATE platos SET costo_total = v_costo_total WHERE id = v_plato_id;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'PLATO 1: Bife de Chorizo a la Pimienta';
  RAISE NOTICE 'COSTO TOTAL: $%', ROUND(v_costo_total);
  RAISE NOTICE '========================================';

  -- ============================================
  -- PLATO 2: Costillar al Horno en su Jugo
  -- ============================================
  INSERT INTO platos (nombre, seccion, descripcion, paso_a_paso, rendimiento_porciones, version_receta, costo_total, activo)
  VALUES ('Costillar al Horno en su Jugo', 'Principales', NULL, NULL, 1, '1.0', 0, true)
  RETURNING id INTO v_plato_id;

  v_costo_total := 0;

  -- Ingrediente 2.1: Punta de Asado - 0.75 kg
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Punta de Asado' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.75 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.75, v_costo_linea);

  RAISE NOTICE 'P2 - Punta de Asado: 0.75 kg x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 2.2: Papa - 0.20 kg
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Papa' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.20 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.20, v_costo_linea);

  RAISE NOTICE 'P2 - Papa: 0.20 kg x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 2.3: Leche Entera - 0.09 lt
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Leche Entera' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.09 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.09, v_costo_linea);

  RAISE NOTICE 'P2 - Leche Entera: 0.09 lt x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 2.4: Fondo oscuro - 1.00 porcion
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Fondo oscuro' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 1.00 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 1.00, v_costo_linea);

  RAISE NOTICE 'P2 - Fondo oscuro: 1.00 porc x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Ingrediente 2.5: Espinaca A La Crema - 0.35 kg
  SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
  INTO v_insumo_id, v_precio, v_iva, v_merma
  FROM insumos i
  LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
  WHERE i.nombre = 'Espinaca A La Crema' AND i.activo = true
  LIMIT 1;

  v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
  v_costo_linea := 0.35 * v_costo_final;
  v_costo_total := v_costo_total + v_costo_linea;

  INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
  VALUES (v_plato_id, v_insumo_id, NULL, 0.35, v_costo_linea);

  RAISE NOTICE 'P2 - Espinaca A La Crema: 0.35 kg x $% = $%', ROUND(v_costo_final), ROUND(v_costo_linea);

  -- Actualizar costo total del plato 2
  UPDATE platos SET costo_total = v_costo_total WHERE id = v_plato_id;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'PLATO 2: Costillar al Horno en su Jugo';
  RAISE NOTICE 'COSTO TOTAL: $%', ROUND(v_costo_total);
  RAISE NOTICE '========================================';

  RAISE NOTICE '';
  RAISE NOTICE '2 platos creados correctamente';

END $$;
