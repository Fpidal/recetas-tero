-- =====================================================
-- SCHEMA DE SUPABASE PARA TERO RESTÓ
-- Sistema de Gestión de Mercadería y Recetas
-- =====================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TIPOS ENUMERADOS
-- =====================================================

CREATE TYPE categoria_insumo AS ENUM (
  'Carnes',
  'Almacen',
  'Verduras_Frutas',
  'Pescados_Mariscos',
  'Lacteos_Fiambres',
  'Bebidas',
  'Salsas_Recetas'
);

CREATE TYPE unidad_medida AS ENUM (
  'kg',
  'lt',
  'unidad',
  'gr',
  'ml'
);

CREATE TYPE estado_orden AS ENUM (
  'borrador',
  'enviada',
  'recibida',
  'cancelada',
  'parcialmente_recibida'
);

-- =====================================================
-- TABLA: PROVEEDORES
-- =====================================================

CREATE TABLE proveedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  codigo VARCHAR(20),
  categoria VARCHAR(50),
  contacto VARCHAR(255),
  celular VARCHAR(50),
  telefono VARCHAR(50),
  email VARCHAR(255),
  situacion_iva VARCHAR(50),
  condicion_pago VARCHAR(50),
  forma_pago VARCHAR(50),
  cuit VARCHAR(20),
  banco VARCHAR(100),
  cbu VARCHAR(30),
  direccion TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_proveedores_nombre ON proveedores(nombre);
CREATE INDEX idx_proveedores_activo ON proveedores(activo);

-- =====================================================
-- TABLA: INSUMOS
-- =====================================================

CREATE TABLE insumos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  categoria categoria_insumo NOT NULL,
  unidad_medida unidad_medida NOT NULL,
  merma_porcentaje DECIMAL(5,2) DEFAULT 0,
  iva_porcentaje DECIMAL(5,2) DEFAULT 21,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_insumos_nombre ON insumos(nombre);
CREATE INDEX idx_insumos_categoria ON insumos(categoria);
CREATE INDEX idx_insumos_activo ON insumos(activo);

-- =====================================================
-- TABLA: PRECIOS_INSUMO (Histórico de precios)
-- =====================================================

CREATE TABLE precios_insumo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  precio DECIMAL(12,2) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  es_precio_actual BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_precios_insumo_insumo ON precios_insumo(insumo_id);
CREATE INDEX idx_precios_insumo_proveedor ON precios_insumo(proveedor_id);
CREATE INDEX idx_precios_insumo_actual ON precios_insumo(es_precio_actual) WHERE es_precio_actual = true;
CREATE INDEX idx_precios_insumo_fecha ON precios_insumo(fecha DESC);

-- =====================================================
-- TABLA: RECETAS_BASE (Salsas, guarniciones, preparados)
-- =====================================================

