import { supabase } from './supabase'
import { costoFinalInsumo } from './costos'
import { descargarExcel, hoyISO, type Hoja } from './exportar-excel'

/**
 * Los seis exportadores a Excel.
 *
 * QUÉ EXPORTAN: la foto completa de lo activo, no lo que está filtrado en
 * pantalla. El objetivo es pasarle los datos a otra aplicación o guardarlos
 * afuera, y para eso "todo" es más útil que "lo que estoy mirando".
 * Facturas y órdenes aceptan un rango de fechas porque crecen sin techo.
 *
 * ⚠️ TODO SE TRAE PAGINADO. PostgREST devuelve como máximo 1000 filas aunque
 * no se pida límite: `factura_items` ya pasó las 2300. Sin paginar, el archivo
 * saldría incompleto y sin ningún error a la vista. Ya nos pasó con los precios
 * (V.22), donde 63 insumos no mostraban su variación por este mismo corte.
 */

const TAMANO_PAGINA = 1000
const MAX_PAGINAS = 100

/** Trae una tabla entera, de a 1000, aplicando los filtros que se le pasen. */
async function traerTodo<T = any>(
  tabla: string,
  select: string,
  filtros?: (q: any) => any
): Promise<T[]> {
  const todos: T[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * TAMANO_PAGINA
    let q = supabase.from(tabla).select(select).range(desde, desde + TAMANO_PAGINA - 1)
    if (filtros) q = filtros(q)

    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break

    todos.push(...(data as T[]))
    if (data.length < TAMANO_PAGINA) break
  }
  return todos
}

/** Mapa id → datos del insumo, para no repetir joins en cada hoja de detalle */
async function mapaInsumos(): Promise<Map<string, { nombre: string; unidad: string; iva: number }>> {
  const insumos = await traerTodo<any>('insumos', 'id, nombre, unidad_medida, iva_porcentaje')
  return new Map(
    insumos.map((i) => [
      i.id,
      { nombre: i.nombre, unidad: i.unidad_medida, iva: Number(i.iva_porcentaje ?? 21) },
    ])
  )
}

/**
 * Suma las percepciones de una factura.
 * Se guardan como JSON en la cabecera, no como ítems, así que no aparecen en
 * ninguna línea: son la diferencia entre sumar los ítems y el total real.
 */
function sumarPercepciones(percepciones: any): number {
  if (!Array.isArray(percepciones)) return 0
  return percepciones.reduce((s: number, p: any) => s + (Number(p?.valor) || 0), 0)
}

const soloActivos = (q: any) => q.eq('activo', true).order('nombre')

/**
 * Rótulo del período a partir de las fechas que realmente entraron.
 * Se calcula sobre los datos y no sobre los filtros de la pantalla: así el
 * nombre del archivo dice lo que el archivo tiene, sin importar con qué
 * combinación de filtros se llegó.
 */
function rotularRango(fechas: string[]): { archivo: string; texto: string } {
  const validas = fechas.filter(Boolean).sort()
  if (validas.length === 0) return { archivo: hoyISO(), texto: '' }
  const desde = validas[0]
  const hasta = validas[validas.length - 1]
  if (desde === hasta) return { archivo: desde, texto: ` del ${desde}` }
  return { archivo: `${desde}_a_${hasta}`, texto: ` del ${desde} al ${hasta}` }
}

// =====================================================
// 1 · PROVEEDORES
// =====================================================

export async function exportarProveedores(): Promise<void> {
  const filas = await traerTodo<any>('proveedores', '*', soloActivos)

  await descargarExcel({
    nombreArchivo: `proveedores_${hoyISO()}`,
    descripcion: 'Proveedores activos',
    hojas: [
      {
        nombre: 'Proveedores',
        filas,
        columnas: [
          { titulo: 'Nombre', valor: 'nombre' },
          { titulo: 'Código', valor: 'codigo', ancho: 12 },
          { titulo: 'Categoría', valor: 'categoria', ancho: 18 },
          { titulo: 'CUIT', valor: 'cuit', ancho: 15 },
          { titulo: 'Contacto', valor: 'contacto', ancho: 22 },
          { titulo: 'Teléfono', valor: 'telefono', ancho: 16 },
          { titulo: 'Email', valor: 'email', ancho: 26 },
          { titulo: 'Dirección', valor: 'direccion', ancho: 32 },
          { titulo: 'Notas', valor: 'notas', ancho: 34 },
          { titulo: 'ID', valor: 'id', ancho: 38 },
        ],
      },
    ],
  })
}

