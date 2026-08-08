import { supabase } from './supabase'

/**
 * Expansión de compuestos a nivel insumo.
 *
 * POR QUÉ EXISTE: la carga diaria acepta cosas de distinta profundidad —
 * un insumo suelto, una elaboración, una receta, un trago o un menú
 * ejecutivo — y todo lo que viene después (Consumo diario, Resumen, PDF,
 * y mañana el inventario) trabaja a nivel insumo. Antes esta lógica estaba
 * escrita inline en `desglosarConsumo`, con un bloque copiado por tipo.
 * Con cinco tipos eso no escala, y un tipo nuevo obligaba a tocar el
 * desglose en varios lados a la vez.
 *
 * Acá está en un solo lugar, con las cadenas resueltas por niveles:
 *
 *   ejecutivo → plato        → elaboración → insumo
 *             → elaboración  → insumo
 *             → insumo
 *   trago     → elaboración  → insumo
 *             → insumo
 *   receta    → elaboración  → insumo
 *             → insumo
 *   elaboración → insumo
 *
 * Las elaboraciones (`recetas_base`) son la hoja: su tabla de ingredientes
 * solo admite `insumo_id`, no anidan entre sí.
 */

/** Cantidad de un insumo necesaria por UNA unidad del compuesto. */
export interface LineaInsumo {
  insumo_id: string
  cantidad: number
}

/** Una unidad de un compuesto = 1 porción / 1 trago / 1 menú. */
export interface CompuestosExpandidos {
  elaboraciones: Map<string, LineaInsumo[]>
  recetas: Map<string, LineaInsumo[]>
  tragos: Map<string, LineaInsumo[]>
  ejecutivos: Map<string, LineaInsumo[]>
}

export interface IdsCompuestos {
  elaboraciones?: string[]
  recetas?: string[]
  tragos?: string[]
  ejecutivos?: string[]
}

const vacio = (): CompuestosExpandidos => ({
  elaboraciones: new Map(),
  recetas: new Map(),
  tragos: new Map(),
  ejecutivos: new Map(),
})

/** Suma cantidades del mismo insumo para no repetir filas. */
function consolidar(lineas: LineaInsumo[]): LineaInsumo[] {
  const mapa = new Map<string, number>()
  for (const l of lineas) {
    if (!l.insumo_id) continue
    mapa.set(l.insumo_id, (mapa.get(l.insumo_id) || 0) + l.cantidad)
  }
  return Array.from(mapa.entries()).map(([insumo_id, cantidad]) => ({ insumo_id, cantidad }))
}

const unicos = (ids: (string | null | undefined)[]): string[] =>
  Array.from(new Set(ids.filter((x): x is string => !!x)))

/**
 * Expande cada compuesto pedido a su lista de insumos por unidad.
 *
 * Resuelve en tres vueltas, de afuera hacia adentro: primero los menús
 * (que descubren más platos y elaboraciones), después los platos y tragos
 * (que descubren más elaboraciones), y al final las elaboraciones.
 * Cada nivel se pide una sola vez, en batch.
 */
