'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  obtenerConsumo,
  desglosarConsumo,
  confirmarConsumo,
  desconfirmarConsumo,
  formatearMonedaAnalisis,
} from '@/lib/consumo-queries'
import {
  type ConsumoDiario as ConsumoDiarioType,
  type ItemDesglosado,
  type Servicio,
  SERVICIO_LABEL,
  SERVICIO_ICON,
} from '@/types/analisis'

function dateToString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ConsumoDiario() {
  const [fecha, setFecha] = useState(dateToString(new Date()))
  const [servicio, setServicio] = useState<Servicio>('mediodia')

  const [consumo, setConsumo] = useState<ConsumoDiarioType | null>(null)
  const [desglose, setDesglose] = useState<ItemDesglosado[]>([])
  const [cargando, setCargando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, servicio])

  async function cargar() {
    try {
      setCargando(true)
      const c = await obtenerConsumo(fecha, servicio)
      setConsumo(c)
      if (c) {
        const d = await desglosarConsumo(c.id)
        setDesglose(d)
      } else {
        setDesglose([])
      }
    } catch (e) {
      console.error('Error cargando desglose:', e)
    } finally {
      setCargando(false)
    }
  }

  async function handleConfirmar() {
    if (!consumo) return
    if (
      !confirm(
        '¿Confirmar este consumo?\n\nNota: en esta versión solo marca el consumo como confirmado. ' +
          'El descuento automático del stock se agregará en una próxima versión.'
      )
    )
      return

    try {
      setConfirmando(true)
      await confirmarConsumo(consumo.id)
      await cargar()
    } catch (e) {
      console.error('Error confirmando:', e)
    } finally {
      setConfirmando(false)
    }
  }

  async function handleDesconfirmar() {
    if (!consumo) return
    if (!confirm('¿Volver a editar este consumo? Quedará marcado como borrador.')) return

    try {
      setConfirmando(true)
      await desconfirmarConsumo(consumo.id)
      await cargar()
    } catch (e) {
      console.error('Error:', e)
    } finally {
      setConfirmando(false)
    }
  }

  const totalCosto = desglose.reduce((acc, d) => acc + d.costo_total, 0)

  return (
    <div className="space-y-4">
      {/* Header día */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Servicio</label>
            <select
              value={servicio}
              onChange={(e) => setServicio(e.target.value as Servicio)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
                <option key={s} value={s}>
                  {SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <span className="text-xs text-gray-500">
              Vista informativa: desglosa recetas y elaboraciones a nivel insumo
            </span>
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          Cargando...
        </div>
      ) : !consumo ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-sm">No hay carga para este día/servicio.</p>
          <p className="text-gray-400 text-xs mt-1">
            Cargá items en la solapa &quot;Carga diaria&quot; para verlos desglosados acá.
          </p>
        </div>
      ) : desglose.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-500 text-sm">
          La carga existe pero no hay items con insumos asociados.
        </div>
      ) : (
        <>
          {/* Aviso confirmación */}
          {consumo.confirmado ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>
                Consumo confirmado el{' '}
                {new Date(consumo.confirmado_at!).toLocaleString('es-AR')}.
              </span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>
                Este consumo está en <strong>borrador</strong>. Revisá el detalle abajo y confirmá cuando esté OK.
              </span>
            </div>
          )}

          {/* Tabla desglosada */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Detalle real por insumo
              </h3>
              <p className="text-[11px] text-gray-500">
                {desglose.length} insumos · suma todo lo cargado (insumos directos + recetas + elaboraciones)
              </p>
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
                  {desglose.map((d) => (
                    <tr key={d.insumo_id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-gray-900">{d.nombre}</td>
                      <td className="px-3 text-[11px] text-gray-500">
                        {d.origenes.slice(0, 2).join(' · ')}
                        {d.origenes.length > 2 && ` · +${d.origenes.length - 2} más`}
                      </td>
                      <td className="text-right px-3 font-medium">
                        {d.cantidad_total.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {d.unidad}
                      </td>
                      <td className="text-right px-3 text-gray-600">
                        {d.costo_total > 0 ? formatearMonedaAnalisis(d.costo_total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <td colSpan={3} className="py-3 px-3 text-right text-gray-700">
                      Total cargas directas (IVA inc.):
                    </td>
                    <td className="text-right px-3 text-base text-gray-900">
                      {formatearMonedaAnalisis(totalCosto)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {desglose.map((d) => (
                <div key={d.insumo_id} className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="text-sm font-medium text-gray-900">{d.nombre}</div>
                    <div className="text-sm font-semibold text-gray-700 ml-2">
                      {d.cantidad_total.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {d.unidad}
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {d.origenes.slice(0, 3).join(' · ')}
                  </div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:justify-end gap-2">
              {consumo.confirmado ? (
                <Button variant="secondary" onClick={handleDesconfirmar} disabled={confirmando}>
                  Volver a editar
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmar}
                  disabled={confirmando}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {confirmando ? 'Confirmando...' : 'Confirmar consumo'}
                </Button>
              )}
            </div>
          </div>

          <div className="text-xs text-gray-500 px-1">
            ℹ️ El descuento automático del stock se agregará en una próxima versión. Por ahora la
            confirmación es solo informativa.
          </div>
        </>
      )}
    </div>
  )
}
