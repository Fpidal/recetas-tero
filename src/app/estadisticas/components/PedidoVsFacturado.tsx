'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatearMoneda } from '@/lib/formato-numeros'
import { formatearFechaCorta } from '@/lib/fechas'
import {
  compararPedidoFacturado, UMBRAL_AL_PRECIO,
  type ComparacionPedidoFacturado, type LineaComparada, type TotalesComparacion,
} from '@/lib/pedido-vs-facturado'

/**
 * Pedido contra facturado (V.69): la herramienta de trabajo detrás de las
 * cuatro cifras del Cierre de mes. Reemplaza a "Compras por Proveedor", cuyo
 * ranking ya está en el cierre. Acá se ve en qué producto y en qué factura,
 * para poder reclamar.
 */

const fmt = (v: number) => formatearMoneda(v, true, 0)
const pct = (v: number, d = 1) => v.toFixed(d).replace('.', ',')
const conSigno = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`
const cant = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 2 })

export default function PedidoVsFacturado({ desde, hasta }: { desde: string; hasta: string }) {
  const [datos, setDatos] = useState<ComparacionPedidoFacturado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    if (!desde || !hasta) return
    let vigente = true
    setDatos(null); setError(null); setAbierto(null)
    compararPedidoFacturado(desde, hasta)
      .then((d) => { if (vigente) setDatos(d) })
      .catch((e) => { if (vigente) setError(e?.message || String(e)) })
    return () => { vigente = false }
  }, [desde, hasta])

  // Líneas con diferencia de cada proveedor, ordenadas por plata
  const lineasPorProveedor = useMemo(() => {
    const m = new Map<string, LineaComparada[]>()
    datos?.lineas.forEach((l) => {
      if (l.aRevisar || Math.abs(l.variacion) < UMBRAL_AL_PRECIO) return
      const lista = m.get(l.proveedorId) ?? []
      lista.push(l)
      m.set(l.proveedorId, lista)
    })
    m.forEach((lista) => lista.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)))
    return m
  }, [datos])

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
        No se pudo armar la comparación: <span className="font-mono">{error}</span>
      </div>
    )
  }
  if (!datos) {
    return <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Comparando órdenes y facturas…</div>
  }

  const t = datos.totales
  const conDiferencia = datos.proveedores.filter((p) => p.alPrecio < p.lineas)
  const respetaron = datos.proveedores.filter((p) => p.alPrecio === p.lineas)

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 max-w-3xl">
        El precio de cada producto en la orden de compra contra el de la factura, sólo por lo que se entregó.
        Netos, con el descuento del proveedor y sin IVA. Entran <span className="font-mono">{datos.facturasConOC}</span> de{' '}
        <span className="font-mono">{datos.facturasDelPeriodo}</span> facturas, las que tienen OC.
        {(datos.sinOC.cantidad > 0 || datos.noPedidos.cantidad > 0) && ' Quedan afuera '}
        {datos.sinOC.cantidad > 0 && <>{datos.sinOC.cantidad} {datos.sinOC.cantidad === 1 ? 'factura' : 'facturas'} sin OC (<span className="font-mono">{fmt(datos.sinOC.monto)}</span>)</>}
        {datos.sinOC.cantidad > 0 && datos.noPedidos.cantidad > 0 && ' y '}
        {datos.noPedidos.cantidad > 0 && <>{datos.noPedidos.cantidad} {datos.noPedidos.cantidad === 1 ? 'producto que llegó' : 'productos que llegaron'} sin pedirse (<span className="font-mono">{fmt(datos.noPedidos.monto)}</span>)</>}
        {(datos.sinOC.cantidad > 0 || datos.noPedidos.cantidad > 0) && '.'}
      </p>

      {t.lineas === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500 text-center">
          No hay facturas con orden de compra en este período.
        </div>
      ) : (
        <>
          <Totales t={t} mayorDeMenos={[...datos.proveedores].sort((a, b) => a.deMenos - b.deMenos)[0]} />

          <section className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Por proveedor</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Ordenados por lo que cobraron de más. Tocá un proveedor para ver sus líneas con diferencia y la factura de cada una.
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-500">
                    <th className="text-left font-semibold px-3 py-2.5">Proveedor</th>
                    <th className="text-left font-semibold px-3 py-2.5">Líneas al precio de la OC</th>
                    <th className="text-right font-semibold px-3 py-2.5">Pedido</th>
                    <th className="text-right font-semibold px-3 py-2.5">Facturado</th>
                    <th className="text-right font-semibold px-3 py-2.5">De más</th>
                    <th className="text-right font-semibold px-3 py-2.5">De menos</th>
                    <th className="text-right font-semibold px-3 py-2.5">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {conDiferencia.map((p) => {
                    const estaAbierto = abierto === p.proveedorId
                    const lineas = lineasPorProveedor.get(p.proveedorId) ?? []
                    return (
                      <Fragment key={p.proveedorId}>
                        <tr
                          className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${estaAbierto ? 'bg-orange-50/40' : ''}`}
                          onClick={() => setAbierto(estaAbierto ? null : p.proveedorId)}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5 font-medium text-gray-900">
                              {estaAbierto ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                              {p.proveedor}
                            </div>
                            <div className="text-[11px] text-gray-400 ml-5">
                              {p.facturas} {p.facturas === 1 ? 'factura' : 'facturas'} · {p.lineas} {p.lineas === 1 ? 'línea' : 'líneas'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5"><Cumplimiento t={p} /></td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmt(p.pedido)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{fmt(p.facturado)}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${p.deMas > 0 ? 'text-red-700' : 'text-gray-300'}`}>{p.deMas > 0 ? fmt(p.deMas) : '—'}</td>
                          <td className={`px-3 py-2.5 text-right font-mono ${p.deMenos < 0 ? 'text-green-700' : 'text-gray-300'}`}>{p.deMenos < 0 ? `−${fmt(Math.abs(p.deMenos))}` : '—'}</td>
                          <td className="px-3 py-2.5 text-right"><ChipNeto neto={p.neto} pedido={p.pedido} /></td>
                        </tr>
                        {estaAbierto && (
                          <tr className="bg-gray-50/70 border-b border-gray-100">
                            <td colSpan={7} className="px-3 py-3 pl-8">
                              <TablaLineas lineas={lineas} />
                              <p className="text-[11px] text-gray-400 mt-2">
                                {lineas.length} {lineas.length === 1 ? 'línea con diferencia' : 'líneas con diferencia'}, ordenadas por plata.
                                Las {p.alPrecio} al precio de la OC no se listan.
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {respetaron.length > 0 && (
                    <tr className="bg-gray-50 text-xs text-gray-500">
                      <td colSpan={7} className="px-3 py-2.5">
                        Al precio de la OC en todas las líneas: {respetaron.map((p) => p.proveedor).join(', ')}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400">
              El neto en verde si quedó a tu favor o en ±0,5%, amarillo hasta 2% de más, rojo por encima.
              El precio de la OC es el que tenía el sistema al armarla: en productos de mercado, como la verdura, la diferencia suele ser el precio del día.
            </p>
          </section>
        </>
      )}

      {datos.aRevisar.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">A revisar</h3>
            <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
              Difieren 50% o más y además la cantidad cambió a menos de la mitad o a más del doble: casi siempre la OC y la factura
              usan unidades distintas. No se suman arriba.
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <TablaLineas lineas={datos.aRevisar} conProveedor />
          </div>
        </section>
      )}
    </div>
  )
}

function Totales({ t, mayorDeMenos }: { t: TotalesComparacion; mayorDeMenos?: { proveedor: string; deMenos: number } }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="rounded-lg border border-red-200 bg-gradient-to-b from-red-50 to-white shadow-sm p-4 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Cobrado de más</div>
        <div className="text-2xl font-semibold text-red-700 mt-1 font-mono break-all">{fmt(t.deMas)}</div>
        <div className="text-xs text-gray-500 mt-1">
          <span className="font-mono">{t.masCaras}</span> líneas sobre el precio de la OC ·{' '}
          <span className="font-mono">{pct(t.pedido > 0 ? (t.deMas / t.pedido) * 100 : 0)}%</span> de lo pedido
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Cobrado de menos</div>
        <div className="text-2xl font-semibold text-green-700 mt-1 font-mono break-all">−{fmt(Math.abs(t.deMenos))}</div>
        <div className="text-xs text-gray-500 mt-1">
          <span className="font-mono">{t.masBaratas}</span> líneas
          {mayorDeMenos && mayorDeMenos.deMenos < 0 && (
            <> · la mayor, {mayorDeMenos.proveedor} (<span className="font-mono">−{fmt(Math.abs(mayorDeMenos.deMenos))}</span>)</>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Neto</div>
        <div className="text-2xl font-semibold text-gray-900 mt-1 font-mono break-all">{conSigno(t.neto)}</div>
        <div className="text-xs text-gray-500 mt-1">
          Pedido <span className="font-mono">{fmt(t.pedido)}</span> · facturado <span className="font-mono">{fmt(t.facturado)}</span>
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Al precio de la OC</div>
        <div className="text-2xl font-semibold text-gray-900 mt-1 font-mono">{Math.round((t.alPrecio / t.lineas) * 100)}%</div>
        <div className="text-xs text-gray-500 mt-1">
          <span className="font-mono">{t.alPrecio}</span> de <span className="font-mono">{t.lineas}</span> líneas sin diferencia
        </div>
      </div>
    </div>
  )
}

/** Barra verde / roja / verde claro: al precio, más caras, más baratas */
function Cumplimiento({ t }: { t: TotalesComparacion }) {
  const ok = (t.alPrecio / t.lineas) * 100
  const sube = (t.masCaras / t.lineas) * 100
  const baja = 100 - ok - sube
  return (
    <div>
      <div className="flex h-2 w-28 rounded overflow-hidden bg-gray-100">
        <div className="bg-green-700" style={{ width: `${ok}%` }} />
        <div className="bg-red-600" style={{ width: `${sube}%` }} />
        <div className="bg-green-300" style={{ width: `${baja}%` }} />
      </div>
      <div className="text-xs font-mono text-gray-600 mt-1">
        {Math.round(ok)}% · {t.masCaras} {t.masCaras === 1 ? 'más cara' : 'más caras'}
      </div>
    </div>
  )
}

function ChipNeto({ neto, pedido }: { neto: number; pedido: number }) {
  const p = pedido > 0 ? (neto / pedido) * 100 : 0
  const clase = p <= 0.5 ? 'text-green-700 bg-green-50' : p <= 2 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
  return <span className={`text-xs font-semibold font-mono px-2 py-0.5 rounded-full ${clase}`}>{p >= 0 ? '+' : '−'}{pct(Math.abs(p))}%</span>
}

function TablaLineas({ lineas, conProveedor }: { lineas: LineaComparada[]; conProveedor?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[680px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="text-left font-semibold py-1.5 pr-3">Fecha</th>
            <th className="text-left font-semibold py-1.5 pr-3">Factura</th>
            <th className="text-left font-semibold py-1.5 pr-3">Producto</th>
            <th className="text-right font-semibold py-1.5 pr-3">Pedido</th>
            <th className="text-right font-semibold py-1.5 pr-3">Llegó</th>
            <th className="text-right font-semibold py-1.5 pr-3">Precio OC</th>
            <th className="text-right font-semibold py-1.5 pr-3">Facturado</th>
            <th className="text-right font-semibold py-1.5 pr-3">Var.</th>
            <th className="text-right font-semibold py-1.5">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const color = l.diferencia > 0 ? 'text-red-700' : 'text-green-700'
            return (
              <tr key={`${l.facturaId}-${l.clave}`} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 pr-3 font-mono text-gray-600">{formatearFechaCorta(l.fecha)}</td>
                <td className="py-1.5 pr-3 font-mono text-gray-500">{l.factura}</td>
                <td className="py-1.5 pr-3 text-gray-900">
                  {l.nombre}
                  {conProveedor && <span className="text-gray-400"> · {l.proveedor}</span>}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">{cant(l.cantidadPedida)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{cant(l.cantidad)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{fmt(l.precioPedido)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{fmt(l.precioFacturado)}</td>
                <td className={`py-1.5 pr-3 text-right font-mono ${color}`}>{l.variacion > 0 ? '+' : '−'}{pct(Math.abs(l.variacion))}%</td>
                <td className={`py-1.5 text-right font-mono ${color}`}>{conSigno(l.diferencia)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
