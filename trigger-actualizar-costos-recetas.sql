-- =====================================================
-- TRIGGER: Actualizar costos de recetas y platos
-- cuando cambian los precios de insumos
-- =====================================================

-- FUNCIÓN 1: Recalcular costos de recetas_base cuando cambia un precio
CREATE OR REPLACE FUNCTION actualizar_costos_recetas_base()
RETURNS TRIGGER AS $$
DECLARE
  v_insumo_id UUID;
  v_precio_con_iva_merma DECIMAL(12,4);
  v_iva DECIMAL(5,2);
  v_merma DECIMAL(5,2);
BEGIN
  -- Solo procesar si es precio actual
  IF NEW.es_precio_actual = false THEN
    RETURN NEW;
  END IF;

  v_insumo_id := NEW.insumo_id;

  -- Obtener IVA y merma del insumo
  SELECT
    COALESCE(iva_porcentaje, 0),
    COALESCE(merma_porcentaje, 0)
  INTO v_iva, v_merma
  FROM insumos
  WHERE id = v_insumo_id;

  -- Calcular precio con IVA y merma
  v_precio_con_iva_merma := NEW.precio * (1 + v_iva / 100) * (1 + v_merma / 100);

  -- Actualizar costo_linea en receta_base_ingredientes
  UPDATE receta_base_ingredientes
  SET costo_linea = cantidad * v_precio_con_iva_merma
  WHERE insumo_id = v_insumo_id;

  -- Recalcular costo_total y costo_por_porcion en recetas_base
  UPDATE recetas_base rb
  SET
    costo_total = COALESCE((
      SELECT SUM(costo_linea)
      FROM receta_base_ingredientes
      WHERE receta_base_id = rb.id
    ), 0),
    costo_por_porcion = CASE
      WHEN rb.rendimiento_porciones > 0 THEN
        COALESCE((
          SELECT SUM(costo_linea)
          FROM receta_base_ingredientes
          WHERE receta_base_id = rb.id
        ), 0) / rb.rendimiento_porciones
      ELSE 0
    END,
    updated_at = NOW()
  WHERE rb.id IN (
    SELECT DISTINCT receta_base_id
    FROM receta_base_ingredientes
    WHERE insumo_id = v_insumo_id
  );

  -- Actualizar costo_linea en plato_ingredientes (insumos directos)
  UPDATE plato_ingredientes
  SET costo_linea = cantidad * v_precio_con_iva_merma
  WHERE insumo_id = v_insumo_id;

  -- Recalcular costo_total en platos que usan este insumo directamente
  UPDATE platos p
  SET
    costo_total = COALESCE((
      SELECT SUM(costo_linea)
      FROM plato_ingredientes
      WHERE plato_id = p.id
    ), 0),
    updated_at = NOW()
  WHERE p.id IN (
    SELECT DISTINCT plato_id
    FROM plato_ingredientes
    WHERE insumo_id = v_insumo_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FUNCIÓN 2: Actualizar platos cuando cambia el costo de una receta_base
CREATE OR REPLACE FUNCTION actualizar_costos_platos_desde_receta()
RETURNS TRIGGER AS $$
BEGIN
  -- Si cambió el costo_por_porcion de la receta_base
  IF OLD.costo_por_porcion IS DISTINCT FROM NEW.costo_por_porcion THEN
    -- Actualizar costo_linea en plato_ingredientes que usan esta receta_base
    UPDATE plato_ingredientes
    SET costo_linea = cantidad * NEW.costo_por_porcion
    WHERE receta_base_id = NEW.id;

    -- Recalcular costo_total en platos que usan esta receta_base
    UPDATE platos p
    SET
      costo_total = COALESCE((
        SELECT SUM(costo_linea)
        FROM plato_ingredientes
        WHERE plato_id = p.id
      ), 0),
      updated_at = NOW()
    WHERE p.id IN (
      SELECT DISTINCT plato_id
      FROM plato_ingredientes
      WHERE receta_base_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CREAR TRIGGERS
-- =====================================================

-- Eliminar triggers si existen
DROP TRIGGER IF EXISTS trigger_actualizar_costos_recetas ON precios_insumo;
DROP TRIGGER IF EXISTS trigger_actualizar_costos_platos ON recetas_base;

-- Trigger cuando se inserta/actualiza un precio
CREATE TRIGGER trigger_actualizar_costos_recetas
AFTER INSERT OR UPDATE ON precios_insumo
FOR EACH ROW
EXECUTE FUNCTION actualizar_costos_recetas_base();

-- Trigger cuando se actualiza una receta_base
CREATE TRIGGER trigger_actualizar_costos_platos
AFTER UPDATE ON recetas_base
FOR EACH ROW
EXECUTE FUNCTION actualizar_costos_platos_desde_receta();

-- =====================================================
-- ACTUALIZACIÓN INICIAL: Sincronizar todos los costos
-- =====================================================

-- Actualizar todos los costo_linea en receta_base_ingredientes
UPDATE receta_base_ingredientes rbi
SET costo_linea = rbi.cantidad * (
  SELECT p.precio * (1 + COALESCE(i.iva_porcentaje, 0) / 100) * (1 + COALESCE(i.merma_porcentaje, 0) / 100)
  FROM precios_insumo p
  JOIN insumos i ON i.id = p.insumo_id
  WHERE p.insumo_id = rbi.insumo_id
  AND p.es_precio_actual = true
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM precios_insumo p
  WHERE p.insumo_id = rbi.insumo_id AND p.es_precio_actual = true
);

-- Recalcular costo_total y costo_por_porcion en todas las recetas_base
UPDATE recetas_base rb
SET
  costo_total = COALESCE((
    SELECT SUM(costo_linea)
    FROM receta_base_ingredientes
    WHERE receta_base_id = rb.id
  ), 0),
  costo_por_porcion = CASE
    WHEN rb.rendimiento_porciones > 0 THEN
      COALESCE((
        SELECT SUM(costo_linea)
        FROM receta_base_ingredientes
        WHERE receta_base_id = rb.id
      ), 0) / rb.rendimiento_porciones
    ELSE 0
  END,
  updated_at = NOW()
WHERE rb.activo = true;

-- Actualizar costo_linea en plato_ingredientes (insumos directos)
UPDATE plato_ingredientes pi
SET costo_linea = pi.cantidad * (
  SELECT p.precio * (1 + COALESCE(i.iva_porcentaje, 0) / 100) * (1 + COALESCE(i.merma_porcentaje, 0) / 100)
  FROM precios_insumo p
  JOIN insumos i ON i.id = p.insumo_id
  WHERE p.insumo_id = pi.insumo_id
  AND p.es_precio_actual = true
  LIMIT 1
)
WHERE pi.insumo_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM precios_insumo p
  WHERE p.insumo_id = pi.insumo_id AND p.es_precio_actual = true
);

-- Actualizar costo_linea en plato_ingredientes (recetas_base)
UPDATE plato_ingredientes pi
SET costo_linea = pi.cantidad * (
  SELECT rb.costo_por_porcion
  FROM recetas_base rb
  WHERE rb.id = pi.receta_base_id
)
WHERE pi.receta_base_id IS NOT NULL;

-- Recalcular costo_total en todos los platos
UPDATE platos p
SET
  costo_total = COALESCE((
    SELECT SUM(costo_linea)
    FROM plato_ingredientes
    WHERE plato_id = p.id
  ), 0),
  updated_at = NOW()
WHERE p.activo = true;

-- =====================================================
-- FUNCIÓN 3: Actualizar costos cuando cambia IVA/merma de un insumo
-- =====================================================

CREATE OR REPLACE FUNCTION actualizar_costos_al_cambiar_insumo()
RETURNS TRIGGER AS $func$
DECLARE
  v_precio_actual DECIMAL(12,4);
  v_precio_con_iva_merma DECIMAL(12,4);
BEGIN
  IF OLD.iva_porcentaje IS DISTINCT FROM NEW.iva_porcentaje
     OR OLD.merma_porcentaje IS DISTINCT FROM NEW.merma_porcentaje THEN

    SELECT precio INTO v_precio_actual
    FROM precios_insumo
    WHERE insumo_id = NEW.id AND es_precio_actual = true
    LIMIT 1;

    IF v_precio_actual IS NOT NULL THEN
      v_precio_con_iva_merma := v_precio_actual * (1 + COALESCE(NEW.iva_porcentaje, 0) / 100) * (1 + COALESCE(NEW.merma_porcentaje, 0) / 100);

      UPDATE receta_base_ingredientes
      SET costo_linea = cantidad * v_precio_con_iva_merma
      WHERE insumo_id = NEW.id;

      UPDATE recetas_base rb
      SET
        costo_total = COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0),
        costo_por_porcion = CASE WHEN rb.rendimiento_porciones > 0 THEN
          COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = rb.id), 0) / rb.rendimiento_porciones
        ELSE 0 END,
        updated_at = NOW()
      WHERE rb.id IN (SELECT DISTINCT receta_base_id FROM receta_base_ingredientes WHERE insumo_id = NEW.id);

      UPDATE plato_ingredientes
      SET costo_linea = cantidad * v_precio_con_iva_merma
      WHERE insumo_id = NEW.id;

      UPDATE platos p
      SET
        costo_total = COALESCE((SELECT SUM(costo_linea) FROM plato_ingredientes WHERE plato_id = p.id), 0),
        updated_at = NOW()
      WHERE p.id IN (SELECT DISTINCT plato_id FROM plato_ingredientes WHERE insumo_id = NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizar_costos_insumo ON insumos;

CREATE TRIGGER trigger_actualizar_costos_insumo
AFTER UPDATE ON insumos
FOR EACH ROW EXECUTE FUNCTION actualizar_costos_al_cambiar_insumo();

-- =====================================================
-- FUNCIÓN 4: Recalcular costo de plato cuando cambian ingredientes
-- =====================================================

CREATE OR REPLACE FUNCTION recalcular_costo_plato_trigger()
RETURNS TRIGGER AS $func$
DECLARE
  v_plato_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_plato_id := OLD.plato_id;
  ELSE
    v_plato_id := NEW.plato_id;
  END IF;

  UPDATE platos p
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM plato_ingredientes WHERE plato_id = v_plato_id), 0),
    updated_at = NOW()
  WHERE p.id = v_plato_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalcular_costo_plato ON plato_ingredientes;

