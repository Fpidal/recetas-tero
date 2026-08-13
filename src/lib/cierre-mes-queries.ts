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
async function incidenciaDelMes(anio: number, mes: number): Promise<ResumenIncidencia> {
  const porServicio = await Promise.all(
    SERVICIOS.map((s) => obtenerIncidenciasMes(anio, mes, s))
  )
  return resumirIncidencias(porServicio.flat())
}

/**
 * Trae todo el cierre de un mes. `mes` en formato YYYY-MM.
 */
export async function obtenerCierreMes(mes: string): Promise<CierreMes> {
  const [anio, mesNum] = mes.split('-').map(Number)

  // Mes anterior, cuidando el salto de año
  const previoDate = new Date(anio, mesNum - 2, 1)
  const anioPrevio = previoDate.getFullYear()
  const mesPrevioNum = previoDate.getMonth() + 1

  const [rpc, incidencia, incidenciaPrevia] = await Promise.all([
    supabase.rpc('cierre_mes', { p_mes: primerDia(mes) }),
    incidenciaDelMes(anio, mesNum),
    incidenciaDelMes(anioPrevio, mesPrevioNum),
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
