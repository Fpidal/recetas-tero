-- =====================================================
-- SISTEMA DE ACTUALIZACIÓN AUTOMÁTICA DE COSTOS
-- Ejecutar en Supabase SQL Editor
-- =====================================================
-- Cuando cambia el precio de un insumo, automáticamente:
-- 1. Recalcula costos de todas las elaboraciones (recetas_base)
-- 2. Recalcula costos de todos los platos
-- 3. Recalcula costos de todos los menús ejecutivos
-- 4. Actualiza precio sugerido y food cost en carta
-- =====================================================

-- =====================================================
-- FUNCIÓN 1: Recalcular costos de una elaboración específica
-- =====================================================
CREATE OR REPLACE FUNCTION recalcular_costo_receta_base(p_receta_id UUID)
RETURNS VOID AS $$
DECLARE
    v_costo_total DECIMAL(10,2);
    v_rendimiento INT;
BEGIN
    -- Obtener rendimiento
    SELECT rendimiento_porciones INTO v_rendimiento
    FROM recetas_base
    WHERE id = p_receta_id;

    -- Calcular costo total sumando ingredientes con precio actual, IVA y merma
    SELECT COALESCE(SUM(
        rbi.cantidad * COALESCE(
            (SELECT precio FROM precios_insumo
             WHERE insumo_id = rbi.insumo_id
             ORDER BY fecha DESC LIMIT 1), 0
        ) * (1 + COALESCE(i.iva_porcentaje, 0) / 100.0)
          * (1 + COALESCE(i.merma_porcentaje, 0) / 100.0)
    ), 0)
    INTO v_costo_total
    FROM receta_base_ingredientes rbi
    JOIN insumos i ON i.id = rbi.insumo_id
    WHERE rbi.receta_base_id = p_receta_id;

    -- Actualizar receta
    UPDATE recetas_base
    SET costo_total = v_costo_total,
        costo_por_porcion = CASE
            WHEN v_rendimiento > 0 THEN v_costo_total / v_rendimiento
            ELSE v_costo_total
        END,
        updated_at = NOW()
    WHERE id = p_receta_id;

    -- Actualizar costo_linea de cada ingrediente
    UPDATE receta_base_ingredientes rbi
    SET costo_linea = rbi.cantidad * COALESCE(
        (SELECT precio FROM precios_insumo
         WHERE insumo_id = rbi.insumo_id
         ORDER BY fecha DESC LIMIT 1), 0
    ) * (1 + COALESCE(i.iva_porcentaje, 0) / 100.0)
      * (1 + COALESCE(i.merma_porcentaje, 0) / 100.0)
    FROM insumos i
    WHERE i.id = rbi.insumo_id
    AND rbi.receta_base_id = p_receta_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN 2: Recalcular costos de un plato específico
-- =====================================================
CREATE OR REPLACE FUNCTION recalcular_costo_plato(p_plato_id UUID)
RETURNS VOID AS $$
DECLARE
    v_costo_total DECIMAL(10,2);
BEGIN
    -- Calcular costo total del plato
    -- Suma de insumos directos + recetas base (por porción)
    SELECT COALESCE(SUM(
        CASE
            -- Si es insumo directo
            WHEN pi.insumo_id IS NOT NULL THEN
                pi.cantidad * COALESCE(
                    (SELECT precio FROM precios_insumo
                     WHERE insumo_id = pi.insumo_id
                     ORDER BY fecha DESC LIMIT 1), 0
                ) * (1 + COALESCE(i.iva_porcentaje, 0) / 100.0)
                  * (1 + COALESCE(i.merma_porcentaje, 0) / 100.0)
            -- Si es receta base
            WHEN pi.receta_base_id IS NOT NULL THEN
                pi.cantidad * COALESCE(rb.costo_por_porcion, 0)
            ELSE 0
        END
    ), 0)
    INTO v_costo_total
    FROM plato_ingredientes pi
    LEFT JOIN insumos i ON i.id = pi.insumo_id
    LEFT JOIN recetas_base rb ON rb.id = pi.receta_base_id
    WHERE pi.plato_id = p_plato_id;

    -- Actualizar plato
    UPDATE platos
    SET costo_total = v_costo_total,
        updated_at = NOW()
    WHERE id = p_plato_id;

    -- Actualizar costo_linea de cada ingrediente
    UPDATE plato_ingredientes pi
    SET costo_linea = CASE
        WHEN pi.insumo_id IS NOT NULL THEN
            pi.cantidad * COALESCE(
                (SELECT precio FROM precios_insumo
                 WHERE insumo_id = pi.insumo_id
                 ORDER BY fecha DESC LIMIT 1), 0
            ) * (1 + COALESCE(i.iva_porcentaje, 0) / 100.0)
              * (1 + COALESCE(i.merma_porcentaje, 0) / 100.0)
        WHEN pi.receta_base_id IS NOT NULL THEN
            pi.cantidad * COALESCE(rb.costo_por_porcion, 0)
        ELSE 0
    END
    FROM insumos i, recetas_base rb
    WHERE (i.id = pi.insumo_id OR pi.insumo_id IS NULL)
    AND (rb.id = pi.receta_base_id OR pi.receta_base_id IS NULL)
    AND pi.plato_id = p_plato_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN 3: Recalcular costos de un menú ejecutivo
