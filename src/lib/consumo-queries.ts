// Queries del módulo Análisis (consumo + incidencia real)

import { supabase } from './supabase'
import { costoFinalInsumo, costoBotellaVino } from './costos'
import { expandirCompuestos, type LineaInsumo } from './desglose-compuestos'
import { FK_DE_TIPO } from '@/types/analisis'
import type {
  ConsumoDiario,
  ConsumoItem,
  ConsumoItemInput,
  OpcionBuscador,
  ItemDesglosado,
  Servicio,
  IncidenciaDia,
} from '@/types/analisis'
import { formatearMoneda } from './formato-numeros'

// =====================================================
// FORMATO MONEDA SIN DECIMALES
// =====================================================
export function formatearMonedaAnalisis(valor: number | string | null | undefined): string {
  return formatearMoneda(valor, true, 0)
}

// =====================================================
// BUSCADOR: opciones de insumos / elaboraciones / recetas
// =====================================================

/**
 * Insumos con precio actual + IVA + merma (mismo C. Final que muestra Insumos)
 */
export async function obtenerInsumosBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('v_insumos_con_precio')
    .select('id, nombre, unidad_medida, precio_actual, iva_porcentaje, merma_porcentaje')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error

  return (data || [])
    .filter((i: any) => i.precio_actual !== null && i.precio_actual > 0)
    .map((i: any) => ({
      id: i.id,
      tipo: 'insumo' as const,
      nombre: i.nombre,
      unidad: i.unidad_medida,
      // Costo Final = precio × (1 + IVA) × (1 + merma)
      costo_unitario:
        costoFinalInsumo(i.precio_actual, i.iva_porcentaje, i.merma_porcentaje),
    }))
}

/**
 * Elaboraciones (recetas_base) — costo por porción ya viene calculado
 */
export async function obtenerElaboracionesBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('recetas_base')
    .select('id, nombre, costo_por_porcion, rendimiento_porciones')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error

  return (data || []).map((r: any) => ({
    id: r.id,
    tipo: 'elaboracion' as const,
    nombre: r.nombre,
    unidad: 'porcion',
    costo_unitario: Number(r.costo_por_porcion || 0),
  }))
}

/**
 * Recetas (platos) — costo unitario = costo_total / rendimiento
 */
export async function obtenerRecetasBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('platos')
    .select('id, nombre, costo_total, rendimiento_porciones')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error

  return (data || []).map((p: any) => {
    const rendimiento = p.rendimiento_porciones > 0 ? p.rendimiento_porciones : 1
    return {
      id: p.id,
      tipo: 'receta' as const,
      nombre: p.nombre,
      unidad: 'porcion',
      costo_unitario: Number(p.costo_total || 0) / rendimiento,
    }
  })
}

/**
 * Costo final (precio + IVA + merma) de cada insumo pedido.
 */
async function obtenerCostosInsumos(insumoIds: string[]): Promise<Map<string, number>> {
  if (insumoIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('v_insumos_con_precio')
    .select('id, precio_actual, iva_porcentaje, merma_porcentaje')
    .in('id', insumoIds)

  if (error) throw error

  return new Map(
    (data || []).map((i: any) => [
      i.id as string,
      costoFinalInsumo(i.precio_actual, i.iva_porcentaje, i.merma_porcentaje),
    ])
  )
}

/**
 * Costo de una unidad de cada compuesto, a partir de sus insumos.
 *
 * POR QUÉ SE CALCULA Y NO SE LEE DE LA TABLA: ni `tragos.costo_total` ni
 * `menus_ejecutivos.costo_total` tienen trigger que los mantenga. La pantalla
 * de Tragos nunca lee esa columna (calcula siempre en vivo) y la ficha de un
 * menú ejecutivo solo la escribe cuando alguien guarda el menú a mano.
 *
 * Medido el 08/08/26: 8 de 17 menús tenían la tabla desfasada hasta 5%, tres
 * días después del recálculo de V.20. En cambio los 84 platos y las 79
 * elaboraciones coincidían todos dentro del 0,5%, así que la cadena de abajo
 * es confiable y conviene reconstruir desde ahí.
 *
 * Además esto garantiza que el costo con el que se carga un item sea el mismo
 * que sale de su desglose: los dos salen del mismo expansor.
 */
async function costearCompuestos(expandidos: Map<string, LineaInsumo[]>): Promise<Map<string, number>> {
  const insumoIds = new Set<string>()
  Array.from(expandidos.values()).forEach((lineas) =>
    lineas.forEach((l) => insumoIds.add(l.insumo_id))
  )

  const costos = await obtenerCostosInsumos(Array.from(insumoIds))

  const resultado = new Map<string, number>()
  Array.from(expandidos.entries()).forEach(([id, lineas]) => {
    resultado.set(
      id,
      lineas.reduce((acc, l) => acc + l.cantidad * (costos.get(l.insumo_id) || 0), 0)
    )
  })
  return resultado
}

/**
 * Tragos — un trago es una unidad, no tienen rendimiento
 */
export async function obtenerTragosBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('tragos')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  const tragos = data || []
  if (tragos.length === 0) return []

  const expandidos = await expandirCompuestos({ tragos: tragos.map((t: any) => t.id) })
  const costos = await costearCompuestos(expandidos.tragos)

  return tragos.map((t: any) => ({
    id: t.id,
    tipo: 'trago' as const,
    nombre: t.nombre,
    unidad: 'trago',
    costo_unitario: costos.get(t.id) || 0,
  }))
}

