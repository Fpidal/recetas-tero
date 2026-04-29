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
  CATEGORIAS_LABEL,
  CATEGORIAS_COLOR,
  CATEGORIAS_ORDEN,
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
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 font-mono">{desglose.length}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            consumidos en la semana
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-gray-500 font-semibold">Días con carga</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 font-mono">{diasConCarga} / 7</div>
          <div className="text-[10px] text-gray-500 mt-1">
            {filtroServicio === 'todos' ? 'de cualquier servicio' : SERVICIO_LABEL[filtroServicio]}
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg border-2 border-blue-300 shadow-sm p-3 sm:p-4 col-span-2 lg:col-span-1">
          <div className="text-[10px] sm:text-xs uppercase text-blue-700 font-semibold">Costo total</div>
          <div className="text-lg sm:text-2xl font-bold text-blue-700 mt-1 break-all font-mono">
            {formatearMonedaAnalisis(costoTotal)}
          </div>
          <div className="text-[10px] text-blue-600 mt-1">
            IVA incluido · suma de toda la semana
          </div>
        </div>
      </div>

      {/* Desglose agrupado por categoría */}
      {cargando ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          Cargando...
        </div>
      ) : desglose.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          No hay consumos cargados en esta semana
          {filtroServicio !== 'todos' && ` para ${SERVICIO_LABEL[filtroServicio]}`}.
        </div>
      ) : (
        <>
          {agruparPorCategoria(desglose).map(([categoria, items, subtotal]) => (
            <SeccionCategoria
              key={categoria}
              categoria={categoria}
              items={items}
              subtotal={subtotal}
              porcentajeDelTotal={costoTotal > 0 ? (subtotal / costoTotal) * 100 : 0}
            />
          ))}

          {/* Total general */}
          <div className="bg-gray-900 text-white rounded-lg shadow-sm p-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase opacity-70">Total semana</div>
              <div className="text-[11px] opacity-60">
                {formatearFecha(dateToISO(lunes))} → {formatearFecha(dateToISO(domingo))}
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono">{formatearMonedaAnalisis(costoTotal)}</div>
          </div>
        </>
      )}
    </div>
  )
}

// Agrupa desglose por categoría, respetando el orden fijo.
// Devuelve array de [categoria, items, subtotal] ordenado.
function agruparPorCategoria(
  items: ItemDesglosado[]
): Array<[string, ItemDesglosado[], number]> {
  const map = new Map<string, ItemDesglosado[]>()
  for (const it of items) {
    const cat = it.categoria || 'Almacen'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(it)
  }
  // Ordenar por CATEGORIAS_ORDEN y poner las no listadas al final
  const orden = CATEGORIAS_ORDEN.filter((c) => map.has(c))
  const extras = Array.from(map.keys()).filter((c) => !CATEGORIAS_ORDEN.includes(c))
  const todas = [...orden, ...extras]

  return todas.map((cat) => {
    const its = map.get(cat) || []
    const subtotal = its.reduce((a, i) => a + i.costo_total, 0)
    return [cat, its, subtotal] as [string, ItemDesglosado[], number]
  })
}

function SeccionCategoria({
  categoria,
  items,
  subtotal,
  porcentajeDelTotal,
}: {
  categoria: string
  items: ItemDesglosado[]
  subtotal: number
  porcentajeDelTotal: number
}) {
  const label = CATEGORIAS_LABEL[categoria] || categoria
  const color = CATEGORIAS_COLOR[categoria] || {
    bg: 'bg-gray-50',
    text: 'text-gray-800',
    border: 'border-gray-200',
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div
        className={`px-4 py-3 border-b ${color.bg} ${color.border} flex items-center justify-between`}
      >
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold ${color.text}`}>{label}</h3>
          <span className={`text-xs ${color.text} opacity-70 font-mono`}>({items.length})</span>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold font-mono ${color.text}`}>
            {formatearMonedaAnalisis(subtotal)}
          </div>
          <div className={`text-[10px] font-mono ${color.text} opacity-60`}>
            {porcentajeDelTotal.toFixed(1)}% del total
          </div>
        </div>
      </div>

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
            {items.map((d) => (
              <tr key={d.insumo_id} className="hover:bg-gray-50">
                <td className="py-2.5 px-3 text-gray-900">{d.nombre}</td>
                <td className="px-3 text-[11px] text-gray-500">
                  {d.origenes.slice(0, 2).join(' · ')}
                  {d.origenes.length > 2 && ` · +${d.origenes.length - 2}`}
                </td>
                <td className="text-right px-3 font-medium font-mono">
                  {d.cantidad_total.toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                  {d.unidad}
                </td>
                <td className="text-right px-3 text-gray-700 font-mono">
                  {d.costo_total > 0 ? formatearMonedaAnalisis(d.costo_total) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100">
        {items.map((d) => (
          <div key={d.insumo_id} className="p-3">
            <div className="flex items-start justify-between mb-1">
              <div className="text-sm font-medium text-gray-900">{d.nombre}</div>
              <div className="text-sm font-semibold text-gray-700 ml-2 font-mono">
                {d.cantidad_total.toLocaleString('es-AR', { maximumFractionDigits: 3 })}{' '}
                {d.unidad}
              </div>
            </div>
            <div className="flex items-start justify-between">
              <div className="text-[11px] text-gray-500 flex-1 mr-2">
                {d.origenes.slice(0, 2).join(' · ')}
                {d.origenes.length > 2 && ` · +${d.origenes.length - 2}`}
              </div>
              <div className="text-xs text-gray-700 whitespace-nowrap font-mono">
                {d.costo_total > 0 ? formatearMonedaAnalisis(d.costo_total) : '—'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