// =====================================================
// 2 · INSUMOS
// =====================================================

export async function exportarInsumos(): Promise<void> {
  // v_insumos_con_precio ya trae el precio vigente resuelto
  const insumos = await traerTodo<any>(
    'v_insumos_con_precio',
    'id, nombre, categoria, unidad_medida, cantidad_por_paquete, iva_porcentaje, merma_porcentaje, precio_actual, fecha_precio, proveedor_nombre',
    soloActivos
  )

  await descargarExcel({
    nombreArchivo: `insumos_${hoyISO()}`,
    descripcion: 'Insumos activos con su precio vigente y costo final',
    hojas: [
      {
        nombre: 'Insumos',
        filas: insumos,
        nota:
          'C. Final = precio × (1 + IVA) ÷ (1 − merma). Es el valor con el que costean todas las recetas. ' +
          'El precio sale de la última factura registrada.',
        columnas: [
          { titulo: 'Insumo', valor: 'nombre', ancho: 32 },
          { titulo: 'Categoría', valor: 'categoria', ancho: 18 },
          { titulo: 'Unidad', valor: 'unidad_medida', ancho: 10 },
          { titulo: 'Cant. x paquete', valor: 'cantidad_por_paquete', tipo: 'numero' },
          { titulo: 'Precio', valor: 'precio_actual', tipo: 'moneda' },
          { titulo: 'IVA', valor: 'iva_porcentaje', tipo: 'porcentaje' },
          { titulo: 'Merma', valor: 'merma_porcentaje', tipo: 'porcentaje' },
          {
            titulo: 'C. Final',
            tipo: 'moneda',
            valor: (i: any) =>
              costoFinalInsumo(i.precio_actual, i.iva_porcentaje, i.merma_porcentaje),
          },
          { titulo: 'Proveedor', valor: 'proveedor_nombre', ancho: 24 },
          { titulo: 'Fecha precio', valor: 'fecha_precio', tipo: 'fecha' },
          { titulo: 'ID', valor: 'id', ancho: 38 },
        ],
      },
    ],
  })
}

// =====================================================
// 3 · RECETAS (platos)
// =====================================================

