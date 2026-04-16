-- =====================================================
-- ALTER TABLE: AGREGAR CUBIERTOS A VENTAS DIARIAS
-- =====================================================
-- Agrega 3 columnas para cantidad de cubiertos por servicio
-- Permite calcular ticket promedio = ventas / cubiertos

ALTER TABLE ventas_diarias
  ADD COLUMN IF NOT EXISTS cubiertos_mediodia INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cubiertos_noche INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cubiertos_eventos INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ventas_diarias.cubiertos_mediodia IS 'Cantidad de cubiertos del servicio mediodía';
COMMENT ON COLUMN ventas_diarias.cubiertos_noche IS 'Cantidad de cubiertos del servicio noche';
COMMENT ON COLUMN ventas_diarias.cubiertos_eventos IS 'Cantidad de cubiertos del servicio eventos';
