import { supabase } from './supabase'

/**
 * Auditoría semanal de compras — el pantallazo de la semana.
 *
 * No es un informe de cumplimiento: es el papel que se lleva a la reunión con
 * el encargado de compras. Por eso todo está ordenado por PLATA EN JUEGO y no
 * por categoría, y cada línea trae el dato que hace preguntar: no alcanza con
 * "el arroz subió 12%", sirve "el arroz subió 12% y es la tercera suba en dos
 * meses".
 *
 * ⚠️ EL EMPAREJAMIENTO OC ↔ FACTURA VA POR CLAVE COMPUESTA.
 * Una línea puede ser un insumo (insumo_id cargado, vino_id null) o un vino
 * (al revés). Comparar solo por insumo_id hace que todos los vinos matcheen
 * entre sí, porque `null === null` es verdadero: con dos vinos en la misma
 * factura, los dos se comparan contra el primero y el segundo sale como
 * faltante sin serlo. Es el mismo error que apareció buscando facturas
 * duplicadas en agosto. Por eso la clave es `i:<uuid>` o `v:<uuid>`.
 */

/** Diferencia de precio a partir de la cual se avisa. Debajo es redondeo. */
export const UMBRAL_PRECIO = 1 // %

/** Días que se le dan a un proveedor para mandar la factura antes de reclamar. */
export const DIAS_SIN_FACTURA = 7

/** Estados de orden que pueden estar esperando factura. Un borrador todavía no
 *  se mandó y una cancelada no va a llegar nunca: ninguno es un desvío. */
export const ESTADOS_ESPERANDO_FACTURA = ['enviada', 'parcialmente_recibida']

const TAMANO_PAGINA = 1000
const MAX_PAGINAS = 100

