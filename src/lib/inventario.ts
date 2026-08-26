import { supabase } from './supabase'
import { expandirCompuestos, type LineaInsumo } from './desglose-compuestos'
import { traerTodo } from './exportaciones'
import { costoFinalInsumo } from './costos'

/**
 * Inventario: cuánto entró, cuánto salió y qué diferencia hay.
 *
 * NO GUARDA STOCK. Lo calcula cada vez:
 *
 *   stock = lo contado en el último conteo de ese insumo
 *         + compras posteriores a esa fecha
 *         − consumo posterior a esa fecha
 *
 * Por eso el conteo ES el punto cero, y cada conteo nuevo vuelve a fijarlo.
 * Un insumo que nunca se contó no tiene stock confiable y se informa como tal
 * en vez de mostrar un número inventado — que es lo que hacía la pantalla vieja,
 * sumando TODAS las facturas desde el origen sin restar nada. Al 25/08/26 eso
 * daba 616 kg de bola de lomo.
 *
 * ES SOLO LECTURA SOBRE EL RESTO DEL SISTEMA. Lee facturas, consumo, insumos y
 * recetas; escribe únicamente en `inventario_conteos` y `inventario_conteo_items`.
 * El precio de los insumos, el costo de las recetas y el food cost no se enteran.
 *
 * TRES CONVERSIONES QUE NO SON OBVIAS, y sin las cuales el número no cierra:
 *
 *   1. El consumo se descuenta EN BRUTO. La receta guarda el neto que va al
 *      plato —7 kg de cebolla pelada— pero de la cámara salieron 7 ÷ (1 − merma)
 *      = 7,78 kg con cáscara. Lo que se cuenta en la cámara son cebollas
 *      enteras, así que el descuento tiene que estar en la misma unidad.
 *
 *   2. Las compras se multiplican por `cantidad_por_paquete`. La factura carga
 *      30 cajas de agua y el salón sirve botellas: sin el factor, el agua da
 *      −447 unidades.
 *
 *   3. Los compuestos se abren hasta el insumo con `expandirCompuestos()`, que
 *      ya resuelve el rendimiento. Una empanada descuenta 20 g de roast beef,
 *      no los 800 g del relleno entero, que rinde 40.
 */

export interface MovimientoInsumo {
  insumo_id: string
  nombre: string
  unidad: string
  categoria: string
  /** Última vez que se contó. null = nunca */
  fechaConteo: string | null
  /** Lo contado esa vez. 0 si nunca se contó */
  base: number
  /** Compras posteriores al conteo, ya en unidades sueltas */
  entro: number
  /** Unidades por caja del insumo. 1 = se compra suelto */
  porPaquete: number
  /** Consumo posterior al conteo, en bruto */
  salio: number
  /** base + entro − salio */
  stock: number
  /** Días desde el último conteo. null = nunca se contó */
  diasDesdeConteo: number | null
  /** Costo final de una unidad: lo que vale un kilo/unidad de este stock */
  precioConIva: number
  /** El stock valorizado a costo final */
  valor: number
  /**
   * Hay un conteo y es reciente. Sin conteo el número arrastra todo el
   * histórico; con uno viejo arrastra todo lo que pasó desde entonces sin que
   * nadie lo verificara. En los dos casos el número se muestra, pero atenuado.
   */
  confiable: boolean
}

/**
 * A partir de acá un conteo deja de servir como punto de partida.
 *
 * No es una regla contable: es que un mes de compras y consumos sin verificar
 * acumula demasiado error como para llamarlo stock. Además resuelve solo el
 * caso de sacar un insumo del inventario y volver a agregarlo meses después —
 * su conteo viejo queda vencido y hay que recontarlo, que es lo correcto.
 */
export const DIAS_CONTEO_VIGENTE = 30

/** Lo que se necesita de cada insumo para convertir unidades */
interface DatosInsumo {
  nombre: string
  unidad: string
  categoria: string
  merma: number
  porPaquete: number
  /** Precio de compra de una unidad, sin IVA */
  precio: number
  iva: number
}

/**
 * Neto de receta → bruto que sale de la cámara.
 *
 * Es la misma relación que usa la planilla de pedidos: con 25% de merma,
 * 18,40 kg netos son 24,53 kg de compra. Una merma de 100% sería una división
 * por cero, así que se corta en 99.
 */
