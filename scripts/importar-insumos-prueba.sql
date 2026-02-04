-- Importar 2 insumos de prueba
-- Proveedor: Morres (Carnes)
-- Ejecutar en Supabase SQL Editor

DO $$
DECLARE
  v_proveedor_id UUID;
  v_insumo_id UUID;
  v_precio NUMERIC;
  v_iva NUMERIC;
  v_merma NUMERIC;
  v_costo_unitario NUMERIC;
  v_con_iva NUMERIC;
  v_final NUMERIC;
BEGIN
  -- Verificar que Morres existe
  SELECT id INTO v_proveedor_id FROM proveedores WHERE nombre = 'Morres' AND activo = true;

  IF v_proveedor_id IS NULL THEN
    RAISE EXCEPTION 'Proveedor Morres no encontrado';
  END IF;

  RAISE NOTICE 'Proveedor Morres encontrado: %', v_proveedor_id;

  -- 1. Carne Picada: $11.300/kg, IVA 10.5%, Merma 0%
  v_precio := 11300; v_iva := 10.5; v_merma := 0;
  v_costo_unitario := v_precio / 1;
  v_con_iva := v_costo_unitario * (1 + v_iva / 100);
  v_final := v_con_iva * (1 + v_merma / 100);

  INSERT INTO insumos (nombre, categoria, unidad_medida, cantidad_por_paquete, iva_porcentaje, merma_porcentaje, activo)
  VALUES ('Carne Picada', 'Carnes', 'kg', 1, v_iva, v_merma, true)
  RETURNING id INTO v_insumo_id;

  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual)
  VALUES (v_insumo_id, v_proveedor_id, v_costo_unitario, CURRENT_DATE, true);

  RAISE NOTICE 'Carne Picada: Precio $% | +IVA $% | Final $%', v_precio, ROUND(v_con_iva), ROUND(v_final);

  -- 2. Molleja: $20.500/kg, IVA 10.5%, Merma 20%
  v_precio := 20500; v_iva := 10.5; v_merma := 20;
  v_costo_unitario := v_precio / 1;
  v_con_iva := v_costo_unitario * (1 + v_iva / 100);
  v_final := v_con_iva * (1 + v_merma / 100);

  INSERT INTO insumos (nombre, categoria, unidad_medida, cantidad_por_paquete, iva_porcentaje, merma_porcentaje, activo)
  VALUES ('Molleja', 'Carnes', 'kg', 1, v_iva, v_merma, true)
  RETURNING id INTO v_insumo_id;

  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual)
  VALUES (v_insumo_id, v_proveedor_id, v_costo_unitario, CURRENT_DATE, true);

  RAISE NOTICE 'Molleja: Precio $% | +IVA $% | Final $%', v_precio, ROUND(v_con_iva), ROUND(v_final);

  RAISE NOTICE '--- Importación completada: 2 insumos ---';
END $$;
