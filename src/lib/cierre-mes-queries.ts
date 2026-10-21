import { supabase } from './supabase'
import { obtenerIncidenciasMes, resumirIncidencias, type ResumenIncidencia } from './consumo-queries'
import type { Servicio } from '@/types/analisis'

/**
 * Datos del Cierre de Mes — la foto del mes.
 *
 * DE DÓNDE SALE CADA COSA:
 *
 *   Compras (totales, rubros, semanas, top 10)  →  función SQL `cierre_mes()`
 *   Ventas, cubiertos, ticket, incidencia       →  obtenerIncidenciasMes() + resumirIncidencias()
 *
 * El corte no es caprichoso. Las compras son agregación pura sobre miles de
 * filas: se hace en la base y vuelve un JSON. Ventas e incidencia, en cambio,
 * YA están calculadas en /analisis, y reescribirlas en SQL dejaría la misma
 * fórmula viviendo en dos lugares. Eso es exactamente lo que pasó con la
 * fórmula de la merma y costó una semana de arqueología (ver docs/SISTEMA-COSTOS.md).
 *
 * Regla: si una cuenta ya existe en algún lado, se reutiliza. Si no existe,
 * se escribe una sola vez, y si es agregación pesada, se escribe en SQL.
 */

const SERVICIOS: Servicio[] = ['mediodia', 'noche', 'eventos']

// ---------------------------------------------------------------
// Lo que devuelve la función SQL
// ---------------------------------------------------------------

export interface RubroCompra {
  rubro: string
  monto: number
  monto_previo: number
}

export interface SemanaCompra {
  desde: string // YYYY-MM-DD
  hasta: string
  dias_en_mes: number
  /** true si la semana calendario quedó cortada por el corte de mes */
  cortada: boolean
  monto: number
}

export interface InsumoTop {
  insumo_id: string
  nombre: string
  rubro: string
  monto: number
  cantidad: number
  /** Variación del precio DENTRO del mes. null si no hubo dos precios para comparar */
  variacion_precio: number | null
}

export interface VentaServicio {
  servicio: Servicio
  venta: number
  cubiertos: number
}

interface RespuestaSQL {
  mes: string
  mes_previo: string
  compras: { mes: number; previo: number }
  ventas: { mes: number; previo: number; cubiertos: number; cubiertos_previo: number }
  rubros: RubroCompra[]
  semanas: SemanaCompra[]
  top_insumos: InsumoTop[]
  ventas_por_servicio: VentaServicio[]
}

// ---------------------------------------------------------------
// Lo que consume la pantalla
// ---------------------------------------------------------------

export interface CierreMes {
  mes: string // YYYY-MM-01
  mesPrevio: string
  compras: { mes: number; previo: number }
  ventas: { mes: number; previo: number; cubiertos: number; cubiertosPrevio: number }
  rubros: RubroCompra[]
  semanas: SemanaCompra[]
  topInsumos: InsumoTop[]
  ventasPorServicio: VentaServicio[]
  /** Incidencia real del mes y del anterior, con su muestreo */
  incidencia: ResumenIncidencia
  incidenciaPrevia: ResumenIncidencia
  /** Qué falta cargar, para avisar en vez de mostrar ceros */
  faltaVentas: boolean
  faltaConsumo: boolean
  /** Día de corte de los dos meses, cuando se mira el mes en curso */
  hastaDia?: number
  // --- Secciones agregadas en V.66. Opcionales mientras se construyen las queries ---
  /** Los 10 proveedores del mes, con su puesto en el mes anterior */
  proveedores?: ProveedorMes[]
  /** Los que estaban en el top 10 del mes anterior y este mes no */
  proveedoresSalieron?: ProveedorMes[]
  /** Incidencia real de cada servicio, con los meses anteriores para ver la tendencia */
  incidenciaPorServicio?: IncidenciaServicio[]
  /** Ventas del mes anterior por servicio, para comparar restaurante y eventos */
  ventasPorServicioPrevio?: VentaServicio[]
  canasta?: Canasta
}