export function aBruto(neto: number, mermaPorcentaje: number): number {
  const m = Math.min(Math.max(mermaPorcentaje || 0, 0), 99)
  return neto / (1 - m / 100)
}

/**
 * Cuánto vale una cantidad de stock, a COSTO FINAL.
 *
 * Es la política del resto del sistema: no se lleva IVA compras contra IVA
 * ventas, todo se evalúa sobre el costo final. Se usa `costoFinalInsumo()` —la
 * única fórmula del costo, ver docs/SISTEMA-COSTOS.md— y no una cuenta escrita
 * acá, para que el día que cambie, cambie en un solo lado.
 *
 * ⚠️ EL COSTO FINAL SE APLICA SOBRE LA CANTIDAD ÚTIL, NO SOBRE LA BRUTA. El
 * C. Final divide por (1 − merma) para dar el costo del kilo que llega al plato,
 * y el stock está en BRUTO, con cáscara. Multiplicar los dos contaría la merma
 * dos veces: 11% de más con la cebolla al 10%, 33% con el limón al 40%.
 *
 * Llevado a la cantidad útil, el factor se cancela y da exactamente lo pagado:
 *
 *   costo_final × útiles
 *     = [precio × (1+iva) / (1−merma)] × [brutos × (1−merma)]
 *     = brutos × precio × (1+iva)
 */
export function valorizar(cantidadBruta: number, precio: number, iva: number, merma: number): number {
  const m = Math.min(Math.max(merma || 0, 0), 99)
  const util = cantidadBruta * (1 - m / 100)
  return util * costoFinalInsumo(precio, iva, m)
}

async function datosDeInsumos(): Promise<Map<string, DatosInsumo>> {
  const [insumosRes, preciosRes] = await Promise.all([
    supabase
      .from('insumos')
      .select('id, nombre, unidad_medida, categoria, merma_porcentaje, cantidad_por_paquete, iva_porcentaje')
      .eq('activo', true)
      .eq('inventario', true),
    supabase.from('precios_insumo').select('insumo_id, precio').eq('es_precio_actual', true),
  ])
  if (insumosRes.error) throw insumosRes.error
  if (preciosRes.error) throw preciosRes.error

  const precios = new Map(
    (preciosRes.data || []).map((p: any) => [p.insumo_id, Number(p.precio) || 0])
  )

  return new Map(
    (insumosRes.data || []).map((i: any) => [
      i.id,
      {
        nombre: i.nombre,
        unidad: i.unidad_medida || '',
        categoria: i.categoria || '',
        merma: Number(i.merma_porcentaje) || 0,
        porPaquete: Number(i.cantidad_por_paquete) || 1,
        precio: precios.get(i.id) || 0,
        iva: Number(i.iva_porcentaje) || 0,
      },
    ])
  )
}

/** Última fecha contada por insumo, con lo que se contó */
async function ultimosConteos(): Promise<Map<string, { fecha: string; cantidad: number }>> {
  const { data, error } = await supabase
    .from('inventario_conteo_items')
    .select('insumo_id, cantidad_contada, inventario_conteos!inner (fecha)')
    .order('fecha', { referencedTable: 'inventario_conteos', ascending: false })
  if (error) throw error

  const mapa = new Map<string, { fecha: string; cantidad: number }>()
  for (const fila of (data || []) as any[]) {
    const fecha = fila.inventario_conteos?.fecha
    if (!fecha) continue
    const previo = mapa.get(fila.insumo_id)
    // Se queda con el más reciente: el orden del select no garantiza el de la
    // tabla anidada en todos los casos, así que se compara acá.
    if (!previo || fecha > previo.fecha) {
      mapa.set(fila.insumo_id, { fecha, cantidad: Number(fila.cantidad_contada) || 0 })
    }
  }
  return mapa
}

/**
 * Compras por insumo desde una fecha, ya convertidas a unidades sueltas.
 *
 * Las notas de crédito restan: son devolución de mercadería, así que la
 * mercadería no está en la cámara.
 */
