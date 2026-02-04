-- Importar 44 recetas desde CSV
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
  v_plato_count INT := 0;
  v_ing_count INT := 0;
  v_missing_count INT := 0;
  v_missing TEXT := '';
  rec RECORD;
  plato RECORD;
BEGIN

  -- Tabla temporal con datos del CSV
  CREATE TEMP TABLE tmp_recetas (
    nombre_plato TEXT,
    ingrediente TEXT,
    cantidad NUMERIC
  );

  INSERT INTO tmp_recetas (nombre_plato, ingrediente, cantidad) VALUES
  ('Langostinos Apanados','Langostino Cola  No.1',0.11),
  ('Langostinos Apanados','Pan Rallado',0.10),
  ('Langostinos Apanados','Huevo',2.00),
  ('Langostinos Apanados','Salsa Tartara',0.50),
  ('Tortilla Española','Papa',0.40),
  ('Tortilla Española','Cebollon',0.55),
  ('Tortilla Española','Huevo',4.00),
  ('ENSALADA CAESAR DE POLLO','Lechuga',0.10),
  ('ENSALADA CAESAR DE POLLO','Suprema',0.14),
  ('ENSALADA CAESAR DE POLLO','Aderezo Caesar',0.07),
  ('Menu 3 pasos','Bife De Chorizo',0.35),
  ('Menu 3 pasos','Panceta',0.05),
  ('Menu 3 pasos','Calabaza',0.18),
  ('Menu 3 pasos','Cebolla Caramelizada',1.00),
  ('Menu 3 pasos','Jugo',1.00),
  ('Menu 3 pasos','Agua',1.00),
  ('Menu 3 pasos','Café',0.02),
  ('Menu 3 pasos','Langostino Cola  No.1',0.07),
  ('Menu 3 pasos','Pan Rallado',0.05),
  ('Menu 3 pasos','Aceite De Oliva',0.02),
  ('Petit Camambert','Camambert',1.00),
  ('Petit Camambert','Jamon Crudo',0.06),
  ('Petit Camambert','Rucula',0.14),
  ('Petit Camambert','Morron Rojo',0.07),
  ('Burratina con Salmorejo','Burratina',1.00),
  ('Burratina con Salmorejo','Jamon Crudo',0.03),
  ('Burratina con Salmorejo','Rucula',0.14),
  ('Burratina con Salmorejo','Tomate',0.05),
  ('Picada de Fiambres','Jamon Crudo',0.06),
  ('Picada de Fiambres','Mortadela',0.04),
  ('Picada de Fiambres','Queso Azul',0.03),
  ('Picada de Fiambres','Jamon Cocido',0.03),
  ('Sugerencia de Pesacado Blanco','Abadejo',0.30),
  ('Sugerencia de Pesacado Blanco','Espinaca A La Crema',0.20),
  ('Sugerencia de Pesacado Blanco','Jamon Crudo',0.02),
  ('Sugerencia de Pesacado Blanco','Aceite De Oliva',0.02),
  ('Sugerencia de Pesacado Blanco','Crema De Leche',0.05),
  ('Sugerencia de Pesacado Blanco','Manteca',0.01),
  ('Mejillones Provenzal','Mejillones Frescos',0.62),
  ('Mejillones Provenzal','Vino',0.03),
  ('Mejillones Provenzal','Aceite De Oliva',0.02),
  ('Rabas al Romana','Tubo De Calamar',0.25),
  ('Rabas al Romana','Salsa Tartara',1.00),
  ('Rabas al Romana','Harina 0000',0.12),
  ('Milanesa de Centro de Ojo','Ojo de Bife',0.20),
  ('Milanesa de Centro de Ojo','Papa',0.25),
  ('Milanesa de Centro de Ojo','Salsa de Pimienta',0.12),
  ('Milanesa de Centro de Ojo','Espinaca A La Crema',0.15),
  ('STRACOTTO AL MALBEC','Roast Beef',0.28),
  ('STRACOTTO AL MALBEC','Papa',0.25),
  ('STRACOTTO AL MALBEC','Fondo oscuro',1.00),
  ('STRACOTTO AL MALBEC','Espinaca A La Crema',0.50),
  ('Molleja al Verdeo','Molleja',0.18),
  ('Molleja al Verdeo','Papa',0.25),
  ('Molleja al Verdeo','Salsa Verdeo',0.15),
  ('Minis de Brie y masa filo (6u)','Camambert',0.09),
  ('Minis de Brie y masa filo (6u)','Masa Filo',0.09),
  ('Minis de Brie y masa filo (6u)','Mermelada de Morron',0.05),
  ('Plato de Jamon crudo','Jamon Crudo',0.12),
  ('Plato de Jamon crudo','Tomate Triturado',0.15),
  ('Plato de Jamon crudo','Mermelada de Morron',0.05),
  ('Lomo a la pimienta','Lomo',0.28),
  ('Lomo a la pimienta','Papa',0.30),
  ('Lomo a la pimienta','Salsa de Pimienta',0.50),
  ('Salmon Marroqui','Salmon Filet',0.23),
  ('Salmon Marroqui','Papa',0.30),
  ('Salmon Marroqui','Salsa Tartara',1.00),
  ('Paella para 2','Langostino Cola  No.1',0.14),
  ('Paella para 2','Mejillon Pelado',0.12),
  ('Paella para 2','Tubo De Calamar',0.17),
  ('Paella para 2','Morron Rojo',0.06),
  ('Paella para 2','Morron Verde',0.06),
  ('Paella para 2','Cebollon',0.12),
  ('Paella para 2','Limon',0.10),
  ('Paella para 2','Arvejas',0.03),
  ('Paella para 2','Arroz Carnaroli',0.10),
  ('Paella para 2','Aceite De Oliva',0.08),
  ('Paella para 2','Pollo Pata Muslo',0.40),
  ('Risotto fruto de mar','Vieira Media Valva',0.06),
  ('Risotto fruto de mar','Langostino Cola  No.1',0.07),
  ('Risotto fruto de mar','Mejillon Pelado',0.06),
  ('Risotto fruto de mar','Tubo De Calamar',0.07),
  ('Risotto fruto de mar','Morron Rojo',0.03),
  ('Risotto fruto de mar','Morron Verde',0.03),
  ('Risotto fruto de mar','Cebollon',0.03),
  ('Risotto fruto de mar','Limon',0.10),
  ('Risotto fruto de mar','Arvejas',0.03),
  ('Risotto fruto de mar','Arroz Carnaroli',0.08),
  ('Risotto fruto de mar','Manteca',0.02),
  ('Bastones de Mozzarella','Muzzarella',0.10),
  ('Bastones de Mozzarella','Huevo',1.00),
  ('Bastones de Mozzarella','Pan Rallado',0.04),
  ('Bastones de Mozzarella','Pomodoro',0.04),
  ('Gambas al ajillo 7u','Langostino Cola  No.1',0.11),
  ('Gambas al ajillo 7u','Aceite De Oliva',0.10),
  ('Suprema al puerro','Suprema',0.33),
  ('Suprema al puerro','Crema De Leche',0.15),
  ('Suprema al puerro','Puerro',0.03),
  ('Suprema al puerro','Espinaca',0.15),
  ('Suprema al puerro','Calabaza',0.30),
  ('Bife de chorizo a caballo','Bife De Chorizo',0.38),
  ('Bife de chorizo a caballo','Huevo',2.00),
  ('Bife de chorizo a caballo','Papa',0.40),
  ('Bife de chorizo a caballo','Cebollon',0.08),
  ('Revuelto gramajo','Jamon Cocido',0.06),
  ('Revuelto gramajo','Huevo',5.00),
  ('Revuelto gramajo','Papa',0.30),
  ('Revuelto gramajo','Arvejas',0.04),
  ('Mila p/ 2','Nalga Feteada',0.35),
  ('Mila p/ 2','Huevo',2.00),
  ('Mila p/ 2','Pan Rallado',0.07),
  ('Mila p/ 2','Limon',0.10),
  ('Mila p/ 2','Pure De Papa',2.00),
  ('Suprema p/ 2','Suprema',0.35),
  ('Suprema p/ 2','Huevo',2.00),
  ('Suprema p/ 2','Pan Rallado',0.07),
  ('Suprema p/ 2','Limon',0.10),
  ('Suprema p/ 2','Pure De Papa',2.00),
  ('Mila napo p/2','Nalga Feteada',0.35),
  ('Mila napo p/2','Huevo',2.00),
  ('Mila napo p/2','Pan Rallado',0.07),
  ('Mila napo p/2','Limon',0.10),
  ('Mila napo p/2','Pure De Papa',2.00),
  ('Mila napo p/2','Jamon Cocido',0.04),
  ('Mila napo p/2','Muzzarella',0.15),
  ('Mila napo p/2','Tomate',0.07),
  ('Mila napo p/2','Pomodoro',0.07),
  ('Risotto al fungi','Arroz Carnaroli',0.08),
  ('Risotto al fungi','Morron Rojo',0.08),
  ('Risotto al fungi','Cebollon',0.08),
  ('Risotto al fungi','Portobello',0.08),
  ('Risotto al fungi','Champiñon',0.08),
  ('Risotto al fungi','Hongo De Pino',0.08),
  ('Risotto al fungi','Manteca',0.03),
  ('Pollo al ajillo','Pollo Pata Muslo',0.40),
  ('Pollo al ajillo','Aceite De Oliva',0.05),
  ('Pollo al ajillo','Ajo',0.02),
  ('Pollo al ajillo','Harina 0000',0.02),
  ('Pollo al ajillo','Vino',0.03),
  ('Lomo al champignon','Lomo',0.25),
  ('Lomo al champignon','Champiñon',0.10),
  ('Lomo al champignon','Cebollon',0.03),
  ('Lomo al champignon','Crema De Leche',0.10),
  ('Lomo al champignon','Pure De Papa',1.00),
  ('Brochette de langotinos','Morron Rojo',0.04),
  ('Brochette de langotinos','Morron Verde',0.04),
  ('Brochette de langotinos','Cebollon',0.04),
  ('Brochette de langotinos','Linguini',0.20),
  ('Brochette de langotinos','Salsa de Soja',0.08),
  ('Pechuga rellena','Suprema',0.30),
  ('Pechuga rellena','Espinaca',0.10),
  ('Pechuga rellena','Champiñon',0.06),
  ('Pechuga rellena','Puerro',0.04),
  ('Pechuga rellena','Crema De Leche',0.10),
  ('Spaguhetti fruto de mar','Linguini',0.20),
  ('Spaguhetti fruto de mar','Langostino Cola  No.1',0.07),
  ('Spaguhetti fruto de mar','Tubo De Calamar',0.07),
  ('Spaguhetti fruto de mar','Vieira Media Valva',0.06),
  ('Spaguhetti fruto de mar','Mejillon Pelado',0.06),
  ('Spaguhetti fruto de mar','Cebollon',0.06),
  ('Spaguhetti fruto de mar','Morron Rojo',0.03),
  ('Spaguhetti fruto de mar','Morron Verde',0.03),
  ('Spaguhetti fruto de mar','Pomodoro',0.10),
  ('Merluza al roque','Suprema',0.30),
  ('Merluza al roque','Crema De Leche',0.07),
  ('Merluza al roque','Queso Azul',0.10),
  ('Merluza al roque','Espinaca A La Crema',1.00),
  ('Merluza a la milanesa','Merluzon',0.25),
  ('Merluza a la milanesa','Pan Rallado',0.05),
  ('Merluza a la milanesa','Huevo',1.00),
  ('Merluza a la milanesa','Pure De Papa',1.00),
  ('Bondiola Braseada','Bondiola',0.25),
  ('Bondiola Braseada','Mostaza',0.05),
  ('Bondiola Braseada','Espinaca',0.15),
  ('Bondiola Braseada','Pure De Papa',1.00),
  ('Trucha a la navarra','Trucha',0.25),
  ('Trucha a la navarra','Salsa Verdeo',0.05),
  ('Trucha a la navarra','Espinaca',0.10),
  ('Trucha a la navarra','Pure De Papa',0.35),
  ('Vieyras Gratinadas','Vieira Media Valva',0.15),
  ('Vieyras Gratinadas','Salsa Verdeo',0.03),
  ('Arroz Meloso Langostino','Langostino Cola  No.1',0.13),
  ('Arroz Meloso Langostino','Arroz Calasparra',0.10),
  ('Arroz Meloso Langostino','Cebolla de Verdeo',0.10),
  ('Arroz Meloso Langostino','Mejillones Frescos',0.15),
  ('Hamburguesa Completa','Carne Picada',0.15),
  ('Hamburguesa Completa','Pan Hamburguesa',1.00),
  ('Hamburguesa Completa','Huevo',1.00),
  ('Hamburguesa Completa','Jamon Cocido',0.02),
  ('Hamburguesa Completa','Queso La Paulina',0.02),
  ('Hamburguesa Completa','Papa',0.25),
  ('Lomito Completa','Corazon de Cuadril',0.15),
  ('Lomito Completa','Pan Lomito',1.00),
  ('Lomito Completa','Huevo',1.00),
  ('Lomito Completa','Jamon Cocido',0.02),
  ('Lomito Completa','Queso La Paulina',0.02),
  ('Lomito Completa','Papa',0.25),
  ('Pestaña de Ojo de Bife a caballo','Ojo de Bife 2',0.30),
  ('Pestaña de Ojo de Bife a caballo','Espinaca A La Crema',0.80),
  ('Ravilones de mariscos nero di sepia','Mejillon Pelado',0.08),
  ('Ravilones de mariscos nero di sepia','Jamon Crudo',0.02),
  ('Ravilones de mariscos nero di sepia','Cebollon',0.015),
  ('Ravilones de mariscos nero di sepia','Morron Rojo',0.06),
  ('Plato Jamon crudo Español','Jamon Crudo español',0.10);

  -- ============================================
  -- PROCESAR CADA PLATO
  -- ============================================
  FOR plato IN (SELECT DISTINCT nombre_plato FROM tmp_recetas ORDER BY nombre_plato) LOOP

    INSERT INTO platos (nombre, seccion, descripcion, paso_a_paso, rendimiento_porciones, version_receta, costo_total, activo)
    VALUES (plato.nombre_plato, 'Principales', NULL, NULL, 1, '1.0', 0, true)
    RETURNING id INTO v_plato_id;

    v_plato_count := v_plato_count + 1;
    v_costo_total := 0;

    -- Procesar ingredientes del plato
    FOR rec IN (SELECT * FROM tmp_recetas WHERE nombre_plato = plato.nombre_plato) LOOP

      -- Buscar insumo por nombre (case insensitive)
      SELECT i.id, COALESCE(p.precio, 0), i.iva_porcentaje, i.merma_porcentaje
      INTO v_insumo_id, v_precio, v_iva, v_merma
      FROM insumos i
      LEFT JOIN precios_insumo p ON p.insumo_id = i.id AND p.es_precio_actual = true
      WHERE lower(i.nombre) = lower(rec.ingrediente) AND i.activo = true
      LIMIT 1;

      IF v_insumo_id IS NULL THEN
        v_missing := v_missing || rec.ingrediente || ' (' || plato.nombre_plato || '), ';
        v_missing_count := v_missing_count + 1;
        CONTINUE;
      END IF;

      v_costo_final := v_precio * (1 + v_iva / 100) * (1 + v_merma / 100);
      v_costo_linea := rec.cantidad * v_costo_final;
      v_costo_total := v_costo_total + v_costo_linea;

      INSERT INTO plato_ingredientes (plato_id, insumo_id, receta_base_id, cantidad, costo_linea)
      VALUES (v_plato_id, v_insumo_id, NULL, rec.cantidad, v_costo_linea);

      v_ing_count := v_ing_count + 1;

    END LOOP;

    -- Actualizar costo total del plato
    UPDATE platos SET costo_total = v_costo_total WHERE id = v_plato_id;

    RAISE NOTICE '% — $%', plato.nombre_plato, ROUND(v_costo_total);

  END LOOP;

  DROP TABLE tmp_recetas;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESUMEN';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Platos creados: %', v_plato_count;
  RAISE NOTICE 'Ingredientes vinculados: %', v_ing_count;
  RAISE NOTICE 'Ingredientes faltantes: %', v_missing_count;

  IF v_missing <> '' THEN
    RAISE NOTICE 'FALTANTES: %', v_missing;
  END IF;

END $$;