export interface ProveedorMes {
  nombre: string
  monto: number
  montoPrevio: number
  puesto: number | null
  puestoPrevio: number | null
}

export interface IncidenciaServicio {
  servicio: Servicio
  /** Del mes, con su muestreo */
  resumen: ResumenIncidencia
  /** Meses anteriores, del más viejo al más nuevo. null = sin consumo cargado */
  historia: { mes: string; incidencia: number | null }[]
}

/**
 * "Tu inflación": cuánto subió lo que se compra, ponderado por lo que se gasta
 * en cada insumo, contra el ticket del restaurante y el IPC.
 */
export interface Canasta {
  /** Primer mes de la serie (YYYY-MM-01): las variaciones acumuladas parten de ahí */
  desde: string
  meses: { mes: string; canasta: number | null; ticket: number | null; ipc: number | null }[]
  /** variacion null: el rubro no tuvo ningún insumo comprado dos meses seguidos */
  rubros: { rubro: string; gasto: number; variacion: number | null }[]
  insumos: number
}

/** Variación porcentual. null cuando no hay base contra la cual comparar. */
export function variacion(actual: number, previo: number): number | null {
  if (!previo) return null
  return ((actual - previo) / Math.abs(previo)) * 100
}

/** "2026-07" → "2026-07-01", que es lo que espera la función SQL */
function primerDia(mes: string): string {
  return `${mes}-01`
}

/** Resume los tres servicios de un mes en un solo número, como hace /analisis */
async function incidenciaDelMes(
  anio: number,
  mes: number,
  hastaDia?: number
): Promise<ResumenIncidencia> {
  const porServicio = await Promise.all(
    SERVICIOS.map((s) => obtenerIncidenciasMes(anio, mes, s))
  )
  const dias = porServicio.flat()
  // Mismo corte que la función SQL: si se compara un mes en curso, los dos
  // lados tienen que cubrir la misma cantidad de días.
  const recortados = hastaDia
    ? dias.filter((d) => Number(d.fecha.slice(8, 10)) <= hastaDia)
    : dias
  return resumirIncidencias(recortados)
}

/**
 * Trae todo el cierre de un mes. `mes` en formato YYYY-MM.
 *
 * @param hastaDia Corta LOS DOS meses el mismo día. Para un mes en curso es
 * obligatorio: comparar agosto hasta el 16 contra julio entero hace que el mes
 * actual siempre parezca más bajo, y marca caídas que no existen. Sin este
 * parámetro se comparan los meses completos, que es lo correcto para un mes ya
 * cerrado (la solapa Cierre de Mes).
 */
export async function obtenerCierreMes(mes: string, hastaDia?: number): Promise<CierreMes> {
  const [anio, mesNum] = mes.split('-').map(Number)

  // Mes anterior, cuidando el salto de año
  const previoDate = new Date(anio, mesNum - 2, 1)
  const anioPrevio = previoDate.getFullYear()
  const mesPrevioNum = previoDate.getMonth() + 1

  const [rpc, incidencia, incidenciaPrevia] = await Promise.all([
    supabase.rpc('cierre_mes', { p_mes: primerDia(mes), p_hasta_dia: hastaDia ?? null }),
    incidenciaDelMes(anio, mesNum, hastaDia),
    incidenciaDelMes(anioPrevio, mesPrevioNum, hastaDia),
  ])

  if (rpc.error) throw rpc.error
  const d = rpc.data as RespuestaSQL

  const num = (v: any) => Number(v) || 0

  return {
    mes: d.mes,
    mesPrevio: d.mes_previo,
    compras: { mes: num(d.compras?.mes), previo: num(d.compras?.previo) },
    ventas: {
      mes: num(d.ventas?.mes),
      previo: num(d.ventas?.previo),
      cubiertos: num(d.ventas?.cubiertos),
      cubiertosPrevio: num(d.ventas?.cubiertos_previo),
    },
    rubros: (d.rubros || []).map((r) => ({
      rubro: r.rubro,
      monto: num(r.monto),
      monto_previo: num(r.monto_previo),
    })),
    semanas: (d.semanas || []).map((s) => ({ ...s, monto: num(s.monto) })),
    topInsumos: (d.top_insumos || []).map((t) => ({
      ...t,
      monto: num(t.monto),
      cantidad: num(t.cantidad),
      variacion_precio: t.variacion_precio === null ? null : Number(t.variacion_precio),
    })),
    ventasPorServicio: (d.ventas_por_servicio || []).map((v) => ({
      ...v,
      venta: num(v.venta),
      cubiertos: num(v.cubiertos),
    })),
    incidencia,
    incidenciaPrevia,
    faltaVentas: incidencia.venta === 0,
    faltaConsumo: incidencia.diasConCarga === 0,
  }
}