-- =====================================================
CREATE OR REPLACE FUNCTION recalcular_costo_menu_ejecutivo(p_menu_id UUID)
RETURNS VOID AS $$
DECLARE
    v_costo_total DECIMAL(10,2);
    v_precio_carta DECIMAL(10,2);
    v_margen_objetivo DECIMAL(5,2);
BEGIN
    -- Obtener precio carta y margen objetivo actuales
    SELECT precio_carta, COALESCE(margen_objetivo, 30)
    INTO v_precio_carta, v_margen_objetivo
    FROM menus_ejecutivos
    WHERE id = p_menu_id;

    -- Calcular costo total del menú
    SELECT COALESCE(SUM(
        CASE
            -- Si es insumo directo
            WHEN mei.insumo_id IS NOT NULL THEN
                mei.cantidad * COALESCE(
                    (SELECT precio FROM precios_insumo
                     WHERE insumo_id = mei.insumo_id
                     ORDER BY fecha DESC LIMIT 1), 0
                ) * (1 + COALESCE(i.iva_porcentaje, 0) / 100.0)
                  * (1 + COALESCE(i.merma_porcentaje, 0) / 100.0)
            -- Si es receta base
            WHEN mei.receta_base_id IS NOT NULL THEN
                mei.cantidad * COALESCE(rb.costo_por_porcion, 0)
            -- Si es plato
            WHEN mei.plato_id IS NOT NULL THEN
                mei.cantidad * COALESCE(p.costo_total, 0)
            ELSE 0
        END
    ), 0)
    INTO v_costo_total
    FROM menu_ejecutivo_items mei
    LEFT JOIN insumos i ON i.id = mei.insumo_id
    LEFT JOIN recetas_base rb ON rb.id = mei.receta_base_id
    LEFT JOIN platos p ON p.id = mei.plato_id
    WHERE mei.menu_ejecutivo_id = p_menu_id;

    -- Actualizar menú con nuevos cálculos
    UPDATE menus_ejecutivos
    SET costo_total = v_costo_total,
        precio_sugerido = CASE
            WHEN v_margen_objetivo > 0 THEN v_costo_total / (v_margen_objetivo / 100.0)
            ELSE 0
        END,
        food_cost_real = CASE
            WHEN v_precio_carta > 0 THEN (v_costo_total / v_precio_carta) * 100
            ELSE 0
        END,
        updated_at = NOW()
    WHERE id = p_menu_id;

    -- Actualizar costo_linea de cada item
    UPDATE menu_ejecutivo_items mei
    SET costo_linea = CASE
        WHEN mei.insumo_id IS NOT NULL THEN
            mei.cantidad * COALESCE(
                (SELECT precio FROM precios_insumo
                 WHERE insumo_id = mei.insumo_id
                 ORDER BY fecha DESC LIMIT 1), 0
            ) * (1 + COALESCE(i.iva_porcentaje, 0) / 100.0)
              * (1 + COALESCE(i.merma_porcentaje, 0) / 100.0)
        WHEN mei.receta_base_id IS NOT NULL THEN
            mei.cantidad * COALESCE(rb.costo_por_porcion, 0)
        WHEN mei.plato_id IS NOT NULL THEN
            mei.cantidad * COALESCE(p.costo_total, 0)
        ELSE 0
    END
    FROM insumos i, recetas_base rb, platos p
    WHERE (i.id = mei.insumo_id OR mei.insumo_id IS NULL)
    AND (rb.id = mei.receta_base_id OR mei.receta_base_id IS NULL)
    AND (p.id = mei.plato_id OR mei.plato_id IS NULL)
    AND mei.menu_ejecutivo_id = p_menu_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN 4: Actualizar carta para un plato
-- =====================================================
CREATE OR REPLACE FUNCTION actualizar_carta_plato(p_plato_id UUID)
RETURNS VOID AS $$
DECLARE
    v_costo_plato DECIMAL(10,2);
BEGIN
    -- Obtener costo actual del plato
    SELECT costo_total INTO v_costo_plato
    FROM platos WHERE id = p_plato_id;

    -- Actualizar carta
    UPDATE carta
    SET precio_sugerido = CASE
            WHEN margen_objetivo > 0 THEN v_costo_plato / (margen_objetivo / 100.0)
            ELSE 0
        END,
        food_cost_real = CASE
            WHEN precio_carta > 0 THEN (v_costo_plato / precio_carta) * 100
            ELSE 0
        END,
        updated_at = NOW()
    WHERE plato_id = p_plato_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCIÓN PRINCIPAL: Propagar cambio de precio de insumo
-- =====================================================
CREATE OR REPLACE FUNCTION propagar_cambio_precio_insumo(p_insumo_id UUID)
RETURNS VOID AS $$
DECLARE
    r_receta RECORD;
    r_plato RECORD;
    r_menu RECORD;
