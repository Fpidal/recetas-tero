import { supabase } from './supabase'
import { desglosarRango } from './consumo-queries'
import type { Servicio } from '@/types/analisis'

/**
 * Consumo por cubierto — dónde se esconde el desperdicio.
 *
 * POR QUÉ ESTA VISTA Y NO OTRA: casi todo lo que se consume varía porque la
 * gente pide distinto. Si un mes se vendió más carne, el consumo de carne sube
 * y eso no dice nada. Pero hay un grupo de insumos donde **cada persona que se
 * sienta consume aproximadamente lo mismo**: el pan, la servilleta, el aceite
 * de oliva de la mesa, el queso rallado. Ahí la cantidad por cubierto tiene que
 * ser estable, y si se mueve, se movió por otra razón: porción más generosa,
 * desperdicio, o algo que se está yendo.
 *
 * Medido en el almuerzo del 12/08/26, con 101 cubiertos: 101 servilletas
 * —exactamente una por persona—, 30 g de pan y $724 por cubierto entre todos
 * estos ítems. El 14,9% del costo del servicio, más de lo que pesa cualquier
 * plato individual. No se estaba mirando en ningún lado.
 *
 * NO CLASIFICA POR MÍ: muestra todos los insumos con su cantidad por cubierto
 * y la variación contra el período anterior, ordenados por cuánto se movieron.
 * Cuáles deberían ser estables lo sabe el usuario, no los datos — a un
 * algoritmo, el pan y el roast beef se le parecen.
 *
 * ⚠️ LOS CUBIERTOS SE CUENTAN SOLO DE LOS DÍAS CON CONSUMO CARGADO. Si se
 * cargaron 12 de 30 días y se divide por los cubiertos del mes entero, el
 * consumo por cubierto sale casi tres veces más bajo. Es la misma trampa de la
 * incidencia real (V.29), que dio seis meses de gráficos mal.
 */

const CUBIERTOS_FIELD: Record<Servicio, string> = {
  mediodia: 'cubiertos_mediodia',
  noche: 'cubiertos_noche',
  eventos: 'cubiertos_eventos',
}

export interface InsumoPorCubierto {
  refId: string
  nombre: string
  categoria: string
  unidad: string
  /** Cantidad total del período */
  cantidad: number
  costo: number
  /** Lo que importa: cuánto consume cada persona que se sienta */
  porCubierto: number
  costoPorCubierto: number
  /** Mismo cálculo en el período anterior. null si no había datos. */
  porCubiertoPrevio: number | null
  /** Variación porcentual del consumo por cubierto. null si no hay con qué comparar. */
  variacion: number | null
}

export interface ConsumoPorCubierto {
  desde: string
  hasta: string
  /** Cubiertos de los días QUE TIENEN consumo cargado */
  cubiertos: number
  cubiertosPrevios: number
  /** Días con consumo, y días del período que tuvieron venta */
  diasConCarga: number
  diasConVenta: number
  costoTotal: number
  /** Costo por cubierto de todo el consumo, para dar contexto */
  costoTotalPorCubierto: number
  insumos: InsumoPorCubierto[]
}

/**
 * Cubiertos de los días que tienen consumo cargado, dentro de un rango.
 * Si se filtra por servicio, cuenta solo los cubiertos de ese servicio.
 */
async function cubiertosDeDiasConCarga(
  desde: string,
  hasta: string,
  servicio?: Servicio
): Promise<{ cubiertos: number; diasConCarga: number; diasConVenta: number }> {
  let q = supabase.from('consumo_diario').select('fecha, servicio').gte('fecha', desde).lte('fecha', hasta)
  if (servicio) q = q.eq('servicio', servicio)
  const { data: consumos, error } = await q
  if (error) throw error
  if (!consumos || consumos.length === 0) {
    return { cubiertos: 0, diasConCarga: 0, diasConVenta: 0 }
  }

  const { data: ventas, error: eVentas } = await supabase
    .from('ventas_diarias')
    .select('fecha, cubiertos_mediodia, cubiertos_noche, cubiertos_eventos')
    .gte('fecha', desde)
    .lte('fecha', hasta)
  if (eVentas) throw eVentas

  const porFecha = new Map((ventas || []).map((v: any) => [v.fecha, v]))

  let cubiertos = 0
  const fechas = new Set<string>()
  for (const c of consumos as any[]) {
    fechas.add(c.fecha)
    const v = porFecha.get(c.fecha)
    if (!v) continue
    // Un consumo es de un servicio: se suman los cubiertos de ESE servicio.
    // Sumar el día entero contaría gente que comió en otro turno.
    cubiertos += Number(v[CUBIERTOS_FIELD[c.servicio as Servicio]] || 0)
  }

  const diasConVenta = (ventas || []).filter((v: any) =>
    Number(v.cubiertos_mediodia || 0) + Number(v.cubiertos_noche || 0) + Number(v.cubiertos_eventos || 0) > 0
  ).length

  return { cubiertos, diasConCarga: fechas.size, diasConVenta }
}