CREATE TRIGGER trigger_recalcular_costo_plato
AFTER INSERT OR UPDATE OR DELETE ON plato_ingredientes
FOR EACH ROW EXECUTE FUNCTION recalcular_costo_plato_trigger();

-- =====================================================
-- FUNCIÓN 5: Recalcular costo de receta cuando cambian ingredientes
-- =====================================================

CREATE OR REPLACE FUNCTION recalcular_costo_receta_trigger()
RETURNS TRIGGER AS $func$
DECLARE
  v_receta_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_receta_id := OLD.receta_base_id;
  ELSE
    v_receta_id := NEW.receta_base_id;
  END IF;

  UPDATE recetas_base rb
  SET
    costo_total = COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = v_receta_id), 0),
    costo_por_porcion = CASE WHEN rb.rendimiento_porciones > 0 THEN
      COALESCE((SELECT SUM(costo_linea) FROM receta_base_ingredientes WHERE receta_base_id = v_receta_id), 0) / rb.rendimiento_porciones
    ELSE 0 END,
    updated_at = NOW()
  WHERE rb.id = v_receta_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalcular_costo_receta ON receta_base_ingredientes;

CREATE TRIGGER trigger_recalcular_costo_receta
AFTER INSERT OR UPDATE OR DELETE ON receta_base_ingredientes
FOR EACH ROW EXECUTE FUNCTION recalcular_costo_receta_trigger();

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- Ejecutar esto para ver las recetas actualizadas:
-- SELECT nombre, costo_total, costo_por_porcion FROM recetas_base WHERE activo = true ORDER BY nombre;
-- SELECT nombre, costo_total FROM platos WHERE activo = true ORDER BY nombre;
