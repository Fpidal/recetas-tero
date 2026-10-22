import { supabase } from './supabase'
import { claveItem } from './auditoria-semanal'

/**
 * Pedido contra facturado: ¿el proveedor respetó el precio de la OC?
 *
 * Cada producto se valoriza con la cantidad FACTURADA, una vez al precio de la
 * orden y otra al de la factura. Lo que no se entregó no entra: si se pidieron
 * 10 kg y llegaron 6, comparar totales diría "me cobraron de menos" cuando en
 * realidad faltó mercadería. Las faltas ya las muestra la auditoría semanal.
 *
 * Es NETO contra NETO (trampa 10 de CLAUDE.md): el precio de la OC ya trae el
 * descuento pactado, así que a la factura se le aplica el suyo antes de
 * comparar. Sin IVA de ningún lado. Es la misma cuenta que `auditarSemana()`,
 * acá sumada por proveedor y por período.
 *
 * El precio de la OC es el último que tenía el sistema al armarla (o el que se
 * corrigió a mano), así que una diferencia también puede ser el mercado que se
 * movió entre el pedido y la entrega; en verdura pasa todo el tiempo.
 */

/** Debajo de esto es redondeo: la línea cuenta como "al precio de la OC" */
export const UMBRAL_AL_PRECIO = 0.5 // %

/**
 * Desde acá la diferencia casi nunca es precio sino unidad: el queso crema del
 * 09/09/26 se pidió 1 a $13.658 y se facturaron 3,5 a $6.426. Esas líneas se
 * muestran aparte, para revisar, y NO se suman a los totales.
 */
export const UMBRAL_A_REVISAR = 50 // %

export interface LineaComparada {
  clave: string
  nombre: string
  proveedorId: string
  proveedor: string
  facturaId: string
  factura: string
  fecha: string
  cantidad: number
  cantidadPedida: number
  precioPedido: number
  precioFacturado: number
  /** (facturado − pedido) × cantidad facturada */
  diferencia: number
  variacion: number
  aRevisar: boolean
}

export interface TotalesComparacion {
  lineas: number
  alPrecio: number
  masCaras: number
  masBaratas: number
  pedido: number
  facturado: number
  deMas: number
  /** Negativo */
  deMenos: number
  neto: number
}

export interface ProveedorComparado extends TotalesComparacion {
  proveedorId: string
  proveedor: string
  facturas: number
}

export interface ComparacionPedidoFacturado {
  desde: string
  hasta: string
  totales: TotalesComparacion
  proveedores: ProveedorComparado[]
  /** Todas las líneas comparadas, incluidas las de revisar */
  lineas: LineaComparada[]
  aRevisar: LineaComparada[]
  facturasDelPeriodo: number
  facturasConOC: number
  /** Facturas del período sin orden asociada: no hay contra qué comparar */
  sinOC: { cantidad: number; monto: number }
  /** Productos facturados que no estaban en la orden */
  noPedidos: { cantidad: number; monto: number }
}

const PAGINA = 1000