/**
 * Día de corte para comparar el mes EN CURSO contra el anterior.
 *
 * Devuelve el día de hoy mientras el mes está a medias, y `undefined` el último
 * día del mes — ahí el mes ya está completo y corresponde compararlo entero.
 *
 * Ese caso importa cuando los meses tienen distinto largo: el 30 de septiembre,
 * cortar agosto en el día 30 dejaría afuera el 31 y agosto se vería más chico
 * de lo que fue. Con el mes cerrado, van los dos completos aunque uno tenga un
 * día más.
 */
export function corteDelMesEnCurso(hoy: Date = new Date()): number | undefined {
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  return hoy.getDate() === ultimoDia ? undefined : hoy.getDate()
}

/** "2026-07-01" → "Julio 2026" */
export function nombreMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number)
  const nombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${nombres[mes - 1]} ${anio}`
}

/** "2026-07-05" → "05/07" */
export function diaMes(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${dia}/${mes}`
}

// ---------------------------------------------------------------
// Análisis del cierre (V.66): proveedores, restaurante y eventos,
// incidencia por servicio y "tu inflación"
// ---------------------------------------------------------------
//
// Va aparte de obtenerCierreMes() porque el Dashboard también usa esa función
// y no necesita nada de esto: son ~30 consultas más que sólo pide la solapa
// Cierre de mes (y su PDF).

type Analisis = Pick<
  CierreMes,
  'proveedores' | 'proveedoresSalieron' | 'incidenciaPorServicio' | 'ventasPorServicioPrevio' | 'canasta'
>

const PAGINA = 1000

/** PostgREST corta en 1000 filas sin avisar (trampa 4): todo lo que puede pasar de eso va paginado */
async function traerPaginado<T>(armar: (desde: number, hasta: number) => any): Promise<T[]> {
  const filas: T[] = []
  for (let p = 0; p < 50; p++) {
    const { data, error } = await armar(p * PAGINA, p * PAGINA + PAGINA - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    filas.push(...(data as T[]))
    if (data.length < PAGINA) break
  }
  return filas
}

/** Mes desplazado: ("2026-09", -1) → { anio: 2026, mes: 8, clave: "2026-08" } */
function moverMes(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  const anio = d.getFullYear()
  const num = d.getMonth() + 1
  const clave = `${anio}-${String(num).padStart(2, '0')}`
  const ultimo = new Date(anio, num, 0).getDate()
  return { anio, mes: num, clave, desde: `${clave}-01`, hasta: `${clave}-${String(ultimo).padStart(2, '0')}` }
}

const dentroDelCorte = (fecha: string, hastaDia?: number) => !hastaDia || Number(fecha.slice(8, 10)) <= hastaDia

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const mitad = Math.floor(v.length / 2)
  return v.length % 2 ? v[mitad] : (v[mitad - 1] + v[mitad]) / 2
}