async function traerTodo<T = any>(tabla: string, select: string, filtros?: (q: any) => any): Promise<T[]> {
  const todos: T[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    let q = supabase.from(tabla).select(select).range(p * TAMANO_PAGINA, p * TAMANO_PAGINA + TAMANO_PAGINA - 1)
    if (filtros) q = filtros(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    todos.push(...(data as T[]))
    if (data.length < TAMANO_PAGINA) break
  }
  return todos
}

/**
 * Referencia estable de una línea del informe, para asociarle una nota.
 * Tiene que sobrevivir a recargas y a recalcular la semana, así que se arma
 * con ids y números de comprobante, nunca con nombres (un insumo se puede
 * renombrar y la nota quedaría huérfana).
 */
export function referenciaDe(clave: string, contexto?: string): string {
  return contexto ? `${clave}|${contexto}` : clave
}

/** Clave que distingue insumos de vinos. Ver la advertencia de arriba. */
export function claveItem(item: { insumo_id?: string | null; vino_id?: string | null }): string | null {
  if (item.insumo_id) return `i:${item.insumo_id}`
  if (item.vino_id) return `v:${item.vino_id}`
  return null
}

// =====================================================
// Tipos
// =====================================================

export interface Faltante {
  /** Identifica la línea para poder colgarle una nota. Ver referenciaDe(). */
  ref: string
  nombre: string
  proveedor: string
  factura: string
  fecha: string
  unidad: string
  pedido: number
  recibido: number // 0 = no llegó nada
  /** Plata que se pidió y no llegó, al precio de la orden */
  montoFaltante: number
}

export interface PrecioDistinto {
  ref: string
  nombre: string
  proveedor: string
  factura: string
  fecha: string
  precioPedido: number
  precioFacturado: number
  variacion: number
  cantidad: number
  /** Lo que costó de más (o de menos) esa diferencia en esta compra */
  impacto: number
}

export interface CambioPrecio {
  ref: string
  nombre: string
  /** A quién se le compró esta vez */
  proveedor: string
  /**
   * A quién se le compraba antes, SOLO si es distinto. En null cuando se le
   * siguió comprando al mismo, que es el caso normal y no hace falta aclarar.
   * Cuando tiene valor, la pregunta deja de ser "por qué subió" y pasa a ser
   * "por qué se le compró a otro".
   */
  proveedorAnterior: string | null
  fecha: string
  precioAnterior: number
  precioNuevo: number
  /** Positiva si subió, negativa si bajó */
  variacion: number
  /** Cuántas veces subió en los últimos 60 días. El dato que hace preguntar. */
  subasEnDosMeses: number
}

export interface Agregado {
  ref: string
  nombre: string
  proveedor: string
  factura: string
  fecha: string
  cantidad: number
  unidad: string
  monto: number
}

export interface OrdenSinFactura {
  ref: string
  numero: string
  proveedor: string
  fecha: string
  estado: string
  total: number
  diasEsperando: number
}

export interface AuditoriaSemanal {
  desde: string
  hasta: string
  comprasSemana: number
  cantidadFacturas: number
  faltantes: Faltante[]
  preciosDistintos: PrecioDistinto[]
  cambiosPrecio: CambioPrecio[]
  agregados: Agregado[]
  ordenesSinFactura: OrdenSinFactura[]
  /** true si no hay absolutamente nada que reportar */
  sinNovedades: boolean
}

// =====================================================
// Semana calendario
// =====================================================

/** Lunes de la semana que contiene esa fecha */
export function lunesDe(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  const dia = d.getDay()
  d.setDate(d.getDate() - dia + (dia === 0 ? -6 : 1))
  return d
}

export function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** La última semana cerrada: la que terminó el domingo pasado */
export function ultimaSemanaCerrada(): { desde: string; hasta: string } {
  const lunesEsta = lunesDe(new Date())
  const lunesPasada = new Date(lunesEsta)
  lunesPasada.setDate(lunesEsta.getDate() - 7)
  const domingoPasada = new Date(lunesPasada)
  domingoPasada.setDate(lunesPasada.getDate() + 6)
  return { desde: aISO(lunesPasada), hasta: aISO(domingoPasada) }
}

export function correrSemana(desde: string, direccion: -1 | 1): { desde: string; hasta: string } {
  const [a, m, d] = desde.split('-').map(Number)
  const nuevo = new Date(a, m - 1, d + direccion * 7)
  const fin = new Date(nuevo)
  fin.setDate(nuevo.getDate() + 6)
  return { desde: aISO(nuevo), hasta: aISO(fin) }
}

// =====================================================
// La auditoría
// =====================================================

export async function auditarSemana(desde: string, hasta: string): Promise<AuditoriaSemanal> {
  const hoy = aISO(new Date())

  const [facturas, ordenes, insumos, vinos, proveedores] = await Promise.all([
    traerTodo<any>(
      'facturas_proveedor',
      `id, numero_factura, fecha, total, proveedor_id, orden_compra_id,
       factura_items (insumo_id, vino_id, cantidad, precio_unitario, descuento)`,
      (q: any) => q.eq('activo', true).gte('fecha', desde).lte('fecha', hasta)
    ),
    traerTodo<any>(
      'ordenes_compra',
      `id, numero, fecha, estado, total, proveedor_id,
       orden_compra_items (insumo_id, vino_id, cantidad, precio_unitario)`,
      (q: any) => q.eq('activo', true)
    ),
    traerTodo<any>('insumos', 'id, nombre, unidad_medida'),
    traerTodo<any>('vinos', 'id, nombre, bodega'),
    traerTodo<any>('proveedores', 'id, nombre'),
  ])

  const nombreProv = new Map(proveedores.map((p: any) => [p.id, p.nombre]))
  const ordenPorId = new Map(ordenes.map((o: any) => [o.id, o]))

  /** Nombre y unidad de una línea, sea insumo o vino */
  const datosDe = (clave: string): { nombre: string; unidad: string } => {
    const [tipo, id] = [clave.slice(0, 1), clave.slice(2)]
    if (tipo === 'i') {
      const ins = insumos.find((x: any) => x.id === id)
      return { nombre: ins?.nombre ?? '(insumo eliminado)', unidad: ins?.unidad_medida ?? '' }
    }
    const v = vinos.find((x: any) => x.id === id)
    return { nombre: v ? `${v.nombre} (${v.bodega})` : '(vino eliminado)', unidad: 'botella' }
  }

  const faltantes: Faltante[] = []
  const preciosDistintos: PrecioDistinto[] = []
  const agregados: Agregado[] = []

  for (const f of facturas) {
    const prov = nombreProv.get(f.proveedor_id) ?? 'Sin proveedor'
    const orden = f.orden_compra_id ? ordenPorId.get(f.orden_compra_id) : null
    const itemsFactura: any[] = f.factura_items || []

    // Sin orden de compra no hay contra qué comparar: la factura entró suelta
    if (!orden?.orden_compra_items?.length) continue

    // Se agrupa por clave porque un mismo insumo puede venir en varias líneas
    const acumular = (items: any[]) => {
      const m = new Map<string, { cantidad: number; precio: number }>()
      for (const it of items) {
        const k = claveItem(it)
        if (!k) continue
        const prev = m.get(k)
        const cant = Number(it.cantidad) || 0
        // NETO, con el descuento aplicado. El precio de la OC ya viene neto, así
        // que comparar contra el precio de lista de la factura inventa una suba
        // igual al descuento: los 25 ítems de El triunfo (3%) aparecían todos
        // con un falso "+3,1%", y el Salentein Reserva con "+70,2%" cuando en
        // realidad se pagó 14,9% MENOS de lo pedido. La OC no tiene descuento
        // por línea, por eso el campo se lee con `?? 0`.
        const descuento = Number(it.descuento) || 0
        const precio = (Number(it.precio_unitario) || 0) * (1 - descuento / 100)
        // Si se repite, se suman cantidades y se toma el último precio
        m.set(k, { cantidad: (prev?.cantidad ?? 0) + cant, precio })
      }
      return m
    }

    const enOC = acumular(orden.orden_compra_items)
    const enFactura = acumular(itemsFactura)

    // Lo pedido: ¿llegó? ¿completo? ¿al precio acordado?
    Array.from(enOC.entries()).forEach(([clave, oc]) => {
      const { nombre, unidad } = datosDe(clave)
      const fi = enFactura.get(clave)

      if (!fi) {
        faltantes.push({
          ref: referenciaDe(clave, f.numero_factura),
          nombre, proveedor: prov, factura: f.numero_factura, fecha: f.fecha, unidad,
          pedido: oc.cantidad, recibido: 0,
          montoFaltante: oc.cantidad * oc.precio,
        })
        return
      }

      if (fi.cantidad < oc.cantidad) {
        faltantes.push({
          ref: referenciaDe(clave, f.numero_factura),
          nombre, proveedor: prov, factura: f.numero_factura, fecha: f.fecha, unidad,
          pedido: oc.cantidad, recibido: fi.cantidad,
          montoFaltante: (oc.cantidad - fi.cantidad) * oc.precio,
        })
      }

      if (oc.precio > 0) {
        const variacion = ((fi.precio - oc.precio) / oc.precio) * 100
        if (Math.abs(variacion) >= UMBRAL_PRECIO) {
          preciosDistintos.push({
            ref: referenciaDe(clave, f.numero_factura),
            nombre, proveedor: prov, factura: f.numero_factura, fecha: f.fecha,
            precioPedido: oc.precio, precioFacturado: fi.precio, variacion,
            cantidad: fi.cantidad,
            impacto: (fi.precio - oc.precio) * fi.cantidad,
          })
        }
      }
    })

    // Lo que llegó sin haberse pedido
    Array.from(enFactura.entries()).forEach(([clave, fi]) => {
      if (enOC.has(clave)) return
      const { nombre, unidad } = datosDe(clave)
      agregados.push({
        ref: referenciaDe(clave, f.numero_factura),
        nombre, proveedor: prov, factura: f.numero_factura, fecha: f.fecha,
        cantidad: fi.cantidad, unidad, monto: fi.cantidad * fi.precio,
      })
    })
  }

  // ---------------------------------------------------------------
  // Subas de precio de la semana, contra lo que se venía pagando
  // ---------------------------------------------------------------
  const hace60 = new Date()
  hace60.setDate(hace60.getDate() - 60)

  const precios = await traerTodo<any>(
    'precios_insumo',
    'insumo_id, proveedor_id, precio, fecha, created_at',
    // ⚠️ El desempate por created_at NO es cosmético. Dos precios del mismo día
    // —un tipeo y su corrección 23 segundos después— quedaban en orden
    // arbitrario, y el "precio anterior" podía terminar siendo el erróneo. El
    // asado a 5 costillas mostró "$243 → $24.301, +9900%" en la semana del
    // 24/08 cuando el cambio real era 24.300 → 24.301: +0,004%. Y de paso
    // inventaba subas al contar `subasEnDosMeses` sobre una lista desordenada.
    (q: any) =>
      q.gte('fecha', aISO(hace60)).gt('precio', 0)
        .order('fecha', { ascending: true })
        .order('created_at', { ascending: true })
  )

  const porInsumo = new Map<string, any[]>()
  for (const p of precios) {
    if (!porInsumo.has(p.insumo_id)) porInsumo.set(p.insumo_id, [])
    porInsumo.get(p.insumo_id)!.push(p)
  }

  const cambiosPrecio: CambioPrecio[] = []
  Array.from(porInsumo.entries()).forEach(([insumoId, lista]) => {
    // Cuántas veces subió en los últimos 60 días — el dato que hace preguntar
    let subasEnDosMeses = 0
    for (let i = 1; i < lista.length; i++) {
      if (lista[i].precio > lista[i - 1].precio) subasEnDosMeses++
    }

    // El último cambio de precio, si cayó dentro de la semana
    for (let i = lista.length - 1; i >= 1; i--) {
      const actual = lista[i]
      if (actual.fecha < desde || actual.fecha > hasta) continue
      const anterior = lista[i - 1]
      if (anterior.precio <= 0) break
      const variacion = ((actual.precio - anterior.precio) / anterior.precio) * 100
      // Sube o baja: las dos cosas interesan, sobre todo si cambió el proveedor
      if (Math.abs(variacion) >= UMBRAL_PRECIO) {
        const ins = insumos.find((x: any) => x.id === insumoId)
        const cambioDeProveedor =
          anterior.proveedor_id && actual.proveedor_id !== anterior.proveedor_id
        cambiosPrecio.push({
          ref: referenciaDe(`i:${insumoId}`),
          nombre: ins?.nombre ?? '(insumo eliminado)',
          proveedor: nombreProv.get(actual.proveedor_id) ?? '—',
          proveedorAnterior: cambioDeProveedor
            ? nombreProv.get(anterior.proveedor_id) ?? '—'
            : null,
          fecha: actual.fecha,
          precioAnterior: anterior.precio,
          precioNuevo: actual.precio,
          variacion,
          subasEnDosMeses,
        })
      }
      break
    }
  })

  // ---------------------------------------------------------------
  // Órdenes que siguen esperando factura
  // ---------------------------------------------------------------
  const ordenesSinFactura: OrdenSinFactura[] = ordenes
    .filter((o: any) => ESTADOS_ESPERANDO_FACTURA.includes(o.estado))
    .map((o: any) => {
      const [a, m, d] = o.fecha.split('-').map(Number)
      const dias = Math.floor((Date.now() - new Date(a, m - 1, d).getTime()) / 86_400_000)
      return {
        ref: referenciaDe(`oc:${o.id}`),
        numero: o.numero ?? '—',
        proveedor: nombreProv.get(o.proveedor_id) ?? '—',
        fecha: o.fecha,
        estado: o.estado,
        total: Number(o.total) || 0,
        diasEsperando: dias,
      }
    })
    .filter((o) => o.diasEsperando > DIAS_SIN_FACTURA && o.fecha <= hoy)
    .sort((a, b) => b.total - a.total)

  // Todo ordenado por plata: arriba lo que más costó
  faltantes.sort((a, b) => b.montoFaltante - a.montoFaltante)
  preciosDistintos.sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto))
  // Por magnitud del cambio, sin importar el signo: una baja del 20% también llama
  cambiosPrecio.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))
  agregados.sort((a, b) => b.monto - a.monto)

  const comprasSemana = facturas.reduce((s: number, f: any) => s + (Number(f.total) || 0), 0)

  return {
    desde,
    hasta,
    comprasSemana,
    cantidadFacturas: facturas.length,
    faltantes,
    preciosDistintos,
    cambiosPrecio,
    agregados,
    ordenesSinFactura,
    sinNovedades:
      faltantes.length === 0 &&
      preciosDistintos.length === 0 &&
      cambiosPrecio.length === 0 &&
      agregados.length === 0 &&
      ordenesSinFactura.length === 0,
  }
}

