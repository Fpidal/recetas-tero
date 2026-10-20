-- =====================================================
-- Restaurantes: elegir dónde va el logo
-- =====================================================
-- 20/10/26. Correr en el SQL Editor de Supabase, DESPUÉS de
-- supabase-restaurantes.sql.
--
-- Dos tildes en Configuración → Empresa: el logo en la orden de compra, y el
-- logo en los informes internos (consumo, resumen semanal, cierre de mes).
-- Los dos arrancan en sí. Sin logo, el encabezado lleva el nombre de fantasía.
--
-- No hace falta GRANT ni policy nuevos: son columnas de una tabla que ya los
-- tiene.
-- =====================================================

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS logo_en_oc       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS logo_en_informes BOOLEAN NOT NULL DEFAULT true;

-- Verificación: dos columnas, boolean
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'restaurantes'
  AND column_name IN ('logo_en_oc', 'logo_en_informes');
