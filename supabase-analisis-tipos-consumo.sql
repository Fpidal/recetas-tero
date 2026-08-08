-- =====================================================
-- ANÁLISIS: nuevos tipos de consumo + costo Cocina / Barra
-- =====================================================
-- Agrega a la carga diaria los tipos `trago`, `ejecutivo` y `vino`,
-- y separa el costo del servicio en Cocina y Barra.
--
-- 100% ADITIVO: no borra ni migra datos. Las filas existentes
-- (insumo / elaboracion / receta) quedan intactas y se imputan
-- a Cocina, que es donde estaban conceptualmente.
--
-- NOTA SOBRE `vino`: la columna `vino_id` y el tipo 'vino' se crean
-- acá aunque el frontend todavía no los use. El vino no desglosa a
-- insumos (no es un insumo), así que su pantalla va en un segundo
-- paso. Se migra la base una sola vez para no repetir este script.
--
-- ⚠️ Los CHECK originales de consumo_items se crearon inline, así que
-- Postgres les puso nombres auto-generados. Este script los descubre
-- y los reemplaza por constraints con nombre explícito, para que el
-- próximo cambio no tenga que adivinar cómo se llaman.
-- =====================================================


-- =====================================================
-- 0. RESPALDO DE LA DEFINICIÓN VIEJA
-- =====================================================
-- El paso 4 hace CREATE OR REPLACE sobre `recalcular_costo_consumo`.
-- Si la versión viva de Supabase tenía algo que el repo no documenta, se
-- perdería en silencio — que es exactamente el problema que nos costó una
-- hora en V.20. Esto la imprime en el panel "Notices" ANTES de pisarla.
--
-- Si al correr esto ves algo distinto a la función del repo (un UPDATE simple
-- de costo_total), PARÁ y avisá antes de seguir.

DO $$
DECLARE definicion TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO definicion
  FROM pg_proc WHERE proname = 'recalcular_costo_consumo' LIMIT 1;

  IF definicion IS NULL THEN
    RAISE NOTICE 'No existía recalcular_costo_consumo(). Se crea nueva.';
  ELSE
    RAISE NOTICE E'=== DEFINICIÓN ANTERIOR (respaldo) ===\n%', definicion;
  END IF;
END $$;


-- =====================================================
-- 1. NUEVAS COLUMNAS FK
-- =====================================================

ALTER TABLE public.consumo_items
  ADD COLUMN IF NOT EXISTS trago_id          UUID REFERENCES public.tragos(id)            ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS menu_ejecutivo_id UUID REFERENCES public.menus_ejecutivos(id)  ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS vino_id           UUID REFERENCES public.vinos(id)             ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_consumo_items_trago     ON public.consumo_items(trago_id);
CREATE INDEX IF NOT EXISTS idx_consumo_items_ejecutivo ON public.consumo_items(menu_ejecutivo_id);
CREATE INDEX IF NOT EXISTS idx_consumo_items_vino      ON public.consumo_items(vino_id);


-- =====================================================
-- 2. REEMPLAZAR LOS CHECK POR OTROS CON NOMBRE EXPLÍCITO
-- =====================================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.consumo_items'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.consumo_items DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'CHECK eliminado: %', c.conname;
  END LOOP;
END $$;

ALTER TABLE public.consumo_items
  ADD CONSTRAINT consumo_items_cantidad_positiva
  CHECK (cantidad > 0);

ALTER TABLE public.consumo_items
  ADD CONSTRAINT consumo_items_tipo_valido
  CHECK (tipo IN ('insumo', 'elaboracion', 'receta', 'trago', 'ejecutivo', 'vino'));

