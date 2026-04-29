'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, X, ChefHat, BookOpen, Package } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  obtenerInsumosBuscador,
  obtenerElaboracionesBuscador,
  obtenerRecetasBuscador,
  obtenerOCrearConsumo,
  obtenerConsumo,
  obtenerItemsConsumo,
  agregarItem,
  eliminarItem,
  formatearMonedaAnalisis,
} from '@/lib/consumo-queries'
import { parsearNumero, formatearInputNumero } from '@/lib/formato-numeros'
import {
  type ConsumoDiario,
  type ConsumoItem,
  type OpcionBuscador,
  type Servicio,
  type TipoConsumoItem,
  SERVICIO_LABEL,
  SERVICIO_ICON,
} from '@/types/analisis'

const TIPOS: { valor: TipoConsumoItem; label: string; icon: any; color: string }[] = [
  { valor: 'insumo', label: 'Insumo', icon: Package, color: 'text-blue-600' },
  { valor: 'elaboracion', label: 'Elaboración', icon: BookOpen, color: 'text-amber-600' },
  { valor: 'receta', label: 'Receta', icon: ChefHat, color: 'text-rose-600' },
]

interface Props {
  fecha: string
  setFecha: (f: string) => void
  servicio: Servicio
  setServicio: (s: Servicio) => void
}