/** Los 10 proveedores del mes, con su puesto en el mes anterior (mismo corte de día) */
async function proveedoresDelMes(mes: string, hastaDia?: number) {
  const actual = moverMes(mes, 0)
  const previo = moverMes(mes, -1)
  const facturas = await traerPaginado<any>((d, h) =>
    supabase
      .from('facturas_proveedor')
      .select('total, fecha, proveedor_id, proveedores (nombre)')
      .eq('activo', true)
      .gte('fecha', previo.desde)
      .lte('fecha', actual.hasta)
      .order('fecha')
      .range(d, h)
  )

  // Mismas reglas que cierre_mes(): sum(total) ya descuenta las notas de crédito
  const montos = new Map<string, { nombre: string; mes: number; previo: number }>()
  for (const f of facturas) {
    if (!f.proveedor_id || !dentroDelCorte(f.fecha, hastaDia)) continue
    const p = montos.get(f.proveedor_id) || { nombre: f.proveedores?.nombre || 'Sin nombre', mes: 0, previo: 0 }
    if (f.fecha >= actual.desde) p.mes += Number(f.total) || 0
    else p.previo += Number(f.total) || 0
    montos.set(f.proveedor_id, p)
  }

  const lista = Array.from(montos.values())
  const puestos = (campo: 'mes' | 'previo') => {
    const orden = lista.filter((p) => p[campo] > 0).sort((a, b) => b[campo] - a[campo])
    return new Map(orden.map((p, i) => [p, i + 1]))
  }
  const puestoMes = puestos('mes')
  const puestoPrevio = puestos('previo')
  const aProveedor = (p: (typeof lista)[number]): ProveedorMes => ({
    nombre: p.nombre,
    monto: p.mes,
    montoPrevio: p.previo,
    puesto: puestoMes.get(p) ?? null,
    puestoPrevio: puestoPrevio.get(p) ?? null,
  })

  const top = lista.filter((p) => (puestoMes.get(p) ?? 99) <= 10).map(aProveedor).sort((a, b) => (a.puesto ?? 0) - (b.puesto ?? 0))
  const salieron = lista
    .filter((p) => (puestoPrevio.get(p) ?? 99) <= 10 && (puestoMes.get(p) ?? 99) > 10)
    .map(aProveedor)
    .sort((a, b) => (a.puestoPrevio ?? 0) - (b.puestoPrevio ?? 0))
  return { top, salieron }
}

/** Incidencia real de cada servicio: el mes (con su corte) y los cuatro anteriores */
async function incidenciaPorServicio(mes: string, hastaDia?: number): Promise<IncidenciaServicio[]> {
  const actual = moverMes(mes, 0)
  const anteriores = [-4, -3, -2, -1].map((k) => moverMes(mes, k))
  return Promise.all(
    SERVICIOS.map(async (servicio) => {
      const [delMes, ...historia] = await Promise.all([
        obtenerIncidenciasMes(actual.anio, actual.mes, servicio),
        ...anteriores.map((m) => obtenerIncidenciasMes(m.anio, m.mes, servicio)),
      ])
      return {
        servicio,
        resumen: resumirIncidencias(delMes.filter((d) => dentroDelCorte(d.fecha, hastaDia))),
        historia: historia.map((dias, i) => {
          const r = resumirIncidencias(dias)
          return { mes: anteriores[i].desde, incidencia: r.diasConCarga > 0 && r.ventaConCosto > 0 ? r.incidencia : null }
        }),
      }
    })
  )
}

/**
 * "Tu inflación": cuánto subió lo que se compra, mes a mes, en los últimos
 * cuatro meses.
 *
 * - Precio de cada insumo en el mes: la mediana de sus precios por kilo/litro
 *   (precios_insumo, los mismos que costean las recetas), por fecha de factura.
 * - Variación del mes: la del insumo contra el mes anterior, ponderada por lo
 *   que se gastó en él en todo el período. Un insumo que no se compró los dos
 *   meses no entra ese mes.
 * - Saltos de más de 80% en un mes se dejan afuera: casi siempre son errores de
 *   carga (el queso crema del 09/09/26 guardado a la mitad, trampa 13).
 */