// =====================================================
// NOTAS: por qué pasó lo que pasó
// =====================================================
// El informe detecta el desvío pero no sabe la razón. Si el parmesano subió
// 100%, solo una persona sabe que se cambió por uno de mejor calidad o que
// hacía meses que no se compraba. La nota queda escrita y sale en el PDF, así
// la semana siguiente no se vuelve a discutir lo mismo.

export type BloqueAuditoria =
  | 'faltante'
  | 'cambio_precio'
  | 'precio_distinto'
  | 'agregado'
  | 'orden_sin_factura'
  /**
   * Comentario escrito al cargar la factura, antes de auditar. Quien carga es
   * quien sabe por qué pasó; una semana después ya nadie se acuerda. Va en su
   * propio bloque porque en ese momento todavía no se sabe en qué sección del
   * informe va a caer la línea: puede ser faltante, precio distinto, o las dos.
   * El resumen semanal lo muestra junto a la nota del bloque que corresponda.
   */
  | 'item_factura'

/** Lunes de la semana a la que pertenece una fecha, en formato ISO. */
export function semanaDe(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return aISO(lunesDe(new Date(a, m - 1, d)))
}

/** Notas de una semana, indexadas por `${bloque}|${referencia}` */
export type MapaNotas = Map<string, string>

export const claveNota = (bloque: BloqueAuditoria, ref: string) => `${bloque}|${ref}`

export async function obtenerNotas(semanaDesde: string): Promise<MapaNotas> {
  const { data, error } = await supabase
    .from('notas_auditoria')
    .select('bloque, referencia, nota')
    .eq('semana_desde', semanaDesde)

  if (error) {
    // Si la tabla todavía no existe, el informe tiene que seguir funcionando
    console.error('No se pudieron leer las notas:', error)
    return new Map()
  }
  return new Map((data || []).map((n: any) => [claveNota(n.bloque, n.referencia), n.nota]))
}

/** Guarda la nota. Con texto vacío la borra: es la forma natural de deshacer. */
export async function guardarNota(
  semanaDesde: string,
  bloque: BloqueAuditoria,
  referencia: string,
  nota: string
): Promise<void> {
  const limpia = nota.trim()

  if (!limpia) {
    const { error } = await supabase
      .from('notas_auditoria')
      .delete()
      .eq('semana_desde', semanaDesde)
      .eq('bloque', bloque)
      .eq('referencia', referencia)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('notas_auditoria')
    .upsert(
      { semana_desde: semanaDesde, bloque, referencia, nota: limpia },
      { onConflict: 'semana_desde,bloque,referencia' }
    )
  if (error) throw error
}