export async function expandirCompuestos(ids: IdsCompuestos): Promise<CompuestosExpandidos> {
  const idsEjecutivos = unicos(ids.ejecutivos || [])
  const idsTragos = unicos(ids.tragos || [])
  let idsRecetas = unicos(ids.recetas || [])
  let idsElaboraciones = unicos(ids.elaboraciones || [])

  if (!idsEjecutivos.length && !idsTragos.length && !idsRecetas.length && !idsElaboraciones.length) {
    return vacio()
  }

  // ---------------------------------------------------------------
  // NIVEL 1 — menús ejecutivos
  // Un menú es una unidad (1 cubierto), no tiene rendimiento.
  // ---------------------------------------------------------------
  type ItemMenu = { menu_ejecutivo_id: string; tipo: string; insumo_id: string | null; receta_base_id: string | null; plato_id: string | null; cantidad: number }
  let itemsMenu: ItemMenu[] = []

  if (idsEjecutivos.length) {
    const { data, error } = await supabase
      .from('menu_ejecutivo_items')
      .select('menu_ejecutivo_id, tipo, insumo_id, receta_base_id, plato_id, cantidad')
      .in('menu_ejecutivo_id', idsEjecutivos)
    if (error) throw error
    itemsMenu = (data || []) as ItemMenu[]

    // Los menús descubren platos y elaboraciones que hay que expandir igual
    idsRecetas = unicos([...idsRecetas, ...itemsMenu.map((i) => i.plato_id)])
    idsElaboraciones = unicos([...idsElaboraciones, ...itemsMenu.map((i) => i.receta_base_id)])
  }

  // ---------------------------------------------------------------
  // NIVEL 2 — platos y tragos
  // El plato SÍ tiene rendimiento: sus cantidades son por receta entera.
  // El trago no: 1 trago = la receta completa.
  // ---------------------------------------------------------------
  type Plato = { id: string; rendimiento_porciones: number; plato_ingredientes: { insumo_id: string | null; receta_base_id: string | null; cantidad: number }[] }
  type IngTrago = { trago_id: string; insumo_id: string | null; receta_base_id: string | null; cantidad: number }

  const [platosRes, tragosRes] = await Promise.all([
    idsRecetas.length
      ? supabase
          .from('platos')
          .select('id, rendimiento_porciones, plato_ingredientes (insumo_id, receta_base_id, cantidad)')
          .in('id', idsRecetas)
      : Promise.resolve({ data: [] as any[], error: null }),
    idsTragos.length
      ? supabase
          .from('trago_ingredientes')
          .select('trago_id, insumo_id, receta_base_id, cantidad')
          .in('trago_id', idsTragos)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (platosRes.error) throw platosRes.error
  if (tragosRes.error) throw tragosRes.error

  const platos = (platosRes.data || []) as unknown as Plato[]
  const ingTragos = (tragosRes.data || []) as unknown as IngTrago[]

  // Platos y tragos descubren más elaboraciones
  idsElaboraciones = unicos([
    ...idsElaboraciones,
    ...platos.flatMap((p) => (p.plato_ingredientes || []).map((i) => i.receta_base_id)),
    ...ingTragos.map((i) => i.receta_base_id),
  ])

  // ---------------------------------------------------------------
  // NIVEL 3 — elaboraciones (la hoja: solo llevan insumos)
  // ---------------------------------------------------------------
  const elaboraciones = new Map<string, LineaInsumo[]>()

  if (idsElaboraciones.length) {
    const { data, error } = await supabase
      .from('recetas_base')
      .select('id, rendimiento_porciones, receta_base_ingredientes (insumo_id, cantidad)')
      .in('id', idsElaboraciones)
    if (error) throw error

    for (const r of (data || []) as any[]) {
      // Las cantidades son por receta entera → las llevo a UNA porción
      const rendimiento = r.rendimiento_porciones > 0 ? r.rendimiento_porciones : 1
      elaboraciones.set(
        r.id,
        consolidar(
          (r.receta_base_ingredientes || []).map((ing: any) => ({
            insumo_id: ing.insumo_id,
            cantidad: Number(ing.cantidad || 0) / rendimiento,
          }))
        )
      )
    }
  }

  // ---------------------------------------------------------------
  // Armado, de adentro hacia afuera
  // ---------------------------------------------------------------

  /** Insumos de N porciones de una elaboración. */
  const desdeElaboracion = (id: string | null, porciones: number): LineaInsumo[] =>
    !id
      ? []
      : (elaboraciones.get(id) || []).map((l) => ({
          insumo_id: l.insumo_id,
          cantidad: l.cantidad * porciones,
        }))

  // Recetas (platos) → por UNA porción
  const recetas = new Map<string, LineaInsumo[]>()
  for (const p of platos) {
    const rendimiento = p.rendimiento_porciones > 0 ? p.rendimiento_porciones : 1
    const lineas: LineaInsumo[] = []
    for (const ing of p.plato_ingredientes || []) {
      const cantidadPorPorcion = Number(ing.cantidad || 0) / rendimiento
      if (ing.insumo_id) {
        lineas.push({ insumo_id: ing.insumo_id, cantidad: cantidadPorPorcion })
      } else {
        // El ingrediente es una elaboración: la cantidad está en porciones de esa elaboración
        lineas.push(...desdeElaboracion(ing.receta_base_id, cantidadPorPorcion))
      }
    }
    recetas.set(p.id, consolidar(lineas))
  }

  // Tragos → por UN trago (sin rendimiento)
  const tragos = new Map<string, LineaInsumo[]>()
  for (const ing of ingTragos) {
    const acumulado = tragos.get(ing.trago_id) || []
    const cantidad = Number(ing.cantidad || 0)
    if (ing.insumo_id) {
      acumulado.push({ insumo_id: ing.insumo_id, cantidad })
    } else {
      acumulado.push(...desdeElaboracion(ing.receta_base_id, cantidad))
    }
    tragos.set(ing.trago_id, acumulado)
  }
  Array.from(tragos.keys()).forEach((id) => tragos.set(id, consolidar(tragos.get(id)!)))

  // Menús ejecutivos → por UN menú (sin rendimiento)
  const ejecutivos = new Map<string, LineaInsumo[]>()
  for (const item of itemsMenu) {
    const acumulado = ejecutivos.get(item.menu_ejecutivo_id) || []
    const cantidad = Number(item.cantidad || 0)

    if (item.tipo === 'insumo' && item.insumo_id) {
      acumulado.push({ insumo_id: item.insumo_id, cantidad })
    } else if (item.tipo === 'plato' && item.plato_id) {
      // La cantidad está en porciones de ese plato
      for (const l of recetas.get(item.plato_id) || []) {
        acumulado.push({ insumo_id: l.insumo_id, cantidad: l.cantidad * cantidad })
      }
    } else if (item.tipo === 'receta_base') {
      acumulado.push(...desdeElaboracion(item.receta_base_id, cantidad))
    }

    ejecutivos.set(item.menu_ejecutivo_id, acumulado)
  }
  Array.from(ejecutivos.keys()).forEach((id) => ejecutivos.set(id, consolidar(ejecutivos.get(id)!)))

  return { elaboraciones, recetas, tragos, ejecutivos }
}
