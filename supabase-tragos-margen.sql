-- =====================================================
-- TRAGOS: agregar Margen Objetivo (como en Carta / Vinos)
-- =====================================================
-- Aditivo: agrega 1 columna con default. No toca datos existentes.
-- Permite definir el % de costo objetivo por trago y calcular
-- el precio sugerido (precio = costo / (margen / 100)).

ALTER TABLE public.tragos
  ADD COLUMN IF NOT EXISTS margen_objetivo DECIMAL(5,2) DEFAULT 25;
