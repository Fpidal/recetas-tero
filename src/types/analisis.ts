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
 * Desde V.38 el tipo no alcanza para decidir: una gaseosa es una receta y un
 * agua puede ser un insumo suelto, y las dos son barra. La regla completa está
 * en areaDeItem(), acá abajo. TIPOS_BARRA queda como la parte del tipo.
 */
export type AreaConsumo = 'cocina' | 'barra'

export const TIPOS_BARRA: TipoConsumoItem[] = ['trago', 'vino']

export function areaDeTipo(tipo: TipoConsumoItem): AreaConsumo {
  return TIPOS_BARRA.includes(tipo) ? 'barra' : 'cocina'
}

/**
 * A qué área pertenece un item cargado.
 *
 * ⚠️ ESTA REGLA VIVE EN DOS LUGARES, Y SOLO DOS:
 *
 *     Base      → `actualizar_costos_consumo()`, que calcula costo_cocina y
 *                 costo_barra en `consumo_diario`
 *     Frontend  → esta función
 *
 * Si se toca una, se toca la otra. Misma convención que la fórmula del costo
 * final (ver CLAUDE.md). Los `.sql` versionados están en
 * supabase-consumo-bebidas-barra.sql.
 *
 * POR QUÉ NO ALCANZA EL TIPO: hasta V.38 la regla era "trago o vino va a
 * barra, el resto a cocina". El agua, la gaseosa, la cerveza y el café no son
 * ni trago ni vino, así que caían en cocina: en el servicio del 08/08/26 eso
 * puso $35.426 de bebidas dentro de un costo de cocina de $434.275. La
 * división existe para mirar bebida y comida por separado, y así no servía.
 */
export function areaDeItem(item: {
  tipo: TipoConsumoItem
  /** Sección del plato, cuando el item es una receta */
  seccion?: string | null
  /** Categoría del insumo, cuando el item es un insumo suelto */
  categoria?: string | null
}): AreaConsumo {
  if (TIPOS_BARRA.includes(item.tipo)) return 'barra'
  // Lo que viene: las gaseosas y el café ya son recetas de sección Bebidas
  if (item.tipo === 'receta' && item.seccion === 'Bebidas') return 'barra'
  // Lo histórico: hasta V.38 las aguas y la cerveza se cargaban como insumo
  if (item.tipo === 'insumo' && item.categoria === 'Bebidas') return 'barra'
  return 'cocina'
}

/**
 * "Bebidas" y no "Barra" porque el número incluye el agua y la gaseosa que
 * vienen adentro del menú ejecutivo, que no son una venta de barra. En el
 * almuerzo del 12/08/26 eran 51 aguas, 26 con gas y 22 gaseosas — $78.111 de
 * un servicio de $491.792. Llamarlo Barra hacía pensar en vinos y tragos.
 *
 * OJO con este número: separa la bebida cargada suelta, pero la que viene
 * adentro de una promo queda del lado de la comida, porque la promo entra
 * como una sola línea. Para bebida vs comida bien separadas está el Resumen,
 * que expande los compuestos hasta el insumo y agrupa por categoría.
 */
export const AREA_LABEL: Record<AreaConsumo, string> = {
  cocina: 'Cocina',
  barra: 'Bebidas',
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
  /** Sección del plato — solo para tipo 'receta'. La usa areaDeItem(). */
  seccion?: string | null
  /** Categoría del insumo — solo para tipo 'insumo'. La usa areaDeItem(). */
  categoria?: string | null
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

// Acá había un SERVICIO_ICON con 🌞 🌙 🎉. Se renderizaba siempre como
// `{SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}`, o sea "🌞 Mediodía": el emoji al
// lado de la palabra que ya dice lo mismo. Un icono sirve para reemplazar una
// palabra, no para acompañarla — ahí solo ensucia. Va SERVICIO_LABEL solo.

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
