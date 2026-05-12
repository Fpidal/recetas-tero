-- =====================================================
-- Agregar campo control_menus a insumos
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Agregar columna
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS control_menus BOOLEAN DEFAULT false;

-- Marcar los insumos que aparecían en la hoja de control de menús
UPDATE insumos SET control_menus = true WHERE nombre IN (
  -- CARNES
  'Bife De Chorizo',
  'Bola de lomo',
  'Carre de Cerdo',
  'Pollo Pata Muslo',
  'Roast Beef',
  'Suprema',
  -- PESCADOS Y MARISCOS
  'Langostino Cola No.2',
  'Mejillon Pelado',
  'Tubo De Calamar',
  -- VERDURAS Y FRUTAS
  'Albhaca',
  'Batata',
  'Berenjena',
  'Calabaza',
  'Cebolla de Verdeo',
  'Cebollon',
  'Lechuga',
  'Limon',
  'Morron Rojo',
  'Morron Verde',
  'Papa',
  'Puerro',
  'Tomate',
  'Zanahoria',
  'Zucchini',
  -- LÁCTEOS Y FIAMBRES
  'Crema De Leche',
  'Jamon Cocido',
  'Manteca',
  'Muzzarella Cilindro',
  'Muzzarella Cuadrada',
  'Panceta',
  'Queso Azul',
  'Queso parmesano',
  -- ALMACÉN
  'Arroz Carnaroli',
  'Arroz Gallo',
  'Arvejas congelada bolsa',
  'Atun en aceite',
  'Fideos Cintas (caseritos)',
  'Fideos penne rigatte',
  'Harina 0000',
  'Huevo',
  'Leche Entera',
  'Tomate Triturado'
);

-- Verificar cuántos se marcaron
SELECT COUNT(*) as marcados FROM insumos WHERE control_menus = true;
