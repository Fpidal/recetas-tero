import { supabase } from './supabase'

/**
 * Objetivo de compras semanal, y cómo viene la semana contra él.
 *
 * QUÉ SE CUENTA: las órdenes de compra **de la semana en que se pidieron**,
 * con IVA y sin vinos.
 *
 * POR SEMANA DE PEDIDO, no de recepción. Es lo que se puede controlar: el
 * miércoles ver "llevo $3,2M de $5,5M" sirve para decidir; enterarse cuando ya
 * llegó la mercadería, no. Medido el 20/08/26 sobre 104 facturas: **ninguna
 * tardó más de 7 días** desde su OC, así que en la práctica las dos formas de
 * contar dan casi lo mismo.
 *
 * CON IVA, y esto tiene una trampa: `ordenes_compra.total` guarda el NETO, pero
 * ninguna pantalla lo usa — todas calculan el IVA en vivo desde el
 * `iva_porcentaje` de cada insumo. Comparar el objetivo contra `total` a secas
 * daría un 20% de menos. Acá se reconstruye desde los items, igual que la
 * pantalla de Órdenes.
 *
 * SIN VINOS porque tienen otra lógica de compra: se cargan por caja cuando hay
 * oferta, no semana a semana. Una compra de vino distorsiona la semana entera
 * — en la del 13/07 fueron $1,64M sobre $4,07M de comida.
 */

export interface EstadoSemana {
  semanaDesde: string
  semanaHasta: string
  /** null si todavía no se cargó ningún objetivo */
  objetivo: number | null
  /** Todo lo pedido en la semana, sin vinos y con IVA */
  generado: number
  /** De eso, lo que ya llegó */
  recibido: number
  /** Y lo que falta llegar */
  pendiente: number
  /** Vinos de la semana, aparte: no cuentan contra el objetivo pero se muestran */
  vinos: number
  /** objetivo − generado. Positivo = queda margen. null sin objetivo. */
  diferencia: number | null
  /** Qué porcentaje del objetivo se lleva lo generado */
  porcentaje: number | null
  ordenes: number
}

/** Lunes de la semana de una fecha. Lunes a domingo, como todo el sistema. */
export function lunesDe(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1
  const l = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
  return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, '0')}-${String(l.getDate()).padStart(2, '0')}`
}

export function domingoDe(lunes: string): string {
  const [a, m, d] = lunes.split('-').map(Number)
  const x = new Date(a, m - 1, d + 6)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * El objetivo vigente en una semana: el de la fila más reciente que empiece
 * en esa semana o antes. Así se carga una vez y rige hasta que se cambie.
 */
export async function objetivoVigente(semanaDesde: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('objetivos_compra')
    .select('objetivo')
    .lte('semana_desde', semanaDesde)
    .order('semana_desde', { ascending: false })
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? Number((data[0] as any).objetivo) : null
}

/** Guarda o pisa el objetivo de una semana */
export async function guardarObjetivo(semanaDesde: string, objetivo: number): Promise<void> {
  const { error } = await supabase
    .from('objetivos_compra')
    .upsert({ semana_desde: semanaDesde, objetivo }, { onConflict: 'semana_desde' })
  if (error) throw error
}

/**
 * Los estados que cuentan como compra comprometida.
 *
 * `cancelada` queda afuera —no se compró— y `borrador` entra porque es una
 * orden armada que está por salir: verla en el acumulado es justamente lo que
 * permite frenarla antes de mandarla. Es el mismo criterio que ya usa la
 * pantalla de Órdenes para su total pendiente.
 */
const ESTADOS_QUE_CUENTAN = ['borrador', 'enviada', 'recibida', 'parcialmente_recibida']
const ESTADOS_RECIBIDOS = ['recibida', 'parcialmente_recibida']

interface FilaOC {
  id: string
  fecha: string
  estado: string
  orden_compra_items: {
    cantidad: number
    precio_unitario: number
    vino_id: string | null
    insumos: { iva_porcentaje: number } | null
  }[]
}

/** Total con IVA de una orden, separando vinos del resto */
function totalizar(o: FilaOC): { sinVinos: number; vinos: number } {
  let sinVinos = 0
  let vinos = 0
  for (const it of o.orden_compra_items || []) {
    const neto = Number(it.cantidad) * Number(it.precio_unitario)
    // Los vinos van al 21%; el resto toma el IVA de su insumo. Sin insumo
    // —un item huérfano— se asume 21%, que es el caso más común.
    const iva = it.vino_id ? 21 : it.insumos?.iva_porcentaje ?? 21
    const conIva = neto * (1 + iva / 100)
    if (it.vino_id) vinos += conIva
    else sinVinos += conIva
  }
  return { sinVinos, vinos }
}

export async function obtenerEstadoSemana(semanaDesde: string): Promise<EstadoSemana> {
  const semanaHasta = domingoDe(semanaDesde)

  const [{ data, error }, objetivo] = await Promise.all([
    supabase
      .from('ordenes_compra')
      .select(`
        id, fecha, estado,
        orden_compra_items ( cantidad, precio_unitario, vino_id, insumos ( iva_porcentaje ) )
      `)
      .gte('fecha', semanaDesde)
      .lte('fecha', semanaHasta)
      .in('estado', ESTADOS_QUE_CUENTAN),
    objetivoVigente(semanaDesde),
  ])
  if (error) throw error

  const ordenes = (data || []) as unknown as FilaOC[]

  let generado = 0
  let recibido = 0
  let vinos = 0
  for (const o of ordenes) {
    const t = totalizar(o)
    generado += t.sinVinos
    vinos += t.vinos
    if (ESTADOS_RECIBIDOS.includes(o.estado)) recibido += t.sinVinos
  }

  return {
    semanaDesde,
    semanaHasta,
    objetivo,
    generado,
    recibido,
    pendiente: generado - recibido,
    vinos,
    diferencia: objetivo === null ? null : objetivo - generado,
    porcentaje: objetivo && objetivo > 0 ? (generado / objetivo) * 100 : null,
    ordenes: ordenes.length,
  }
}

/** Las últimas N semanas, para el historial */
export async function obtenerHistorial(semanas = 12): Promise<EstadoSemana[]> {
  const hoy = new Date()
  const lunesActual = lunesDe(hoy)
  const [a, m, d] = lunesActual.split('-').map(Number)

  const fechas: string[] = []
  for (let i = 0; i < semanas; i++) {
    const x = new Date(a, m - 1, d - i * 7)
    fechas.push(
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    )
  }

  const estados = await Promise.all(fechas.map(obtenerEstadoSemana))
  // Sin órdenes y sin objetivo no hay nada que mostrar: son semanas cerradas
  // o previas al sistema, y llenarían el historial de filas vacías.
  return estados.filter((e) => e.ordenes > 0 || e.objetivo !== null)
}

/**
 * Cuán cerca del objetivo se está.
 *
 * El aviso arranca en 85% y no en 100%: enterarse cuando ya se pasó no permite
 * hacer nada. La idea es ver el jueves que queda poco margen y decidir qué
 * entra y qué espera al lunes.
 */
export function estadoObjetivo(porcentaje: number | null): 'sin-objetivo' | 'holgado' | 'cerca' | 'excedido' {
  if (porcentaje === null) return 'sin-objetivo'
  if (porcentaje > 100) return 'excedido'
  if (porcentaje >= 85) return 'cerca'
  return 'holgado'
}