-- Exactamente UNA FK cargada, y que sea la que corresponde al tipo.
ALTER TABLE public.consumo_items
  ADD CONSTRAINT consumo_items_fk_coherente
  CHECK (
    (
      (insumo_id         IS NOT NULL)::int +
      (receta_base_id    IS NOT NULL)::int +
      (plato_id          IS NOT NULL)::int +
      (trago_id          IS NOT NULL)::int +
      (menu_ejecutivo_id IS NOT NULL)::int +
      (vino_id           IS NOT NULL)::int
    ) = 1
    AND CASE tipo
      WHEN 'insumo'      THEN insumo_id         IS NOT NULL
      WHEN 'elaboracion' THEN receta_base_id    IS NOT NULL
      WHEN 'receta'      THEN plato_id          IS NOT NULL
      WHEN 'trago'       THEN trago_id          IS NOT NULL
      WHEN 'ejecutivo'   THEN menu_ejecutivo_id IS NOT NULL
      WHEN 'vino'        THEN vino_id           IS NOT NULL
      ELSE false
    END
  );


-- =====================================================
-- 3. COSTO SEPARADO COCINA / BARRA
-- =====================================================
-- `costo_total` NO cambia de significado: sigue siendo el total del
-- servicio (= cocina + barra). Todo lo que ya lo lee sigue andando
-- igual, sin tocar una línea.

ALTER TABLE public.consumo_diario
  ADD COLUMN IF NOT EXISTS costo_cocina DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_barra  DECIMAL(12,2) NOT NULL DEFAULT 0;


-- =====================================================
-- 4. TRIGGER: recalcular los tres totales
-- =====================================================
-- ⚠️ QUÉ TIPOS SON BARRA vive en DOS lugares, y solo dos:
--      Base     → esta función
--      Frontend → TIPOS_BARRA en src/types/analisis.ts
--    Si se toca uno, se toca el otro.

CREATE OR REPLACE FUNCTION recalcular_costo_consumo()
RETURNS TRIGGER AS $$
DECLARE
  consumo_id_target UUID;
BEGIN
  consumo_id_target := COALESCE(NEW.consumo_id, OLD.consumo_id);

  UPDATE consumo_diario
  SET
    costo_cocina = COALESCE((
      SELECT SUM(subtotal) FROM consumo_items
      WHERE consumo_id = consumo_id_target
        AND tipo NOT IN ('trago', 'vino')
    ), 0),
    costo_barra = COALESCE((
      SELECT SUM(subtotal) FROM consumo_items
      WHERE consumo_id = consumo_id_target
        AND tipo IN ('trago', 'vino')
    ), 0),
    costo_total = COALESCE((
      SELECT SUM(subtotal) FROM consumo_items
      WHERE consumo_id = consumo_id_target
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
-- 5. BACKFILL de los consumos que ya existen
-- =====================================================
-- El WHERE es obligatorio: Supabase rechaza UPDATE sin WHERE (21000).

UPDATE consumo_diario cd
SET
  costo_cocina = COALESCE((
    SELECT SUM(ci.subtotal) FROM consumo_items ci
    WHERE ci.consumo_id = cd.id AND ci.tipo NOT IN ('trago', 'vino')
  ), 0),
  costo_barra = COALESCE((
    SELECT SUM(ci.subtotal) FROM consumo_items ci
    WHERE ci.consumo_id = cd.id AND ci.tipo IN ('trago', 'vino')
  ), 0),
  costo_total = COALESCE((
    SELECT SUM(ci.subtotal) FROM consumo_items ci
    WHERE ci.consumo_id = cd.id
  ), 0)
WHERE cd.id IS NOT NULL;


-- =====================================================
-- 6. VERIFICACIÓN
-- =====================================================

-- Los tres CHECK con nombre explícito
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.consumo_items'::regclass AND contype = 'c'
ORDER BY conname;

-- Los totales tienen que cerrar: cocina + barra = total
SELECT
  COUNT(*)                                                              AS consumos,
  COUNT(*) FILTER (WHERE ROUND(costo_cocina + costo_barra, 2)
                       = ROUND(costo_total, 2))                         AS cierran_ok,
  COUNT(*) FILTER (WHERE ROUND(costo_cocina + costo_barra, 2)
                      <> ROUND(costo_total, 2))                         AS con_diferencia
FROM consumo_diario;
