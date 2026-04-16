'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { obtenerHistorico, formatearMonedaVentas } from '@/lib/ventas-queries'
import {
  type ResumenPeriodo,
  type TipoPeriodo,
  OBJETIVO_INCIDENCIA,
  getEstadoIncidencia,
} from '@/types/ventas'

export default function Historico() {
  const [tipo, setTipo] = useState<TipoPeriodo>('mensual')
  const [datos, setDatos] = useState<ResumenPeriodo[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargar()
  }, [tipo])

  async function cargar() {
    try {
      setCargando(true)
      const cantidad = tipo === 'mensual' ? 12 : 16
      const data = await obtenerHistorico(tipo, cantidad)
      setDatos(data)
    } catch (e) {
      console.error('Error cargando histórico:', e)
    } finally {
      setCargando(false)
    }
  }

  // Datos para el gráfico
  const datosGrafico = datos.map((p) => ({
    nombre:
      tipo === 'mensual'
        ? p.label.split(' ')[0].slice(0, 3)
        : `S${p.label.split(' ')[1]}`,
    Ventas: Math.round(p.ventasTotal),
    Compras: Math.round(p.compras),
  }))

  return (
    <div className="space-y-6">
      {/* Selector tipo período */}
      <div className="flex sm:justify-end">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-full sm:w-auto">
          <button
            onClick={() => setTipo('mensual')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tipo === 'mensual'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Mensual
          </button>
          <button
            onClick={() => setTipo('semanal')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tipo === 'semanal'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Semanal
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
      ) : datos.every((d) => d.ventasTotal === 0) ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-sm">No hay ventas cargadas todavía.</p>
        </div>
      ) : (
        <>
          {/* Gráfico de barras: ventas vs compras */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Evolución {tipo === 'mensual' ? 'mensual' : 'semanal'}: Ventas vs Compras
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={datosGrafico} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={70}
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
                    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
                    return `$${v}`
                  }}
                />
                <Tooltip formatter={(v: any) => formatearMonedaVentas(v || 0)} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Ventas" fill="#0f172a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Compras" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla detallada */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-3 sm:px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Detalle por {tipo === 'mensual' ? 'mes' : 'semana'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Semáforo: ✅ ≤ {OBJETIVO_INCIDENCIA}% · ⚠️ {OBJETIVO_INCIDENCIA + 1}-{OBJETIVO_INCIDENCIA + 5}% · ❌ &gt; {OBJETIVO_INCIDENCIA + 5}%
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                    <th className="text-left py-2 px-3 sm:px-4 font-medium">Período</th>
                    <th className="text-right py-2 px-3 sm:px-4 font-medium">Ventas</th>
                    <th className="text-right py-2 px-3 sm:px-4 font-medium hidden xs:table-cell">Compras</th>
                    <th className="text-right py-2 px-3 sm:px-4 font-medium">Incid.</th>
                    <th className="text-right py-2 px-3 sm:px-4 font-medium hidden sm:table-cell">Cubiertos</th>
                    <th className="text-right py-2 px-3 sm:px-4 font-medium hidden sm:table-cell">Ticket prom.</th>
                    <th className="text-right py-2 px-3 sm:px-4 font-medium hidden md:table-cell">Margen</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {[...datos].reverse().map((p) => {
                    const estado = getEstadoIncidencia(p.incidencia)
                    const colorBadge =
                      estado === 'ok'
                        ? 'bg-green-100 text-green-800'
                        : estado === 'warning'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'

                    const sinDatos = p.ventasTotal === 0 && p.compras === 0
                    return (
                      <tr key={p.label} className="hover:bg-gray-50">
                        <td className="py-3 px-3 sm:px-4 text-gray-900">{p.label}</td>
                        <td className="text-right py-3 px-3 sm:px-4 text-gray-700">
                          {p.ventasTotal > 0 ? formatearMonedaVentas(p.ventasTotal) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="text-right py-3 px-3 sm:px-4 text-gray-700 hidden xs:table-cell">
                          {p.compras > 0 ? formatearMonedaVentas(p.compras) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="text-right py-3 px-3 sm:px-4">
                          {sinDatos || p.ventasTotal === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorBadge}`}
                            >
                              {p.incidencia.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="text-right py-3 px-3 sm:px-4 hidden sm:table-cell text-gray-700">
                          {p.cubiertosTotal > 0 ? p.cubiertosTotal.toLocaleString('es-AR') : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="text-right py-3 px-3 sm:px-4 hidden sm:table-cell text-gray-700">
                          {p.ticketPromedioGeneral > 0 ? formatearMonedaVentas(p.ticketPromedioGeneral) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="text-right py-3 px-3 sm:px-4 hidden md:table-cell text-gray-700">
                          {p.ventasTotal > 0 ? formatearMonedaVentas(p.margenBruto) : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