export async function exportarRecetas(): Promise<void> {
  const [platos, ingredientes, insumos, elaboraciones, carta] = await Promise.all([
    traerTodo<any>('platos', 'id, nombre, seccion, descripcion, rendimiento_porciones, costo_total', soloActivos),
    traerTodo<any>('plato_ingredientes', 'plato_id, insumo_id, receta_base_id, cantidad, costo_linea'),
    mapaInsumos(),
    traerTodo<any>('recetas_base', 'id, nombre'),
    traerTodo<any>('carta', 'plato_id, precio_carta, margen_objetivo', (q: any) => q.eq('activo', true)),
  ])

  const nombreElab = new Map(elaboraciones.map((e: any) => [e.id, e.nombre]))
  const nombrePlato = new Map(platos.map((p: any) => [p.id, p.nombre]))
  const enCarta = new Map(carta.map((c: any) => [c.plato_id, c]))

  const hojas: Hoja[] = [
    {
      nombre: 'Recetas',
      filas: platos,
      columnas: [
        { titulo: 'Receta', valor: 'nombre', ancho: 34 },
        { titulo: 'Sección', valor: 'seccion', ancho: 16 },
        { titulo: 'Porciones', valor: 'rendimiento_porciones', tipo: 'entero' },
        { titulo: 'Costo total', valor: 'costo_total', tipo: 'moneda' },
        {
          titulo: 'Costo x porción',
          tipo: 'moneda',
          valor: (p: any) =>
            Number(p.costo_total || 0) / (p.rendimiento_porciones > 0 ? p.rendimiento_porciones : 1),
        },
        { titulo: 'Precio carta', tipo: 'moneda', valor: (p: any) => enCarta.get(p.id)?.precio_carta ?? null },
        {
          titulo: 'Food cost',
          tipo: 'porcentaje',
          valor: (p: any) => {
            const c = enCarta.get(p.id)
            if (!c?.precio_carta) return null
            const rend = p.rendimiento_porciones > 0 ? p.rendimiento_porciones : 1
            return (Number(p.costo_total || 0) / rend / c.precio_carta) * 100
          },
        },
        { titulo: 'Descripción', valor: 'descripcion', ancho: 44 },
        { titulo: 'ID', valor: 'id', ancho: 38 },
      ],
    },
    {
      nombre: 'Ingredientes',
      filas: ingredientes.filter((i: any) => nombrePlato.has(i.plato_id)),
      nota: 'Una fila por ingrediente. Cada uno es un insumo o una elaboración, nunca las dos cosas.',
      columnas: [
        { titulo: 'Receta', valor: (i: any) => nombrePlato.get(i.plato_id) ?? '', ancho: 34 },
        {
          titulo: 'Ingrediente',
          ancho: 32,
          valor: (i: any) =>
            i.insumo_id ? insumos.get(i.insumo_id)?.nombre ?? '' : nombreElab.get(i.receta_base_id) ?? '',
        },
        { titulo: 'Tipo', ancho: 14, valor: (i: any) => (i.insumo_id ? 'Insumo' : 'Elaboración') },
        { titulo: 'Cantidad', valor: 'cantidad', tipo: 'numero' },
        {
          titulo: 'Unidad',
          ancho: 10,
          valor: (i: any) => (i.insumo_id ? insumos.get(i.insumo_id)?.unidad ?? '' : 'porción'),
        },
        { titulo: 'Costo línea', valor: 'costo_linea', tipo: 'moneda' },
      ],
    },
  ]

  await descargarExcel({
    nombreArchivo: `recetas_${hoyISO()}`,
    descripcion: 'Recetas activas con su desglose de ingredientes',
    hojas,
  })
}

// =====================================================
// 4 · ELABORACIONES (recetas base)
// =====================================================

export async function exportarElaboraciones(): Promise<void> {
  const [bases, ingredientes, insumos] = await Promise.all([
    traerTodo<any>('recetas_base', 'id, nombre, descripcion, rendimiento_porciones, costo_total, costo_por_porcion', soloActivos),
    traerTodo<any>('receta_base_ingredientes', 'receta_base_id, insumo_id, cantidad, costo_linea'),
    mapaInsumos(),
  ])

  const nombreBase = new Map(bases.map((b: any) => [b.id, b.nombre]))

  await descargarExcel({
    nombreArchivo: `elaboraciones_${hoyISO()}`,
    descripcion: 'Elaboraciones activas con su desglose de insumos',
    hojas: [
      {
        nombre: 'Elaboraciones',
        filas: bases,
        columnas: [
          { titulo: 'Elaboración', valor: 'nombre', ancho: 34 },
          { titulo: 'Porciones', valor: 'rendimiento_porciones', tipo: 'entero' },
          { titulo: 'Costo total', valor: 'costo_total', tipo: 'moneda' },
          { titulo: 'Costo x porción', valor: 'costo_por_porcion', tipo: 'moneda' },
          { titulo: 'Descripción', valor: 'descripcion', ancho: 44 },
          { titulo: 'ID', valor: 'id', ancho: 38 },
        ],
      },
      {
        nombre: 'Insumos',
        filas: ingredientes.filter((i: any) => nombreBase.has(i.receta_base_id)),
        columnas: [
          { titulo: 'Elaboración', valor: (i: any) => nombreBase.get(i.receta_base_id) ?? '', ancho: 34 },
          { titulo: 'Insumo', valor: (i: any) => insumos.get(i.insumo_id)?.nombre ?? '', ancho: 32 },
          { titulo: 'Cantidad', valor: 'cantidad', tipo: 'numero' },
          { titulo: 'Unidad', ancho: 10, valor: (i: any) => insumos.get(i.insumo_id)?.unidad ?? '' },
          { titulo: 'Costo línea', valor: 'costo_linea', tipo: 'moneda' },
        ],
      },
    ],
  })
}

