// Tipos para el módulo de Ventas

export interface VentaDiaria {
  id: string
  fecha: string // YYYY-MM-DD
  venta_mediodia: number
  venta_noche: number
  venta_eventos: number
  cubiertos_mediodia: number
  cubiertos_noche: number
  cubiertos_eventos: number
  notas: string | null
  created_at: string
  updated_at: string
}

export interface VentaDiariaInput {
  fecha: string
  venta_mediodia: number
  venta_noche: number
  venta_eventos: number
  cubiertos_mediodia: number
  cubiertos_noche: number
  cubiertos_eventos: number
  notas?: string | null
}

// Resumen de un período (semana o mes)
export interface ResumenPeriodo {
  // Identificación del período
  label: string              // Ej: "Abril 2026" o "Semana 15 (07/04 - 13/04)"
  fechaInicio: string        // YYYY-MM-DD
  fechaFin: string           // YYYY-MM-DD

  // Ventas
  ventaMediodia: number
  ventaNoche: number
  ventaEventos: number
  ventasTotal: number

  // Cubiertos
  cubiertosMediodia: number
  cubiertosNoche: number
  cubiertosEventos: number
  cubiertosTotal: number

  // Ticket promedio (ventas / cubiertos) por servicio
  ticketPromedioMediodia: number
  ticketPromedioNoche: number
  ticketPromedioEventos: number
  ticketPromedioGeneral: number

  // Compras
  compras: number

  // Cálculos
  incidencia: number         // % (compras / ventas * 100)
  margenBruto: number        // ventas - compras

  // Días con datos
  diasConVentas: number
}

export type TipoPeriodo = 'mensual' | 'semanal'

// Objetivo de incidencia (food cost target)
export const OBJETIVO_INCIDENCIA = 30

// Umbrales para semáforo
export function getEstadoIncidencia(incidencia: number): 'ok' | 'warning' | 'danger' {
  if (incidencia <= OBJETIVO_INCIDENCIA) return 'ok'
  if (incidencia <= OBJETIVO_INCIDENCIA + 5) return 'warning'
  return 'danger'
}

export function getColorIncidencia(incidencia: number): {
  bg: string
  text: string
  border: string
} {
  const estado = getEstadoIncidencia(incidencia)
  switch (estado) {
    case 'ok':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' }
    case 'warning':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }
    case 'danger':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
  }
}
