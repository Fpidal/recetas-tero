'use client'

import { useEffect, useState } from 'react'
import { Save, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  obtenerIncidenciaDia,
  obtenerIncidenciasMes,
  guardarVentaServicio,
  formatearMonedaAnalisis,
} from '@/lib/consumo-queries'
import { formatearInputNumero, parsearNumero, formatearFecha } from '@/lib/formato-numeros'
import {
  type IncidenciaDia,
  type Servicio,
  SERVICIO_LABEL,
  SERVICIO_ICON,
  OBJETIVO_INCIDENCIA_REAL,
  getEstadoIncidenciaReal,
  getColorEstado,
} from '@/types/analisis'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function dateToString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function Incidencia() {
  // Carga manual de venta del día
  const [fechaCarga, setFechaCarga] = useState(dateToString(new Date()))
  const [servicioCarga, setServicioCarga] = useState<Servicio>('mediodia')
  const [ventaInput, setVentaInput] = useState('')
  const [cubiertosInput, setCubiertosInput] = useState('')
  const [datosCarga, setDatosCarga] = useState<IncidenciaDia | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Detalle del mes
  const [fechaRef, setFechaRef] = useState(new Date())
  const [servicioVista, setServicioVista] = useState<Servicio>('mediodia')
  const [incidencias, setIncidencias] = useState<IncidenciaDia[]>([])
  const [cargando, setCargando] = useState(false)

  // Cargar info del día seleccionado para precarga del form
  useEffect(() => {
    obtenerIncidenciaDia(fechaCarga, servicioCarga).then((d) => {
      setDatosCarga(d)
      // Precargar con valores existentes
      setVentaInput(d.venta > 0 ? formatearInputNumero(String(d.venta).replace('.', ',')) : '')
      setCubiertosInput(d.cubiertos > 0 ? String(d.cubiertos) : '')
    })
  }, [fechaCarga, servicioCarga])

  // Cargar incidencias del mes
  useEffect(() => {
    cargarMes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaRef, servicioVista])

  async function cargarMes() {
    try {
      setCargando(true)
      const data = await obtenerIncidenciasMes(
        fechaRef.getFullYear(),
        fechaRef.getMonth() + 1,
        servicioVista
      )
      setIncidencias(data)
    } catch (e) {
      console.error('Error cargando mes:', e)
    } finally {
      setCargando(false)
    }
  }

  async function handleGuardarVenta() {
    try {
      setGuardando(true)
      await guardarVentaServicio(
        fechaCarga,
        servicioCarga,
        parsearNumero(ventaInput || '0'),
        parseInt(cubiertosInput || '0', 10) || 0
      )
      // Refrescar datos
      const d = await obtenerIncidenciaDia(fechaCarga, servicioCarga)
      setDatosCarga(d)
      // Refrescar mes si corresponde
      const yyyy = fechaRef.getFullYear()
      const mm = fechaRef.getMonth() + 1
      const [year, month] = fechaCarga.split('-').map(Number)
      if (year === yyyy && month === mm && servicioCarga === servicioVista) {
        cargarMes()
      }
    } catch (e) {
      console.error('Error guardando venta:', e)
      alert('Error al guardar la venta')
    } finally {
      setGuardando(false)
    }
  }

  function navegarMes(dir: -1 | 1) {
    const nueva = new Date(fechaRef)
    nueva.setMonth(nueva.getMonth() + dir)
    setFechaRef(nueva)
  }

  // Resumen del mes
  const totales = incidencias.reduce(
    (acc, d) => {
      acc.venta += d.venta
      acc.costo += d.costo
      acc.cubiertos += d.cubiertos
      if (d.tiene_consumo) acc.diasConCarga++
      return acc
    },
    { venta: 0, costo: 0, cubiertos: 0, diasConCarga: 0 }
  )
  const incidenciaMes = totales.venta > 0 ? (totales.costo / totales.venta) * 100 : 0
  const margenMes = totales.venta - totales.costo
  const colorMes = getColorEstado(getEstadoIncidenciaReal(incidenciaMes))

  return (
    <div className="space-y-6">
      {/* ===== CARGA MANUAL DE VENTA DEL DÍA ===== */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">💵 Cargar venta del día</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={fechaCarga}
              onChange={(e) => setFechaCarga(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Servicio</label>
            <select
              value={servicioCarga}
              onChange={(e) => setServicioCarga(e.target.value as Servicio)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
                <option key={s} value={s}>
                  {SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Venta total</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={ventaInput}
                onChange={(e) => setVentaInput(formatearInputNumero(e.target.value))}
                placeholder="0"
                className="w-full border border-gray-300 rounded-md pl-7 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cubiertos</label>
            <input
              type="text"
              inputMode="numeric"
              value={cubiertosInput}
              onChange={(e) => setCubiertosInput(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-right"
            />
          </div>
          <Button onClick={handleGuardarVenta} disabled={guardando} className="w-full">
            <Save className="w-4 h-4 mr-1" />
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
        {datosCarga && (
          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-900 flex items-center gap-2">
            ℹ️ <span>
              {datosCarga.tiene_consumo ? (
                <>
                  El costo de cocina del {formatearFecha(fechaCarga)} ({SERVICIO_LABEL[servicioCarga].toLowerCase()}) viene
                  automático: <strong>{formatearMonedaAnalisis(datosCarga.costo)}</strong>
                </>
              ) : (
                <>
                  Todavía no hay carga de consumo para este día/servicio.{' '}
                  <strong>Cargá el consumo en la solapa &quot;Carga diaria&quot;</strong> para ver la incidencia real.
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ===== NAVEGADOR + SELECTOR ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => navegarMes(-1)}
            className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm sm:text-base font-semibold text-gray-900 text-center flex-1 sm:flex-initial sm:min-w-[180px]">
            {MESES[fechaRef.getMonth()]} {fechaRef.getFullYear()}
          </span>
          <button
            onClick={() => navegarMes(1)}
            className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-stretch sm:self-auto">
          {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
            <button
              key={s}
              onClick={() => setServicioVista(s)}
              className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                servicioVista === s
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* ===== KPIs DEL MES ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-gray-500 font-semibold">Ventas</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 break-all">
            {formatearMonedaAnalisis(totales.venta)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">{totales.cubiertos} cubiertos</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-gray-500 font-semibold">Costo cocina</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 break-all">
            {formatearMonedaAnalisis(totales.costo)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {totales.diasConCarga} servicios cargados
          </div>
        </div>
        <div className={`rounded-lg border-2 ${colorMes.bg} ${colorMes.border} shadow-sm p-3 sm:p-4`}>
          <div className={`text-[10px] sm:text-xs uppercase font-semibold ${colorMes.text}`}>
            ⭐ Incidencia REAL
          </div>
          <div className={`text-lg sm:text-2xl font-bold mt-1 ${colorMes.text}`}>
            {incidenciaMes.toFixed(1)}%
          </div>
          <div className={`text-[10px] mt-1 ${colorMes.text}`}>
            Objetivo ≤ {OBJETIVO_INCIDENCIA_REAL}%
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-gray-500 font-semibold">Margen bruto</div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 mt-1 break-all">
            {formatearMonedaAnalisis(margenMes)}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {totales.venta > 0 ? `${((margenMes / totales.venta) * 100).toFixed(1)}% del total` : '—'}
          </div>
        </div>
      </div>

      {/* ===== TABLA DETALLE DEL MES ===== */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            Detalle día a día - {SERVICIO_LABEL[servicioVista]}
          </h3>
        </div>

        {cargando ? (
          <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : incidencias.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No hay datos para este mes/servicio.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                    <th className="text-left py-2 px-3 font-medium">Día</th>
                    <th className="text-right py-2 px-3 font-medium">Venta</th>
                    <th className="text-right py-2 px-3 font-medium">Cub.</th>
                    <th className="text-right py-2 px-3 font-medium">Costo</th>
                    <th className="text-right py-2 px-3 font-medium">Inc. real</th>
                    <th className="text-right py-2 px-3 font-medium">Ticket prom.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {incidencias.map((d) => (
                    <FilaIncidencia key={d.fecha} d={d} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {incidencias.map((d) => (
                <CardIncidenciaMobile key={d.fecha} d={d} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FilaIncidencia({ d }: { d: IncidenciaDia }) {
  const dia = DIAS_SEMANA[new Date(d.fecha + 'T12:00:00').getDay()]
  const sinDatos = !d.tiene_venta && !d.tiene_consumo
  const colorBadge = d.incidencia > 0 ? getColorEstado(getEstadoIncidenciaReal(d.incidencia)).badge : ''

  return (
    <tr className={`hover:bg-gray-50 ${sinDatos ? 'bg-gray-50/50' : ''}`}>
      <td className="py-2.5 px-3 text-gray-900">
        {formatearFecha(d.fecha)} <span className="text-xs text-gray-400">{dia}</span>
      </td>
      <td className="text-right px-3">
        {d.tiene_venta ? formatearMonedaAnalisis(d.venta) : <span className="text-gray-400">— sin venta</span>}
      </td>
      <td className="text-right px-3 text-gray-600">{d.cubiertos > 0 ? d.cubiertos : '—'}</td>
      <td className="text-right px-3">
        {d.tiene_consumo ? formatearMonedaAnalisis(d.costo) : <span className="text-gray-400">— sin carga</span>}
      </td>
      <td className="text-right px-3">
        {d.incidencia > 0 ? (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorBadge}`}>
            {d.incidencia.toFixed(1)}%
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="text-right px-3 text-gray-700">
        {d.ticket_promedio > 0 ? formatearMonedaAnalisis(d.ticket_promedio) : '—'}
      </td>
    </tr>
  )
}

function CardIncidenciaMobile({ d }: { d: IncidenciaDia }) {
  const dia = DIAS_SEMANA[new Date(d.fecha + 'T12:00:00').getDay()]
  const colorBadge = d.incidencia > 0 ? getColorEstado(getEstadoIncidenciaReal(d.incidencia)).badge : ''

  return (
    <div className="p-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">{formatearFecha(d.fecha)}</div>
          <div className="text-xs text-gray-400">{dia}</div>
        </div>
        {d.incidencia > 0 && (
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorBadge}`}>
            {d.incidencia.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-500">Venta</div>
          <div className="font-medium text-gray-900">
            {d.tiene_venta ? formatearMonedaAnalisis(d.venta) : <span className="text-gray-400">—</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Costo</div>
          <div className="font-medium text-gray-900">
            {d.tiene_consumo ? formatearMonedaAnalisis(d.costo) : <span className="text-gray-400">—</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Cubiertos</div>
          <div className="font-medium text-gray-900">{d.cubiertos > 0 ? d.cubiertos : '—'}</div>
        </div>
        <div>
          <div className="text-gray-500">Ticket prom.</div>
          <div className="font-medium text-gray-900">
            {d.ticket_promedio > 0 ? formatearMonedaAnalisis(d.ticket_promedio) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
