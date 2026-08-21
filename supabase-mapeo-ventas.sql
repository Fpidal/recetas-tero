-- =====================================================
-- MAPEO DE PRODUCTOS DEL SISTEMA DE VENTAS
-- =====================================================
--
-- PARA QUE: el Excel del sistema de ventas trae los productos con SU nombre y
-- SU codigo, que no coinciden con los del recetario. "Costilla" alla es
-- "Costillar al Horno en su Jugo" aca; "Muzzarella Apanada" es "Muzzarelitas
-- apanadas". De 45 productos cobrados en el archivo del 24/07, 20 coincidian
-- solos por nombre, 16 a medias y 9 nada.
--
-- El enlace se hace UNA VEZ POR CODIGO y queda guardado. Los codigos del
-- sistema de ventas son estables, asi que la segunda importacion reconoce todo
-- sin preguntar. Es el mismo patron de `proveedor_mapeo_excel`, que ya se usa
-- para las listas de precios de proveedores.
--
-- POR QUE `ignorar`: hay filas del archivo que no son un producto del
-- recetario. El "Cubierto" es la mas clara — son $135.000 que van a la venta
-- del dia pero no se cargan como consumo de ningun plato. Sin esta marca,
-- quedarian preguntando para siempre en cada importacion.
--
-- LAS FILAS EN $0 NO SE MAPEAN. Son componentes que ya vienen adentro de un
-- menu: "Ensalada rusa M. PESCADO" son las mismas 9 unidades que el "Menu
-- Pescado" que si se cobro. Cargarlas duplicaria su costo. El archivo ya las
-- distingue dejandolas en cero, asi que la regla sale del propio dato.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.mapeo_ventas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- El codigo tal cual viene del sistema de ventas
  codigo        TEXT NOT NULL UNIQUE,
  -- Como se llama alla. Solo para reconocerlo al revisar el mapeo.
  nombre_origen TEXT NOT NULL,

  -- A que apunta. Mismas FKs que consumo_items, por coherencia.
  tipo          TEXT CHECK (tipo IN ('insumo','elaboracion','receta','trago','ejecutivo','vino')),
  insumo_id         UUID REFERENCES public.insumos(id)            ON DELETE SET NULL,
  receta_base_id    UUID REFERENCES public.recetas_base(id)       ON DELETE SET NULL,
  plato_id          UUID REFERENCES public.platos(id)             ON DELETE SET NULL,
  trago_id          UUID REFERENCES public.tragos(id)             ON DELETE SET NULL,
  menu_ejecutivo_id UUID REFERENCES public.menus_ejecutivos(id)   ON DELETE SET NULL,
  vino_id           UUID REFERENCES public.vinos(id)              ON DELETE SET NULL,

  -- Para el Cubierto y cualquier fila que no sea un producto del recetario
  ignorar       BOOLEAN NOT NULL DEFAULT false,

  created_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

  -- O apunta a algo, o esta ignorado. Un mapeo a medias es peor que ninguno:
  -- la importacion lo daria por resuelto y no cargaria nada.
  CONSTRAINT mapeo_ventas_resuelto CHECK (
    ignorar = true OR (
      tipo IS NOT NULL AND (
        (tipo = 'insumo'      AND insumo_id         IS NOT NULL) OR
        (tipo = 'elaboracion' AND receta_base_id    IS NOT NULL) OR
        (tipo = 'receta'      AND plato_id          IS NOT NULL) OR
        (tipo = 'trago'       AND trago_id          IS NOT NULL) OR
        (tipo = 'ejecutivo'   AND menu_ejecutivo_id IS NOT NULL) OR
        (tipo = 'vino'        AND vino_id           IS NOT NULL)
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_mapeo_ventas_codigo ON public.mapeo_ventas (codigo);

COMMENT ON TABLE public.mapeo_ventas IS
  'Enlace entre los productos del sistema de ventas y los del recetario. Una '
  'fila por codigo de origen; se resuelve una vez y se reutiliza.';


-- =====================================================
-- PERMISOS: GRANT + RLS + POLICY
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapeo_ventas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapeo_ventas TO service_role;

ALTER TABLE public.mapeo_ventas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo autenticados"
  ON public.mapeo_ventas FOR ALL
  TO authenticated
  USING (true);


-- =====================================================
-- DE DONDE VINO CADA LINEA DE CONSUMO
-- =====================================================
-- Sin esto, reimportar el mismo dia duplicaria todo: no habria forma de saber
-- que linea ya existia. Con el codigo de origen, la importacion actualiza en
-- vez de agregar.
--
-- NULL = cargado a mano, que es como estan todas las lineas hasta hoy.

ALTER TABLE public.consumo_items
  ADD COLUMN IF NOT EXISTS origen_codigo TEXT;

CREATE INDEX IF NOT EXISTS idx_consumo_items_origen
  ON public.consumo_items (consumo_id, origen_codigo)
  WHERE origen_codigo IS NOT NULL;

COMMENT ON COLUMN public.consumo_items.origen_codigo IS
  'Codigo del producto en el sistema de ventas, si la linea vino de una '
  'importacion. NULL si se cargo a mano.';


SELECT 'mapeo_ventas' AS tabla, COUNT(*) AS filas FROM public.mapeo_ventas;
