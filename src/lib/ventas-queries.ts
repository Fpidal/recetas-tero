// Queries para el módulo de Ventas
// Sigue el patrón del proyecto: cliente browser de Supabase

import { supabase } from './supabase'
import { formatearMoneda } from './formato-numeros'
import type { VentaDiaria, VentaDiariaInput, ResumenPeriodo, TipoPeriodo } from '@/types/ventas'

// =====================================================
// FORMATO DE MONEDA SIN DECIMALES (ventas son montos grandes)
// =====================================================
export function formatearMonedaVentas(valor: number | string | null | undefined): string {
  return formatearMoneda(valor, true, 0)
}

// =====================================================
// HELPERS DE FECHAS
// =====================================================

/**
 * Devuelve el lunes de la semana de una fecha dada (lunes = inicio de semana ARG)
 */
export function getLunes(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

/**
 * Devuelve el domingo de la semana de una fecha dada
 */
export function getDomingo(fecha: Date): Date {
  const lunes = getLunes(fecha)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return domingo
}

/**
 * Convierte Date a string YYYY-MM-DD (sin timezone)
 */
export function dateToString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Convierte string YYYY-MM-DD a Date (sin timezone)
 */
export function stringToDate(s: string): Date {
  const [year, month, day] = s.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Devuelve el primer y último día de un mes (1-12)
 */
export function getRangoMes(año: number, mes: number): { desde: string; hasta: string } {
  const desde = new Date(año, mes - 1, 1)
  const hasta = new Date(año, mes, 0) // día 0 del mes siguiente = último del actual
  return { desde: dateToString(desde), hasta: dateToString(hasta) }
}

/**
 * Devuelve el número de semana ISO (1-53)
 */
export function getNumeroSemana(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// =====================================================
// QUERIES VENTAS
// =====================================================

/**
 * Obtiene todas las ventas de un rango de fechas
 */
export async function obtenerVentasRango(
  desde: string,
  hasta: string
): Promise<VentaDiaria[]> {
  const { data, error } = await supabase
    .from('ventas_diarias')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Obtiene una venta por fecha específica (null si no existe)
 */
export async function obtenerVentaPorFecha(fecha: string): Promise<VentaDiaria | null> {
  const { data, error } = await supabase
    .from('ventas_diarias')
    .select('*')
    .eq('fecha', fecha)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Inserta o actualiza una venta diaria (upsert por fecha)
 */
export async function guardarVenta(input: VentaDiariaInput): Promise<VentaDiaria> {
  const { data, error } = await supabase
    .from('ventas_diarias')
    .upsert(
      {
        fecha: input.fecha,
        venta_mediodia: input.venta_mediodia,
        venta_noche: input.venta_noche,
        venta_eventos: input.venta_eventos,
        cubiertos_mediodia: input.cubiertos_mediodia,
        cubiertos_noche: input.cubiertos_noche,
        cubiertos_eventos: input.cubiertos_eventos,
        notas: input.notas || null,
      },
      { onConflict: 'fecha' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Elimina una venta por id
 */
export async function eliminarVenta(id: string): Promise<void> {
  const { error } = await supabase.from('ventas_diarias').delete().eq('id', id)
  if (error) throw error
}

/**
 * Obtiene los últimos N días cargados
 */
export async function obtenerUltimosDias(limit: number = 10): Promise<VentaDiaria[]> {
  const { data, error } = await supabase
    .from('ventas_diarias')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Tipo de filtro para la vista de días
 * - 'mes': mes actual
 * - 'ultimos30': últimos 30 días
 * - { año, mes }: mes específico (mes 1-12)
 */
export type FiltroVentas = 'mes' | 'ultimos30' | { año: number; mes: number }

/**
 * Representa un día del calendario (con o sin datos de venta)
 */
export interface DiaCalendario {
  fecha: string
  diaSemana: string
  tieneDatos: boolean
  venta?: VentaDiaria
}

/**
 * Opción para el selector de mes
 */
export interface OpcionMes {
  año: number
  mes: number
  label: string
}

/**
 * Genera las opciones de meses para el selector (últimos N meses)
 */
export function generarOpcionesMeses(cantidadMeses: number = 12): OpcionMes[] {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  const hoy = new Date()
  const opciones: OpcionMes[] = []

  for (let i = 0; i < cantidadMeses; i++) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    opciones.push({
      año: fecha.getFullYear(),
      mes: fecha.getMonth() + 1,
      label: `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`,
    })
  }

  return opciones
}

/**
 * Obtiene todos los días de un período con sus datos de venta (si existen)
 * Para "mes": todos los días del mes actual
 * Para "ultimos30": los últimos 30 días desde hoy
 * Para { año, mes }: todos los días del mes específico
 */
export async function obtenerDiasConVentas(filtro: FiltroVentas): Promise<DiaCalendario[]> {
  const hoy = new Date()
  let desde: Date
  let hasta: Date

  if (filtro === 'mes') {
    // Primer día del mes actual
    desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    // Último día del mes actual
    hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  } else if (filtro === 'ultimos30') {
    // Últimos 30 días
    hasta = new Date(hoy)
    desde = new Date(hoy)
    desde.setDate(desde.getDate() - 29) // 30 días incluyendo hoy
  } else {
    // Mes específico { año, mes }
    desde = new Date(filtro.año, filtro.mes - 1, 1)
    hasta = new Date(filtro.año, filtro.mes, 0) // día 0 del mes siguiente = último del actual
  }

  const desdeStr = dateToString(desde)
  const hastaStr = dateToString(hasta)

  // Traer ventas del rango
  const ventas = await obtenerVentasRango(desdeStr, hastaStr)
  const ventasPorFecha = new Map(ventas.map(v => [v.fecha, v]))

  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const resultado: DiaCalendario[] = []

  // Generar todos los días del rango
  const cursor = new Date(desde)
  while (cursor <= hasta) {
    const fechaStr = dateToString(cursor)
    const venta = ventasPorFecha.get(fechaStr)

    resultado.push({
      fecha: fechaStr,
      diaSemana: diasSemana[cursor.getDay()],
      tieneDatos: !!venta,
      venta: venta || undefined,
    })

    cursor.setDate(cursor.getDate() + 1)
  }

  // Ordenar descendente (más reciente primero)
  return resultado.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// =====================================================
// QUERIES COMPRAS (FACTURAS)
// =====================================================

/**
 * Obtiene total de compras (suma de facturas activas) de un rango
 */
export async function obtenerComprasRango(desde: string, hasta: string): Promise<number> {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('total')
    .eq('activo', true)
    .gte('fecha', desde)
    .lte('fecha', hasta)

  if (error) throw error
  return (data || []).reduce((acc, f) => acc + Number(f.total), 0)
}

/**
 * Obtiene facturas individuales de un rango (para cálculos por período)
 */
export async function obtenerFacturasRango(
  desde: string,
  hasta: string
): Promise<{ fecha: string; total: number }[]> {
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('fecha, total')
    .eq('activo', true)
    .gte('fecha', desde)
    .lte('fecha', hasta)

  if (error) throw error
  return (data || []).map((f) => ({ fecha: f.fecha, total: Number(f.total) }))
}

// =====================================================
// CÁLCULOS DE RESÚMENES
// =====================================================

/**
 * Calcula el resumen de un período dado (rango de fechas, ventas y facturas)
 */
function calcularResumen(
  label: string,
  fechaInicio: string,
  fechaFin: string,
  ventas: VentaDiaria[],
  facturas: { fecha: string; total: number }[]
): ResumenPeriodo {
  const ventaMediodia = ventas.reduce((acc, v) => acc + Number(v.venta_mediodia), 0)
  const ventaNoche = ventas.reduce((acc, v) => acc + Number(v.venta_noche), 0)
  const ventaEventos = ventas.reduce((acc, v) => acc + Number(v.venta_eventos), 0)
  const ventasTotal = ventaMediodia + ventaNoche + ventaEventos

  const cubiertosMediodia = ventas.reduce((acc, v) => acc + Number(v.cubiertos_mediodia || 0), 0)
  const cubiertosNoche = ventas.reduce((acc, v) => acc + Number(v.cubiertos_noche || 0), 0)
  const cubiertosEventos = ventas.reduce((acc, v) => acc + Number(v.cubiertos_eventos || 0), 0)
  const cubiertosTotal = cubiertosMediodia + cubiertosNoche + cubiertosEventos

  const ticketPromedioMediodia = cubiertosMediodia > 0 ? ventaMediodia / cubiertosMediodia : 0
  const ticketPromedioNoche = cubiertosNoche > 0 ? ventaNoche / cubiertosNoche : 0
  const ticketPromedioEventos = cubiertosEventos > 0 ? ventaEventos / cubiertosEventos : 0
  const ticketPromedioGeneral = cubiertosTotal > 0 ? ventasTotal / cubiertosTotal : 0

  const compras = facturas.reduce((acc, f) => acc + f.total, 0)
  const incidencia = ventasTotal > 0 ? (compras / ventasTotal) * 100 : 0
  const margenBruto = ventasTotal - compras

  const diasConVentas = ventas.filter(
    (v) => Number(v.venta_mediodia) + Number(v.venta_noche) + Number(v.venta_eventos) > 0
  ).length

  return {
    label,
    fechaInicio,
    fechaFin,
    ventaMediodia,
    ventaNoche,
    ventaEventos,
    ventasTotal,
    cubiertosMediodia,
    cubiertosNoche,
    cubiertosEventos,
    cubiertosTotal,
    ticketPromedioMediodia,
    ticketPromedioNoche,
    ticketPromedioEventos,
    ticketPromedioGeneral,
    compras,
    incidencia,
    margenBruto,
    diasConVentas,
  }
}

/**
 * Resumen de un mes específico
 */
export async function obtenerResumenMes(año: number, mes: number): Promise<ResumenPeriodo> {
  const { desde, hasta } = getRangoMes(año, mes)
  const [ventas, facturas] = await Promise.all([
    obtenerVentasRango(desde, hasta),
    obtenerFacturasRango(desde, hasta),
  ])

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  const label = `${meses[mes - 1]} ${año}`

  return calcularResumen(label, desde, hasta, ventas, facturas)
}

/**
 * Resumen de una semana (lunes a domingo) que contiene a la fecha dada
 */
export async function obtenerResumenSemana(fechaRef: Date): Promise<ResumenPeriodo> {
  const lunes = getLunes(fechaRef)
  const domingo = getDomingo(fechaRef)
  const desde = dateToString(lunes)
  const hasta = dateToString(domingo)

  const [ventas, facturas] = await Promise.all([
    obtenerVentasRango(desde, hasta),
    obtenerFacturasRango(desde, hasta),
  ])

  const numSemana = getNumeroSemana(lunes)
  const formatearDM = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  const label = `Semana ${numSemana} (${formatearDM(lunes)} - ${formatearDM(domingo)})`

  return calcularResumen(label, desde, hasta, ventas, facturas)
}

/**
 * Histórico mensual: últimos N meses
 */
export async function obtenerHistoricoMensual(cantidadMeses: number = 12): Promise<ResumenPeriodo[]> {
  const hoy = new Date()
  const promesas: Promise<ResumenPeriodo>[] = []

  for (let i = cantidadMeses - 1; i >= 0; i--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    promesas.push(obtenerResumenMes(fecha.getFullYear(), fecha.getMonth() + 1))
  }

  return Promise.all(promesas)
}

/**
 * Histórico semanal: últimas N semanas
 */
export async function obtenerHistoricoSemanal(cantidadSemanas: number = 12): Promise<ResumenPeriodo[]> {
  const hoy = new Date()
  const promesas: Promise<ResumenPeriodo>[] = []

  for (let i = cantidadSemanas - 1; i >= 0; i--) {
    const fecha = new Date(hoy)
    fecha.setDate(hoy.getDate() - i * 7)
    promesas.push(obtenerResumenSemana(fecha))
  }

  return Promise.all(promesas)
}

/**
 * Wrapper genérico para obtener histórico según tipo de período
 */
export async function obtenerHistorico(
  tipo: TipoPeriodo,
  cantidad?: number
): Promise<ResumenPeriodo[]> {
  if (tipo === 'mensual') {
    return obtenerHistoricoMensual(cantidad ?? 12)
  }
  return obtenerHistoricoSemanal(cantidad ?? 12)
}