// =====================================================
// 5 · FACTURAS
// =====================================================

/**
 * @param idsVisibles Los ids que la pantalla está mostrando. Se pasa siempre
 * desde la lista para que el Excel baje EXACTAMENTE lo que se ve: la pantalla
 * tiene filtros de fecha, de proveedor y de período, y replicarlos acá sería
 * mantener la misma lógica dos veces. Si no se pasa, baja todo lo activo.
 */
export async function exportarFacturas(idsVisibles?: string[]): Promise<void> {
  const filtro = (q: any) => q.eq('activo', true).order('fecha', { ascending: false })

  const [todasFacturas, proveedores, insumos] = await Promise.all([
    traerTodo<any>(
      'facturas_proveedor',
      'id, numero_factura, fecha, tipo, total, proveedor_id, orden_compra_id, notas, percepciones',
      filtro
    ),
    traerTodo<any>('proveedores', 'id, nombre'),
    mapaInsumos(),
  ])

  const visibles = idsVisibles ? new Set(idsVisibles) : null
  const facturas = visibles ? todasFacturas.filter((f: any) => visibles.has(f.id)) : todasFacturas

  const nombreProv = new Map(proveedores.map((p: any) => [p.id, p.nombre]))
  const idsFacturas = new Set(facturas.map((f: any) => f.id))

  // Los ítems se traen enteros y se filtran acá: filtrar por `in` con cientos
  // de ids arma URLs enormes y PostgREST las rechaza.
  const items = (
    await traerTodo<any>('factura_items', 'factura_id, insumo_id, cantidad, precio_unitario, descuento')
  ).filter((i: any) => idsFacturas.has(i.factura_id))

  // Neto e IVA de cada línea, para que la hoja de ítems reconcilie con la cabecera.
  // El IVA sale del insumo (es editable por insumo: 21%, 10,5% o 0%).
  const neto = (i: any) =>
    Number(i.cantidad || 0) * Number(i.precio_unitario || 0) * (1 - Number(i.descuento || 0) / 100)
  const ivaPct = (i: any) => insumos.get(i.insumo_id)?.iva ?? 21
  const ivaMonto = (i: any) => neto(i) * (ivaPct(i) / 100)

  // Neto e IVA acumulados por factura, para desglosar la cabecera
  const porFactura = new Map<string, { neto: number; iva: number }>()
  for (const i of items) {
    const acc = porFactura.get(i.factura_id) || { neto: 0, iva: 0 }
    acc.neto += neto(i)
    acc.iva += ivaMonto(i)
    porFactura.set(i.factura_id, acc)
  }

  const cabecera = new Map(facturas.map((f: any) => [f.id, f]))
  const rango = rotularRango(facturas.map((f: any) => f.fecha))

  await descargarExcel({
    nombreArchivo: `facturas_${rango.archivo}`,
    descripcion: `${facturas.length} comprobantes${rango.texto}`,
    hojas: [
      {
        nombre: 'Facturas',
        filas: facturas,
        nota:
          'Total = Neto + IVA + Percepciones. Las notas de crédito se guardan con total NEGATIVO, así que la suma ' +
          'de la columna Total ya da el neto de compras: no filtrar por tipo para totalizar. ' +
          'El Neto y el IVA se reconstruyen desde los ítems, por eso pueden diferir en centavos por redondeo.',
        columnas: [
          { titulo: 'Fecha', valor: 'fecha', tipo: 'fecha' },
          { titulo: 'Número', valor: 'numero_factura', ancho: 20 },
          { titulo: 'Proveedor', valor: (f: any) => nombreProv.get(f.proveedor_id) ?? '', ancho: 26 },
          { titulo: 'Tipo', ancho: 14, valor: (f: any) => (f.tipo === 'nota_credito' ? 'Nota de crédito' : 'Factura') },
          { titulo: 'Neto', tipo: 'moneda', valor: (f: any) => porFactura.get(f.id)?.neto ?? null },
          { titulo: 'IVA', tipo: 'moneda', valor: (f: any) => porFactura.get(f.id)?.iva ?? null },
          { titulo: 'Percepciones', tipo: 'moneda', valor: (f: any) => sumarPercepciones(f.percepciones) },
          { titulo: 'Total', valor: 'total', tipo: 'moneda' },
          { titulo: 'Notas', valor: 'notas', ancho: 34 },
          { titulo: 'ID', valor: 'id', ancho: 38 },
        ],
      },
      {
        nombre: 'Items',
        filas: items,
        nota:
          'El Neto ya tiene aplicado el descuento del ítem. Sumando la columna "Con IVA" se llega al total de las ' +
          'facturas, salvo las percepciones: esas se cargan en la cabecera del comprobante y no pertenecen a ninguna línea.',
        columnas: [
          { titulo: 'Fecha', tipo: 'fecha', valor: (i: any) => cabecera.get(i.factura_id)?.fecha ?? null },
          { titulo: 'Factura', ancho: 20, valor: (i: any) => cabecera.get(i.factura_id)?.numero_factura ?? '' },
          {
            titulo: 'Proveedor',
            ancho: 26,
            valor: (i: any) => nombreProv.get(cabecera.get(i.factura_id)?.proveedor_id) ?? '',
          },
          { titulo: 'Insumo', ancho: 32, valor: (i: any) => insumos.get(i.insumo_id)?.nombre ?? '(vino u otro)' },
          { titulo: 'Cantidad', valor: 'cantidad', tipo: 'numero' },
          { titulo: 'Unidad', ancho: 10, valor: (i: any) => insumos.get(i.insumo_id)?.unidad ?? '' },
          { titulo: 'Precio unit.', valor: 'precio_unitario', tipo: 'moneda' },
          { titulo: 'Descuento', valor: 'descuento', tipo: 'porcentaje' },
          { titulo: 'Neto', tipo: 'moneda', valor: neto },
          { titulo: 'IVA %', tipo: 'porcentaje', valor: ivaPct },
          { titulo: 'IVA', tipo: 'moneda', valor: ivaMonto },
          { titulo: 'Con IVA', tipo: 'moneda', valor: (i: any) => neto(i) + ivaMonto(i) },
        ],
      },
    ],
  })
}

