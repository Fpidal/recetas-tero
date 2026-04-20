'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Package, DollarSign, Calendar } from 'lucide-react'
import {
  desglosarRango,
  getLunesDeSemana,
  getDomingoDeSemana,
  dateToISO,
  formatearMonedaAnalisis,
} from '@/lib/consumo-queries'
import { formatearFecha } from '@/lib/formato-numeros'
import {
  type ItemDesglosado,
  type Servicio,
  SERVICIO_LABEL,
  SERVICIO_ICON,
} from '@/types/analisis'

interface Props {
  fecha: string // fecha compartida (la semana incluye esta fecha)
  servicio: Servicio
  setServicio: (s: Servicio) => void
}

type FiltroServicio = Servicio | 'todos'

export default function Resumen({ fecha, servicio, setServicio }: Props) {
  // La semana se calcula a partir de la fecha compartida
  // Pero tiene su propia navegación: si navegás a otra semana, no cambia `fecha` global
  const [fechaRef, setFechaRef] = useState<Date>(() => {
    const [y, m, d] = fecha.split('-').map(Number)
    return new Date(y, m - 1, d)
  })

  const [filtroServicio, setFiltroServicio] = useState<FiltroServicio>('todos')
  const [desglose, setDesglose] = useState<ItemDesglosado[]>([])
  const [diasConCarga, setDiasConCarga] = useState(0)
  const [costoTotal, setCostoTotal] = useState(0)
  const [cargando, setCargando] = useState(false)

  const lunes = getLunesDeSemana(fechaRef)
  const domingo = getDomingoDeSemana(fechaRef)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaRef, filtroServicio])

  async function cargar() {
    try {
      setCargando(true)
      const data = await desglosarRango(
        dateToISO(lunes),
        dateToISO(domingo),
        filtroServicio === 'todos' ? undefined : filtroServicio
      )
      setDesglose(data.desglose)
      setDiasConCarga(data.diasConCarga)
      setCostoTotal(data.costoTotal)
    } catch (e) {
      console.error('Error cargando resumen:', e)
    } finally {
      setCargando(false)
    }
  }

  function navegarSemana(dir: -1 | 1) {
    const nueva = new Date(fechaRef)
    nueva.setDate(nueva.getDate() + dir * 7)
    setFechaRef(nueva)
  }

  function irAHoy() {
    setFechaRef(new Date())
  }

  const rangoLabel = `${formatearFecha(dateToISO(lunes))} → ${formatearFecha(dateToISO(domingo))}`

  return (
    <div className="space-y-4">
      {/* Header: navegación de semana + filtro servicio */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => navegarSemana(-1)}
              className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 sm:flex-initial text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                <Calendar className="w-3 h-3" />
                <span>Semana</span>
              </div>
              <div className="text-sm sm:text-base font-semibold text-gray-900">
                {rangoLabel}
              </div>
            </div>
            <button
              onClick={() => navegarSemana(1)}
              className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 flex-shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={irAHoy}
              className="ml-1 sm:ml-2 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md border border-gray-300 flex-shrink-0"
            >
              Hoy
            </button>
          </div>

          {/* Filtro de servicio */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-stretch sm:self-auto">
            <button
              onClick={() => setFiltroServicio('todos')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filtroServicio === 'todos'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Todos
            </button>
            {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
              <button
                key={s}
                onClick={() => setFiltroServicio(s)}
                className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filtroServicio === s
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-gray-500 font-semibold">Insumos únicos</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{desglose.length}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            consumidos en la semana
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-gray-500 font-semibold">Días con carga</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{diasConCarga} / 7</div>
          <div className="text-[10px] text-gray-500 mt-1">
            {filtroServicio === 'todos' ? 'de cualquier servicio' : SERVICIO_LABEL[filtroServicio]}
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg border-2 border-blue-300 shadow-sm p-3 sm:p-4 col-span-2 lg:col-span-1">
          <div className="text-[10px] sm:text-xs uppercase text-blue-700 font-semibold">Costo total</div>
          <div className="text-lg sm:text-2xl font-bold text-blue-700 mt-1 break-all">
            {formatearMonedaAnalisis(costoTotal)}
          </div>
          <div className="text-[10px] text-blue-600 mt-1">
            IVA incluido · suma de toda la semana
          </div>
        </div>
      </div>

      {/* Tabla de desglose */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            Detalle por insumo - Semana del {formatearFecha(dateToISO(lunes))} al{' '}
            {formatearFecha(dateToISO(domingo))}
          </h3>
          <p className="text-[11px] text-gray-500">
            Totales acumulados: insumos directos + desglose de recetas y elaboraciones
          </p>
        </div>

        {cargando ? (
          <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : desglose.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No hay consumos cargados en esta semana
            {filtroServicio !== 'todos' && ` para ${SERVICIO_LABEL[filtroServicio]}`}.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                    <th className="text-left py-2 px-3 font-medium">Insumo</th>
                    <th className="text-left py-2 px-3 font-medium">Origen</th>
                    <th className="text-right py-2 px-3 font-medium">Cantidad</th>
                    <th className="text-right py-2 px-3 font-medium">Costo (IVA inc.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {desglose.map((d) => (
                    <tr key={d.insumo_id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-gray-900">{d.nombre}</td>
                      <td className="px-3 text-[11px] text-gray-500">
                        {d.origenes.slice(0, 2).join(' · ')}
                        {d.origenes.length > 2 && ` · +${d.origenes.length - 2}`}
                      </td>
                      <td className="text-right px-3 font-medium">
                        {d.cantidad_total.toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                        {d.unidad}
                      </td>
                      <td className="text-right px-3 text-gray-700">
                        {d.costo_total > 0 ? formatearMonedaAnalisis(d.costo_total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <td colSpan={3} className="py-3 px-3 text-right text-gray-700">
                      Total semana (IVA inc.):
                    </td>
                    <td className="text-right px-3 text-base text-gray-900">
                      {formatearMonedaAnalisis(costoTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {desglose.map((d) => (
                <div key={d.insumo_id} className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="text-sm font-medium text-gray-900">{d.nombre}</div>
                    <div className="text-sm font-semibold text-gray-700 ml-2">
                      {d.cantidad_total.toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                      {d.unidad}
                    </div>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="text-[11px] text-gray-500 flex-1 mr-2">
                      {d.origenes.slice(0, 2).join(' · ')}
                      {d.origenes.length > 2 && ` · +${d.origenes.length - 2}`}
                    </div>
                    <div className="text-xs text-gray-700 whitespace-nowrap">
                      {d.costo_total > 0 ? formatearMonedaAnalisis(d.costo_total) : '—'}
                    </div>
                  </div>
                </div>
              ))}
              <div className="p-3 bg-gray-50 flex justify-between font-semibold">
                <span className="text-sm text-gray-700">Total semana</span>
                <span className="text-base text-gray-900">{formatearMonedaAnalisis(costoTotal)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