/**
 * Menús ejecutivos — un menú es un cubierto, no tienen rendimiento
 */
export async function obtenerEjecutivosBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('menus_ejecutivos')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  const menus = data || []
  if (menus.length === 0) return []

  const expandidos = await expandirCompuestos({ ejecutivos: menus.map((m: any) => m.id) })
  const costos = await costearCompuestos(expandidos.ejecutivos)

  return menus.map((m: any) => ({
    id: m.id,
    tipo: 'ejecutivo' as const,
    nombre: m.nombre,
    unidad: 'menu',
    costo_unitario: costos.get(m.id) || 0,
  }))
}

/**
 * Cómo se nombra un vino en toda la app de Análisis: nombre + cepa + bodega.
 *
 * La cepa NO es decorativa: sin ella hay vinos indistinguibles. "Reserva
 * (Salentein)" son ocho vinos distintos —Malbec, Chardonnay, Pinot Noir, Rosé,
 * Merlot, Cabernet Sauvignon, Cabernet Franc y Sauvignon Blanc— y 18 combinaciones
 * de nombre+bodega se repiten. Elegir a ciegas entre ocho renglones iguales es
 * cargar mal el consumo.
 */
export function nombreVino(v: {
  nombre?: string | null
  cepa?: string | null
  bodega?: string | null
}): string {
  const partes = [v.nombre, v.cepa].filter(Boolean).join(' ')
  return v.bodega ? `${partes} (${v.bodega})` : partes || '(sin nombre)'
}

/**
 * Vinos — se consume la botella. No pasan por `insumos` ni tienen receta,
 * así que su costo sale directo de la lista de la bodega.
 */
export async function obtenerVinosBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('vinos')
    .select('id, nombre, bodega, cepa, precio_caja, unidades_caja, descuento_porcentaje')
    .eq('activo', true)
    .order('bodega')
    .order('nombre')

  if (error) throw error

  return (data || [])
    .map((v: any) => ({
      id: v.id,
      tipo: 'vino' as const,
      nombre: nombreVino(v),
      unidad: 'botella',
      costo_unitario: costoBotellaVino(v.precio_caja, v.unidades_caja, v.descuento_porcentaje),
    }))
    .filter((v) => v.costo_unitario > 0)
}

/**
 * Combina todas las opciones para un buscador unificado
 */
export async function obtenerTodasOpciones(): Promise<OpcionBuscador[]> {
  const [ins, elab, rec, tra, eje, vin] = await Promise.all([
    obtenerInsumosBuscador(),
    obtenerElaboracionesBuscador(),
    obtenerRecetasBuscador(),
    obtenerTragosBuscador(),
    obtenerEjecutivosBuscador(),
    obtenerVinosBuscador(),
  ])
  return [...ins, ...elab, ...rec, ...tra, ...eje, ...vin]
}

// =====================================================
// CONSUMO DIARIO
// =====================================================

/**
 * Obtiene el consumo (cabecera) de un día/servicio. Null si no existe
 */
