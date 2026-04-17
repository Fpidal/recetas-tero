-- =====================================================
-- MÓDULO: ANÁLISIS - CONSUMO DIARIO DE COCINA
-- =====================================================
-- Permite cargar el consumo real al final de cada servicio
-- (mediodía, noche, eventos) para calcular incidencia REAL
-- vs ventas. Acepta insumos, elaboraciones (recetas_base) y recetas (platos).

-- =====================================================
-- TABLA: consumo_diario (cabecera)
-- =====================================================
CREATE TABLE IF NOT EXISTS consumo_diario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fecha DATE NOT NULL,
  servicio TEXT NOT NULL CHECK (servicio IN ('mediodia', 'noche', 'eventos')),
  costo_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  confirmado BOOLEAN NOT NULL DEFAULT false,
  confirmado_at TIMESTAMP WITH TIME ZONE,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(fecha, servicio)
);

CREATE INDEX IF NOT EXISTS idx_consumo_diario_fecha ON consumo_diario(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_consumo_diario_servicio ON consumo_diario(servicio);

-- =====================================================
-- TABLA: consumo_items (items cargados en cada servicio)
-- =====================================================
-- Cada fila apunta a un insumo, una elaboración (receta_base) o una receta (plato)
CREATE TABLE IF NOT EXISTS consumo_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumo_id UUID NOT NULL REFERENCES consumo_diario(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('insumo', 'elaboracion', 'receta')),
  insumo_id UUID REFERENCES insumos(id) ON DELETE RESTRICT,
  receta_base_id UUID REFERENCES recetas_base(id) ON DELETE RESTRICT,
  plato_id UUID REFERENCES platos(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL CHECK (cantidad > 0),
  unidad TEXT NOT NULL,
  costo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  -- Validación: cada tipo debe tener su FK correspondiente
  CHECK (
    (tipo = 'insumo' AND insumo_id IS NOT NULL AND receta_base_id IS NULL AND plato_id IS NULL) OR
    (tipo = 'elaboracion' AND receta_base_id IS NOT NULL AND insumo_id IS NULL AND plato_id IS NULL) OR
    (tipo = 'receta' AND plato_id IS NOT NULL AND insumo_id IS NULL AND receta_base_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_consumo_items_consumo ON consumo_items(consumo_id);
CREATE INDEX IF NOT EXISTS idx_consumo_items_insumo ON consumo_items(insumo_id);
CREATE INDEX IF NOT EXISTS idx_consumo_items_receta_base ON consumo_items(receta_base_id);
CREATE INDEX IF NOT EXISTS idx_consumo_items_plato ON consumo_items(plato_id);
CREATE INDEX IF NOT EXISTS idx_consumo_items_tipo ON consumo_items(tipo);

-- =====================================================
-- TRIGGER: actualizar updated_at en consumo_diario
-- =====================================================
CREATE OR REPLACE FUNCTION actualizar_updated_at_consumo()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_consumo_diario_updated_at ON consumo_diario;
CREATE TRIGGER trigger_consumo_diario_updated_at
  BEFORE UPDATE ON consumo_diario
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_updated_at_consumo();

-- =====================================================
-- TRIGGER: recalcular costo_total cuando cambian items
-- =====================================================
CREATE OR REPLACE FUNCTION recalcular_costo_consumo()
RETURNS TRIGGER AS $$
DECLARE
  consumo_id_target UUID;
BEGIN
  consumo_id_target := COALESCE(NEW.consumo_id, OLD.consumo_id);

  UPDATE consumo_diario
  SET costo_total = COALESCE((
    SELECT SUM(subtotal) FROM consumo_items WHERE consumo_id = consumo_id_target
  ), 0)
  WHERE id = consumo_id_target;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalcular_costo_insert ON consumo_items;
CREATE TRIGGER trigger_recalcular_costo_insert
  AFTER INSERT OR UPDATE OR DELETE ON consumo_items
  FOR EACH ROW
  EXECUTE FUNCTION recalcular_costo_consumo();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE consumo_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumo_items ENABLE ROW LEVEL SECURITY;

-- consumo_diario
DROP POLICY IF EXISTS "consumo_diario_select" ON consumo_diario;
CREATE POLICY "consumo_diario_select" ON consumo_diario
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "consumo_diario_insert" ON consumo_diario;
CREATE POLICY "consumo_diario_insert" ON consumo_diario
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "consumo_diario_update" ON consumo_diario;
CREATE POLICY "consumo_diario_update" ON consumo_diario
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "consumo_diario_delete" ON consumo_diario;
CREATE POLICY "consumo_diario_delete" ON consumo_diario
  FOR DELETE TO authenticated USING (true);

-- consumo_items
DROP POLICY IF EXISTS "consumo_items_select" ON consumo_items;
CREATE POLICY "consumo_items_select" ON consumo_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "consumo_items_insert" ON consumo_items;
CREATE POLICY "consumo_items_insert" ON consumo_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "consumo_items_update" ON consumo_items;
CREATE POLICY "consumo_items_update" ON consumo_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "consumo_items_delete" ON consumo_items;
CREATE POLICY "consumo_items_delete" ON consumo_items
  FOR DELETE TO authenticated USING (true);

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON TABLE consumo_diario IS 'Cabecera de carga de consumo real por día y servicio (mediodía/noche/eventos)';
COMMENT ON TABLE consumo_items IS 'Items consumidos: insumos, elaboraciones (recetas_base) o recetas (platos). Costo unitario con IVA incluido';
COMMENT ON COLUMN consumo_diario.confirmado IS 'true si el usuario confirmó el consumo (paso previo a descontar de stock)';
COMMENT ON COLUMN consumo_items.costo_unitario IS 'Costo unitario con IVA incluido al momento de la carga';
