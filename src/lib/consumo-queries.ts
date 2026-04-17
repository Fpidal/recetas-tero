// Queries del módulo Análisis (consumo + incidencia real)

import { supabase } from './supabase'
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
 * Insumos con precio actual + IVA (sin merma porque para consumo se pesa neto)
 */
export async function obtenerInsumosBuscador(): Promise<OpcionBuscador[]> {
  const { data, error } = await supabase
    .from('v_insumos_con_precio')
    .select('id, nombre, unidad_medida, precio_actual, iva_porcentaje')
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
      // IVA incluido (sin merma)
      costo_unitario: Number(i.precio_actual) * (1 + Number(i.iva_porcentaje || 0) / 100),
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
 * Combina todas las opciones (insumos + elaboraciones + recetas) para un buscador unificado
 */
export async function obtenerTodasOpciones(): Promise<OpcionBuscador[]> {
  const [ins, elab, rec] = await Promise.all([
    obtenerInsumosBuscador(),
    obtenerElaboracionesBuscador(),
    obtenerRecetasBuscador(),
  ])
  return [...ins, ...elab, ...rec]
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
      insumos:insumo_id (nombre),
      recetas_base:receta_base_id (nombre),
      platos:plato_id (nombre)
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
      '(sin nombre)',
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
  const { error } = await supabase.from('consumo_items').insert({
    consumo_id: consumoId,
    tipo: item.tipo,
    insumo_id: item.tipo === 'insumo' ? item.insumo_id : null,
    receta_base_id: item.tipo === 'elaboracion' ? item.receta_base_id : null,
    plato_id: item.tipo === 'receta' ? item.plato_id : null,
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
 * Toma los items cargados (que pueden ser insumos, elaboraciones o recetas)
 * y los desglosa a nivel insumo, sumando cantidades y costos.
 *
 * Por ejemplo: 12 milanesas + 2,5 kg de bola de lomo
 *   → "Bola de lomo: 1,8 kg + 2,5 kg = 4,3 kg" (con sus orígenes)
 */
export async function desglosarConsumo(consumoId: string): Promise<ItemDesglosado[]> {
  // 1. Obtener todos los items del consumo
  const items = await obtenerItemsConsumo(consumoId)
  if (items.length === 0) return []

  // 2. Obtener insumos referenciados directamente
  const insumosDirectos = items.filter((i) => i.tipo === 'insumo' && i.insumo_id)

  // 3. Obtener elaboraciones (recetas_base) y sus ingredientes
  const elabIds = items
    .filter((i) => i.tipo === 'elaboracion' && i.receta_base_id)
    .map((i) => i.receta_base_id!)

  // 4. Obtener recetas (platos) y sus ingredientes
  const platoIds = items
    .filter((i) => i.tipo === 'receta' && i.plato_id)
    .map((i) => i.plato_id!)

  // Cargar ingredientes de elaboraciones
  type IngredienteElab = {
    receta_base_id: string
    insumo_id: string
    cantidad: number
    rendimiento_porciones: number
    nombre_receta: string
  }

  let ingredientesElab: IngredienteElab[] = []
  if (elabIds.length > 0) {
    const { data } = await supabase
      .from('recetas_base')
      .select('id, nombre, rendimiento_porciones, receta_base_ingredientes(insumo_id, cantidad)')
      .in('id', elabIds)

    for (const r of data || []) {
      const rendimiento = (r as any).rendimiento_porciones > 0 ? (r as any).rendimiento_porciones : 1
      for (const ing of (r as any).receta_base_ingredientes || []) {
        ingredientesElab.push({
          receta_base_id: (r as any).id,
          insumo_id: ing.insumo_id,
          cantidad: ing.cantidad / rendimiento, // por porción
          rendimiento_porciones: rendimiento,
          nombre_receta: (r as any).nombre,
        })
      }
    }
  }

  // Cargar ingredientes de platos (incluye recetas_base anidadas)
  type IngredientePlato = {
    plato_id: string
    insumo_id: string
    cantidad: number // por porción del plato
    nombre_plato: string
  }

  let ingredientesPlato: IngredientePlato[] = []
  if (platoIds.length > 0) {
    const { data } = await supabase
      .from('platos')
      .select(`
        id, nombre, rendimiento_porciones,
        plato_ingredientes (
          insumo_id, receta_base_id, cantidad
        )
      `)
      .in('id', platoIds)

    // Cargar receta_base_ingredientes para platos que tengan recetas anidadas
    const recetaBaseIdsAnidadas = new Set<string>()
    for (const p of data || []) {
      for (const ing of (p as any).plato_ingredientes || []) {
        if (ing.receta_base_id) recetaBaseIdsAnidadas.add(ing.receta_base_id)
      }
    }

    let recetasAnidadas: Map<string, { insumo_id: string; cantidad_por_porcion: number }[]> = new Map()
    if (recetaBaseIdsAnidadas.size > 0) {
      const { data: rdata } = await supabase
        .from('recetas_base')
        .select('id, rendimiento_porciones, receta_base_ingredientes(insumo_id, cantidad)')
        .in('id', Array.from(recetaBaseIdsAnidadas))

      for (const r of rdata || []) {
        const rendimiento = (r as any).rendimiento_porciones > 0 ? (r as any).rendimiento_porciones : 1
        const ings = ((r as any).receta_base_ingredientes || []).map((ing: any) => ({
          insumo_id: ing.insumo_id,
          cantidad_por_porcion: ing.cantidad / rendimiento,
        }))
        recetasAnidadas.set((r as any).id, ings)
      }
    }

    for (const p of data || []) {
      const rendimiento = (p as any).rendimiento_porciones > 0 ? (p as any).rendimiento_porciones : 1
      for (const ing of (p as any).plato_ingredientes || []) {
        if (ing.insumo_id) {
          ingredientesPlato.push({
            plato_id: (p as any).id,
            insumo_id: ing.insumo_id,
            cantidad: ing.cantidad / rendimiento,
            nombre_plato: (p as any).nombre,
          })
        } else if (ing.receta_base_id) {
          // El ingrediente es una receta base anidada → desglosar a sus insumos
          const subIngs = recetasAnidadas.get(ing.receta_base_id) || []
          for (const sub of subIngs) {
            ingredientesPlato.push({
              plato_id: (p as any).id,
              insumo_id: sub.insumo_id,
              cantidad: (ing.cantidad / rendimiento) * sub.cantidad_por_porcion,
              nombre_plato: (p as any).nombre,
            })
          }
        }
      }
    }
  }

  // Pre-cargar precios actuales de todos los insumos involucrados (para prorrateo)
  const todosInsumoIds = new Set<string>()
  for (const it of insumosDirectos) if (it.insumo_id) todosInsumoIds.add(it.insumo_id)
  for (const e of ingredientesElab) todosInsumoIds.add(e.insumo_id)
  for (const p of ingredientesPlato) todosInsumoIds.add(p.insumo_id)

  const { data: infoInsumos } = await supabase
    .from('v_insumos_con_precio')
    .select('id, nombre, unidad_medida, precio_actual, iva_porcentaje')
    .in('id', Array.from(todosInsumoIds))

  const infoMap = new Map<
    string,
    { nombre: string; unidad: string; costo_unit_iva: number }
  >()
  for (const i of infoInsumos || []) {
    const precio = Number((i as any).precio_actual || 0)
    const iva = Number((i as any).iva_porcentaje || 0)
    infoMap.set((i as any).id, {
      nombre: (i as any).nombre,
      unidad: (i as any).unidad_medida,
      costo_unit_iva: precio * (1 + iva / 100),
    })
  }

  // Consolidar a nivel insumo.
  // El costo se prorratea para que la suma = total del consumo (congelado).
  type Acum = {
    cantidad: number
    costo: number
    origenes: string[]
  }
  const mapa = new Map<string, Acum>()

  // 1) Insumos directos: costo = subtotal cacheado directo
  for (const item of insumosDirectos) {
    const acc = mapa.get(item.insumo_id!) || { cantidad: 0, costo: 0, origenes: [] }
    acc.cantidad += Number(item.cantidad)
    acc.costo += Number(item.subtotal)
    acc.origenes.push('Carga directa')
    mapa.set(item.insumo_id!, acc)
  }

  // 2) Elaboraciones: prorratear subtotal cacheado entre sus insumos
  for (const item of items) {
    if (item.tipo !== 'elaboracion' || !item.receta_base_id) continue
    const ings = ingredientesElab.filter((e) => e.receta_base_id === item.receta_base_id)
    if (ings.length === 0) continue

    // Calcular costo teórico de cada insumo con precios actuales (para obtener el peso)
    const costosTeoricos = ings.map((ing) => {
      const info = infoMap.get(ing.insumo_id)
      const cantidadInsumo = Number(item.cantidad) * ing.cantidad
      return {
        ing,
        cantidadInsumo,
        costoTeorico: info ? cantidadInsumo * info.costo_unit_iva : 0,
      }
    })
    const totalTeorico = costosTeoricos.reduce((a, c) => a + c.costoTeorico, 0)
    const subtotalCacheado = Number(item.subtotal)

    for (const { ing, cantidadInsumo, costoTeorico } of costosTeoricos) {
      const acc = mapa.get(ing.insumo_id) || { cantidad: 0, costo: 0, origenes: [] }
      acc.cantidad += cantidadInsumo
      // Prorrateo: si hay total teórico, usar % ; si no, distribuir en partes iguales
      if (totalTeorico > 0) {
        acc.costo += subtotalCacheado * (costoTeorico / totalTeorico)
      } else {
        acc.costo += subtotalCacheado / costosTeoricos.length
      }
      acc.origenes.push(`${item.cantidad} ${item.unidad} ${ing.nombre_receta}`)
      mapa.set(ing.insumo_id, acc)
    }
  }

  // 3) Recetas (platos): idem prorrateo
  for (const item of items) {
    if (item.tipo !== 'receta' || !item.plato_id) continue
    const ings = ingredientesPlato.filter((p) => p.plato_id === item.plato_id)
    if (ings.length === 0) continue

    const costosTeoricos = ings.map((ing) => {
      const info = infoMap.get(ing.insumo_id)
      const cantidadInsumo = Number(item.cantidad) * ing.cantidad
      return {
        ing,
        cantidadInsumo,
        costoTeorico: info ? cantidadInsumo * info.costo_unit_iva : 0,
      }
    })
    const totalTeorico = costosTeoricos.reduce((a, c) => a + c.costoTeorico, 0)
    const subtotalCacheado = Number(item.subtotal)

    for (const { ing, cantidadInsumo, costoTeorico } of costosTeoricos) {
      const acc = mapa.get(ing.insumo_id) || { cantidad: 0, costo: 0, origenes: [] }
      acc.cantidad += cantidadInsumo
      if (totalTeorico > 0) {
        acc.costo += subtotalCacheado * (costoTeorico / totalTeorico)
      } else {
        acc.costo += subtotalCacheado / costosTeoricos.length
      }
      acc.origenes.push(`${item.cantidad} ${item.unidad} ${ing.nombre_plato}`)
      mapa.set(ing.insumo_id, acc)
    }
  }

  if (mapa.size === 0) return []

  // Construir resultado
  const resultado: ItemDesglosado[] = []
  Array.from(mapa.entries()).forEach(([id, acc]) => {
    const info = infoMap.get(id)
    if (!info) return
    resultado.push({
      insumo_id: id,
      nombre: info.nombre,
      unidad: info.unidad,
      cantidad_total: acc.cantidad,
      costo_total: acc.costo,
      origenes: Array.from(new Set(acc.origenes)),
    })
  })

  resultado.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-AR'))
  return resultado
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
