'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatearMoneda } from '@/lib/formato-numeros'
import { CATEGORIAS_LABEL } from '@/types/analisis'

/**
 * ABC de insumos — dónde se va la plata de las compras.
 *
 * Pareto sobre el gasto: A hasta el 80% acumulado, B hasta el 95%, C el resto.
 * Toda la agregación vive en la función SQL abc_insumos(), que usa el mismo
 * prorrateo que cierre_mes() para que los dos informes den el mismo total.
 *
 * La columna de volatilidad no es adorno: con 58 insumos en la clase A, todos
 * "importantes", lo que distingue al que hay que mirar HOY es que además se
 * esté moviendo el precio.
 */

const fmt = (v: number) => formatearMoneda(v, true, 0)

interface ItemAbc {
  insumo_id: string
  nombre: string
  rubro: string
  unidad: string
  monto: number
  cantidad: number
  compras: number
  porcentaje: number
  acumulado: number
  clase: 'A' | 'B' | 'C'
  subas: number
  variacion: number | null
  posicion: number
}

interface ResumenClase {
  clase: 'A' | 'B' | 'C'
  insumos: number
  monto: number
  porcentaje: number
}

interface DatosAbc {
  desde: string
  hasta: string
  gasto_total: number
  resumen: ResumenClase[]
  items: ItemAbc[]
}

/** Períodos ofrecidos. El trimestre es el default: un mes solo puede estar
 *  distorsionado por estacionalidad (un mes de muchos eventos infla carnes). */
function periodos(): { valor: string; label: string; desde: string; hasta: string }[] {
  const hoy = new Date()
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0)

  const atras = (meses: number) => new Date(hoy.getFullYear(), hoy.getMonth() - meses, 1)

  return [
    { valor: '3m', label: 'Últimos 3 meses', desde: iso(atras(3)), hasta: iso(finMesPasado) },
    { valor: '6m', label: 'Últimos 6 meses', desde: iso(atras(6)), hasta: iso(finMesPasado) },
    { valor: '12m', label: 'Últimos 12 meses', desde: iso(atras(12)), hasta: iso(finMesPasado) },
    {
      valor: 'mes',
      label: 'Mes pasado',
      desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: iso(finMesPasado),
    },
  ]
}

const COLOR_CLASE = {
  A: { chip: 'bg-red-100 text-red-800', barra: 'bg-red-500', borde: 'border-red-200', fondo: 'bg-red-50', texto: 'text-red-800' },
  B: { chip: 'bg-amber-100 text-amber-800', barra: 'bg-amber-500', borde: 'border-amber-200', fondo: 'bg-amber-50', texto: 'text-amber-800' },
  C: { chip: 'bg-gray-100 text-gray-700', barra: 'bg-gray-400', borde: 'border-gray-200', fondo: 'bg-gray-50', texto: 'text-gray-700' },
}

const QUE_HACER = {
  A: 'Precio vigilado. Comparar proveedores y no dejar pasar una suba: acá cada 1% es plata real.',
  B: 'Importan pero no urgen. Revisar cada tanto.',
  C: 'Mitad del catálogo, poco del gasto. Comprar por comodidad, no perder tiempo negociando.',
}