/** Corre el mismo rango tantos días atrás como dure, para comparar */
function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const d = new Date(desde + 'T00:00:00')
  const h = new Date(hasta + 'T00:00:00')
  const dias = Math.round((h.getTime() - d.getTime()) / 86400000) + 1
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return {
    desde: iso(new Date(d.getTime() - dias * 86400000)),
    hasta: iso(new Date(d.getTime() - 86400000)),
  }
}

export async function obtenerConsumoPorCubierto(
  desde: string,
  hasta: string,
  servicio?: Servicio
): Promise<ConsumoPorCubierto> {
  const previo = periodoAnterior(desde, hasta)

  const [actual, anterior, cub, cubPrev] = await Promise.all([
    desglosarRango(desde, hasta, servicio),
    desglosarRango(previo.desde, previo.hasta, servicio),
    cubiertosDeDiasConCarga(desde, hasta, servicio),
    cubiertosDeDiasConCarga(previo.desde, previo.hasta, servicio),
  ])

  // El desglose viene a nivel insumo, con los compuestos ya abiertos: el pan de
  // adentro de la ensalada césar suma con el pan de la mesa, que es lo correcto
  // para saber cuánto pan por persona sale de la cocina.
  const previoPorRef = new Map(
    anterior.desglose.map((d) => [`${d.tipo}:${d.ref_id}`, d.cantidad_total])
  )

  const insumos: InsumoPorCubierto[] = actual.desglose.map((d) => {
    const clave = `${d.tipo}:${d.ref_id}`
    const porCubierto = cub.cubiertos > 0 ? d.cantidad_total / cub.cubiertos : 0

    const cantPrev = previoPorRef.get(clave)
    const porCubiertoPrevio =
      cantPrev !== undefined && cubPrev.cubiertos > 0 ? cantPrev / cubPrev.cubiertos : null

    return {
      refId: d.ref_id,
      nombre: d.nombre,
      categoria: d.categoria,
      unidad: d.unidad,
      cantidad: d.cantidad_total,
      costo: d.costo_total,
      porCubierto,
      costoPorCubierto: cub.cubiertos > 0 ? d.costo_total / cub.cubiertos : 0,
      porCubiertoPrevio,
      variacion:
        porCubiertoPrevio && porCubiertoPrevio > 0
          ? ((porCubierto - porCubiertoPrevio) / porCubiertoPrevio) * 100
          : null,
    }
  })

  return {
    desde,
    hasta,
    cubiertos: cub.cubiertos,
    cubiertosPrevios: cubPrev.cubiertos,
    diasConCarga: cub.diasConCarga,
    diasConVenta: cub.diasConVenta,
    costoTotal: actual.costoTotal,
    costoTotalPorCubierto: cub.cubiertos > 0 ? actual.costoTotal / cub.cubiertos : 0,
    insumos,
  }
}

/**
 * Cuánto tiene que moverse para que valga mirarlo.
 *
 * Debajo de esto es ruido: los cubiertos se cuentan a mano, el consumo se
 * carga estimado, y un 10% arriba o abajo entra dentro de esa imprecisión.
 * Un umbral más bajo llenaría la lista de falsos positivos y en dos semanas
 * nadie la miraría.
 */
export const UMBRAL_VARIACION = 15

/**
 * Y cuánto tiene que pesar. Un insumo que cuesta $8 por cubierto puede
 * duplicarse sin que importe; lo que se busca son los que mueven la aguja.
 */
export const MINIMO_COSTO_POR_CUBIERTO = 20
