-- =====================================================
-- FIX: un solo precio vigente por insumo, garantizado
-- =====================================================
--
-- EL PROBLEMA (14/08/26): "Queso brie" aparecía tres veces en los buscadores
-- con tres precios distintos ($7.840, $17.514 y $17.020). No eran tres
-- insumos: era UN insumo con TRES filas marcadas `es_precio_actual = true`.
--
-- Consecuencia real: la vista v_insumos_con_precio devuelve una fila por cada
-- precio vigente, y las pantallas hacen `.find(...)` sobre esa lista, o sea que
-- toman "la primera que llega" SIN ORDEN GARANTIZADO. El costo de las recetas
-- pasaba a depender del azar: ese día costeaba con $14.066 (junio) cuando el
-- precio real era $14.474, y en la siguiente carga podía tocarle $6.479 —la
-- mitad— sin que nada avisara.
--
-- LA CAUSA: había DOS triggers BEFORE DELETE sobre factura_items haciendo el
-- mismo trabajo:
--
--   trg_factura_item_eliminado       -> revertir_precio_item_eliminado
--   trigger_revertir_precio_factura  -> revertir_precio_al_eliminar_factura
--
-- Los dos buscan "el precio apagado más reciente" y lo encienden. Corren en
-- secuencia: el primero enciende uno, y el segundo —al encontrarlo ya
-- encendido— sigue de largo y enciende el siguiente. Dos vigentes por cada
-- borrado. Y editar una factura borra todos sus ítems y los reinserta, así
-- que esto corría en CADA edición.
--
-- =====================================================
-- QUÉ HACE ESTE ARCHIVO
--   1. Elimina el trigger y la función duplicados.
--   2. Elimina `actualizar_precio_insumo_desde_factura`, código muerto que
--      ningún trigger usa y que llama a una función inexistente.
--   3. Reescribe la reversión para BORRAR ANTES DE ENCENDER (ver más abajo).
--   4. Agrega un índice único parcial que hace IMPOSIBLE el estado inválido.
-- =====================================================


-- =====================================================
-- 1. FUERA EL TRIGGER DUPLICADO
-- =====================================================

DROP TRIGGER IF EXISTS trigger_revertir_precio_factura ON public.factura_items;
DROP FUNCTION IF EXISTS public.revertir_precio_al_eliminar_factura();


-- =====================================================
-- 2. FUERA EL CÓDIGO MUERTO
-- =====================================================
-- No la usa ningún trigger (verificado en pg_trigger el 14/08/26), inserta el
-- precio SIN aplicar el descuento del proveedor —criterio viejo, corregido en
-- V.16— y llama a `propagar_cambio_precio_insumo`, que no existe. Si alguien
-- la enganchara por error, rompería la carga de facturas.

DROP FUNCTION IF EXISTS public.actualizar_precio_insumo_desde_factura();


-- =====================================================
-- 3. REVERSIÓN: BORRAR PRIMERO, ENCENDER DESPUÉS
-- =====================================================
-- El orden importa por el índice del paso 4. La versión anterior encendía el
-- precio viejo y RECIÉN DESPUÉS borraba el de la factura, así que había un
-- instante con dos vigentes. Con el índice único eso falla. Invertido, nunca
-- hay más de uno.

CREATE OR REPLACE FUNCTION public.revertir_precio_item_eliminado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_precio_anterior_id UUID;
  v_precio_factura_id UUID;
BEGIN
  -- Vinos: no tocan precios_insumo
  IF OLD.insumo_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT id INTO v_precio_factura_id
  FROM precios_insumo
  WHERE factura_item_id = OLD.id;

  IF v_precio_factura_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- 1º borrar el precio que aportaba esta línea
  DELETE FROM precios_insumo WHERE id = v_precio_factura_id;

  -- 2º recién ahora, si no quedó ninguno vigente, encender el anterior
  IF NOT EXISTS (
    SELECT 1 FROM precios_insumo
    WHERE insumo_id = OLD.insumo_id AND es_precio_actual
  ) THEN
    SELECT id INTO v_precio_anterior_id
    FROM precios_insumo
    WHERE insumo_id = OLD.insumo_id
    ORDER BY fecha DESC, created_at DESC
    LIMIT 1;

    IF v_precio_anterior_id IS NOT NULL THEN
      UPDATE precios_insumo SET es_precio_actual = true WHERE id = v_precio_anterior_id;
    END IF;
  END IF;

  PERFORM propagar_costo_insumo(OLD.insumo_id);

  RETURN OLD;
