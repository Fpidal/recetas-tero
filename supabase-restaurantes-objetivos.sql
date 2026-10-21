-- =====================================================
-- Restaurantes: los objetivos de costo, editables desde Configuración
-- =====================================================
-- 21/10/26. Correr en el SQL Editor de Supabase.
--
-- POR QUÉ. El objetivo con el que arranca un plato, trago o vino nuevo estaba
-- escrito a mano en unos 40 lugares del código, y no siempre igual (30 en
-- Carta, 25 en Tragos y Menús especiales, 30 en Vinos). En la carta activa
-- NINGÚN plato tiene 30: se usan 20 y 25. Y el semáforo de incidencia real
-- de Ventas y Análisis estaba fijo en 30 con 5 puntos de tolerancia.
--
-- QUÉ HACE. Cuatro objetivos por restaurante, con los valores que hoy más se
-- usan en Tero:
--   · Food cost de cocina (platos y menús nuevos) ........ 25
--   · Beverage cost de tragos (tragos nuevos) ............ 25 (los 23 están así)
--   · Costo de vinos (vinos nuevos en carta) ............. 40 (44 de 61)
--   · Incidencia real objetivo (semáforo) ................ 30, tolerancia 5
--
-- Cambiarlos NO toca los platos que ya tienen su objetivo: es el valor con
-- el que arranca uno nuevo, y el semáforo general.
--
-- No hace falta GRANT ni policy nuevos: son columnas de una tabla que ya los
-- tiene (sólo el admin modifica).
-- =====================================================

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS objetivo_fc_cocina    NUMERIC(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS objetivo_bc_tragos    NUMERIC(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS objetivo_costo_vinos  NUMERIC(5,2) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS objetivo_incidencia   NUMERIC(5,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tolerancia_incidencia NUMERIC(5,2) NOT NULL DEFAULT 5;

-- Verificación: una fila con 25 · 25 · 40 · 30 · 5
SELECT nombre_fantasia, objetivo_fc_cocina, objetivo_bc_tragos, objetivo_costo_vinos,
       objetivo_incidencia, tolerancia_incidencia
FROM public.restaurantes;