// =====================================================
// 6 · ÓRDENES DE COMPRA
// =====================================================

/** @param idsVisibles Igual que en facturas: baja lo que la pantalla muestra. */
export async function exportarOrdenesCompra(idsVisibles?: string[]): Promise<void> {
  const filtro = (q: any) => q.eq('activo', true).order('fecha', { ascending: false })

  const [todasOrdenes, proveedores, insumos] = await Promise.all([
    traerTodo<any>('ordenes_compra', 'id, numero, fecha, estado, total, proveedor_id, notas', filtro),
    traerTodo<any>('proveedores', 'id, nombre'),
    mapaInsumos(),
  ])

  const visibles = idsVisibles ? new Set(idsVisibles) : null
  const ordenes = visibles ? todasOrdenes.filter((o: any) => visibles.has(o.id)) : todasOrdenes

  const nombreProv = new Map(proveedores.map((p: any) => [p.id, p.nombre]))
  const idsOrdenes = new Set(ordenes.map((o: any) => o.id))
  const items = (
    await traerTodo<any>('orden_compra_items', 'orden_compra_id, insumo_id, cantidad, precio_unitario')
  ).filter((i: any) => idsOrdenes.has(i.orden_compra_id))

  // Igual que en facturas: el total de la OC es subtotalNeto + IVA, así que la
  // hoja de ítems tiene que traer el IVA o las dos hojas no cierran entre sí.
  const netoOC = (i: any) => Number(i.cantidad || 0) * Number(i.precio_unitario || 0)
  const ivaPctOC = (i: any) => insumos.get(i.insumo_id)?.iva ?? 21
  const ivaMontoOC = (i: any) => netoOC(i) * (ivaPctOC(i) / 100)

  const porOrden = new Map<string, { neto: number; iva: number }>()
  for (const i of items) {
    const acc = porOrden.get(i.orden_compra_id) || { neto: 0, iva: 0 }
    acc.neto += netoOC(i)
    acc.iva += ivaMontoOC(i)
    porOrden.set(i.orden_compra_id, acc)
  }

  const cabecera = new Map(ordenes.map((o: any) => [o.id, o]))
  const rango = rotularRango(ordenes.map((o: any) => o.fecha))

  await descargarExcel({
    nombreArchivo: `ordenes-compra_${rango.archivo}`,
    descripcion: `${ordenes.length} órdenes${rango.texto}`,
    hojas: [
      {
        nombre: 'Órdenes',
        filas: ordenes,
        nota:
          'El precio de la orden es el precio ESPERADO, sirve para controlar. El costo real sale siempre de la factura. ' +
          'No usar estos importes para costear. Total = Neto + IVA (las órdenes no llevan percepciones).',
        columnas: [
          { titulo: 'Fecha', valor: 'fecha', tipo: 'fecha' },
          { titulo: 'Número', valor: 'numero', ancho: 16 },
          { titulo: 'Proveedor', valor: (o: any) => nombreProv.get(o.proveedor_id) ?? '', ancho: 26 },
          { titulo: 'Estado', valor: 'estado', ancho: 20 },
          { titulo: 'Neto', tipo: 'moneda', valor: (o: any) => porOrden.get(o.id)?.neto ?? null },
          { titulo: 'IVA', tipo: 'moneda', valor: (o: any) => porOrden.get(o.id)?.iva ?? null },
          { titulo: 'Total', valor: 'total', tipo: 'moneda' },
          { titulo: 'Notas', valor: 'notas', ancho: 34 },
          { titulo: 'ID', valor: 'id', ancho: 38 },
        ],
      },
      {
        nombre: 'Items',
        filas: items,
        columnas: [
          { titulo: 'Fecha', tipo: 'fecha', valor: (i: any) => cabecera.get(i.orden_compra_id)?.fecha ?? null },
          { titulo: 'Orden', ancho: 16, valor: (i: any) => cabecera.get(i.orden_compra_id)?.numero ?? '' },
          {
            titulo: 'Proveedor',
            ancho: 26,
            valor: (i: any) => nombreProv.get(cabecera.get(i.orden_compra_id)?.proveedor_id) ?? '',
          },
          { titulo: 'Insumo', ancho: 32, valor: (i: any) => insumos.get(i.insumo_id)?.nombre ?? '(vino u otro)' },
          { titulo: 'Cantidad', valor: 'cantidad', tipo: 'numero' },
          { titulo: 'Unidad', ancho: 10, valor: (i: any) => insumos.get(i.insumo_id)?.unidad ?? '' },
          { titulo: 'Precio unit.', valor: 'precio_unitario', tipo: 'moneda' },
          { titulo: 'Neto', tipo: 'moneda', valor: netoOC },
          { titulo: 'IVA %', tipo: 'porcentaje', valor: ivaPctOC },
          { titulo: 'IVA', tipo: 'moneda', valor: ivaMontoOC },
          { titulo: 'Con IVA', tipo: 'moneda', valor: (i: any) => netoOC(i) + ivaMontoOC(i) },
        ],
      },
    ],
  })
}