END;
$function$;


-- =====================================================
-- 3 bis. ANULACIÓN DE FACTURA: mismo criterio
-- =====================================================
-- Tenía el mismo orden invertido: encendía el anterior y después apagaba el de
-- la factura. Con el índice único, eso falla.

CREATE OR REPLACE FUNCTION public.revertir_precios_factura_anulada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_precio_anterior_id UUID;
  v_precio_factura_id UUID;
BEGIN
  IF OLD.activo = true AND NEW.activo = false THEN
    FOR v_item IN
      SELECT fi.id AS factura_item_id, fi.insumo_id
      FROM factura_items fi
      WHERE fi.factura_id = NEW.id AND fi.insumo_id IS NOT NULL
    LOOP
      SELECT id INTO v_precio_factura_id
      FROM precios_insumo
      WHERE factura_item_id = v_item.factura_item_id;

      IF v_precio_factura_id IS NOT NULL THEN
        -- 1º apagar el de la factura anulada
        UPDATE precios_insumo SET es_precio_actual = false WHERE id = v_precio_factura_id;

        -- 2º si no quedó ninguno vigente, encender el más reciente que quede
        IF NOT EXISTS (
          SELECT 1 FROM precios_insumo
          WHERE insumo_id = v_item.insumo_id AND es_precio_actual
        ) THEN
          SELECT id INTO v_precio_anterior_id
          FROM precios_insumo
          WHERE insumo_id = v_item.insumo_id
            AND id <> v_precio_factura_id
          ORDER BY fecha DESC, created_at DESC
          LIMIT 1;

          IF v_precio_anterior_id IS NOT NULL THEN
            UPDATE precios_insumo SET es_precio_actual = true WHERE id = v_precio_anterior_id;
          END IF;
        END IF;

        PERFORM propagar_costo_insumo(v_item.insumo_id);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;


-- =====================================================
-- 4. LA RED DE SEGURIDAD
-- =====================================================
-- Hasta hoy, NADA en la base impedía que un insumo tuviera dos precios
-- vigentes. Los triggers eran la única defensa, y cuando uno falló el dato
-- quedó corrupto en silencio durante semanas.
--
-- Con este índice, el próximo intento de crear un segundo precio vigente falla
-- EN EL MOMENTO, con error visible, en vez de dejar costos al azar.
--
-- Es parcial (`where es_precio_actual`) porque el historial sí puede tener
-- muchas filas por insumo: lo único único es el vigente.

CREATE UNIQUE INDEX IF NOT EXISTS precios_insumo_un_vigente_por_insumo
  ON public.precios_insumo (insumo_id)
  WHERE es_precio_actual;


-- =====================================================
-- 5. VERIFICACIÓN
-- =====================================================

-- 5.1 Queda un solo trigger de reversión sobre factura_items
SELECT c.relname AS tabla, t.tgname AS trigger, p.proname AS funcion
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p  ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
  AND c.relname = 'factura_items'
ORDER BY t.tgname;

-- 5.2 El índice existe
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'precios_insumo'
  AND indexname = 'precios_insumo_un_vigente_por_insumo';

-- 5.3 Ningún insumo con más de un precio vigente (tiene que dar 0)
SELECT COUNT(*) FILTER (WHERE vigentes > 1) AS con_mas_de_uno
FROM (
  SELECT insumo_id, COUNT(*) AS vigentes
  FROM precios_insumo WHERE es_precio_actual GROUP BY insumo_id
) x;
