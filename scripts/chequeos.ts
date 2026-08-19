/**
 * Invariantes de la base — las cosas que tienen que ser ciertas siempre.
 *
 * CADA UNO SALE DE ALGO QUE YA SE ROMPIÓ. No son chequeos hipotéticos: son las
 * trampas documentadas en CLAUDE.md, convertidas en algo que se puede correr en
 * diez segundos en vez de descubrirlo cuando un número sale raro.
 *
 * La idea es correr `npm run consultar -- chequeos` antes de un push que toque
 * datos, y después de correr cualquier `.sql` en Supabase.
 *
 * Para agregar uno: que `problemaSi` devuelva true SOLO cuando hay algo mal.
 * Un chequeo que grita seguido se ignora a la semana.
 */

export interface Chequeo {
  nombre: string
  descripcion: string
  sql: string
  /** true si el resultado indica un problema */
  problemaSi: (filas: any[]) => boolean
  /** Qué hacer si salta */
  queSignifica: string
  /**
   * Cuántas filas mira este chequeo. Tiene que devolver una columna `n`.
   *
   * POR QUÉ EXISTE: un chequeo que busca anomalías da verde de dos formas —
   * porque no hay anomalías, o porque no vio ningún dato. Las dos se ven
   * idénticas y la segunda es una mentira peligrosa.
   *
   * Pasó el 19/08/26, la primera vez que se corrió esto: el rol de lectura no
   * podía ver `consumo_diario` ni `ventas_diarias` porque sus policies son
   * `to authenticated` y el rol no lo es. Postgres devolvía cero filas sin
   * error, y los siete chequeos dieron verde sobre tablas vacías.
   */
  universo: string
}