async function canastaDelMes(mes: string): Promise<Canasta> {
  const MAX_SALTO = 0.8
  const meses = [-4, -3, -2, -1, 0].map((k) => moverMes(mes, k)) // el primero es la base
  const desde = meses[0].desde
  const hasta = meses[4].hasta

  const [precios, lineas, ventas] = await Promise.all([
    traerPaginado<any>((d, h) =>
      supabase
        .from('precios_insumo')
        .select('id, insumo_id, precio, insumos (categoria), factura_items!inner (facturas_proveedor!inner (fecha, activo))')
        .gte('factura_items.facturas_proveedor.fecha', desde)
        .lte('factura_items.facturas_proveedor.fecha', hasta)
        .eq('factura_items.facturas_proveedor.activo', true)
        .order('id')
        .range(d, h)
    ),
    traerPaginado<any>((d, h) =>
      supabase
        .from('factura_items')
        .select('id, insumo_id, cantidad, precio_unitario, insumos (categoria), facturas_proveedor!inner (fecha, activo)')
        .not('insumo_id', 'is', null)
        .gte('facturas_proveedor.fecha', desde)
        .lte('facturas_proveedor.fecha', hasta)
        .eq('facturas_proveedor.activo', true)
        .order('id')
        .range(d, h)
    ),
    supabase
      .from('ventas_diarias')
      .select('fecha, venta_mediodia, venta_noche, cubiertos_mediodia, cubiertos_noche')
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ])
  if (ventas.error) throw ventas.error

  const uno = (x: any) => (Array.isArray(x) ? x[0] : x)

  // Lo gastado en cada insumo en el período: el peso de su variación
  const peso = new Map<string, number>()
  const rubroDe = new Map<string, string>()
  for (const l of lineas) {
    peso.set(l.insumo_id, (peso.get(l.insumo_id) || 0) + Number(l.cantidad) * Number(l.precio_unitario))
    rubroDe.set(l.insumo_id, uno(l.insumos)?.categoria || 'Otros')
  }

  // Precios por insumo y mes
  const porMes = new Map<string, Map<string, number[]>>() // insumo → mes → precios
  for (const p of precios) {
    const fecha = uno(uno(p.factura_items)?.facturas_proveedor)?.fecha as string | undefined
    const precio = Number(p.precio)
    if (!fecha || !(precio > 0)) continue
    if (!rubroDe.has(p.insumo_id)) rubroDe.set(p.insumo_id, uno(p.insumos)?.categoria || 'Otros')
    const m = porMes.get(p.insumo_id) || new Map<string, number[]>()
    const clave = fecha.slice(0, 7)
    m.set(clave, [...(m.get(clave) || []), precio])
    porMes.set(p.insumo_id, m)
  }

  // Variación de cada insumo en cada mes, contra el anterior
  const participantes = new Set<string>()
  const variaciones = meses.slice(1).map((m, i) => {
    const anterior = meses[i].clave
    const lista: { insumo: string; v: number; w: number }[] = []
    porMes.forEach((preciosMes, insumo) => {
      const a = preciosMes.get(m.clave)
      const b = preciosMes.get(anterior)
      const w = peso.get(insumo) || 0
      if (!a || !b || w <= 0) return
      const v = mediana(a) / mediana(b) - 1
      if (Math.abs(v) > MAX_SALTO) return
      lista.push({ insumo, v, w })
      participantes.add(insumo)
    })
    return lista
  })
  const ponderada = (lista: { v: number; w: number }[]) => {
    const w = lista.reduce((t, x) => t + x.w, 0)
    return w > 0 ? (lista.reduce((t, x) => t + x.v * x.w, 0) / w) * 100 : null
  }

  // Ticket del restaurante (mediodía y noche, sin eventos) por mes
  const ticket = new Map<string, { venta: number; cub: number }>()
  for (const v of ventas.data || []) {
    const clave = (v as any).fecha.slice(0, 7)
    const t = ticket.get(clave) || { venta: 0, cub: 0 }
    t.venta += Number((v as any).venta_mediodia || 0) + Number((v as any).venta_noche || 0)
    t.cub += Number((v as any).cubiertos_mediodia || 0) + Number((v as any).cubiertos_noche || 0)
    ticket.set(clave, t)
  }
  const ticketDe = (clave: string) => {
    const t = ticket.get(clave)
    return t && t.cub > 0 ? t.venta / t.cub : null
  }

  // Por rubro: la misma cuenta, separada, y encadenada en el período
  const rubros = new Map<string, { gasto: number; factor: number; conDatos: boolean }>()
  peso.forEach((w, insumo) => {
    const r = rubroDe.get(insumo) || 'Otros'
    const x = rubros.get(r) || { gasto: 0, factor: 1, conDatos: false }
    x.gasto += w
    rubros.set(r, x)
  })
  rubros.forEach((x, rubro) => {
    for (const lista of variaciones) {
      const v = ponderada(lista.filter((l) => (rubroDe.get(l.insumo) || 'Otros') === rubro))
      if (v !== null) {
        x.factor *= 1 + v / 100
        x.conDatos = true
      }
    }
  })

  return {
    desde: meses[1].desde,
    insumos: participantes.size,
    meses: meses.slice(1).map((m, i) => {
      const t = ticketDe(m.clave)
      const tPrev = ticketDe(meses[i].clave)
      return {
        mes: m.desde,
        canasta: ponderada(variaciones[i]),
        ticket: t !== null && tPrev ? (t / tPrev - 1) * 100 : null,
        // Sin fuente en la base todavía: el PDF y la pantalla ocultan la columna
        ipc: null,
      }
    }),
    rubros: Array.from(rubros.entries())
      .filter(([, x]) => x.gasto > 0)
      .map(([rubro, x]) => ({ rubro, gasto: x.gasto, variacion: x.conDatos ? (x.factor - 1) * 100 : null })),
  }
}