export default function AbcInsumos() {
  const opciones = useMemo(periodos, [])
  const [periodo, setPeriodo] = useState(opciones[0].valor)
  const [claseVisible, setClaseVisible] = useState<'A' | 'B' | 'C'>('A')
  const [data, setData] = useState<DatosAbc | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rango = opciones.find((o) => o.valor === periodo)!

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setError(null)
    supabase
      .rpc('abc_insumos', { p_desde: rango.desde, p_hasta: rango.hasta })
      .then(({ data: d, error: e }) => {
        if (cancelado) return
        if (e) {
          console.error('Error cargando ABC:', e)
          setError(e.message)
        } else {
          setData(d as DatosAbc)
        }
        setCargando(false)
      })
    return () => { cancelado = true }
  }, [periodo, rango.desde, rango.hasta])

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => i.clase === claseVisible),
    [data, claseVisible]
  )

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="w-full sm:w-64">
            <label className="block text-xs font-medium text-gray-700 mb-1">Período</label>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              {opciones.map((o) => (
                <option key={o.valor} value={o.valor}>{o.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              {rango.desde} → {rango.hasta}
            </p>
          </div>
          {data && (
            <div className="text-right">
              <div className="text-[10px] uppercase text-gray-500 font-semibold">Compras del período</div>
              <div className="text-lg font-bold text-gray-900 font-mono">{fmt(data.gasto_total)}</div>
              <div className="text-[11px] text-gray-500 font-mono">{data.items.length} insumos</div>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            {error.includes('abc_insumos')
              ? 'Falta crear la función abc_insumos() en la base. Está en supabase-abc-insumos.sql.'
              : error}
          </span>
        </div>
      ) : cargando || !data ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          Calculando...
        </div>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          No hay compras cargadas en este período.
        </div>
      ) : (
        <>
          {/* Las tres clases */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['A', 'B', 'C'] as const).map((clase) => {
              const r = data.resumen.find((x) => x.clase === clase)
              const color = COLOR_CLASE[clase]
              const activa = claseVisible === clase
              return (
                <button
                  key={clase}
                  onClick={() => setClaseVisible(clase)}
                  className={`text-left rounded-lg border-2 p-3 transition-all ${
                    activa ? `${color.borde} ${color.fondo} shadow-sm` : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs ${color.chip}`}>
                      {clase}
                    </span>
                    <span className="text-[11px] text-gray-500 font-mono">
                      {r?.insumos ?? 0} insumos
                    </span>
                  </div>
                  <div className="text-lg font-bold text-gray-900 font-mono">{fmt(r?.monto ?? 0)}</div>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                    <div className={`h-full ${color.barra}`} style={{ width: `${r?.porcentaje ?? 0}%` }} />
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1 font-mono">
                    {(r?.porcentaje ?? 0).toFixed(1)}% del gasto
                  </div>
                </button>
              )
            })}
          </div>

          {/* Qué hacer con la clase elegida */}
          <div className={`rounded-lg border p-3 text-sm ${COLOR_CLASE[claseVisible].fondo} ${COLOR_CLASE[claseVisible].borde} ${COLOR_CLASE[claseVisible].texto}`}>
            <strong>Clase {claseVisible}:</strong> {QUE_HACER[claseVisible]}
          </div>

          {/* Detalle */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Insumos clase {claseVisible}
                <span className="text-gray-400 font-normal font-mono"> ({items.length})</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                    <th className="text-right py-2 px-2 font-medium w-10">#</th>
                    <th className="text-left py-2 px-3 font-medium">Insumo</th>
                    <th className="text-left py-2 px-3 font-medium">Rubro</th>
                    <th className="text-right py-2 px-3 font-medium">Gasto</th>
                    <th className="text-right py-2 px-2 font-medium">% total</th>
                    <th className="text-right py-2 px-2 font-medium">Acum.</th>
                    <th className="text-right py-2 px-2 font-medium">Compras</th>
                    <th className="text-left py-2 px-3 font-medium">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((i) => (
                    <tr key={i.insumo_id} className="hover:bg-gray-50">
                      <td className="py-2 px-2 text-right text-gray-400 font-mono text-xs">{i.posicion}</td>
                      <td className="py-2 px-3 text-gray-900">{i.nombre}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs">
                        {CATEGORIAS_LABEL[i.rubro] || i.rubro}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{fmt(i.monto)}</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-600">{i.porcentaje.toFixed(1)}%</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-400">{i.acumulado.toFixed(0)}%</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-500">{i.compras}</td>
                      <td className="py-2 px-3">
                        <Volatilidad subas={i.subas} variacion={i.variacion} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="px-4 py-2.5 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100 leading-snug">
              El gasto sale de las facturas —nunca de las órdenes de compra— e incluye el descuento del
              proveedor y las percepciones, prorrateados por comprobante, así la suma da exactamente
              el total de compras del período. La columna Precio muestra cuánto se movió dentro del período:
              un insumo A con precio estable no necesita atención, uno que además se mueve sí.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

/** Lo que distingue al insumo que hay que mirar hoy del que solo es caro */
function Volatilidad({ subas, variacion }: { subas: number; variacion: number | null }) {
  if (variacion === null || Math.abs(variacion) < 1) {
    return <span className="text-[11px] text-gray-400">estable</span>
  }
  const subio = variacion > 0
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${subio ? 'text-red-600' : 'text-green-700'}`}>
      {subio && <TrendingUp className="w-3 h-3" />}
      {subio ? '+' : ''}{variacion.toFixed(1)}%
      {subas > 1 && <span className="text-gray-400">· {subas} subas</span>}
    </span>
  )
}