async function comprasDesde(desde: string, insumos: Map<string, DatosInsumo>) {
  const filas = await traerTodo<any>(
    'factura_items',
    'insumo_id, cantidad, facturas_proveedor!inner (fecha, activo, tipo)',
    (q: any) => q.gte('facturas_proveedor.fecha', desde).neq('facturas_proveedor.activo', false)
  )

  const mapa = new Map<string, number>()
  for (const f of filas) {
    if (!f.insumo_id) continue
    const info = insumos.get(f.insumo_id)
    if (!info) continue
    const esNC = f.facturas_proveedor?.tipo === 'nota_credito'
    const cantidad = (Number(f.cantidad) || 0) * info.porPaquete
    mapa.set(f.insumo_id, (mapa.get(f.insumo_id) || 0) + (esNC ? -cantidad : cantidad))
  }
  return mapa
}

/**
 * Consumo por insumo desde una fecha, en BRUTO.
 *
 * Cada línea del consumo se abre hasta el insumo y recién ahí se le aplica la
 * merma. Hacerlo al revés —expandir un total ya "brutificado"— daría distinto
 * cuando una receta mezcla insumos de mermas distintas, que es el caso normal:
 * la tortilla lleva cebollón al 25% y papa al 15%.
 */
async function consumoDesde(desde: string, insumos: Map<string, DatosInsumo>) {
  const filas = await traerTodo<any>(
    'consumo_items',
    'tipo, cantidad, insumo_id, receta_base_id, plato_id, trago_id, menu_ejecutivo_id, consumo_diario!inner (fecha)',
    (q: any) => q.gte('consumo_diario.fecha', desde)
  )

  const ids = (tipo: string, campo: string): string[] =>
    filas.filter((f: any) => f.tipo === tipo).map((f: any) => f[campo]).filter(Boolean)

  const expandidos = await expandirCompuestos({
    elaboraciones: ids('elaboracion', 'receta_base_id'),
    recetas: ids('receta', 'plato_id'),
    tragos: ids('trago', 'trago_id'),
    ejecutivos: ids('ejecutivo', 'menu_ejecutivo_id'),
  })

  const lineasDe = (f: any): LineaInsumo[] | null => {
    switch (f.tipo) {
      case 'elaboracion': return expandidos.elaboraciones.get(f.receta_base_id || '') || []
      case 'receta': return expandidos.recetas.get(f.plato_id || '') || []
      case 'trago': return expandidos.tragos.get(f.trago_id || '') || []
      case 'ejecutivo': return expandidos.ejecutivos.get(f.menu_ejecutivo_id || '') || []
      default: return null // insumo suelto, o vino (que no baja a insumo)
    }
  }

  const mapa = new Map<string, number>()
  const sumar = (insumoId: string, neto: number) => {
    const info = insumos.get(insumoId)
    if (!info) return
    mapa.set(insumoId, (mapa.get(insumoId) || 0) + aBruto(neto, info.merma))
  }

  for (const f of filas) {
    const cantidad = Number(f.cantidad) || 0
    if (cantidad === 0) continue
    const lineas = lineasDe(f)
    if (lineas === null) {
      // Carga directa: la cantidad ya está en la unidad del insumo
      if (f.insumo_id) sumar(f.insumo_id, cantidad)
      continue
    }
    for (const l of lineas) sumar(l.insumo_id, cantidad * l.cantidad)
  }
  return mapa
}

/** Antes de esta fecha no hay nada que valga la pena mirar */
const ORIGEN = '2026-01-01'

/**
 * El estado de la cámara hoy, insumo por insumo.
 *
 * Solo los insumos marcados con `inventario = true`: son 47 de 323, y el resto
 * —especias, descartables— no se cuenta.
 */
