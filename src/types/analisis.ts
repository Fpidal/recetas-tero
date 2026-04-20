// Tipos para el módulo de Análisis (carga de consumo + incidencia real)

export type Servicio = 'mediodia' | 'noche' | 'eventos'
export type TipoConsumoItem = 'insumo' | 'elaboracion' | 'receta'

// Cabecera del consumo de un servicio
export interface ConsumoDiario {
  id: string
  fecha: string // YYYY-MM-DD
  servicio: Servicio
  costo_total: number
  confirmado: boolean
  confirmado_at: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

// Item cargado en un consumo
export interface ConsumoItem {
  id: string
  consumo_id: string
  tipo: TipoConsumoItem
  insumo_id: string | null
  receta_base_id: string | null
  plato_id: string | null
  cantidad: number
  unidad: string
  costo_unitario: number
  subtotal: number
  created_at: string
  // Datos enriquecidos (vienen de joins)
  nombre?: string
}

// Para insertar un item nuevo
export interface ConsumoItemInput {
  tipo: TipoConsumoItem
  insumo_id?: string | null
  receta_base_id?: string | null
  plato_id?: string | null
  cantidad: number
  unidad: string
  costo_unitario: number
}

// Item desglosado a nivel insumo (para vista "Consumo diario")
export interface ItemDesglosado {
  insumo_id: string
  nombre: string
  unidad: string
  categoria: string
  cantidad_total: number
  costo_total: number
  origenes: string[] // Ej: ["12 milanesas", "carga directa"]
}

// Etiquetas legibles para categorías de insumos
export const CATEGORIAS_LABEL: Record<string, string> = {
  Carnes: 'Carnes',
  Almacen: 'Almacén',
  Verduras_Frutas: 'Verduras y Frutas',
  Pescados_Mariscos: 'Pescados y Mariscos',
  Lacteos_Fiambres: 'Lácteos y Fiambres',
  Bebidas: 'Bebidas',
  Salsas_Recetas: 'Salsas y Recetas',
}

export const CATEGORIAS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Carnes: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  Almacen: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Verduras_Frutas: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
  Pescados_Mariscos: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  Lacteos_Fiambres: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  Bebidas: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  Salsas_Recetas: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
}

// Orden fijo para mostrar categorías
export const CATEGORIAS_ORDEN = [
  'Carnes',
  'Pescados_Mariscos',
  'Verduras_Frutas',
  'Lacteos_Fiambres',
  'Almacen',
  'Salsas_Recetas',
  'Bebidas',
]

// Buscador: opción que se muestra en la lista
export interface OpcionBuscador {
  id: string
  tipo: TipoConsumoItem
  nombre: string
  costo_unitario: number // con IVA incluido
  unidad: string
}

// Resumen de incidencia de un día/servicio
export interface IncidenciaDia {
  fecha: string
  servicio: Servicio
  venta: number
  cubiertos: number
  costo: number
  incidencia: number // %
  ticket_promedio: number
  tiene_consumo: boolean
  tiene_venta: boolean
}

// Etiqueta legible para servicio
export const SERVICIO_LABEL: Record<Servicio, string> = {
  mediodia: 'Mediodía',
  noche: 'Noche',
  eventos: 'Eventos',
}

export const SERVICIO_ICON: Record<Servicio, string> = {
  mediodia: '🌞',
  noche: '🌙',
  eventos: '🎉',
}

// Objetivo de incidencia real (mismo que ventas: 30%)
export const OBJETIVO_INCIDENCIA_REAL = 30

export function getEstadoIncidenciaReal(inc: number): 'ok' | 'warning' | 'danger' {
  if (inc <= OBJETIVO_INCIDENCIA_REAL) return 'ok'
  if (inc <= OBJETIVO_INCIDENCIA_REAL + 5) return 'warning'
  return 'danger'
}

export function getColorEstado(estado: 'ok' | 'warning' | 'danger') {
  switch (estado) {
    case 'ok':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', badge: 'bg-green-100 text-green-800' }
    case 'warning':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-800' }
    case 'danger':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100 text-red-800' }
  }
}
