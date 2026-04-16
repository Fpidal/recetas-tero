-- =====================================================
-- TABLA: VENTAS DIARIAS
-- =====================================================
-- Registra las ventas diarias del restaurante separadas por servicio
-- (mediodía, noche y eventos) para calcular incidencia de mercadería
-- sobre ventas (food cost real).

CREATE TABLE IF NOT EXISTS ventas_diarias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha DATE NOT NULL UNIQUE,
  venta_mediodia DECIMAL(12,2) NOT NULL DEFAULT 0,
  venta_noche DECIMAL(12,2) NOT NULL DEFAULT 0,
  venta_eventos DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Índice por fecha (DESC para listados recientes primero)
CREATE INDEX IF NOT EXISTS idx_ventas_diarias_fecha ON ventas_diarias(fecha DESC);

-- =====================================================
-- TRIGGER: actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION actualizar_updated_at_ventas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ventas_diarias_updated_at ON ventas_diarias;
CREATE TRIGGER trigger_ventas_diarias_updated_at
  BEFORE UPDATE ON ventas_diarias
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_updated_at_ventas();

-- =====================================================
-- RLS: Row Level Security
-- =====================================================
ALTER TABLE ventas_diarias ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer
DROP POLICY IF EXISTS "ventas_diarias_select" ON ventas_diarias;
CREATE POLICY "ventas_diarias_select" ON ventas_diarias
  FOR SELECT
  TO authenticated
  USING (true);

-- Todos los usuarios autenticados pueden insertar
DROP POLICY IF EXISTS "ventas_diarias_insert" ON ventas_diarias;
CREATE POLICY "ventas_diarias_insert" ON ventas_diarias
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Todos los usuarios autenticados pueden actualizar
DROP POLICY IF EXISTS "ventas_diarias_update" ON ventas_diarias;
CREATE POLICY "ventas_diarias_update" ON ventas_diarias
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Todos los usuarios autenticados pueden eliminar
DROP POLICY IF EXISTS "ventas_diarias_delete" ON ventas_diarias;
CREATE POLICY "ventas_diarias_delete" ON ventas_diarias
  FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE ventas_diarias IS 'Ventas diarias del restaurante separadas por servicio para análisis de incidencia';
COMMENT ON COLUMN ventas_diarias.fecha IS 'Fecha del día (única, una sola entrada por día)';
COMMENT ON COLUMN ventas_diarias.venta_mediodia IS 'Total facturado en el servicio del mediodía';
COMMENT ON COLUMN ventas_diarias.venta_noche IS 'Total facturado en el servicio de la noche';
COMMENT ON COLUMN ventas_diarias.venta_eventos IS 'Total facturado por eventos del día';