export async function obtenerMovimientos(): Promise<MovimientoInsumo[]> {
  const insumos = await datosDeInsumos()
  const conteos = await ultimosConteos()

  // Se pide desde el conteo más viejo (o el origen) y después se recorta por
  // insumo. Así son dos consultas y no dos por insumo.
  const fechas = Array.from(conteos.values()).map((c) => c.fecha)
  const desde = fechas.length > 0 ? fechas.sort()[0] : ORIGEN

  const [compras, consumo] = await Promise.all([
    comprasDesde(desde, insumos),
    consumoDesde(desde, insumos),
  ])

  // Los insumos con conteo propio necesitan su recorte: lo de antes de SU
  // conteo ya está adentro del número contado y contarlo otra vez lo duplica.
  const porInsumo = new Map<string, { entro: number; salio: number }>()
  for (const [id] of Array.from(insumos)) {
    porInsumo.set(id, { entro: compras.get(id) || 0, salio: consumo.get(id) || 0 })
  }

  const conteosPorFecha = Array.from(new Set(Array.from(conteos.values()).map((c) => c.fecha)))
  for (const fecha of conteosPorFecha) {
    if (fecha === desde) continue
    const soloEstos = new Map(
      Array.from(insumos).filter(([id]) => conteos.get(id)?.fecha === fecha)
    )
    if (soloEstos.size === 0) continue
    const [c2, k2] = await Promise.all([
      comprasDesde(fecha, soloEstos),
      consumoDesde(fecha, soloEstos),
    ])
    for (const [id] of Array.from(soloEstos)) {
      porInsumo.set(id, { entro: c2.get(id) || 0, salio: k2.get(id) || 0 })
    }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const filas: MovimientoInsumo[] = []
  for (const [id, info] of Array.from(insumos)) {
    const conteo = conteos.get(id)
    const mov = porInsumo.get(id) || { entro: 0, salio: 0 }
    const base = conteo?.cantidad ?? 0

    // La fecha viene como YYYY-MM-DD: se arma local para no correrse un día
    let dias: number | null = null
    if (conteo) {
      const [a, m, d] = conteo.fecha.split('-').map(Number)
      const f = new Date(a, m - 1, d)
      dias = Math.round((hoy.getTime() - f.getTime()) / 86400000)
    }

    filas.push({
      insumo_id: id,
      nombre: info.nombre,
      unidad: info.unidad,
      categoria: info.categoria,
      fechaConteo: conteo?.fecha ?? null,
      base,
      entro: mov.entro,
      porPaquete: info.porPaquete,
      salio: mov.salio,
      stock: base + mov.entro - mov.salio,
      diasDesdeConteo: dias,
      precioConIva: costoFinalInsumo(info.precio, info.iva, info.merma),
      valor: valorizar(base + mov.entro - mov.salio, info.precio, info.iva, info.merma),
      confiable: dias !== null && dias <= DIAS_CONTEO_VIGENTE,
    })
  }

  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// =====================================================
// CONTEOS
// =====================================================

export interface LineaConteo {
  insumo_id: string
  cantidad_teorica: number
  cantidad_contada: number
  motivo: string | null
  nota: string | null
}

/**
 * Guarda un conteo con sus líneas.
 *
 * `cantidad_teorica` se guarda tal como se mostró, no se recalcula después: es
 * la foto de lo que se comparó ese día. Si más adelante se corrige una factura
 * vieja, el teórico cambiaría y la diferencia registrada dejaría de significar
 * lo que significó.
 */
export async function guardarConteo(
  fecha: string,
  lineas: LineaConteo[],
  notas?: string
): Promise<string> {
  const { data, error } = await supabase
    .from('inventario_conteos')
    .insert({ fecha, notas: notas || null })
    .select('id')
    .single()
  if (error) throw error

  const conteoId = (data as any).id as string
  if (lineas.length > 0) {
    const { error: eItems } = await supabase.from('inventario_conteo_items').insert(
      lineas.map((l) => ({ conteo_id: conteoId, ...l }))
    )
    if (eItems) throw eItems
  }
  return conteoId
}

export interface AjusteAcumulado {
  insumo_id: string
  nombre: string
  unidad: string
  /** Veces que se contó este insumo */
  conteos: number
  /** De esas, cuántas dieron distinto */
  conDiferencia: number
  ajusteTotal: number
  /** ajusteTotal en pesos, con IVA */
  valor: number
}

/**
 * Ajustes acumulados por insumo: dónde se repite la diferencia.
 *
 * Lo que importa no es el total sino la parte SIN EXPLICACIÓN. Un insumo que
 * ajusta mucho pero siempre por consumo sin cargar es un problema de rutina;
 * uno que ajusta sin motivo, mes tras mes, es otra cosa.
 */
export async function obtenerAjustes(desde: string, hasta?: string): Promise<AjusteAcumulado[]> {
  const insumos = await datosDeInsumos()

  let q = supabase
    .from('inventario_conteo_items')
    .select('insumo_id, diferencia, motivo, insumos (nombre, unidad_medida), inventario_conteos!inner (fecha)')
    .gte('inventario_conteos.fecha', desde)
  if (hasta) q = q.lte('inventario_conteos.fecha', hasta)

  const { data, error } = await q
  if (error) throw error

  const mapa = new Map<string, AjusteAcumulado>()
  for (const f of (data || []) as any[]) {
    const dif = Number(f.diferencia) || 0
    // El primer conteo de un insumo es una carga, no un ajuste: si contara,
    // el arranque del 31/07 metería 47 líneas que no son diferencias.
    if (f.motivo === MOTIVO_INICIAL) continue

    const actual = mapa.get(f.insumo_id) || {
      insumo_id: f.insumo_id,
      nombre: f.insumos?.nombre ?? '(sin nombre)',
      unidad: f.insumos?.unidad_medida ?? '',
      conteos: 0,
      conDiferencia: 0,
      ajusteTotal: 0,
      valor: 0,
    }
    actual.conteos++
    if (Math.abs(dif) > 0.001) {
      actual.conDiferencia++
      actual.ajusteTotal += dif
    }
    mapa.set(f.insumo_id, actual)
  }

  // Un conteo que dio exacto no es una diferencia: no tiene nada que explicar
  // y llena el cuadro de ceros. Se cuenta por VECES con diferencia, no por el
  // total: un +5 y un −5 suman cero y sin embargo pasó dos veces.
  // El orden es por PLATA, que es lo que decide si vale la pena ir a mirar.
  return Array.from(mapa.values())
    .filter((a) => a.conDiferencia > 0)
    .map((a) => {
      const i = insumos.get(a.insumo_id)
      return { ...a, valor: i ? valorizar(a.ajusteTotal, i.precio, i.iva, i.merma) : 0 }
    })
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
}

/** Los conteos de UN insumo, del más reciente al más viejo */
export interface LineaHistorial {
  fecha: string
  teorico: number
  contado: number
  diferencia: number
  valor: number
  motivo: string | null
}

export async function obtenerHistorial(insumoId: string): Promise<LineaHistorial[]> {
  const insumos = await datosDeInsumos()
  const info = insumos.get(insumoId)

  const { data, error } = await supabase
    .from('inventario_conteo_items')
    .select('cantidad_teorica, cantidad_contada, diferencia, motivo, inventario_conteos!inner (fecha)')
    .eq('insumo_id', insumoId)
  if (error) throw error

  return ((data || []) as any[])
    .map((f) => ({
      fecha: f.inventario_conteos?.fecha ?? '',
      teorico: Number(f.cantidad_teorica) || 0,
      contado: Number(f.cantidad_contada) || 0,
      diferencia: Number(f.diferencia) || 0,
      valor: info ? valorizar(Number(f.diferencia) || 0, info.precio, info.iva, info.merma) : 0,
      motivo: f.motivo,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Los motivos que ofrece la pantalla. Texto en la base: agregar uno no es migration. */
/** Se propone solo cuando es el primer conteo del insumo. No es un ajuste. */
export const MOTIVO_INICIAL = 'stock_inicial'

export const MOTIVOS: { valor: string; label: string; ayuda: string }[] = [
  { valor: MOTIVO_INICIAL, label: 'Stock inicial', ayuda: 'Primera vez que se cuenta: es una carga, no una diferencia' },
  { valor: 'falta_registrar', label: 'Consumo sin cargar', ayuda: 'Salió de la cámara y nadie lo cargó en Análisis — eventos, por ejemplo' },
  { valor: 'merma_de_mas', label: 'Merma cobrada de más', ayuda: 'El sistema descontó una merma que no ocurrió. Sobra stock' },
  { valor: 'rotura', label: 'Rotura o vencimiento', ayuda: 'Se descartó mercadería' },
  { valor: 'error_carga', label: 'Error de carga', ayuda: 'Una factura o un consumo cargado mal' },
  { valor: 'sin_explicacion', label: 'Sin explicación', ayuda: 'No se encontró la causa. Es el que importa mirar' },
]