CREATE TABLE recetas_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  rendimiento_porciones INTEGER NOT NULL DEFAULT 1,
  costo_total DECIMAL(12,2) DEFAULT 0,
  costo_por_porcion DECIMAL(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_recetas_base_nombre ON recetas_base(nombre);
CREATE INDEX idx_recetas_base_activo ON recetas_base(activo);

-- =====================================================
-- TABLA: RECETA_BASE_INGREDIENTES
-- =====================================================

CREATE TABLE receta_base_ingredientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receta_base_id UUID NOT NULL REFERENCES recetas_base(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL,
  costo_linea DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_receta_base_ing_receta ON receta_base_ingredientes(receta_base_id);
CREATE INDEX idx_receta_base_ing_insumo ON receta_base_ingredientes(insumo_id);

-- =====================================================
-- TABLA: PLATOS
-- =====================================================

CREATE TABLE platos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  seccion VARCHAR(100) DEFAULT 'Principales',
  descripcion TEXT,
  paso_a_paso TEXT,
  rendimiento_porciones INTEGER DEFAULT 1,
  version_receta VARCHAR(10) DEFAULT '1.0',
  costo_total DECIMAL(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_platos_nombre ON platos(nombre);
CREATE INDEX idx_platos_seccion ON platos(seccion);
CREATE INDEX idx_platos_activo ON platos(activo);

-- =====================================================
-- TABLA: PLATO_INGREDIENTES
-- =====================================================

CREATE TABLE plato_ingredientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plato_id UUID NOT NULL REFERENCES platos(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES insumos(id) ON DELETE RESTRICT,
  receta_base_id UUID REFERENCES recetas_base(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL,
  costo_linea DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  CONSTRAINT chk_ingrediente_tipo CHECK (
    (insumo_id IS NOT NULL AND receta_base_id IS NULL) OR
    (insumo_id IS NULL AND receta_base_id IS NOT NULL)
  )
);

CREATE INDEX idx_plato_ing_plato ON plato_ingredientes(plato_id);
CREATE INDEX idx_plato_ing_insumo ON plato_ingredientes(insumo_id);
CREATE INDEX idx_plato_ing_receta ON plato_ingredientes(receta_base_id);

-- =====================================================
-- TABLA: MENUS_EJECUTIVOS
-- =====================================================

CREATE TABLE menus_ejecutivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  costo_total DECIMAL(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_menus_ejecutivos_nombre ON menus_ejecutivos(nombre);
CREATE INDEX idx_menus_ejecutivos_activo ON menus_ejecutivos(activo);

-- =====================================================
-- TABLA: MENU_EJECUTIVO_ITEMS
-- =====================================================

CREATE TABLE menu_ejecutivo_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_ejecutivo_id UUID NOT NULL REFERENCES menus_ejecutivos(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL,
  es_bebida BOOLEAN DEFAULT false,
  costo_linea DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_menu_ejec_items_menu ON menu_ejecutivo_items(menu_ejecutivo_id);
CREATE INDEX idx_menu_ejec_items_insumo ON menu_ejecutivo_items(insumo_id);

-- =====================================================
-- TABLA: MENUS_ESPECIALES
-- =====================================================

CREATE TABLE menus_especiales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  costo_promedio DECIMAL(12,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_menus_especiales_nombre ON menus_especiales(nombre);
CREATE INDEX idx_menus_especiales_activo ON menus_especiales(activo);

-- =====================================================
-- TABLA: MENU_ESPECIAL_OPCIONES
-- =====================================================

CREATE TABLE menu_especial_opciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_especial_id UUID NOT NULL REFERENCES menus_especiales(id) ON DELETE CASCADE,
  plato_id UUID NOT NULL REFERENCES platos(id) ON DELETE RESTRICT,
  tipo_opcion VARCHAR(100) NOT NULL, -- ej: 'entrada', 'principal', 'postre'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_menu_esp_opc_menu ON menu_especial_opciones(menu_especial_id);
CREATE INDEX idx_menu_esp_opc_plato ON menu_especial_opciones(plato_id);

-- =====================================================
-- TABLA: CARTA
-- =====================================================

CREATE TABLE carta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plato_id UUID NOT NULL REFERENCES platos(id) ON DELETE CASCADE UNIQUE,
  precio_sugerido DECIMAL(12,2) DEFAULT 0,
  precio_carta DECIMAL(12,2) NOT NULL,
  margen_objetivo DECIMAL(5,2) DEFAULT 30, -- porcentaje de food cost objetivo
  food_cost_real DECIMAL(5,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_carta_plato ON carta(plato_id);
CREATE INDEX idx_carta_activo ON carta(activo);

-- =====================================================
-- TABLA: ORDENES_COMPRA
-- =====================================================

CREATE TABLE ordenes_compra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero VARCHAR(20),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado estado_orden DEFAULT 'borrador',
  total DECIMAL(12,2) DEFAULT 0,
  notas TEXT,
  orden_origen_id UUID REFERENCES ordenes_compra(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_ordenes_compra_proveedor ON ordenes_compra(proveedor_id);
CREATE INDEX idx_ordenes_compra_fecha ON ordenes_compra(fecha DESC);
CREATE INDEX idx_ordenes_compra_estado ON ordenes_compra(estado);

-- =====================================================
-- TABLA: ORDEN_COMPRA_ITEMS
-- =====================================================

CREATE TABLE orden_compra_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_compra_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_orden_items_orden ON orden_compra_items(orden_compra_id);
CREATE INDEX idx_orden_items_insumo ON orden_compra_items(insumo_id);

-- =====================================================
-- TABLA: FACTURAS_PROVEEDOR
-- =====================================================

CREATE TABLE facturas_proveedor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  numero_factura VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  total DECIMAL(12,2) NOT NULL,
  orden_compra_id UUID REFERENCES ordenes_compra(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_facturas_proveedor ON facturas_proveedor(proveedor_id);
CREATE INDEX idx_facturas_numero ON facturas_proveedor(numero_factura);
CREATE INDEX idx_facturas_fecha ON facturas_proveedor(fecha DESC);

-- =====================================================
-- TABLA: FACTURA_ITEMS
-- =====================================================

CREATE TABLE factura_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  factura_id UUID NOT NULL REFERENCES facturas_proveedor(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  cantidad DECIMAL(10,4) NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_factura_items_factura ON factura_items(factura_id);
CREATE INDEX idx_factura_items_insumo ON factura_items(insumo_id);

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_proveedores_updated_at
  BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insumos_updated_at
  BEFORE UPDATE ON insumos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recetas_base_updated_at
  BEFORE UPDATE ON recetas_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platos_updated_at
  BEFORE UPDATE ON platos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menus_ejecutivos_updated_at
  BEFORE UPDATE ON menus_ejecutivos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menus_especiales_updated_at
  BEFORE UPDATE ON menus_especiales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_carta_updated_at
  BEFORE UPDATE ON carta
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ordenes_compra_updated_at
  BEFORE UPDATE ON ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_facturas_proveedor_updated_at
  BEFORE UPDATE ON facturas_proveedor
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCIÓN: Obtener precio actual de un insumo
-- =====================================================

CREATE OR REPLACE FUNCTION get_precio_actual_insumo(p_insumo_id UUID)
RETURNS DECIMAL(12,2) AS $$
DECLARE
  v_precio DECIMAL(12,2);
BEGIN
  SELECT precio INTO v_precio
  FROM precios_insumo
  WHERE insumo_id = p_insumo_id AND es_precio_actual = true
  LIMIT 1;

  RETURN COALESCE(v_precio, 0);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN: Calcular costo de insumo con merma
-- =====================================================

CREATE OR REPLACE FUNCTION calcular_costo_insumo(
  p_insumo_id UUID,
  p_cantidad DECIMAL
)
RETURNS DECIMAL(12,2) AS $$
DECLARE
  v_precio DECIMAL(12,2);
  v_merma DECIMAL(5,2);
BEGIN
  SELECT get_precio_actual_insumo(p_insumo_id) INTO v_precio;
  SELECT merma_porcentaje INTO v_merma FROM insumos WHERE id = p_insumo_id;

  RETURN p_cantidad * v_precio * (1 + COALESCE(v_merma, 0) / 100);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN: Recalcular costos de receta base
-- =====================================================

CREATE OR REPLACE FUNCTION recalcular_costo_receta_base(p_receta_id UUID)
RETURNS VOID AS $$
DECLARE
  v_costo_total DECIMAL(12,2);
  v_rendimiento INTEGER;
BEGIN
  -- Actualizar costo de cada ingrediente
  UPDATE receta_base_ingredientes
  SET costo_linea = calcular_costo_insumo(insumo_id, cantidad)
  WHERE receta_base_id = p_receta_id;

  -- Calcular costo total
  SELECT COALESCE(SUM(costo_linea), 0) INTO v_costo_total
  FROM receta_base_ingredientes
  WHERE receta_base_id = p_receta_id;

  -- Obtener rendimiento
  SELECT rendimiento_porciones INTO v_rendimiento
  FROM recetas_base WHERE id = p_receta_id;

  -- Actualizar receta
  UPDATE recetas_base
  SET costo_total = v_costo_total,
      costo_por_porcion = CASE WHEN v_rendimiento > 0 THEN v_costo_total / v_rendimiento ELSE 0 END
  WHERE id = p_receta_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN: Recalcular costos de plato
-- =====================================================

CREATE OR REPLACE FUNCTION recalcular_costo_plato(p_plato_id UUID)
RETURNS VOID AS $$
DECLARE
  v_costo_total DECIMAL(12,2);
BEGIN
  -- Actualizar costo de cada ingrediente (insumos directos)
  UPDATE plato_ingredientes
  SET costo_linea = calcular_costo_insumo(insumo_id, cantidad)
  WHERE plato_id = p_plato_id AND insumo_id IS NOT NULL;

  -- Actualizar costo de ingredientes que son recetas base
  UPDATE plato_ingredientes pi
  SET costo_linea = (
    SELECT rb.costo_por_porcion * pi.cantidad
    FROM recetas_base rb
    WHERE rb.id = pi.receta_base_id
  )
  WHERE plato_id = p_plato_id AND receta_base_id IS NOT NULL;

  -- Calcular costo total
  SELECT COALESCE(SUM(costo_linea), 0) INTO v_costo_total
  FROM plato_ingredientes
  WHERE plato_id = p_plato_id;

  -- Actualizar plato
  UPDATE platos SET costo_total = v_costo_total WHERE id = p_plato_id;

  -- Actualizar carta si el plato está en ella
  UPDATE carta
  SET food_cost_real = CASE WHEN precio_carta > 0 THEN (v_costo_total / precio_carta) * 100 ELSE 0 END,
      precio_sugerido = CASE WHEN margen_objetivo > 0 THEN v_costo_total / (margen_objetivo / 100) ELSE 0 END
  WHERE plato_id = p_plato_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN: Actualizar precio de insumo desde factura
-- =====================================================

CREATE OR REPLACE FUNCTION actualizar_precio_desde_factura()
RETURNS TRIGGER AS $$
BEGIN
  -- Marcar precios anteriores como no actuales
  UPDATE precios_insumo
  SET es_precio_actual = false
  WHERE insumo_id = NEW.insumo_id AND es_precio_actual = true;

  -- Insertar nuevo precio
  INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, fecha, es_precio_actual)
  SELECT NEW.insumo_id, fp.proveedor_id, NEW.precio_unitario, fp.fecha, true
  FROM facturas_proveedor fp
  WHERE fp.id = NEW.factura_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_actualizar_precio_factura
  AFTER INSERT ON factura_items
  FOR EACH ROW EXECUTE FUNCTION actualizar_precio_desde_factura();

-- =====================================================
-- FUNCIÓN: Calcular total de orden de compra
-- =====================================================

CREATE OR REPLACE FUNCTION calcular_total_orden()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ordenes_compra
  SET total = (
    SELECT COALESCE(SUM(subtotal), 0)
    FROM orden_compra_items
    WHERE orden_compra_id = COALESCE(NEW.orden_compra_id, OLD.orden_compra_id)
  )
  WHERE id = COALESCE(NEW.orden_compra_id, OLD.orden_compra_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calcular_total_orden_insert
  AFTER INSERT ON orden_compra_items
  FOR EACH ROW EXECUTE FUNCTION calcular_total_orden();

CREATE TRIGGER trigger_calcular_total_orden_update
  AFTER UPDATE ON orden_compra_items
  FOR EACH ROW EXECUTE FUNCTION calcular_total_orden();

CREATE TRIGGER trigger_calcular_total_orden_delete
  AFTER DELETE ON orden_compra_items
  FOR EACH ROW EXECUTE FUNCTION calcular_total_orden();

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista: Insumos con precio actual
CREATE VIEW v_insumos_con_precio AS
SELECT
  i.*,
  pi.precio as precio_actual,
  pi.proveedor_id as proveedor_actual_id,
  p.nombre as proveedor_actual_nombre
FROM insumos i
LEFT JOIN precios_insumo pi ON i.id = pi.insumo_id AND pi.es_precio_actual = true
LEFT JOIN proveedores p ON pi.proveedor_id = p.id;

-- Vista: Carta con detalles de plato y food cost
CREATE VIEW v_carta_detalle AS
SELECT
  c.*,
  p.nombre as plato_nombre,
  p.descripcion as plato_descripcion,
  p.costo_total as plato_costo,
  CASE
    WHEN c.food_cost_real <= c.margen_objetivo THEN 'ok'
    WHEN c.food_cost_real <= c.margen_objetivo * 1.1 THEN 'warning'
    ELSE 'danger'
  END as estado_margen
FROM carta c
JOIN platos p ON c.plato_id = p.id
WHERE c.activo = true AND p.activo = true;

-- =====================================================
-- POLÍTICAS RLS (Row Level Security)
-- =====================================================

-- Por ahora deshabilitamos RLS para desarrollo
-- En producción, habilitar y configurar según roles de usuario

-- ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
-- etc.

-- =====================================================
-- DATOS DE EJEMPLO (Opcional)
-- =====================================================

-- Insertar algunos proveedores de ejemplo
INSERT INTO proveedores (nombre, contacto, telefono, email) VALUES
('Carnes Premium', 'Juan Pérez', '11-5555-1234', 'juan@carnespremium.com'),
('Verdulería Central', 'María García', '11-5555-5678', 'maria@verduleria.com'),
('Distribuidora de Bebidas', 'Carlos López', '11-5555-9012', 'carlos@bebidas.com');

-- Insertar algunos insumos de ejemplo
INSERT INTO insumos (nombre, categoria, unidad_medida, merma_porcentaje, iva_porcentaje) VALUES
('Bife de Chorizo', 'Carnes', 'kg', 15, 10.5),
('Pollo Entero', 'Carnes', 'kg', 20, 10.5),
('Papa', 'Verduras_Frutas', 'kg', 10, 21),
('Cebolla', 'Verduras_Frutas', 'kg', 8, 21),
('Tomate', 'Verduras_Frutas', 'kg', 12, 21),
('Aceite de Oliva', 'Almacen', 'lt', 0, 21),
('Sal Fina', 'Almacen', 'kg', 0, 21),
('Agua Mineral', 'Bebidas', 'unidad', 0, 21),
('Vino Tinto', 'Bebidas', 'unidad', 0, 21),
('Crema de Leche', 'Lacteos_Fiambres', 'lt', 5, 10.5);

-- Insertar precios iniciales
INSERT INTO precios_insumo (insumo_id, proveedor_id, precio, es_precio_actual)
SELECT i.id, p.id,
  CASE
    WHEN i.nombre = 'Bife de Chorizo' THEN 8500
    WHEN i.nombre = 'Pollo Entero' THEN 3200
    WHEN i.nombre = 'Papa' THEN 800
    WHEN i.nombre = 'Cebolla' THEN 650
    WHEN i.nombre = 'Tomate' THEN 1200
    WHEN i.nombre = 'Aceite de Oliva' THEN 4500
    WHEN i.nombre = 'Sal Fina' THEN 350
    WHEN i.nombre = 'Agua Mineral' THEN 500
    WHEN i.nombre = 'Vino Tinto' THEN 3500
    WHEN i.nombre = 'Crema de Leche' THEN 2100
    ELSE 1000
  END,
  true
FROM insumos i
CROSS JOIN proveedores p
WHERE p.nombre = 'Carnes Premium' AND i.categoria = 'Carnes'
   OR p.nombre = 'Verdulería Central' AND i.categoria IN ('Verduras_Frutas', 'Lacteos_Fiambres')
   OR p.nombre = 'Distribuidora de Bebidas' AND i.categoria IN ('Bebidas', 'Almacen');