export default function CargaDiaria({ fecha, setFecha, servicio, setServicio }: Props) {

  const [consumo, setConsumo] = useState<ConsumoDiario | null>(null)
  const [items, setItems] = useState<ConsumoItem[]>([])
  const [cargandoData, setCargandoData] = useState(false)

  // Buscador
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoConsumoItem>('insumo')
  const [busqueda, setBusqueda] = useState('')
  const [opcionesInsumo, setOpcionesInsumo] = useState<OpcionBuscador[]>([])
  const [opcionesElab, setOpcionesElab] = useState<OpcionBuscador[]>([])
  const [opcionesReceta, setOpcionesReceta] = useState<OpcionBuscador[]>([])
  const [seleccionado, setSeleccionado] = useState<OpcionBuscador | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [agregando, setAgregando] = useState(false)

  // Cargar opciones del buscador (1 vez)
  useEffect(() => {
    Promise.all([
      obtenerInsumosBuscador(),
      obtenerElaboracionesBuscador(),
      obtenerRecetasBuscador(),
    ]).then(([ins, elab, rec]) => {
      setOpcionesInsumo(ins)
      setOpcionesElab(elab)
      setOpcionesReceta(rec)
    })
  }, [])

  // Cargar consumo del día/servicio cuando cambian
  useEffect(() => {
    cargarConsumoDelServicio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, servicio])

  async function cargarConsumoDelServicio() {
    try {
      setCargandoData(true)
      const c = await obtenerConsumo(fecha, servicio)
      setConsumo(c)
      if (c) {
        const its = await obtenerItemsConsumo(c.id)
        setItems(its)
      } else {
        setItems([])
      }
    } catch (e) {
      console.error('Error cargando consumo:', e)
    } finally {
      setCargandoData(false)
    }
  }

  // Opciones filtradas por búsqueda
  const opcionesFiltradas = useMemo(() => {
    const fuente =
      tipoSeleccionado === 'insumo'
        ? opcionesInsumo
        : tipoSeleccionado === 'elaboracion'
        ? opcionesElab
        : opcionesReceta

    const q = busqueda.trim().toLowerCase()
    if (!q) return fuente.slice(0, 50)
    return fuente.filter((o) => o.nombre.toLowerCase().includes(q)).slice(0, 50)
  }, [tipoSeleccionado, busqueda, opcionesInsumo, opcionesElab, opcionesReceta])

  // Más usados (top 8 items que aparecen más en TODOS los consumos del último mes)
  // Por simplicidad: muestro los items que ya están en este consumo + los primeros 5 insumos como sugerencia
  const masUsados = useMemo(() => opcionesInsumo.slice(0, 6), [opcionesInsumo])

  const totalCosto = items.reduce((acc, it) => acc + Number(it.subtotal), 0)
  const totalItems = items.length
  const tipoConteo = {
    insumo: items.filter((i) => i.tipo === 'insumo').length,
    elaboracion: items.filter((i) => i.tipo === 'elaboracion').length,
    receta: items.filter((i) => i.tipo === 'receta').length,
  }

  function selectOption(o: OpcionBuscador) {
    setSeleccionado(o)
    setCantidad('')
  }

  async function handleAgregar() {
    if (!seleccionado) {
      alert('Seleccioná un item')
      return
    }
    const cant = parsearNumero(cantidad)
    if (cant <= 0) {
      alert('Ingresá una cantidad válida')
      return
    }

    try {
      setAgregando(true)
      // Asegurarnos de tener consumo creado
      const c = consumo || (await obtenerOCrearConsumo(fecha, servicio))
      if (!consumo) setConsumo(c)

      await agregarItem(c.id, {
        tipo: seleccionado.tipo,
        insumo_id: seleccionado.tipo === 'insumo' ? seleccionado.id : null,
        receta_base_id: seleccionado.tipo === 'elaboracion' ? seleccionado.id : null,
        plato_id: seleccionado.tipo === 'receta' ? seleccionado.id : null,
        cantidad: cant,
        unidad: seleccionado.unidad,
        costo_unitario: seleccionado.costo_unitario,
      })

      // Refrescar items
      const its = await obtenerItemsConsumo(c.id)
      setItems(its)
      setSeleccionado(null)
      setBusqueda('')
      setCantidad('')
    } catch (e) {
      console.error('Error agregando:', e)
      alert('Error al agregar el item')
    } finally {
      setAgregando(false)
    }
  }

  async function handleEliminarItem(id: string) {
    if (!confirm('¿Eliminar este item?')) return
    try {
      await eliminarItem(id)
      if (consumo) {
        const its = await obtenerItemsConsumo(consumo.id)
        setItems(its)
      }
    } catch (e) {
      console.error('Error eliminando:', e)
    }
  }

  const subtotalPreview =
    seleccionado && cantidad ? parsearNumero(cantidad) * seleccionado.costo_unitario : 0

  return (
    <div className="space-y-4">
      {/* Header día */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              {consumo
                ? consumo.confirmado
                  ? '✅ Confirmado'
                  : `📝 Borrador · ${items.length} items`
                : '📭 Sin carga aún'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* COLUMNA IZQUIERDA: agregar item */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 lg:sticky lg:top-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">+ Agregar al consumo</h3>

            {/* Tipo */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
              <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-md p-1">
                {TIPOS.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.valor}
                      onClick={() => {
                        setTipoSeleccionado(t.valor)
                        setSeleccionado(null)
                        setBusqueda('')
                      }}
                      className={`flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded transition-colors ${
                        tipoSeleccionado === t.valor
                          ? 'bg-white shadow-sm font-medium text-gray-900'
                          : 'text-gray-600'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${tipoSeleccionado === t.valor ? t.color : ''}`} />
                      <span className="hidden sm:inline">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Buscador */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar ${TIPOS.find((t) => t.valor === tipoSeleccionado)?.label.toLowerCase()}...`}
                className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm"
              />
            </div>

            {/* Resultados */}
            <div className="border border-gray-200 rounded-md mb-3 divide-y divide-gray-100 text-sm max-h-48 overflow-y-auto">
              {opcionesFiltradas.length === 0 ? (
                <div className="px-3 py-3 text-gray-400 text-xs text-center">Sin resultados</div>
              ) : (
                opcionesFiltradas.map((o) => (
                  <button
                    key={`${o.tipo}-${o.id}`}
                    onClick={() => selectOption(o)}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${
                      seleccionado?.id === o.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="text-gray-900 truncate">{o.nombre}</div>
                    <div className="text-[11px] text-gray-500 font-mono">
                      {formatearMonedaAnalisis(o.costo_unitario)}/{o.unidad}{' '}
                      <span className="text-gray-400">(IVA inc.)</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Cantidad + agregar */}
            {seleccionado && (
              <div className="bg-gray-50 rounded-md p-3 border border-gray-200 space-y-2">
                <div>
                  <div className="text-xs text-gray-500 uppercase mb-0.5">Item seleccionado</div>
                  <div className="text-sm font-medium text-gray-900">{seleccionado.nombre}</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cantidad ({seleccionado.unidad})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cantidad}
                    onChange={(e) => setCantidad(formatearInputNumero(e.target.value))}
                    placeholder="0"
                    autoFocus
                    className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm text-right"
                  />
                </div>

                {subtotalPreview > 0 && (
                  <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 font-mono">
                    Subtotal: <strong className="text-gray-900">{formatearMonedaAnalisis(subtotalPreview)}</strong>
                  </div>
                )}

                <Button onClick={handleAgregar} disabled={agregando || !cantidad} className="w-full">
                  <Plus className="w-4 h-4 mr-1" />
                  {agregando ? 'Agregando...' : 'Agregar al consumo'}
                </Button>
              </div>
            )}

            {/* Más usados */}
            {!seleccionado && masUsados.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="text-[10px] uppercase text-gray-400 mb-2 font-semibold">
                  ⚡ Insumos sugeridos
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {masUsados.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setTipoSeleccionado('insumo')
                        selectOption(o)
                      }}
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                    >
                      + {o.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: lista de items + KPIs */}
        <div className="xl:col-span-2 space-y-4">
          {/* Tabla de items */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">🍳 Consumo del servicio</h3>
              <p className="text-[11px] text-gray-500">
                {totalItems === 0
                  ? 'Todavía no cargaste items. Empezá usando el buscador de la izquierda.'
                  : `${totalItems} items · todos los costos con IVA incluido`}
              </p>
            </div>

            {cargandoData ? (
              <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                Sin items cargados
              </div>
            ) : (
              <>
                {/* Desktop: tabla */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                        <th className="text-left py-2 px-3 font-medium">Item</th>
                        <th className="text-center py-2 px-1 font-medium">Tipo</th>
                        <th className="text-right py-2 px-2 font-medium">Cant.</th>
                        <th className="text-right py-2 px-2 font-medium">Costo unit.</th>
                        <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((it) => (
                        <tr key={it.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-900">{it.nombre}</td>
                          <td className="text-center px-1">
                            <BadgeTipo tipo={it.tipo} />
                          </td>
                          <td className="text-right px-2 text-gray-700 font-mono">
                            {Number(it.cantidad).toLocaleString('es-AR')} {it.unidad}
                          </td>
                          <td className="text-right px-2 text-gray-500 font-mono">
                            {formatearMonedaAnalisis(it.costo_unitario)}/{it.unidad}
                          </td>
                          <td className="text-right px-3 font-medium font-mono">
                            {formatearMonedaAnalisis(it.subtotal)}
                          </td>
                          <td className="px-1">
                            <button
                              onClick={() => handleEliminarItem(it.id)}
                              className="text-gray-400 hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <td colSpan={4} className="py-3 px-3 text-right text-gray-700">
                          Total consumo (IVA inc.):
                        </td>
                        <td className="text-right px-3 text-base text-gray-900 font-mono">
                          {formatearMonedaAnalisis(totalCosto)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile: cards */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {items.map((it) => (
                    <div key={it.id} className="p-3 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <BadgeTipo tipo={it.tipo} />
                          <span className="text-sm text-gray-900 truncate">{it.nombre}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          {Number(it.cantidad).toLocaleString('es-AR')} {it.unidad} ×{' '}
                          {formatearMonedaAnalisis(it.costo_unitario)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-sm font-semibold font-mono">
                          {formatearMonedaAnalisis(it.subtotal)}
                        </span>
                        <button
                          onClick={() => handleEliminarItem(it.id)}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="p-3 bg-gray-50 flex justify-between font-semibold">
                    <span className="text-sm text-gray-700">Total (IVA inc.)</span>
                    <span className="text-base text-gray-900 font-mono">{formatearMonedaAnalisis(totalCosto)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
              <div className="text-[10px] uppercase text-gray-500 font-semibold">Items cargados</div>
              <div className="text-lg font-bold text-gray-900 mt-1 font-mono">{totalItems}</div>
              <div className="text-[11px] text-gray-500 font-mono">
                {tipoConteo.insumo} ins · {tipoConteo.elaboracion} elab · {tipoConteo.receta} rec
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
              <div className="text-[10px] uppercase text-gray-500 font-semibold">Costo total</div>
              <div className="text-lg font-bold text-gray-900 mt-1 font-mono">{formatearMonedaAnalisis(totalCosto)}</div>
              <div className="text-[11px] text-gray-500">IVA incluido</div>
            </div>
            <div className="bg-blue-50 rounded-lg border-2 border-blue-300 shadow-sm p-3">
              <div className="text-[10px] uppercase text-blue-700 font-semibold">💡 Tip</div>
              <div className="text-[11px] text-blue-700 mt-1 leading-tight">
                Cargá la venta del día en la solapa <strong>Incidencia</strong> para ver tu food cost real
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BadgeTipo({ tipo }: { tipo: TipoConsumoItem }) {
  const cfg = {
    insumo: { label: 'INS', cls: 'bg-blue-100 text-blue-800' },
    elaboracion: { label: 'ELA', cls: 'bg-amber-100 text-amber-800' },
    receta: { label: 'REC', cls: 'bg-rose-100 text-rose-800' },
  }[tipo]
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
