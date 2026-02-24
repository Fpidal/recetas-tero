-- Comparador de Precios - Tablas nuevas
-- Ejecutar en Supabase SQL Editor

-- Comparaciones guardadas
CREATE TABLE IF NOT EXISTS comparaciones_precios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proveedores dentro de una comparación
-- Puede ser un proveedor real (proveedor_id) o uno temporal (solo nombre)
CREATE TABLE IF NOT EXISTS comparacion_proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparacion_id UUID REFERENCES comparaciones_precios(id) ON DELETE CASCADE,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  nombre_temporal TEXT,
  orden INT DEFAULT 0
);

-- Precios por insumo x proveedor dentro de una comparación
CREATE TABLE IF NOT EXISTS comparacion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparacion_id UUID REFERENCES comparaciones_precios(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id) ON DELETE CASCADE,
  comparacion_proveedor_id UUID REFERENCES comparacion_proveedores(id) ON DELETE CASCADE,
  precio DECIMAL(12,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_comparacion_proveedores_comparacion ON comparacion_proveedores(comparacion_id);
CREATE INDEX IF NOT EXISTS idx_comparacion_items_comparacion ON comparacion_items(comparacion_id);
CREATE INDEX IF NOT EXISTS idx_comparacion_items_insumo ON comparacion_items(insumo_id);
CREATE INDEX IF NOT EXISTS idx_comparacion_items_proveedor ON comparacion_items(comparacion_proveedor_id);

-- Enable RLS (Row Level Security)
ALTER TABLE comparaciones_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparacion_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparacion_items ENABLE ROW LEVEL SECURITY;

-- Políticas para acceso público (ajustar según necesidad de autenticación)
CREATE POLICY "Allow all on comparaciones_precios" ON comparaciones_precios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on comparacion_proveedores" ON comparacion_proveedores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on comparacion_items" ON comparacion_items FOR ALL USING (true) WITH CHECK (true);
