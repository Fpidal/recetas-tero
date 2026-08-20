'use client'

import { useEffect, useState } from 'react'
import { formatearMoneda } from '@/lib/formato-numeros'
import { obtenerHistorial, estadoObjetivo, type EstadoSemana } from '@/lib/objetivo-compras'

/**
 * Objetivo contra real, semana por semana.
 *
 * La pregunta que contesta no es "cuánto gasté" —eso está en Estadísticas—
 * sino "¿le estoy pegando al objetivo o lo tengo mal calibrado?". Por eso lo
 * que se destaca es el desvío, no el monto.
 */

const money = (v: number) => formatearMoneda(v, true, 0)
const dm = (f: string) => f.split('-').reverse().slice(0, 2).join('/')

export default function HistorialObjetivos() {
  const [filas, setFilas] = useState<EstadoSemana[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    obtenerHistorial(12)
      .then(setFilas)
      .catch((e) => console.error('Error cargando el historial:', e))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return <div className="h-40 bg-white border border-gray-200 rounded-lg animate-pulse" />
  }

  const conObjetivo = filas.filter((f) => f.objetivo !== null)
  const cumplidas = conObjetivo.filter((f) => (f.porcentaje ?? 0) <= 100).length

  return (
    <div className="space-y-4">
      {conObjetivo.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-700">
            En <span className="font-mono font-semibold">{conObjetivo.length}</span> semanas con
            objetivo definido, se cumplió en{' '}
            <span className="font-mono font-semibold">{cumplidas}</span>.
            {conObjetivo.length >= 4 && cumplidas === conObjetivo.length && (
              <span className="text-gray-500">
                {' '}Nunca se pasó — puede que el objetivo esté holgado.
              </span>
            )}
            {conObjetivo.length >= 4 && cumplidas === 0 && (
              <span className="text-gray-500">
                {' '}Nunca se cumplió — el objetivo puede estar por debajo de lo que el negocio necesita.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="border-b border-gray-200">
              {['Semana', 'Objetivo', 'Generado', 'Recibido', 'Desvío', 'Órdenes'].map((h, i) => (
                <th key={h} className={`text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5 ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const estado = estadoObjetivo(f.porcentaje)
              // Solo se pinta lo que se pasó. Cumplir el objetivo es lo normal,
              // no un logro que haya que celebrar en verde toda la columna.
              const color =
                estado === 'excedido' ? 'text-red-700'
                : estado === 'cerca' ? 'text-yellow-700'
                : 'text-gray-500'

              return (
                <tr key={f.semanaDesde} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-900">
                    {dm(f.semanaDesde)} <span className="text-gray-400">al</span> {dm(f.semanaHasta)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                    {f.objetivo !== null ? money(f.objetivo) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-gray-900">
                    {money(f.generado)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                    {money(f.recibido)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-medium ${color}`}>
                    {f.porcentaje !== null ? (
                      <>
                        {f.porcentaje > 100 ? '+' : ''}
                        {(f.porcentaje - 100).toFixed(0)}%
                      </>
                    ) : (
                      <span className="text-gray-300">sin objetivo</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-500">{f.ordenes}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Las semanas se cuentan por la fecha del pedido, con IVA y sin vinos. Una orden cancelada
        no suma. El desvío compara lo generado contra el objetivo:{' '}
        <span className="font-mono">-12%</span> es haber quedado por debajo.
      </p>
    </div>
  )
}
