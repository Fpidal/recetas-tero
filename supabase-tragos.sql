-- =====================================================
-- MÓDULO: TRAGOS / COCTELERÍA
-- =====================================================
-- Espejo de platos / plato_ingredientes, con campos de barra
-- (vaso, técnica) + precio de venta para calcular Beverage Cost.
--
-- 100% ADITIVO: solo crea tablas nuevas. No toca ninguna
-- tabla existente (insumos, platos, carta, etc. quedan intactas).
-- =====================================================


-- =====================================================
-- TABLA: TRAGOS
-- =====================================================

CREATE TABLE tragos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  vaso VARCHAR(100),                          -- Ref: "Old Fashioned", "Copa balón", "Highball"
  tecnica VARCHAR(100),                       -- Ref: "Refrescado", "Batido", "Directo", "Licuado"
  paso_a_paso TEXT,                           -- Preparación
  precio_venta DECIMAL(12,2) DEFAULT 0,       -- Precio de carta (editable a mano)
  costo_total DECIMAL(12,2) DEFAULT 0,        -- Costo calculado del trago
  activo BOOLEAN DEFAULT true,                -- Soft delete
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_tragos_nombre ON tragos(nombre);
CREATE INDEX idx_tragos_activo ON tragos(activo);


-- =====================================================
-- TABLA: TRAGO_INGREDIENTES
-- =====================================================
-- Espejo exacto de plato_ingredientes: insumo directo (gin,
-- tónica, en lt) o elaboración (jarabe casero, en porciones).
-- La cantidad se guarda en la unidad base del insumo (igual
-- que platos); el "ml" es solo capa de presentación en la UI.

CREATE TABLE trago_ingredientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trago_id UUID NOT NULL REFERENCES tragos(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id) ON DELETE RESTRICT,
  receta_base_id UUID REFERENCES recetas_base(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL,
  costo_linea DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT chk_trago_ingrediente_tipo CHECK (
    (insumo_id IS NOT NULL AND receta_base_id IS NULL) OR
    (insumo_id IS NULL AND receta_base_id IS NOT NULL)
  )
);

CREATE INDEX idx_trago_ing_trago ON trago_ingredientes(trago_id);
CREATE INDEX idx_trago_ing_insumo ON trago_ingredientes(insumo_id);
CREATE INDEX idx_trago_ing_receta ON trago_ingredientes(receta_base_id);


-- =====================================================
-- TRIGGER updated_at (reutiliza la función ya existente)
-- =====================================================

CREATE TRIGGER update_tragos_updated_at
  BEFORE UPDATE ON tragos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- PERMISOS DE API + RLS + POLICY (convención obligatoria)
-- Opción C: datos sensibles (costos) → solo autenticados.
-- La app corre detrás de login, así que esto no afecta el uso.
-- =====================================================

-- 1. GRANTs
GRANT SELECT ON public.tragos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tragos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tragos TO service_role;

GRANT SELECT ON public.trago_ingredientes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trago_ingredientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trago_ingredientes TO service_role;

-- 2. RLS
ALTER TABLE public.tragos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trago_ingredientes ENABLE ROW LEVEL SECURITY;

-- 3. Policies (solo autenticados)
CREATE POLICY "solo autenticados"
  ON public.tragos FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "solo autenticados"
  ON public.trago_ingredientes FOR ALL
  TO authenticated
  USING (true);