export async function obtenerConsumo(fecha: string, servicio: Servicio): Promise<ConsumoDiario | null> {
  const { data, error } = await supabase
    .from('consumo_diario')
    .select('*')
    .eq('fecha', fecha)
    .eq('servicio', servicio)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Obtiene los items de un consumo, enriquecidos con el nombre.
 * El costo queda CONGELADO al valor guardado en el momento de la carga.
 * Si cambia un precio después, los consumos viejos no se alteran.
 */
export async function obtenerItemsConsumo(consumoId: string): Promise<ConsumoItem[]> {
  const { data, error } = await supabase
    .from('consumo_items')
    .select(`
      *,
      insumos:insumo_id (nombre, categoria),
      recetas_base:receta_base_id (nombre),
      platos:plato_id (nombre, seccion),
      tragos:trago_id (nombre),
      menus_ejecutivos:menu_ejecutivo_id (nombre),
      vinos:vino_id (nombre, bodega, cepa)
    `)
    .eq('consumo_id', consumoId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data || []).map((item: any) => ({
    ...item,
    nombre:
      item.insumos?.nombre ||
      item.recetas_base?.nombre ||
      item.platos?.nombre ||
      item.tragos?.nombre ||
      item.menus_ejecutivos?.nombre ||
      (item.vinos ? nombreVino(item.vinos) : null) ||
      '(sin nombre)',
    // Para areaDeItem(): decide si va a Cocina o a Barra
    seccion: item.platos?.seccion ?? null,
    categoria: item.insumos?.categoria ?? null,
  }))
}

/**
 * Crea o devuelve un consumo (cabecera) para un día/servicio. Idempotente.
 */
export async function obtenerOCrearConsumo(fecha: string, servicio: Servicio): Promise<ConsumoDiario> {
  const existente = await obtenerConsumo(fecha, servicio)
  if (existente) return existente

  const { data, error } = await supabase
    .from('consumo_diario')
    .insert({ fecha, servicio })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Agrega un item al consumo
 */
export async function agregarItem(consumoId: string, item: ConsumoItemInput): Promise<void> {
  // Solo se carga la FK del tipo; el resto van en null.
  // La base lo exige con el CHECK `consumo_items_fk_coherente`.
  const { error } = await supabase.from('consumo_items').insert({
    consumo_id: consumoId,
    tipo: item.tipo,
    insumo_id: null,
    receta_base_id: null,
    plato_id: null,
    trago_id: null,
    menu_ejecutivo_id: null,
    vino_id: null,
    [FK_DE_TIPO[item.tipo]]: item[FK_DE_TIPO[item.tipo]],
    cantidad: item.cantidad,
    unidad: item.unidad,
    costo_unitario: item.costo_unitario,
  })

  if (error) throw error
}

/**
 * Elimina un item del consumo
 */
export async function eliminarItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('consumo_items').delete().eq('id', itemId)
  if (error) throw error
}

/**
 * Actualiza la cantidad de un item
 */
export async function actualizarCantidad(itemId: string, cantidad: number): Promise<void> {
  const { error } = await supabase.from('consumo_items').update({ cantidad }).eq('id', itemId)
  if (error) throw error
}

/**
 * Marca un consumo como confirmado (paso previo a descontar stock)
 */
export async function confirmarConsumo(consumoId: string): Promise<void> {
  const { error } = await supabase
    .from('consumo_diario')
    .update({
      confirmado: true,
      confirmado_at: new Date().toISOString(),
    })
    .eq('id', consumoId)

  if (error) throw error
}

/**
 * Desconfirma un consumo (para volver a editarlo)
 */
export async function desconfirmarConsumo(consumoId: string): Promise<void> {
  const { error } = await supabase
    .from('consumo_diario')
    .update({ confirmado: false, confirmado_at: null })
    .eq('id', consumoId)

  if (error) throw error
}

/**
 * Elimina el consumo entero (cabecera + items por CASCADE)
 */
export async function eliminarConsumo(consumoId: string): Promise<void> {
  const { error } = await supabase.from('consumo_diario').delete().eq('id', consumoId)
  if (error) throw error
}

// =====================================================
// DESGLOSE A NIVEL INSUMO (para vista "Consumo diario")
// =====================================================

/**
 * Toma los items cargados —que pueden ser insumos sueltos, elaboraciones,
 * recetas, tragos o menús ejecutivos— y los desglosa a nivel insumo,
 * sumando cantidades y costos.
 *
 * Por ejemplo: 12 milanesas + 2,5 kg de bola de lomo
 *   → "Bola de lomo: 1,8 kg + 2,5 kg = 4,3 kg" (con sus orígenes)
 *
 * El COSTO no se recalcula: se reparte el subtotal congelado de cada item
 * entre sus insumos, en proporción a lo que pesa cada uno con los precios
 * de hoy. Así la suma del desglose siempre da exactamente el total del
 * consumo, aunque los precios hayan cambiado desde que se cargó.
 *
 * Las líneas que no bajan a insumo (hoy: vinos) quedan fuera de esta vista.
 */
export async function desglosarConsumo(consumoId: string): Promise<ItemDesglosado[]> {
  // 1. Items del consumo, ya con el nombre resuelto (lo usa la columna Origen)
  const items = await obtenerItemsConsumo(consumoId)
  if (items.length === 0) return []

  // 2. Expandir cada compuesto a su lista de insumos por unidad
  const idsDeTipo = (tipo: string, campo: keyof ConsumoItem) =>
    items.filter((i) => i.tipo === tipo).map((i) => i[campo] as string)

  const expandidos = await expandirCompuestos({
    elaboraciones: idsDeTipo('elaboracion', 'receta_base_id'),
    recetas: idsDeTipo('receta', 'plato_id'),
    tragos: idsDeTipo('trago', 'trago_id'),
    ejecutivos: idsDeTipo('ejecutivo', 'menu_ejecutivo_id'),
  })

  /** Insumos por unidad del item. `null` = no desglosa (insumo directo o vino). */
  function lineasDelItem(item: ConsumoItem): LineaInsumo[] | null {
    switch (item.tipo) {
      case 'elaboracion':
        return expandidos.elaboraciones.get(item.receta_base_id || '') || []
      case 'receta':
        return expandidos.recetas.get(item.plato_id || '') || []
      case 'trago':
        return expandidos.tragos.get(item.trago_id || '') || []
      case 'ejecutivo':
        return expandidos.ejecutivos.get(item.menu_ejecutivo_id || '') || []
      default:
        return null
    }
  }

  // 3. Precios actuales de todos los insumos involucrados (para pesar el prorrateo)
  const todosInsumoIds = new Set<string>()
  for (const item of items) {
    if (item.tipo === 'insumo' && item.insumo_id) {
      todosInsumoIds.add(item.insumo_id)
      continue
    }
    for (const l of lineasDelItem(item) || []) todosInsumoIds.add(l.insumo_id)
  }
  if (todosInsumoIds.size === 0) return []

  const { data: infoInsumos } = await supabase
    .from('v_insumos_con_precio')
    .select('id, nombre, unidad_medida, categoria, precio_actual, iva_porcentaje, merma_porcentaje')
    .in('id', Array.from(todosInsumoIds))

  const infoMap = new Map<
    string,
    { nombre: string; unidad: string; categoria: string; merma: number; costo_unit_iva: number }
  >()
  for (const i of infoInsumos || []) {
    infoMap.set((i as any).id, {
      nombre: (i as any).nombre,
      unidad: (i as any).unidad_medida,
      categoria: (i as any).categoria || 'Almacen',
      merma: Number((i as any).merma_porcentaje) || 0,
      costo_unit_iva: costoFinalInsumo(
        Number((i as any).precio_actual || 0),
        Number((i as any).iva_porcentaje || 0),
        Number((i as any).merma_porcentaje || 0)
      ),
    })
  }

  // 4. Consolidar. La clave lleva el tipo adelante porque conviven dos cosas
  //    distintas: insumos (que vienen de abrir compuestos) y vinos (que no se
  //    abren en nada). Sin el prefijo, un uuid de vino podría pisar a uno de insumo.
  type Acum = {
    tipo: 'insumo' | 'vino'
    ref_id: string
    nombre?: string // solo vinos: no hay tabla donde buscarlo después
    unidad?: string
    cantidad: number
    costo: number
    origenes: string[]
  }
  const mapa = new Map<string, Acum>()

  const acumular = (
    base: { tipo: 'insumo' | 'vino'; ref_id: string; nombre?: string; unidad?: string },
    cantidad: number,
    costo: number,
    origen: string
  ) => {
    const clave = `${base.tipo}:${base.ref_id}`
    const acc = mapa.get(clave) || { ...base, cantidad: 0, costo: 0, origenes: [] }
    acc.cantidad += cantidad
    acc.costo += costo
    acc.origenes.push(origen)
    mapa.set(clave, acc)
  }

  for (const item of items) {
    // Insumo directo: el subtotal congelado ya es suyo, sin repartir
    if (item.tipo === 'insumo') {
      if (item.insumo_id) {
        acumular(
          { tipo: 'insumo', ref_id: item.insumo_id },
          Number(item.cantidad),
          Number(item.subtotal),
          'Carga directa'
        )
      }
      continue
    }

    // Vino: es una hoja, se consume la botella. No hay nada que desglosar
    // ni que prorratear — el subtotal congelado es suyo entero.
    if (item.tipo === 'vino') {
      if (item.vino_id) {
        acumular(
          { tipo: 'vino', ref_id: item.vino_id, nombre: item.nombre, unidad: item.unidad },
          Number(item.cantidad),
          Number(item.subtotal),
          'Carga directa'
        )
      }
      continue
    }

    const lineas = lineasDelItem(item)
    if (!lineas || lineas.length === 0) continue

    // Peso de cada insumo dentro del compuesto, con precios de hoy
    const pesos = lineas.map((l) => {
      const info = infoMap.get(l.insumo_id)
      const cantidadInsumo = Number(item.cantidad) * l.cantidad
      return {
        insumo_id: l.insumo_id,
        cantidadInsumo,
        costoTeorico: info ? cantidadInsumo * info.costo_unit_iva : 0,
      }
    })
    const totalTeorico = pesos.reduce((a, p) => a + p.costoTeorico, 0)
    const subtotalCongelado = Number(item.subtotal)
    const origen = `${item.cantidad} ${item.unidad} ${item.nombre}`

    for (const p of pesos) {
      // Si no hay precios (insumos sin costo), repartir en partes iguales
      const costo =
        totalTeorico > 0
          ? subtotalCongelado * (p.costoTeorico / totalTeorico)
          : subtotalCongelado / pesos.length
      acumular({ tipo: 'insumo', ref_id: p.insumo_id }, p.cantidadInsumo, costo, origen)
    }
  }

  // 5. Armar resultado
  const resultado: ItemDesglosado[] = []
  Array.from(mapa.values()).forEach((acc) => {
    const comun = {
      ref_id: acc.ref_id,
      cantidad_total: acc.cantidad,
      costo_total: acc.costo,
      origenes: Array.from(new Set(acc.origenes)),
    }

    if (acc.tipo === 'vino') {
      resultado.push({
        ...comun,
        tipo: 'vino',
        nombre: acc.nombre || '(sin nombre)',
        unidad: acc.unidad || 'botella',
        categoria: 'Vinos',
        merma_porcentaje: 0, // los vinos no tienen merma
      })
      return
    }

    // Insumo que ya no existe o quedó sin precio: no se muestra
    const info = infoMap.get(acc.ref_id)
    if (!info) return
    resultado.push({
      ...comun,
      tipo: 'insumo',
      nombre: info.nombre,
      unidad: info.unidad,
      categoria: info.categoria,
      merma_porcentaje: info.merma,
    })
  })

  resultado.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-AR'))
  return resultado
}

// =====================================================
// DESGLOSE DE RANGO (para Resumen semanal/mensual)
// =====================================================

/**
 * Desglosa a nivel insumo el consumo de un rango de fechas.
 * Opcionalmente filtrado por servicio.
 * Agrega cantidades y costos por insumo (igual que desglosarConsumo
 * pero para varios consumos).
 */
export async function desglosarRango(
  desde: string,
  hasta: string,
  servicio?: Servicio
): Promise<{
  desglose: ItemDesglosado[]
  diasConCarga: number
  costoTotal: number
}> {
  // Obtener consumo_ids en el rango
  let q = supabase
    .from('consumo_diario')
    .select('id, fecha')
    .gte('fecha', desde)
    .lte('fecha', hasta)
  if (servicio) q = q.eq('servicio', servicio)

  const { data: consumos } = await q
  if (!consumos || consumos.length === 0) {
    return { desglose: [], diasConCarga: 0, costoTotal: 0 }
  }

  // Desglosar en paralelo
  const desgloses = await Promise.all(
    consumos.map((c: any) => desglosarConsumo(c.id))
  )

  // Consolidar. Misma clave compuesta que en desglosarConsumo: insumos y vinos
  // conviven en la misma lista y no se pueden pisar.
  const mapa = new Map<string, ItemDesglosado>()
  for (const desglose of desgloses) {
    for (const d of desglose) {
      const clave = `${d.tipo}:${d.ref_id}`
      const acc = mapa.get(clave)
      if (acc) {
        acc.cantidad_total += d.cantidad_total
        acc.costo_total += d.costo_total
        // fusionar orígenes sin duplicar
        const origenesSet = new Set([...acc.origenes, ...d.origenes])
        acc.origenes = Array.from(origenesSet)
      } else {
        mapa.set(clave, { ...d, origenes: [...d.origenes] })
      }
    }
  }

  // Agrupar orígenes antes de devolver
  const resultado = Array.from(mapa.values())
    .map((item) => ({
      ...item,
      origenes: agruparOrigenes(item.origenes),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-AR'))

  const costoTotal = resultado.reduce((a, r) => a + r.costo_total, 0)
  // Días únicos con carga
  const fechasUnicas = new Set(consumos.map((c: any) => c.fecha))

  return {
    desglose: resultado,
    diasConCarga: fechasUnicas.size,
    costoTotal,
  }
}

/**
 * Agrupa orígenes del mismo tipo y suma las cantidades.
 * Ej: ["6 porcion Milanesa", "14 porcion Milanesa", "Carga directa", "Carga directa"]
 *   → ["20 porciones Milanesa", "Carga directa"]
 */
function agruparOrigenes(origenes: string[]): string[] {
  const mapa = new Map<string, { cantidad: number; unidad: string }>()
  let cargasDirectas = 0

  for (const origen of origenes) {
    if (origen === 'Carga directa') {
      cargasDirectas++
      continue
    }

    // Parsear "X unidad NombreReceta" (ej: "6 porcion Milanesa")
    const match = origen.match(/^([\d.,]+)\s+(\S+)\s+(.+)$/)
    if (match) {
      const cantidad = parseFloat(match[1].replace(',', '.'))
      const unidad = match[2]
      const nombre = match[3]

      const key = `${unidad}|${nombre}`
      const acc = mapa.get(key) || { cantidad: 0, unidad }
      acc.cantidad += cantidad
      mapa.set(key, acc)
    } else {
      // Si no matchea el patrón, dejarlo como está
      mapa.set(origen, { cantidad: 0, unidad: '' })
    }
  }

  const resultado: string[] = []

  // Agregar orígenes agrupados
  mapa.forEach(({ cantidad, unidad }, key) => {
    if (cantidad > 0) {
      const nombre = key.split('|')[1]
      // Pluralizar unidad si cantidad > 1
      const unidadPlural = cantidad > 1 && unidad === 'porcion' ? 'porciones' : unidad
      resultado.push(`${cantidad % 1 === 0 ? cantidad : cantidad.toFixed(1)} ${unidadPlural} ${nombre}`)
    } else {
      // Origen sin parsear (fallback)
      resultado.push(key)
    }
  })

  // Agregar carga directa al final si hubo
  if (cargasDirectas > 0) {
    resultado.push('Carga directa')
  }

  return resultado
}

// Helpers de semana (lunes a domingo)
export function getLunesDeSemana(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

export function getDomingoDeSemana(fecha: Date): Date {
  const lunes = getLunesDeSemana(fecha)
  const dom = new Date(lunes)
  dom.setDate(lunes.getDate() + 6)
  return dom
}

export function dateToISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// =====================================================
// INCIDENCIA: cruce ventas (de ventas_diarias) + costo (de consumo_diario)
// =====================================================

const VENTA_FIELD: Record<Servicio, 'venta_mediodia' | 'venta_noche' | 'venta_eventos'> = {
  mediodia: 'venta_mediodia',
  noche: 'venta_noche',
  eventos: 'venta_eventos',
}

const CUBIERTOS_FIELD: Record<Servicio, 'cubiertos_mediodia' | 'cubiertos_noche' | 'cubiertos_eventos'> = {
  mediodia: 'cubiertos_mediodia',
  noche: 'cubiertos_noche',
  eventos: 'cubiertos_eventos',
}

/**
 * Obtiene la incidencia (venta + costo) de un día/servicio puntual.
 * El costo queda CONGELADO con el valor guardado al momento de la carga.
 */
export async function obtenerIncidenciaDia(fecha: string, servicio: Servicio): Promise<IncidenciaDia> {
  const ventaField = VENTA_FIELD[servicio]
  const cubiertosField = CUBIERTOS_FIELD[servicio]

  const [vRes, cRes] = await Promise.all([
    supabase
      .from('ventas_diarias')
      .select(`${ventaField}, ${cubiertosField}`)
      .eq('fecha', fecha)
      .maybeSingle(),
    supabase
      .from('consumo_diario')
      .select('costo_total')
      .eq('fecha', fecha)
      .eq('servicio', servicio)
      .maybeSingle(),
  ])

  const venta = Number((vRes.data as any)?.[ventaField] || 0)
  const cubiertos = Number((vRes.data as any)?.[cubiertosField] || 0)
  const costo = Number((cRes.data as any)?.costo_total || 0)
  const incidencia = venta > 0 ? (costo / venta) * 100 : 0
  const ticket_promedio = cubiertos > 0 ? venta / cubiertos : 0

  return {
    fecha,
    servicio,
    venta,
    cubiertos,
    costo,
    incidencia,
    ticket_promedio,
    tiene_consumo: cRes.data !== null,
    tiene_venta: !!(vRes.data && venta > 0),
  }
}

/**
 * Resumen de un conjunto de días de incidencia.
 *
 * Vivía inline en la solapa Incidencia de /analisis. Se extrajo tal cual —sin
 * cambiar la cuenta— para que el Cierre de Mes muestre el MISMO número. Si el
 * cierre y /analisis dieran distinto, no habría forma de saber cuál está bien.
 *
 * La sutileza importante: la incidencia se calcula solo sobre los días que
 * tienen consumo cargado (`ventaConCosto`), no sobre la venta total. La carga
 * de consumo es parcial, así que dividir el costo de 9 días por la venta de 31
 * daría una incidencia ridículamente baja. Por eso siempre hay que mostrar el
 * muestreo al lado: `diasConCarga` de `diasConVenta`.
 */
export interface ResumenIncidencia {
  venta: number
  costo: number
  cubiertos: number
  /** Días (servicios) con consumo cargado */
  diasConCarga: number
  /** Días con venta cargada — el denominador del muestreo */
  diasConVenta: number
  /** Venta solo de los días que tienen costo, para que la incidencia sea comparable */
  ventaConCosto: number
  incidencia: number
  ticketPromedio: number
  margen: number
}

export function resumirIncidencias(incidencias: IncidenciaDia[]): ResumenIncidencia {
  const t = incidencias.reduce(
    (acc, d) => {
      acc.venta += d.venta
      acc.costo += d.costo
      acc.cubiertos += d.cubiertos
      if (d.tiene_consumo) {
        acc.diasConCarga++
        acc.ventaConCosto += d.venta // Solo ventas de días con costo cargado
      }
      return acc
    },
    { venta: 0, costo: 0, cubiertos: 0, diasConCarga: 0, ventaConCosto: 0 }
  )

  return {
    ...t,
    diasConVenta: incidencias.filter((d) => d.tiene_venta).length,
    incidencia: t.ventaConCosto > 0 ? (t.costo / t.ventaConCosto) * 100 : 0,
    ticketPromedio: t.cubiertos > 0 ? t.venta / t.cubiertos : 0,
    margen: t.venta - t.costo,
  }
}

/**
 * Guarda venta + cubiertos en ventas_diarias para un día/servicio
 */
export async function guardarVentaServicio(
  fecha: string,
  servicio: Servicio,
  venta: number,
  cubiertos: number
): Promise<void> {
  const ventaField = VENTA_FIELD[servicio]
  const cubiertosField = CUBIERTOS_FIELD[servicio]

  // Buscar fila existente
  const { data: existente } = await supabase
    .from('ventas_diarias')
    .select('id')
    .eq('fecha', fecha)
    .maybeSingle()

  if (existente) {
    const { error } = await supabase
      .from('ventas_diarias')
      .update({ [ventaField]: venta, [cubiertosField]: cubiertos })
      .eq('id', existente.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('ventas_diarias')
      .insert({
        fecha,
        venta_mediodia: 0,
        venta_noche: 0,
        venta_eventos: 0,
        cubiertos_mediodia: 0,
        cubiertos_noche: 0,
        cubiertos_eventos: 0,
        [ventaField]: venta,
        [cubiertosField]: cubiertos,
      })
    if (error) throw error
  }
}

/**
 * Obtiene incidencias de un mes para un servicio.
 * El costo queda CONGELADO con el valor guardado al momento de la carga.
 */
export async function obtenerIncidenciasMes(
  año: number,
  mes: number,
  servicio: Servicio
): Promise<IncidenciaDia[]> {
  const desde = `${año}-${String(mes).padStart(2, '0')}-01`
  const hastaDate = new Date(año, mes, 0)
  const hasta = `${año}-${String(mes).padStart(2, '0')}-${String(hastaDate.getDate()).padStart(2, '0')}`

  const ventaField = VENTA_FIELD[servicio]
  const cubiertosField = CUBIERTOS_FIELD[servicio]

  const [vRes, cRes] = await Promise.all([
    supabase
      .from('ventas_diarias')
      .select(`fecha, ${ventaField}, ${cubiertosField}`)
      .gte('fecha', desde)
      .lte('fecha', hasta),
    supabase
      .from('consumo_diario')
      .select('fecha, costo_total')
      .eq('servicio', servicio)
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])

  const ventasMap = new Map<string, { venta: number; cubiertos: number }>()
  for (const v of vRes.data || []) {
    ventasMap.set((v as any).fecha, {
      venta: Number((v as any)[ventaField] || 0),
      cubiertos: Number((v as any)[cubiertosField] || 0),
    })
  }
  const consumoMap = new Map<string, number>()
  for (const c of cRes.data || []) {
    consumoMap.set((c as any).fecha, Number((c as any).costo_total || 0))
  }

  // Combinar fechas únicas
  const fechasSet = new Set<string>()
  Array.from(ventasMap.keys()).forEach((k) => fechasSet.add(k))
  Array.from(consumoMap.keys()).forEach((k) => fechasSet.add(k))
  const fechas = Array.from(fechasSet).sort().reverse()

  return fechas.map((fecha) => {
    const v = ventasMap.get(fecha)
    const venta = v?.venta || 0
    const cubiertos = v?.cubiertos || 0
    const costo = consumoMap.get(fecha) || 0
    return {
      fecha,
      servicio,
      venta,
      cubiertos,
      costo,
      incidencia: venta > 0 ? (costo / venta) * 100 : 0,
      ticket_promedio: cubiertos > 0 ? venta / cubiertos : 0,
      tiene_consumo: consumoMap.has(fecha),
      tiene_venta: venta > 0,
    }
  })
}

/**
 * Recetas que tienen UN SOLO ingrediente, indexadas por ese insumo.
 *
 * PARA QUÉ: el buscador ofrece cargar un insumo o una receta, y las presenta
 * como equivalentes. Para el café, las aguas o la cerveza son la misma cosa —
 * hay una receta con la porción ya costeada— pero cargar el insumo suelto
 * pierde toda la lectura de venta: un insumo no tiene precio de carta, así que
 * no entra al ranking ni suma facturación.
 *
 * Pasó el 08/08/26: se cargaron $39.122 de café, agua y cerveza como insumo.
 * El costo quedó bien; las 30 aguas vendidas no figuran en ningún lado.
 *
 * La condición es EXACTAMENTE un ingrediente a propósito. Si fuera "el insumo
 * aparece en alguna receta", saltaría con el tomate, que está en veinte
 * recetas de varios ingredientes, y el aviso se volvería ruido que se ignora.
 */
export async function obtenerRecetasDeUnIngrediente(): Promise<Map<string, { id: string; nombre: string }>> {
  const [platosRes, ingredientesRes] = await Promise.all([
    supabase.from('platos').select('id, nombre').eq('activo', true),
    supabase.from('plato_ingredientes').select('plato_id, insumo_id, receta_base_id'),
  ])
  if (platosRes.error) throw platosRes.error
  if (ingredientesRes.error) throw ingredientesRes.error

  const activos = new Map((platosRes.data || []).map((p: any) => [p.id, p.nombre]))

  // Cuántas líneas tiene cada plato, y cuál es su insumo si tiene una sola
  const porPlato = new Map<string, { n: number; insumoId: string | null }>()
  for (const ing of ingredientesRes.data || []) {
    const acc = porPlato.get(ing.plato_id) || { n: 0, insumoId: null }
    acc.n += 1
    // Una línea con receta_base_id no es un insumo directo: descalifica el caso
    acc.insumoId = acc.n === 1 && ing.insumo_id ? ing.insumo_id : null
    porPlato.set(ing.plato_id, acc)
  }

  const mapa = new Map<string, { id: string; nombre: string }>()
  Array.from(porPlato.entries()).forEach(([platoId, { n, insumoId }]) => {
    const nombre = activos.get(platoId)
    if (n === 1 && insumoId && nombre) {
      mapa.set(insumoId, { id: platoId, nombre })
    }
  })
  return mapa
}
