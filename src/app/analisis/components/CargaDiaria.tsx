'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, X, ChefHat, BookOpen, Package, FileDown, UtensilsCrossed, Martini, Wine } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  obtenerInsumosBuscador,
  obtenerElaboracionesBuscador,
  obtenerRecetasBuscador,
  obtenerTragosBuscador,
  obtenerEjecutivosBuscador,
  obtenerVinosBuscador,
  obtenerOCrearConsumo,
  obtenerConsumo,
  obtenerItemsConsumo,
  agregarItem,
  eliminarItem,
  formatearMonedaAnalisis,
} from '@/lib/consumo-queries'
import { parsearNumero, formatearInputNumero } from '@/lib/formato-numeros'
import { coincideBusqueda } from '@/lib/buscar'
import { generarPDFConsumo } from '@/lib/generar-pdf-consumo'
import {
  type ConsumoDiario,
  type ConsumoItem,
  type OpcionBuscador,
  type Servicio,
  type TipoConsumoItem,
  SERVICIO_LABEL,
  TIPO_CONFIG,
  FK_DE_TIPO,
  areaDeTipo,
} from '@/types/analisis'

// Los tipos que se pueden cargar, en el orden en que aparecen los botones:
// primero los de cocina, después los de barra.
const TIPOS: { valor: TipoConsumoItem; icon: any; color: string }[] = [
  { valor: 'insumo', icon: Package, color: 'text-blue-600' },
  { valor: 'elaboracion', icon: BookOpen, color: 'text-amber-600' },
  { valor: 'receta', icon: ChefHat, color: 'text-rose-600' },
  { valor: 'ejecutivo', icon: UtensilsCrossed, color: 'text-emerald-600' },
  { valor: 'trago', icon: Martini, color: 'text-cyan-600' },
  { valor: 'vino', icon: Wine, color: 'text-purple-600' },
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
  // Opciones del buscador, indexadas por tipo
  const [opciones, setOpciones] = useState<Partial<Record<TipoConsumoItem, OpcionBuscador[]>>>({})
  const [seleccionado, setSeleccionado] = useState<OpcionBuscador | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [agregando, setAgregando] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)

  // Cargar opciones del buscador (1 vez)
  useEffect(() => {
    Promise.all([
      obtenerInsumosBuscador(),
      obtenerElaboracionesBuscador(),
      obtenerRecetasBuscador(),
      obtenerEjecutivosBuscador(),
      obtenerTragosBuscador(),
      obtenerVinosBuscador(),
    ])
      .then(([insumo, elaboracion, receta, ejecutivo, trago, vino]) => {
        setOpciones({ insumo, elaboracion, receta, ejecutivo, trago, vino })
      })
      .catch((e) => console.error('Error cargando opciones del buscador:', e))
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

  // Opciones filtradas por búsqueda.
  // Busca por fragmentos sueltos: "sal res mal" encuentra "Reserva Malbec (Salentein)".
  const opcionesFiltradas = useMemo(() => {
    const fuente = opciones[tipoSeleccionado] || []
    if (!busqueda.trim()) return fuente.slice(0, 50)
    return fuente.filter((o) => coincideBusqueda(o.nombre, busqueda)).slice(0, 50)
  }, [tipoSeleccionado, busqueda, opciones])

  // Cuántos quedaron afuera del corte de 50, para no mentir con la lista
  const totalCoincidencias = useMemo(() => {
    const fuente = opciones[tipoSeleccionado] || []
    if (!busqueda.trim()) return fuente.length
    return fuente.filter((o) => coincideBusqueda(o.nombre, busqueda)).length
  }, [tipoSeleccionado, busqueda, opciones])

  // Sugerencias rápidas: los primeros insumos, para no tener que tipear
  const masUsados = useMemo(() => (opciones.insumo || []).slice(0, 6), [opciones.insumo])

  const totalCosto = items.reduce((acc, it) => acc + Number(it.subtotal), 0)
  const totalItems = items.length

  // Costo separado por área: cocina y barra tienen márgenes distintos,
  // sumadas en un solo número se tapan entre sí.
  const costoCocina = items
    .filter((i) => areaDeTipo(i.tipo) === 'cocina')
    .reduce((acc, it) => acc + Number(it.subtotal), 0)
  const costoBarra = totalCosto - costoCocina
  const hayBarra = items.some((i) => areaDeTipo(i.tipo) === 'barra')

  // Cuántos items hay de cada tipo, solo de los que aparecen
  const conteoPorTipo = TIPOS.map((t) => ({
    tipo: t.valor,
    cantidad: items.filter((i) => i.tipo === t.valor).length,
  })).filter((c) => c.cantidad > 0)

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
        [FK_DE_TIPO[seleccionado.tipo]]: seleccionado.id,
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

  async function handleDescargarPDF() {
    if (items.length === 0) return
    try {
      setGenerandoPDF(true)
      await generarPDFConsumo({
        fecha,
        servicio,
        items,
        confirmado: consumo?.confirmado ?? false,
        notas: consumo?.notas,
      })
    } catch (e) {
      console.error('Error generando PDF:', e)
      alert('Error al generar el PDF')
    } finally {
      setGenerandoPDF(false)
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
                  {SERVICIO_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {/* El estado se distingue por color, no por icono: el texto ya dice
                cuál es, así que un glifo al lado solo suma ruido. */}
            {consumo ? (
              consumo.confirmado ? (
                <span className="text-xs font-medium text-success">Confirmado</span>
              ) : (
                <span className="text-xs text-warning">
                  Borrador · {items.length} items
                </span>
              )
            ) : (
              <span className="text-xs text-ink-light">Sin carga aún</span>
            )}
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
                  const activo = tipoSeleccionado === t.valor
                  const disponibles = opciones[t.valor]?.length ?? 0
                  return (
                    <button
                      key={t.valor}
                      onClick={() => {
                        setTipoSeleccionado(t.valor)
                        setSeleccionado(null)
                        setBusqueda('')
                      }}
                      title={`${TIPO_CONFIG[t.valor].label} (${disponibles})`}
                      className={`flex items-center justify-center gap-1 text-[11px] px-1.5 py-1.5 rounded transition-colors ${
                        activo ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-600'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${activo ? t.color : ''}`} />
                      <span className="truncate">{TIPO_CONFIG[t.valor].label}</span>
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
                placeholder={`Buscar ${TIPO_CONFIG[tipoSeleccionado].label.toLowerCase()}...`}
                className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm"
              />
            </div>

            {/* Contador / pista de uso */}
            <div className="text-[10px] text-gray-400 mb-2 px-0.5 h-3.5">
              {busqueda.trim() ? (
                totalCoincidencias === 0 ? (
                  'sin coincidencias'
                ) : totalCoincidencias > opcionesFiltradas.length ? (
                  <span className="font-mono">
                    mostrando {opcionesFiltradas.length} de {totalCoincidencias}
                  </span>
                ) : (
                  <span className="font-mono">
                    {totalCoincidencias} {totalCoincidencias === 1 ? 'resultado' : 'resultados'}
                  </span>
                )
              ) : (
                'Podés escribir partes sueltas: “sal res mal”'
              )}
            </div>

            {/* Resultados */}
            <div key={`results-${busqueda}-${tipoSeleccionado}`} className="border border-gray-200 rounded-md mb-3 divide-y divide-gray-100 text-sm max-h-48 overflow-y-auto">
              {opcionesFiltradas.length === 0 ? (
                <div className="px-3 py-3 text-gray-400 text-xs text-center">
                  {busqueda.trim()
                    ? 'Sin resultados'
                    : `No hay ${TIPO_CONFIG[tipoSeleccionado].plural.toLowerCase()} cargados todavía`}
                </div>
              ) : (
                opcionesFiltradas.map((o, idx) => (
                  <button
                    key={`${o.tipo}-${o.id}-${idx}`}
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

            {/* Más usados - solo mostrar cuando no hay búsqueda activa */}
            {!seleccionado && !busqueda && masUsados.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="text-[10px] uppercase text-gray-400 mb-2 font-semibold">
                  Insumos sugeridos
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
            <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Consumo del servicio</h3>
                <p className="text-[11px] text-gray-500">
                  {totalItems === 0
                    ? 'Todavía no cargaste items. Empezá usando el buscador de la izquierda.'
                    : `${totalItems} items · todos los costos con IVA incluido`}
                </p>
              </div>
              <button
                onClick={handleDescargarPDF}
                disabled={totalItems === 0 || generandoPDF}
                title="Descargar consumo en PDF"
                className="shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">{generandoPDF ? 'Generando...' : 'PDF'}</span>
              </button>
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
                      {/* Cocina y barra solo se muestran si hay algo de barra:
                          si no, el total ya es todo cocina y sobra la fila */}
                      {hayBarra && (
                        <>
                          <tr className="bg-gray-50 border-t-2 border-gray-200 text-gray-600">
                            <td colSpan={4} className="pt-2.5 px-3 text-right text-xs">
                              Cocina:
                            </td>
                            <td className="text-right px-3 pt-2.5 text-sm font-mono">
                              {formatearMonedaAnalisis(costoCocina)}
                            </td>
                            <td></td>
                          </tr>
                          <tr className="bg-gray-50 text-gray-600">
                            <td colSpan={4} className="pb-1 px-3 text-right text-xs">
                              Barra:
                            </td>
                            <td className="text-right px-3 pb-1 text-sm font-mono">
                              {formatearMonedaAnalisis(costoBarra)}
                            </td>
                            <td></td>
                          </tr>
                        </>
                      )}
                      <tr
                        className={`bg-gray-50 font-semibold ${
                          hayBarra ? 'border-t border-gray-300' : 'border-t-2 border-gray-200'
                        }`}
                      >
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
                  <div className="p-3 bg-gray-50 space-y-1">
                    {hayBarra && (
                      <>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Cocina</span>
                          <span className="font-mono">{formatearMonedaAnalisis(costoCocina)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 pb-1 border-b border-gray-200">
                          <span>Barra</span>
                          <span className="font-mono">{formatearMonedaAnalisis(costoBarra)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between font-semibold pt-0.5">
                      <span className="text-sm text-gray-700">Total (IVA inc.)</span>
                      <span className="text-base text-gray-900 font-mono">{formatearMonedaAnalisis(totalCosto)}</span>
                    </div>
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
                {conteoPorTipo.length === 0
                  ? '—'
                  : conteoPorTipo
                      .map((c) => `${c.cantidad} ${TIPO_CONFIG[c.tipo].badge.toLowerCase()}`)
                      .join(' · ')}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
              <div className="text-[10px] uppercase text-gray-500 font-semibold">Costo total</div>
              <div className="text-lg font-bold text-gray-900 mt-1 font-mono">{formatearMonedaAnalisis(totalCosto)}</div>
              <div className="text-[11px] text-gray-500">
                {hayBarra ? (
                  <span className="font-mono">
                    {formatearMonedaAnalisis(costoCocina)} cocina · {formatearMonedaAnalisis(costoBarra)} barra
                  </span>
                ) : (
                  'IVA incluido'
                )}
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg border-2 border-blue-300 shadow-sm p-3">
              <div className="text-[10px] uppercase text-blue-700 font-semibold">Tip</div>
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
  const cfg = TIPO_CONFIG[tipo]
  return (
    <span
      title={cfg.label}
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.badgeClass}`}
    >
      {cfg.badge}
    </span>
  )
}
