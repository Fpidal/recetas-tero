// Tipos para el módulo de Análisis (carga de consumo + incidencia real)

export type Servicio = 'mediodia' | 'noche' | 'eventos'
export type TipoConsumoItem =
  | 'insumo'
  | 'elaboracion'
  | 'receta'
  | 'trago'
  | 'ejecutivo'
  | 'vino'

/**
 * Área del negocio a la que imputa cada tipo de consumo.
 *
 * Existe porque cocina y barra tienen márgenes muy distintos: si el costo
 * de las dos se suma en un solo total, una noche con mucho vino "mejora"
 * la incidencia sin que la cocina haya cambiado nada, y al revés.
 *
 * ⚠️ ESTA CLASIFICACIÓN VIVE EN DOS LUGARES, Y SOLO DOS:
 *      Frontend → TIPOS_BARRA (acá abajo)
 *      Base     → función recalcular_costo_consumo()
 *                 (supabase-analisis-tipos-consumo.sql)
 *    Si se toca una, se toca la otra.
 */
export type AreaConsumo = 'cocina' | 'barra'

export const TIPOS_BARRA: TipoConsumoItem[] = ['trago', 'vino']

export function areaDeTipo(tipo: TipoConsumoItem): AreaConsumo {
  return TIPOS_BARRA.includes(tipo) ? 'barra' : 'cocina'
}

export const AREA_LABEL: Record<AreaConsumo, string> = {
  cocina: 'Cocina',
  barra: 'Barra',
}

// Cabecera del consumo de un servicio
export interface ConsumoDiario {
  id: string
  fecha: string // YYYY-MM-DD
  servicio: Servicio
  costo_total: number // = costo_cocina + costo_barra
  costo_cocina: number
  costo_barra: number
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
  trago_id: string | null
  menu_ejecutivo_id: string | null
  vino_id: string | null
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
  trago_id?: string | null
  menu_ejecutivo_id?: string | null
  vino_id?: string | null
  cantidad: number
  unidad: string
  costo_unitario: number
}

/**
 * Columna FK que le corresponde a cada tipo en `consumo_items`.
 * La base tiene un CHECK que exige exactamente una FK cargada y que sea
 * la de su tipo (consumo_items_fk_coherente), así que esto no puede
 * desviarse sin que la base lo rechace.
 */
export const FK_DE_TIPO: Record<TipoConsumoItem, keyof ConsumoItemInput> = {
  insumo: 'insumo_id',
  elaboracion: 'receta_base_id',
  receta: 'plato_id',
  trago: 'trago_id',
  ejecutivo: 'menu_ejecutivo_id',
  vino: 'vino_id',
}

/**
 * Línea del desglose (vista "Consumo diario" y "Resumen").
 *
 * Casi todo baja a nivel insumo: una receta, una elaboración, un trago o un menú
 * ejecutivo se abren hasta sus ingredientes. El vino es la excepción: no es un
 * insumo, no tiene receta y no se abre en nada — se consume la botella. Por eso
 * la clave es `ref_id` + `tipo` y no `insumo_id` a secas.
 */
export interface ItemDesglosado {
  /** id del insumo o del vino, según `tipo`. Es la clave de agrupación. */
  ref_id: string
  tipo: 'insumo' | 'vino'
  nombre: string
  unidad: string
  categoria: string
  cantidad_total: number
  costo_total: number
  /**
   * Merma del insumo. Hace falta para saber cuánto hay que COMPRAR: la
   * cantidad de arriba es el neto que va al plato, ya limpio, porque la merma
   * se aplica al precio y no a la cantidad. Con 25% de merma, 18,40 kg netos
   * son 24,53 kg de compra.
   */
  merma_porcentaje: number
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
  Otros: 'Otros',
  // No es categoría de insumo: los vinos no pasan por `insumos`, pero necesitan
  // su propia sección en el desglose porque no bajan a ingredientes.
  Vinos: 'Vinos',
}

export const CATEGORIAS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Carnes: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  Almacen: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Verduras_Frutas: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
  Pescados_Mariscos: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  Lacteos_Fiambres: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  Bebidas: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  Salsas_Recetas: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  Otros: { bg: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-200' },
  Vinos: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200' },
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
  'Otros',
  'Vinos', // último: es barra, no cocina
]

// Buscador: opción que se muestra en la lista
export interface OpcionBuscador {
  id: string
  tipo: TipoConsumoItem
  nombre: string
  costo_unitario: number // con IVA incluido
  unidad: string
}

/**
 * Cómo se muestra cada tipo de consumo. Fuente única: lo usan la carga
 * diaria, los badges de las tablas y el PDF, así que un tipo nuevo se
 * agrega en un solo lugar.
 */
export const TIPO_CONFIG: Record<
  TipoConsumoItem,
  { label: string; plural: string; badge: string; badgeClass: string }
> = {
  insumo:      { label: 'Insumo',      plural: 'INSUMOS',      badge: 'INS', badgeClass: 'bg-blue-100 text-blue-800' },
  elaboracion: { label: 'Elaboración', plural: 'ELABORACIONES', badge: 'ELA', badgeClass: 'bg-amber-100 text-amber-800' },
  receta:      { label: 'Receta',      plural: 'RECETAS',      badge: 'REC', badgeClass: 'bg-rose-100 text-rose-800' },
  ejecutivo:   { label: 'Ejecutivo',   plural: 'MENÚS EJECUTIVOS', badge: 'EJE', badgeClass: 'bg-emerald-100 text-emerald-800' },
  trago:       { label: 'Trago',       plural: 'TRAGOS',       badge: 'TRA', badgeClass: 'bg-cyan-100 text-cyan-800' },
  vino:        { label: 'Vino',        plural: 'VINOS',        badge: 'VIN', badgeClass: 'bg-purple-100 text-purple-800' },
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