export const CHEQUEOS: Chequeo[] = [
  {
    nombre: 'precios-vigentes',
    universo: `SELECT COUNT(*) AS n FROM precios_insumo WHERE es_precio_actual`,
    descripcion: 'Un insumo, un solo precio vigente',
    sql: `
      SELECT i.nombre, COUNT(*) AS precios_vigentes
        FROM precios_insumo p
        JOIN insumos i ON i.id = p.insumo_id
       WHERE p.es_precio_actual
       GROUP BY i.id, i.nombre
      HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC, i.nombre
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'La vista v_insumos_con_precio devuelve el insumo duplicado y las pantallas toman "el ' +
      'primero que llega": el costo de las recetas queda al azar. Pasó el 14/08/26 con el queso ' +
      'brie, costeando con un precio de junio. Ver supabase-fix-precio-vigente-unico.sql.',
  },

  {
    nombre: 'consumo-cuadra',
    universo: `SELECT COUNT(*) AS n FROM consumo_diario`,
    descripcion: 'cocina + bebidas = total, en cada servicio',
    sql: `
      SELECT fecha, servicio,
             costo_cocina, costo_barra, costo_total,
             ROUND(costo_cocina + costo_barra - costo_total, 2) AS diferencia
        FROM consumo_diario
       WHERE ROUND(costo_cocina + costo_barra, 2) <> ROUND(costo_total, 2)
       ORDER BY fecha DESC
       LIMIT 20
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'Hay items que no entraron en ninguno de los dos lados. La causa típica es una comparación ' +
      'con NULL en la función actualizar_costos_consumo(): `p.seccion = \'Bebidas\'` no da falso ' +
      'cuando la sección es NULL, da NULL, y la fila se cae de las dos sumas.',
  },

  {
    nombre: 'facturas-duplicadas',
    universo: `SELECT COUNT(*) AS n FROM facturas_proveedor WHERE activo`,
    descripcion: 'Un comprobante por proveedor',
    sql: `
      SELECT p.nombre AS proveedor, f.numero_factura, COUNT(*) AS veces
        FROM facturas_proveedor f
        JOIN proveedores p ON p.id = f.proveedor_id
       WHERE f.activo
         AND f.numero_factura IS NOT NULL
         AND TRIM(f.numero_factura) <> ''
       GROUP BY p.id, p.nombre, f.numero_factura
      HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'La misma factura cargada dos veces infla las compras y el food cost del período. Hay un ' +
      'índice único que lo impide (supabase-factura-unica-por-proveedor.sql); si aparecen filas ' +
      'acá, el índice no está.',
  },

  {
    nombre: 'items-sin-fk',
    universo: `SELECT COUNT(*) AS n FROM consumo_items`,
    descripcion: 'Cada item de consumo apunta a algo que existe',
    sql: `
      SELECT ci.tipo, COUNT(*) AS huerfanos
        FROM consumo_items ci
        LEFT JOIN insumos          i  ON i.id  = ci.insumo_id
        LEFT JOIN recetas_base     rb ON rb.id = ci.receta_base_id
        LEFT JOIN platos           p  ON p.id  = ci.plato_id
        LEFT JOIN tragos           t  ON t.id  = ci.trago_id
        LEFT JOIN menus_ejecutivos m  ON m.id  = ci.menu_ejecutivo_id
        LEFT JOIN vinos            v  ON v.id  = ci.vino_id
       WHERE (ci.insumo_id          IS NOT NULL AND i.id  IS NULL)
          OR (ci.receta_base_id     IS NOT NULL AND rb.id IS NULL)
          OR (ci.plato_id           IS NOT NULL AND p.id  IS NULL)
          OR (ci.trago_id           IS NOT NULL AND t.id  IS NULL)
          OR (ci.menu_ejecutivo_id  IS NOT NULL AND m.id  IS NULL)
          OR (ci.vino_id            IS NOT NULL AND v.id  IS NULL)
       GROUP BY ci.tipo
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'Hay consumo cargado contra un item que ya no existe. Esas líneas desaparecen del desglose ' +
      'pero siguen sumando en el costo total, así que el desglose no cierra contra el encabezado.',
  },

  {
    nombre: 'carta-sin-precio',
    universo: `SELECT COUNT(*) AS n FROM carta WHERE activo`,
    descripcion: 'Los platos de la carta tienen precio',
    sql: `
      SELECT p.seccion, p.nombre
        FROM carta c
        JOIN platos p ON p.id = c.plato_id
       WHERE c.activo
         AND (c.precio_carta IS NULL OR c.precio_carta <= 0)
       ORDER BY p.seccion, p.nombre
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'Sin precio no hay facturación ni contribución: el producto aparece en el Ranking como ' +
      '"Sin precio" y queda afuera de la matriz de ingeniería de menú.',
  },

  {
    nombre: 'anon-sin-permisos',
    universo: `SELECT COUNT(*) AS n FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    descripcion: 'La clave pública no tiene acceso a NADA',
    sql: `
      -- Del CATÁLOGO, no de information_schema: esa vista solo muestra los
      -- permisos que involucran al rol que consulta, así que el rol lector veía
      -- CERO y el chequeo daba verde con anon teniendo 8 columnas concedidas.
      -- Un chequeo de seguridad que mira el lugar equivocado es peor que
      -- ninguno. (Encontrado el 19/08/26.)
      SELECT c.relname AS tabla,
             COALESCE(a.attname, '(toda la tabla)') AS columna,
             acl.privilege_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
        CROSS JOIN LATERAL aclexplode(COALESCE(a.attacl, c.relacl)) acl
        JOIN pg_roles r ON r.oid = acl.grantee
       WHERE n.nspname = 'public' AND r.rolname = 'anon'
       ORDER BY c.relname, columna
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'La clave anónima viaja dentro del JavaScript público, así que cualquiera la saca del ' +
      'navegador. Hasta el 13/08/26 había 22 tablas legibles sin login — 3.539 precios, 476 ' +
      'facturas, los márgenes. Desde V.41 no debe tener NI UNA columna: al sacarse el menú del ' +
      'QR no quedó ninguna pantalla que muestre datos sin sesión. Ver ' +
      'supabase-cerrar-anon-total.sql.',
  },

  {
    nombre: 'tablas-sin-rls',
    universo: `SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname='public'`,
    descripcion: 'Toda tabla de public tiene RLS activa',
    sql: `
      SELECT tablename
        FROM pg_tables
       WHERE schemaname = 'public'
         AND NOT rowsecurity
       ORDER BY tablename
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'Una tabla sin RLS queda expuesta a cualquiera que tenga el GRANT. Es la convención ' +
      'obligatoria para tablas nuevas: GRANT + RLS + policy, los tres. Y va a importar mucho más ' +
      'cuando el sistema pase a multiusuario, porque ahí una tabla sin RLS mezcla datos de dos ' +
      'restaurantes.',
  },

  {
    nombre: 'aislado-por-cliente',
    universo: `SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname='public'`,
    descripcion: 'Cada tabla filtra por restaurante (para el multiusuario)',
    sql: `
      SELECT t.tablename,
             COALESCE(
               STRING_AGG(DISTINCT p.roles::text, ', '),
               'SIN POLICY'
             ) AS para_quien,
             COUNT(p.policyname) FILTER (
               WHERE COALESCE(p.qual, '') ILIKE '%restaurante%'
                  OR COALESCE(p.qual, '') ILIKE '%tenant%'
                  OR COALESCE(p.qual, '') ILIKE '%auth.uid()%'
             ) AS policies_que_filtran
        FROM pg_tables t
        LEFT JOIN pg_policies p
               ON p.schemaname = t.schemaname AND p.tablename = t.tablename
       WHERE t.schemaname = 'public'
       GROUP BY t.tablename
      HAVING COUNT(p.policyname) FILTER (
               WHERE COALESCE(p.qual, '') ILIKE '%restaurante%'
                  OR COALESCE(p.qual, '') ILIKE '%tenant%'
                  OR COALESCE(p.qual, '') ILIKE '%auth.uid()%'
             ) = 0
       ORDER BY t.tablename
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'Estas tablas no filtran por dueño: sus policies dicen USING (true), o sea "todos ven ' +
      'todo". Con un solo restaurante no molesta —todos sos vos— pero el día que haya dos, cada ' +
      'una de estas es una tabla donde uno ve los datos del otro. Al 19/08/26 son 31 de 32; la ' +
      'única preparada es `perfiles`. ESTE CHEQUEO VA A ESTAR EN ROJO HASTA LA MIGRACIÓN: sirve ' +
      'para medir el avance, y el objetivo es que llegue a cero antes de dar de alta al segundo ' +
      'cliente.',
  },

  {
    nombre: 'notas-bloques',
    universo: `SELECT COUNT(*) AS n FROM pg_constraint
                WHERE conrelid = 'public.notas_auditoria'::regclass AND contype = 'c'`,
    descripcion: 'La base acepta todos los tipos de nota que usa el código',
    sql: `
      -- Los valores salen del type BloqueAuditoria en src/lib/auditoria-semanal.ts.
      -- Si se agrega uno allá y no acá, el INSERT lo rechaza y la pantalla solo
      -- dice "no se pudo guardar".
      SELECT b AS bloque_que_falta
        FROM unnest(ARRAY['faltante', 'cambio_precio', 'precio_distinto', 'agregado', 'orden_sin_factura', 'item_factura']) AS b
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.notas_auditoria'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%' || b || '%'
       )
    `,
    problemaSi: (f) => f.length > 0,
    queSignifica:
      'El código puede mandar estos bloques y el CHECK de notas_auditoria no los acepta: ' +
      'guardar la nota falla siempre. Pasó con `item_factura`, que se agregó en V.27 y quedó ' +
      'roto tres meses — lo encontró el usuario intentando comentar una factura, no un test. ' +
      'Ver supabase-notas-item-factura.sql.',
  },
]