async function traerPaginado<T>(armar: (desde: number, hasta: number) => any): Promise<T[]> {
  const filas: T[] = []
  for (let p = 0; p < 50; p++) {
    const { data, error } = await armar(p * PAGINA, p * PAGINA + PAGINA - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    filas.push(...(data as T[]))
    if (data.length < PAGINA) break
  }
  return filas
}

function totalesVacios(): TotalesComparacion {
  return { lineas: 0, alPrecio: 0, masCaras: 0, masBaratas: 0, pedido: 0, facturado: 0, deMas: 0, deMenos: 0, neto: 0 }
}

function sumar(t: TotalesComparacion, l: LineaComparada) {
  t.lineas++
  if (Math.abs(l.variacion) < UMBRAL_AL_PRECIO) t.alPrecio++
  else if (l.variacion > 0) { t.masCaras++; t.deMas += l.diferencia }
  else { t.masBaratas++; t.deMenos += l.diferencia }
  t.pedido += l.precioPedido * l.cantidad
  t.facturado += l.precioFacturado * l.cantidad
  t.neto += l.diferencia
}

/** Agrupa por clave: un mismo insumo puede venir en varias líneas */
function acumular(items: any[], conDescuento: boolean) {
  const m = new Map<string, { cantidad: number; precio: number }>()
  for (const it of items) {
    const k = claveItem(it)
    if (!k) continue
    const prev = m.get(k)
    const descuento = conDescuento ? Number(it.descuento) || 0 : 0
    const precio = (Number(it.precio_unitario) || 0) * (1 - descuento / 100)
    // Si se repite, se suman cantidades y se toma el último precio
    m.set(k, { cantidad: (prev?.cantidad ?? 0) + (Number(it.cantidad) || 0), precio })
  }
  return m
}

export async function compararPedidoFacturado(desde: string, hasta: string): Promise<ComparacionPedidoFacturado> {
  const facturas = await traerPaginado<any>((a, b) =>
    supabase
      .from('facturas_proveedor')
      .select(`id, numero_factura, fecha, total, proveedor_id, orden_compra_id, proveedores (nombre),
               factura_items (insumo_id, vino_id, cantidad, precio_unitario, descuento)`)
      .eq('activo', true)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha')
      .range(a, b)
  )

  const conOC = facturas.filter((f) => f.orden_compra_id)
  const idsOC = Array.from(new Set(conOC.map((f) => f.orden_compra_id as string)))

  const ordenes: any[] = []
  for (let i = 0; i < idsOC.length; i += 100) {
    const { data, error } = await supabase
      .from('ordenes_compra')
      .select('id, orden_compra_items (insumo_id, vino_id, cantidad, precio_unitario)')
      .in('id', idsOC.slice(i, i + 100))
    if (error) throw error
    ordenes.push(...(data ?? []))
  }
  const ordenPorId = new Map(ordenes.map((o) => [o.id, o]))

  // Nombres de lo que se va a mostrar
  const claves = new Set<string>()
  conOC.forEach((f) => (f.factura_items ?? []).forEach((it: any) => { const k = claveItem(it); if (k) claves.add(k) }))
  const idsInsumo = Array.from(claves).filter((k) => k.startsWith('i:')).map((k) => k.slice(2))
  const idsVino = Array.from(claves).filter((k) => k.startsWith('v:')).map((k) => k.slice(2))
  const nombres = new Map<string, string>()
  for (let i = 0; i < idsInsumo.length; i += 200) {
    const { data } = await supabase.from('insumos').select('id, nombre').in('id', idsInsumo.slice(i, i + 200))
    ;(data ?? []).forEach((x: any) => nombres.set(`i:${x.id}`, x.nombre))
  }
  for (let i = 0; i < idsVino.length; i += 200) {
    const { data } = await supabase.from('vinos').select('id, nombre, bodega').in('id', idsVino.slice(i, i + 200))
    ;(data ?? []).forEach((x: any) => nombres.set(`v:${x.id}`, `${x.nombre} (${x.bodega})`))
  }

  const lineas: LineaComparada[] = []
  const noPedidos = { cantidad: 0, monto: 0 }

  for (const f of conOC) {
    const orden = ordenPorId.get(f.orden_compra_id)
    if (!orden?.orden_compra_items?.length) continue
    const enOC = acumular(orden.orden_compra_items, false)
    const enFactura = acumular(f.factura_items ?? [], true)
    const proveedor = f.proveedores?.nombre ?? 'Sin proveedor'

    enFactura.forEach((fi, clave) => {
      const oc = enOC.get(clave)
      if (!oc) {
        noPedidos.cantidad++
        noPedidos.monto += fi.cantidad * fi.precio
        return
      }
      if (oc.precio <= 0 || fi.cantidad <= 0) return
      const variacion = ((fi.precio - oc.precio) / oc.precio) * 100
      lineas.push({
        clave,
        nombre: nombres.get(clave) ?? '(eliminado)',
        proveedorId: f.proveedor_id,
        proveedor,
        facturaId: f.id,
        factura: f.numero_factura,
        fecha: f.fecha,
        cantidad: fi.cantidad,
        cantidadPedida: oc.cantidad,
        precioPedido: oc.precio,
        precioFacturado: fi.precio,
        diferencia: (fi.precio - oc.precio) * fi.cantidad,
        variacion,
        aRevisar: Math.abs(variacion) >= UMBRAL_A_REVISAR,
      })
    })
  }

  const totales = totalesVacios()
  const porProveedor = new Map<string, ProveedorComparado & { _facturas: Set<string> }>()
  for (const l of lineas) {
    if (l.aRevisar) continue
    sumar(totales, l)
    let p = porProveedor.get(l.proveedorId)
    if (!p) {
      p = { ...totalesVacios(), proveedorId: l.proveedorId, proveedor: l.proveedor, facturas: 0, _facturas: new Set() }
      porProveedor.set(l.proveedorId, p)
    }
    sumar(p, l)
    p._facturas.add(l.facturaId)
  }

  const proveedores = Array.from(porProveedor.values())
    .map(({ _facturas, ...p }) => ({ ...p, facturas: _facturas.size }))
    .sort((a, b) => b.deMas - a.deMas || b.lineas - a.lineas)

  const sinOC = facturas.filter((f) => !f.orden_compra_id)

  return {
    desde,
    hasta,
    totales,
    proveedores,
    lineas,
    aRevisar: lineas.filter((l) => l.aRevisar).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
    facturasDelPeriodo: facturas.length,
    facturasConOC: conOC.length,
    sinOC: { cantidad: sinOC.length, monto: sinOC.reduce((s, f) => s + (Number(f.total) || 0), 0) },
    noPedidos,
  }
}
