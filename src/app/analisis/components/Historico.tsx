'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { obtenerIncidenciasMes, formatearMonedaAnalisis } from '@/lib/consumo-queries'
import {
  type Servicio,
  SERVICIO_LABEL,
  SERVICIO_ICON,
  OBJETIVO_INCIDENCIA_REAL,
  getEstadoIncidenciaReal,
  getColorEstado,
} from '@/types/analisis'

interface ResumenMes {
  label: string
  año: number
  mes: number
  ventas: number
  costo: number
  cubiertos: number
  diasConCarga: number
  incidencia: number
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function Historico() {
  const [servicio, setServicio] = useState<Servicio>('mediodia')
  const [resumenes, setResumenes] = useState<ResumenMes[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio])

  async function cargar() {
    try {
      setCargando(true)
      const hoy = new Date()
      const cantidadMeses = 6

      // Cargar últimos N meses en paralelo
      const promesas: Promise<ResumenMes>[] = []
      for (let i = cantidadMeses - 1; i >= 0; i--) {
        const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
        promesas.push(
          obtenerIncidenciasMes(f.getFullYear(), f.getMonth() + 1, servicio).then((dias) => {
            const ventas = dias.reduce((a, d) => a + d.venta, 0)
            const costo = dias.reduce((a, d) => a + d.costo, 0)
            const cubiertos = dias.reduce((a, d) => a + d.cubiertos, 0)
            const diasConCarga = dias.filter((d) => d.tiene_consumo).length
            const incidencia = ventas > 0 ? (costo / ventas) * 100 : 0
            return {
              label: `${MESES_LARGO[f.getMonth()]} ${f.getFullYear()}`,
              año: f.getFullYear(),
              mes: f.getMonth() + 1,
              ventas,
              costo,
              cubiertos,
              diasConCarga,
              incidencia,
            }
          })
        )
      }

      const data = await Promise.all(promesas)
      setResumenes(data)
    } catch (e) {
      console.error('Error cargando histórico:', e)
    } finally {
      setCargando(false)
    }
  }

  // Datos para gráfico
  const datosGrafico = resumenes.map((r) => ({
    nombre: `${MESES_CORTO[r.mes - 1]} ${String(r.año).slice(2)}`,
    incidencia: r.incidencia > 0 ? Number(r.incidencia.toFixed(1)) : null,
    objetivo: OBJETIVO_INCIDENCIA_REAL,
  }))

  return (
    <div className="space-y-6">
      {/* Selector de servicio */}
      <div className="flex sm:justify-end">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-full sm:w-auto">
          {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
            <button
              key={s}
              onClick={() => setServicio(s)}
              className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                servicio === s
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
      ) : resumenes.every((r) => r.ventas === 0 && r.costo === 0) ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-sm">No hay datos cargados todavía.</p>
          <p className="text-gray-400 text-xs mt-1">
            Cargá ventas y consumos para ver la evolución mes a mes.
          </p>
        </div>
      ) : (
        <>
          {/* Gráfico de evolución */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Evolución de incidencia REAL — {SERVICIO_LABEL[servicio]}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={datosGrafico} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={50}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 'dataMax + 10']}
                />
                <Tooltip formatter={(v: any) => (v === null ? 'sin datos' : `${Number(v).toFixed(1)}%`)} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine
                  y={OBJETIVO_INCIDENCIA_REAL}
                  stroke="#3D8B5E"
                  strokeDasharray="5 5"
                  label={{
                    value: `Objetivo ${OBJETIVO_INCIDENCIA_REAL}%`,
                    fontSize: 10,
                    fill: '#3D8B5E',
                    position: 'right',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="incidencia"
                  name="Inc. real %"
                  stroke="#1B3A2D"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Detalle mensual</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Semáforo: ✅ ≤ {OBJETIVO_INCIDENCIA_REAL}% · ⚠️ {OBJETIVO_INCIDENCIA_REAL + 1}-
                {OBJETIVO_INCIDENCIA_REAL + 5}% · ❌ &gt; {OBJETIVO_INCIDENCIA_REAL + 5}%
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                    <th className="text-left py-2 px-3 font-medium">Mes</th>
                    <th className="text-right py-2 px-3 font-medium">Ventas</th>
                    <th className="text-right py-2 px-3 font-medium hidden xs:table-cell">Costo cocina</th>
                    <th className="text-right py-2 px-3 font-medium">Inc. real</th>
                    <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">Cubiertos</th>
                    <th className="text-right py-2 px-3 font-medium hidden md:table-cell">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...resumenes].reverse().map((r) => {
                    const sinDatos = r.ventas === 0 && r.costo === 0
                    const colorBadge = r.incidencia > 0 ? getColorEstado(getEstadoIncidenciaReal(r.incidencia)).badge : ''
                    return (
                      <tr key={`${r.año}-${r.mes}`} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-gray-900">{r.label}</td>
                        <td className="text-right px-3 text-gray-700 font-mono">
                          {r.ventas > 0 ? formatearMonedaAnalisis(r.ventas) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="text-right px-3 text-gray-700 hidden xs:table-cell font-mono">
                          {r.costo > 0 ? formatearMonedaAnalisis(r.costo) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="text-right px-3">
                          {sinDatos || r.incidencia === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium font-mono ${colorBadge}`}>
                              {r.incidencia.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="text-right px-3 text-gray-700 hidden sm:table-cell font-mono">
                          {r.cubiertos > 0 ? r.cubiertos.toLocaleString('es-AR') : '—'}
                        </td>
                        <td className="text-right px-3 text-gray-500 hidden md:table-cell font-mono">
                          {r.diasConCarga > 0 ? r.diasConCarga : '—'}
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