// =====================================================
// 7 · CARTA
// =====================================================

/**
 * Carta completa: lo que está en carta y lo que quedó afuera, en UNA hoja con
 * una columna "En carta" que dice Sí o No.
 *
 * Una hoja con columna en vez de dos hojas separadas, a propósito: con el
 * autofiltro puesto, filtrar por esa columna te da cualquiera de las dos
 * vistas, y además se puede ordenar y comparar entre sí. Dos hojas obligan a
 * elegir de antemano y no dejan cruzar nada.
 *
 * El food cost se recalcula con los precios de HOY, igual que hace la pantalla
 * de Carta. El `food_cost_real` guardado en la tabla puede estar viejo.
 */
export async function exportarCarta(): Promise<void> {
  const [filasCarta, platos, ingredientes, elaboraciones, insumos] = await Promise.all([
    traerTodo<any>('carta', 'id, plato_id, precio_carta, precio_sugerido, margen_objetivo, activo'),
    traerTodo<any>('platos', 'id, nombre, seccion, descripcion, rendimiento_porciones', soloActivos),
    traerTodo<any>('plato_ingredientes', 'plato_id, insumo_id, receta_base_id, cantidad'),
    traerTodo<any>('recetas_base', 'id, nombre, rendimiento_porciones, costo_por_porcion'),
    traerTodo<any>(
      'v_insumos_con_precio',
      'id, precio_actual, iva_porcentaje, merma_porcentaje',
      (q: any) => q.eq('activo', true)
    ),
  ])

  const costoInsumo = new Map<string, number>(
    insumos.map((i: any) => [
      i.id as string,
      costoFinalInsumo(i.precio_actual, i.iva_porcentaje, i.merma_porcentaje),
    ])
  )
  const costoElaboracion = new Map<string, number>(
    elaboraciones.map((e: any) => [e.id as string, Number(e.costo_por_porcion) || 0])
  )
  const platoPorId = new Map(platos.map((p: any) => [p.id, p]))

  /** Costo por porción del plato, con precios de hoy */
  const costoPorPorcion = (platoId: string): number => {
    const p = platoPorId.get(platoId)
    if (!p) return 0
    const total = ingredientes
      .filter((i: any) => i.plato_id === platoId)
      .reduce((suma: number, ing: any) => {
        const unitario = ing.insumo_id
          ? costoInsumo.get(ing.insumo_id) ?? 0
          : costoElaboracion.get(ing.receta_base_id) ?? 0
        return suma + Number(ing.cantidad || 0) * unitario
      }, 0)
    const rend = p.rendimiento_porciones > 0 ? p.rendimiento_porciones : 1
    return total / rend
  }

  const filas = filasCarta
    .filter((c: any) => platoPorId.has(c.plato_id))
    .map((c: any) => {
      const p = platoPorId.get(c.plato_id)
      const costo = costoPorPorcion(c.plato_id)
      const precio = Number(c.precio_carta) || 0
      return {
        en_carta: c.activo ? 'Sí' : 'No',
        nombre: p.nombre,
        seccion: p.seccion,
        descripcion: p.descripcion,
        costo,
        precio,
        food_cost: precio > 0 ? (costo / precio) * 100 : null,
        margen_objetivo: Number(c.margen_objetivo) || null,
        precio_sugerido: Number(c.precio_sugerido) || null,
        contribucion: precio > 0 ? precio - costo : null,
        plato_id: c.plato_id,
      }
    })
    // Primero lo que está en carta, y dentro de cada grupo por sección y nombre
    .sort((a, b) =>
      a.en_carta !== b.en_carta
        ? a.en_carta === 'Sí' ? -1 : 1
        : (a.seccion || '').localeCompare(b.seccion || '', 'es-AR') ||
          a.nombre.localeCompare(b.nombre, 'es-AR')
    )

  await descargarExcel({
    nombreArchivo: `carta_${hoyISO()}`,
    descripcion: `Carta completa: ${filas.filter((f) => f.en_carta === 'Sí').length} en carta y ${filas.filter((f) => f.en_carta === 'No').length} fuera`,
    hojas: [
      {
        nombre: 'Carta',
        filas,
        nota:
          'Filtrá por la columna "En carta" para ver solo lo vigente o solo lo que quedó afuera. ' +
          'El costo y el food cost se calculan con los precios de hoy, no con el valor guardado, ' +
          'que puede estar desactualizado.',
        columnas: [
          { titulo: 'En carta', valor: 'en_carta', ancho: 10 },
          { titulo: 'Plato', valor: 'nombre', ancho: 34 },
          { titulo: 'Sección', valor: 'seccion', ancho: 16 },
          { titulo: 'Costo x porción', valor: 'costo', tipo: 'moneda' },
          { titulo: 'Precio carta', valor: 'precio', tipo: 'moneda' },
          { titulo: 'Food cost', valor: 'food_cost', tipo: 'porcentaje' },
          { titulo: 'F.C. objetivo', valor: 'margen_objetivo', tipo: 'porcentaje' },
          { titulo: 'Precio sugerido', valor: 'precio_sugerido', tipo: 'moneda' },
          { titulo: 'Contribución', valor: 'contribucion', tipo: 'moneda' },
          { titulo: 'Descripción', valor: 'descripcion', ancho: 46 },
          { titulo: 'ID plato', valor: 'plato_id', ancho: 38 },
        ],
      },
    ],
  })
}