/** Ventas por servicio del mes anterior, con el mismo corte de día */
async function ventasPrevias(mes: string, hastaDia?: number): Promise<VentaServicio[]> {
  const previo = moverMes(mes, -1)
  const { data, error } = await supabase
    .from('ventas_diarias')
    .select('fecha, venta_mediodia, venta_noche, venta_eventos, cubiertos_mediodia, cubiertos_noche, cubiertos_eventos')
    .gte('fecha', previo.desde)
    .lte('fecha', previo.hasta)
  if (error) throw error
  const filas = (data || []).filter((v: any) => dentroDelCorte(v.fecha, hastaDia))
  return SERVICIOS.map((s) => ({
    servicio: s,
    venta: filas.reduce((t: number, v: any) => t + Number(v[`venta_${s}`] || 0), 0),
    cubiertos: filas.reduce((t: number, v: any) => t + Number(v[`cubiertos_${s}`] || 0), 0),
  }))
}

/** Las secciones de análisis del Cierre de mes. Mismo `hastaDia` que obtenerCierreMes() */
export async function obtenerAnalisisCierre(mes: string, hastaDia?: number): Promise<Analisis> {
  const [proveedores, incidencia, canasta, previas] = await Promise.all([
    proveedoresDelMes(mes, hastaDia),
    incidenciaPorServicio(mes, hastaDia),
    canastaDelMes(mes),
    ventasPrevias(mes, hastaDia),
  ])
  return {
    proveedores: proveedores.top,
    proveedoresSalieron: proveedores.salieron,
    incidenciaPorServicio: incidencia,
    ventasPorServicioPrevio: previas,
    canasta,
  }
}
