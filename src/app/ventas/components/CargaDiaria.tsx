'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, PartyPopper, Save, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { Button, Input, Modal } from '@/components/ui'
import {
  obtenerUltimosDias,
  obtenerVentaPorFecha,
  guardarVenta,
  eliminarVenta,
  dateToString,
  formatearMonedaVentas,
} from '@/lib/ventas-queries'
import { formatearFecha, formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'
import type { VentaDiaria } from '@/types/ventas'

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function CargaDiaria() {
  // Form state
  const [fecha, setFecha] = useState(dateToString(new Date()))
  const [mediodia, setMediodia] = useState('')
  const [cubiertosMediodia, setCubiertosMediodia] = useState('')
  const [noche, setNoche] = useState('')
  const [cubiertosNoche, setCubiertosNoche] = useState('')
  const [eventos, setEventos] = useState('')
  const [cubiertosEventos, setCubiertosEventos] = useState('')
  const [notas, setNotas] = useState('')

  // UI state
  const [guardando, setGuardando] = useState(false)
  const [ultimosDias, setUltimosDias] = useState<VentaDiaria[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  // Modal de confirmación de reemplazo
  const [modalReemplazo, setModalReemplazo] = useState<{
    abierto: boolean
    existente: VentaDiaria | null
  }>({ abierto: false, existente: null })

  // Modal de eliminación
  const [modalEliminar, setModalEliminar] = useState<{
    abierto: boolean
    venta: VentaDiaria | null
  }>({ abierto: false, venta: null })

  useEffect(() => {
    cargarUltimosDias()
  }, [])

  async function cargarUltimosDias() {
    try {
      setCargandoLista(true)
      const data = await obtenerUltimosDias(15)
      setUltimosDias(data)
    } catch (e) {
      console.error('Error cargando últimos días:', e)
    } finally {
      setCargandoLista(false)
    }
  }

  // Total calculado
  const totalDia =
    parsearNumero(mediodia || '0') +
    parsearNumero(noche || '0') +
    parsearNumero(eventos || '0')

  function limpiarForm() {
    setFecha(dateToString(new Date()))
    setMediodia('')
    setCubiertosMediodia('')
    setNoche('')
    setCubiertosNoche('')
    setEventos('')
    setCubiertosEventos('')
    setNotas('')
    setEditandoId(null)
  }

  function cargarParaEditar(v: VentaDiaria) {
    setFecha(v.fecha)
    setMediodia(v.venta_mediodia ? formatearInputNumero(String(v.venta_mediodia).replace('.', ',')) : '')
    setCubiertosMediodia(v.cubiertos_mediodia ? String(v.cubiertos_mediodia) : '')
    setNoche(v.venta_noche ? formatearInputNumero(String(v.venta_noche).replace('.', ',')) : '')
    setCubiertosNoche(v.cubiertos_noche ? String(v.cubiertos_noche) : '')
    setEventos(v.venta_eventos ? formatearInputNumero(String(v.venta_eventos).replace('.', ',')) : '')
    setCubiertosEventos(v.cubiertos_eventos ? String(v.cubiertos_eventos) : '')
    setNotas(v.notas || '')
    setEditandoId(v.id)
    // Scroll arriba en mobile
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleGuardarClick() {
    if (!fecha) {
      alert('Seleccioná una fecha')
      return
    }

    // Si NO estoy editando, chequear si ya existe la fecha
    if (!editandoId) {
      const existente = await obtenerVentaPorFecha(fecha)
      if (existente) {
        setModalReemplazo({ abierto: true, existente })
        return
      }
    }

    await guardar()
  }

  async function guardar() {
    try {
      setGuardando(true)
      await guardarVenta({
        fecha,
        venta_mediodia: parsearNumero(mediodia || '0'),
        venta_noche: parsearNumero(noche || '0'),
        venta_eventos: parsearNumero(eventos || '0'),
        cubiertos_mediodia: parseInt(cubiertosMediodia || '0', 10) || 0,
        cubiertos_noche: parseInt(cubiertosNoche || '0', 10) || 0,
        cubiertos_eventos: parseInt(cubiertosEventos || '0', 10) || 0,
        notas: notas.trim() || null,
      })
      limpiarForm()
      await cargarUltimosDias()
      setModalReemplazo({ abierto: false, existente: null })
    } catch (e) {
      console.error('Error guardando:', e)
      alert('Error al guardar la venta')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar() {
    if (!modalEliminar.venta) return
    try {
      await eliminarVenta(modalEliminar.venta.id)
      setModalEliminar({ abierto: false, venta: null })
      if (editandoId === modalEliminar.venta.id) limpiarForm()
      await cargarUltimosDias()
    } catch (e) {
      console.error('Error eliminando:', e)
      alert('Error al eliminar la venta')
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ====== FORM DE CARGA ====== */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 sticky top-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editandoId ? 'Editar día' : 'Cargar día'}
                </h2>
                <p className="text-xs text-gray-500">
                  {editandoId ? 'Modificá los valores' : 'Ingresá los totales del día'}
                </p>
              </div>
              {editandoId && (
                <button
                  onClick={limpiarForm}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Cancelar
                </button>
              )}
            </div>

            <div className="space-y-4">
              <Input
                type="date"
                label="Fecha"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={!!editandoId}
              />

              <CampoServicio
                label="Mediodía"
                icon={<Sun className="w-4 h-4 text-yellow-500" />}
                monto={mediodia}
                onMontoChange={setMediodia}
                cubiertos={cubiertosMediodia}
                onCubiertosChange={setCubiertosMediodia}
              />

              <CampoServicio
                label="Noche"
                icon={<Moon className="w-4 h-4 text-slate-700" />}
                monto={noche}
                onMontoChange={setNoche}
                cubiertos={cubiertosNoche}
                onCubiertosChange={setCubiertosNoche}
              />

              <CampoServicio
                label="Eventos"
                icon={<PartyPopper className="w-4 h-4 text-purple-600" />}
                monto={eventos}
                onMontoChange={setEventos}
                cubiertos={cubiertosEventos}
                onCubiertosChange={setCubiertosEventos}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: feriado, evento corporativo..."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-gray-600">Total del día</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatearMonedaVentas(totalDia)}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleGuardarClick}
                disabled={guardando || totalDia === 0}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-2" />
                {guardando ? 'Guardando...' : editandoId ? 'Actualizar' : 'Guardar día'}
              </Button>
            </div>
          </div>
        </div>

        {/* ====== TABLA ÚLTIMOS DÍAS ====== */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Últimos días cargados</h2>
              <p className="text-xs text-gray-500">Click en un día para editarlo</p>
            </div>

            {cargandoLista ? (
              <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
            ) : ultimosDias.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                Todavía no cargaste ninguna venta. Empezá por el formulario de la izquierda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                      <th className="text-left py-2 px-3 font-medium">Fecha</th>
                      <th className="text-right py-2 px-3 font-medium">Mediodía</th>
                      <th className="text-right py-2 px-3 font-medium">Noche</th>
                      <th className="text-right py-2 px-3 font-medium">Eventos</th>
                      <th className="text-right py-2 px-3 font-medium">Total</th>
                      <th className="text-right py-2 px-3 font-medium w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100">
                    {ultimosDias.map((v) => {
                      const total =
                        Number(v.venta_mediodia) + Number(v.venta_noche) + Number(v.venta_eventos)
                      const cubTotal =
                        Number(v.cubiertos_mediodia || 0) +
                        Number(v.cubiertos_noche || 0) +
                        Number(v.cubiertos_eventos || 0)
                      const tieneEventos = Number(v.venta_eventos) > 0
                      const dia = DIAS_SEMANA[new Date(v.fecha + 'T12:00:00').getDay()]
                      const esEditando = editandoId === v.id
                      return (
                        <tr
                          key={v.id}
                          className={`hover:bg-gray-50 cursor-pointer ${
                            tieneEventos ? 'bg-purple-50/50' : ''
                          } ${esEditando ? 'ring-2 ring-primary-500 ring-inset' : ''}`}
                          onClick={() => cargarParaEditar(v)}
                        >
                          <td className="py-3 px-3 text-gray-900">
                            {formatearFecha(v.fecha)}{' '}
                            <span className="text-xs text-gray-400">{dia}</span>
                          </td>
                          <td className="text-right py-3 px-3 text-gray-700">
                            <CeldaServicio venta={v.venta_mediodia} cubiertos={v.cubiertos_mediodia} />
                          </td>
                          <td className="text-right py-3 px-3 text-gray-700">
                            <CeldaServicio venta={v.venta_noche} cubiertos={v.cubiertos_noche} />
                          </td>
                          <td className="text-right py-3 px-3 text-purple-700 font-medium">
                            <CeldaServicio venta={v.venta_eventos} cubiertos={v.cubiertos_eventos} />
                          </td>
                          <td className="text-right py-3 px-3 font-semibold text-gray-900">
                            <div className="flex flex-col items-end leading-tight">
                              <span>{formatearMonedaVentas(total)}</span>
                              {cubTotal > 0 && (
                                <span className="text-[10px] text-gray-400 uppercase font-normal">
                                  {cubTotal} cub.
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-right py-3 px-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  cargarParaEditar(v)
                                }}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded"
                                title="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setModalEliminar({ abierto: true, venta: v })
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== MODAL: CONFIRMACIÓN DE REEMPLAZO ====== */}
      <Modal
        isOpen={modalReemplazo.abierto}
        onClose={() => setModalReemplazo({ abierto: false, existente: null })}
        title="La fecha ya está cargada"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              Ya existe una carga para el <strong>{formatearFecha(fecha)}</strong>.
              Si confirmás, los valores actuales serán reemplazados.
            </div>
          </div>

          {modalReemplazo.existente && (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 border-b border-gray-200">
                Valores actuales en la base
              </div>
              <div className="px-3 py-2 space-y-1 text-sm">
                <Comparacion label="Mediodía" actual={modalReemplazo.existente.venta_mediodia} nuevo={parsearNumero(mediodia || '0')} />
                <Comparacion label="Cubiertos mediodía" actual={modalReemplazo.existente.cubiertos_mediodia} nuevo={parseInt(cubiertosMediodia || '0', 10) || 0} esCantidad />
                <Comparacion label="Noche" actual={modalReemplazo.existente.venta_noche} nuevo={parsearNumero(noche || '0')} />
                <Comparacion label="Cubiertos noche" actual={modalReemplazo.existente.cubiertos_noche} nuevo={parseInt(cubiertosNoche || '0', 10) || 0} esCantidad />
                <Comparacion label="Eventos" actual={modalReemplazo.existente.venta_eventos} nuevo={parsearNumero(eventos || '0')} />
                <Comparacion label="Cubiertos eventos" actual={modalReemplazo.existente.cubiertos_eventos} nuevo={parseInt(cubiertosEventos || '0', 10) || 0} esCantidad />
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="secondary"
              onClick={() => setModalReemplazo({ abierto: false, existente: null })}
            >
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Sí, reemplazar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ====== MODAL: CONFIRMACIÓN DE ELIMINACIÓN ====== */}
      <Modal
        isOpen={modalEliminar.abierto}
        onClose={() => setModalEliminar({ abierto: false, venta: null })}
        title="Eliminar venta"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            ¿Eliminar la venta del{' '}
            <strong>{modalEliminar.venta && formatearFecha(modalEliminar.venta.fecha)}</strong>?
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalEliminar({ abierto: false, venta: null })}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleEliminar}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

function CeldaServicio({ venta, cubiertos }: { venta: number; cubiertos: number }) {
  const v = Number(venta)
  const c = Number(cubiertos || 0)
  if (v === 0 && c === 0) return <span className="text-gray-400 font-normal">—</span>
  return (
    <div className="flex flex-col items-end leading-tight">
      <span>{v > 0 ? formatearMonedaVentas(v) : '—'}</span>
      {c > 0 && <span className="text-[10px] text-gray-400 uppercase">{c} cub.</span>}
    </div>
  )
}

function CampoServicio({
  label,
  icon,
  monto,
  onMontoChange,
  cubiertos,
  onCubiertosChange,
}: {
  label: string
  icon: React.ReactNode
  monto: string
  onMontoChange: (v: string) => void
  cubiertos: string
  onCubiertosChange: (v: string) => void
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
        {icon}
        {label}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {/* Monto: ocupa 2/3 */}
        <div className="relative col-span-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => onMontoChange(formatearInputNumero(e.target.value))}
            placeholder="0"
            className="block w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        {/* Cubiertos: ocupa 1/3 */}
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={cubiertos}
            onChange={(e) => onCubiertosChange(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            title="Cantidad de cubiertos"
            className="block w-full rounded-lg border border-gray-300 px-2 pr-8 py-2.5 sm:py-2 text-base sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] uppercase">cub</span>
        </div>
      </div>
    </div>
  )
}

function Comparacion({
  label,
  actual,
  nuevo,
  esCantidad,
}: {
  label: string
  actual: number
  nuevo: number
  esCantidad?: boolean
}) {
  const cambia = Number(actual) !== nuevo
  const fmt = (v: number) => (esCantidad ? `${v} cub.` : formatearMonedaVentas(v))
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-gray-600">{label}:</span>
      <div className="flex items-baseline gap-2">
        <span className={cambia ? 'line-through text-gray-400 text-xs' : 'text-gray-900'}>
          {fmt(Number(actual))}
        </span>
        {cambia && <span className="font-medium text-gray-900">{fmt(nuevo)}</span>}
      </div>
    </div>
  )
}