BEGIN
    -- 1. Recalcular todas las recetas base que usan este insumo
    FOR r_receta IN
        SELECT DISTINCT receta_base_id
        FROM receta_base_ingredientes
        WHERE insumo_id = p_insumo_id
    LOOP
        PERFORM recalcular_costo_receta_base(r_receta.receta_base_id);
    END LOOP;

    -- 2. Recalcular todos los platos que usan este insumo directamente
    FOR r_plato IN
        SELECT DISTINCT plato_id
        FROM plato_ingredientes
        WHERE insumo_id = p_insumo_id
    LOOP
        PERFORM recalcular_costo_plato(r_plato.plato_id);
        PERFORM actualizar_carta_plato(r_plato.plato_id);
    END LOOP;

    -- 3. Recalcular platos que usan recetas base afectadas
    FOR r_plato IN
        SELECT DISTINCT pi.plato_id
        FROM plato_ingredientes pi
        JOIN receta_base_ingredientes rbi ON rbi.receta_base_id = pi.receta_base_id
        WHERE rbi.insumo_id = p_insumo_id
    LOOP
        PERFORM recalcular_costo_plato(r_plato.plato_id);
        PERFORM actualizar_carta_plato(r_plato.plato_id);
    END LOOP;

    -- 4. Recalcular menús ejecutivos que usan este insumo directamente
    FOR r_menu IN
        SELECT DISTINCT menu_ejecutivo_id
        FROM menu_ejecutivo_items
        WHERE insumo_id = p_insumo_id
    LOOP
        PERFORM recalcular_costo_menu_ejecutivo(r_menu.menu_ejecutivo_id);
    END LOOP;

    -- 5. Recalcular menús que usan recetas base afectadas
    FOR r_menu IN
        SELECT DISTINCT mei.menu_ejecutivo_id
        FROM menu_ejecutivo_items mei
        JOIN receta_base_ingredientes rbi ON rbi.receta_base_id = mei.receta_base_id
        WHERE rbi.insumo_id = p_insumo_id
    LOOP
        PERFORM recalcular_costo_menu_ejecutivo(r_menu.menu_ejecutivo_id);
    END LOOP;

    -- 6. Recalcular menús que usan platos afectados
    FOR r_menu IN
        SELECT DISTINCT mei.menu_ejecutivo_id
        FROM menu_ejecutivo_items mei
        JOIN plato_ingredientes pi ON pi.plato_id = mei.plato_id
        WHERE pi.insumo_id = p_insumo_id
    LOOP
        PERFORM recalcular_costo_menu_ejecutivo(r_menu.menu_ejecutivo_id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: Ejecutar cuando se inserta un nuevo precio
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_nuevo_precio_insumo()
RETURNS TRIGGER AS $$
BEGIN
    -- Propagar el cambio de precio
    PERFORM propagar_cambio_precio_insumo(NEW.insumo_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS trg_precio_insumo_insertado ON precios_insumo;

-- Crear trigger
CREATE TRIGGER trg_precio_insumo_insertado
AFTER INSERT ON precios_insumo
FOR EACH ROW
EXECUTE FUNCTION trigger_nuevo_precio_insumo();

-- =====================================================
-- FUNCIÓN ÚTIL: Recalcular TODO (por si necesitás forzar)
-- =====================================================
CREATE OR REPLACE FUNCTION recalcular_todos_los_costos()
RETURNS TEXT AS $$
DECLARE
    r_receta RECORD;
    r_plato RECORD;
    r_menu RECORD;
    v_recetas INT := 0;
    v_platos INT := 0;
    v_menus INT := 0;
BEGIN
    -- Recalcular todas las recetas base
    FOR r_receta IN SELECT id FROM recetas_base WHERE activo = true
    LOOP
        PERFORM recalcular_costo_receta_base(r_receta.id);
        v_recetas := v_recetas + 1;
    END LOOP;

    -- Recalcular todos los platos
    FOR r_plato IN SELECT id FROM platos WHERE activo = true
    LOOP
        PERFORM recalcular_costo_plato(r_plato.id);
        PERFORM actualizar_carta_plato(r_plato.id);
        v_platos := v_platos + 1;
    END LOOP;

    -- Recalcular todos los menús ejecutivos
    FOR r_menu IN SELECT id FROM menus_ejecutivos WHERE activo = true
    LOOP
        PERFORM recalcular_costo_menu_ejecutivo(r_menu.id);
        v_menus := v_menus + 1;
    END LOOP;

    RETURN 'Recalculados: ' || v_recetas || ' elaboraciones, ' || v_platos || ' platos, ' || v_menus || ' menús';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTARIOS
-- =====================================================
COMMENT ON FUNCTION propagar_cambio_precio_insumo IS 'Propaga el cambio de precio de un insumo a todas las recetas, platos y menús que lo usan';
COMMENT ON FUNCTION recalcular_todos_los_costos IS 'Recalcula todos los costos del sistema. Ejecutar: SELECT recalcular_todos_los_costos();';
