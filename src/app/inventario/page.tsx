'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Warehouse, ClipboardList, ClipboardCheck, TrendingDown, AlertTriangle, Eye } from 'lucide-react'
import { Button, ClickableItemName, Modal } from '@/components/ui'
import { formatearCantidad, formatearInputNumero, parsearNumero, formatearMoneda } from '@/lib/formato-numeros'
import { hoyISO, dateToString } from '@/lib/fechas'
import {
  obtenerMovimientos, guardarConteo, obtenerAjustes, obtenerHistorial,
  MOTIVOS, MOTIVO_INICIAL, DIAS_CONTEO_VIGENTE,
  type MovimientoInsumo, type AjusteAcumulado, type LineaConteo, type LineaHistorial,
} from '@/lib/inventario'
import HojasControl from '@/components/inventario/HojasControl'

/**
 * Inventario: qué entró, qué salió y qué diferencia hay.
 *
 * La versión anterior de esta pantalla mostraba como "stock" la suma de TODAS
 * las facturas desde el origen, sin restar nada: 616 kg de bola de lomo. Ahora
 * el número sale de `src/lib/inventario.ts` — último conteo, más compras, menos
 * consumo — y un insumo que nunca se contó se muestra como tal en vez de
 * inventar una cifra.
 *
 * Es control interno: lee facturas y consumo, y sólo escribe sus propios
 * conteos. No toca costos, precios ni food cost.
 */

const CATEGORIAS: Record<string, string> = {
  Carnes: 'Carnes',
  Almacen: 'Almacén',
  Verduras_Frutas: 'Verduras y Frutas',
  Pescados_Mariscos: 'Pescados y Mariscos',
  Lacteos_Fiambres: 'Lácteos y Fiambres',
  Bebidas: 'Bebidas',
  Salsas_Recetas: 'Salsas y Recetas',
}

type TabType = 'stock' | 'conteo' | 'diferencias' | 'hojas'

/** Lo que se está contando de un insumo, mientras se tipea */
interface EnConteo {
  texto: string
  motivo: string
}

export default function InventarioPage() {
  const [activeTab, setActiveTab] = useState<TabType>('stock')
  const [movimientos, setMovimientos] = useState<MovimientoInsumo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Conteo en curso
  const [fecha, setFecha] = useState(hoyISO())
  const [contado, setContado] = useState<Map<string, EnConteo>>(new Map())
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  // Diferencias
  const [ajustes, setAjustes] = useState<AjusteAcumulado[]>([])
  const [mes, setMes] = useState('todo')

  // Historial de un insumo
  const [historial, setHistorial] = useState<{ nombre: string; unidad: string; lineas: LineaHistorial[] } | null>(null)

  async function abrirHistorial(m: MovimientoInsumo) {
    try {
      const lineas = await obtenerHistorial(m.insumo_id)
      setHistorial({ nombre: m.nombre, unidad: m.unidad, lineas })
    } catch (e) {
      console.error('Error cargando el historial:', e)
    }
  }

  /** Los últimos seis meses, más "todo". El stock es de hoy; el ajuste, de un período. */
  const meses = useMemo(() => {
    const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const lista: { valor: string; label: string }[] = [{ valor: 'todo', label: 'Todo' }]
    const hoy = new Date()
    for (let i = 0; i < 6; i++) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      lista.push({
        valor: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`,
        label: nombres[f.getMonth()],
      })
    }
    return lista
  }, [])

  useEffect(() => {
    cargar()
  }, [])

  useEffect(() => {
    if (activeTab !== 'diferencias') return
    let desde = '2026-01-01'
    let hasta: string | undefined
    if (mes !== 'todo') {
      const [a, m] = mes.split('-').map(Number)
      desde = `${mes}-01`
      // Día 0 del mes siguiente = último día de este
      hasta = dateToString(new Date(a, m, 0))
    }
    obtenerAjustes(desde, hasta)
      .then(setAjustes)
      .catch((e) => console.error('Error cargando ajustes:', e))
  }, [activeTab, mes])

  async function cargar() {
    try {
      setCargando(true)
      setError(null)
      setMovimientos(await obtenerMovimientos())
    } catch (e: any) {
      console.error('Error cargando inventario:', e)
      setError(e?.message || String(e))
    } finally {
      setCargando(false)
    }
  }

  // El texto se guarda tal cual mientras se tipea; el número sale recién al
  // leerlo. Sin esto la coma de los decimales se borra sola (ver ROADMAP).
  function escribir(insumoId: string, texto: string) {
    setContado((prev) => {
      const m = new Map(prev)
      const actual = m.get(insumoId) || { texto: '', motivo: '' }
      m.set(insumoId, { ...actual, texto: formatearInputNumero(texto) })
      return m
    })
  }

  function elegirMotivo(insumoId: string, motivo: string) {
    setContado((prev) => {
      const m = new Map(prev)
      const actual = m.get(insumoId) || { texto: '', motivo: '' }
      m.set(insumoId, { ...actual, motivo })
      return m
    })
  }

  /** Solo las líneas donde efectivamente se escribió algo */
  const lineasContadas = useMemo(() => {
    return movimientos
      .map((m) => {
        const c = contado.get(m.insumo_id)
        if (!c || c.texto.trim() === '') return null
        const cantidad = parsearNumero(c.texto)
        return {
          mov: m,
          cantidad,
          diferencia: cantidad - m.stock,
          motivo: c.motivo,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [movimientos, contado])

  const conDiferencia = lineasContadas.filter((l) => Math.abs(l.diferencia) > 0.001)

  async function confirmar() {
    if (lineasContadas.length === 0) return
    try {
      setGuardando(true)
      const lineas: LineaConteo[] = lineasContadas.map((l) => ({
        insumo_id: l.mov.insumo_id,
        cantidad_teorica: l.mov.stock,
        cantidad_contada: l.cantidad,
        motivo: l.motivo || null,
        nota: null,
      }))
      await guardarConteo(fecha, lineas)
      setResultado(
        `Conteo del ${fecha.split('-').reverse().join('/')} guardado: ${lineas.length} ` +
          `${lineas.length === 1 ? 'insumo contado' : 'insumos contados'}, ` +
          `${conDiferencia.length} con diferencia.`
      )
      setContado(new Map())
      await cargar()
      setActiveTab('stock')
    } catch (e: any) {
      console.error('Error guardando el conteo:', e)
      alert('No se pudo guardar el conteo: ' + (e?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  const nunca = movimientos.filter((m) => m.fechaConteo === null).length
  const vencidos = movimientos.filter((m) => m.fechaConteo !== null && !m.confiable).length

  const tabs = [
    { id: 'stock' as TabType, label: 'Stock', icon: Warehouse },
    { id: 'conteo' as TabType, label: 'Contar', icon: ClipboardCheck },
    { id: 'diferencias' as TabType, label: 'Diferencias', icon: TrendingDown },
    { id: 'hojas' as TabType, label: 'Hojas de Control', icon: ClipboardList },
  ]

  return (
    <div className="p-4 lg:p-6 mobile-content-padding">
      <div className="mb-6">
        <h1>Inventario</h1>
        <p className="text-sm text-gray-500 mt-1">
          {activeTab === 'stock' && 'Lo contado, más lo que entró, menos lo que salió'}
          {activeTab === 'conteo' && 'Cargá lo que contaste. Lo que no toques queda como está'}
          {activeTab === 'diferencias' && 'Dónde se repite la diferencia, y por qué'}
          {activeTab === 'hojas' && 'Planillas para contar a mano'}
        </p>
      </div>

      <div className="flex gap-1 sm:gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const activo = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3 px-2 sm:px-1 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activo ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-gray-800 mb-4">
          <span className="font-semibold text-green-800">Listo.</span> {resultado}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm font-semibold text-red-800 mb-1">No se pudo calcular el inventario</p>
          <p className="text-xs text-red-700 font-mono break-words">{error}</p>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-gray-500">Calculando…</p>
        </div>
      ) : activeTab === 'stock' ? (
        <Stock
          movimientos={movimientos}
          nunca={nunca}
          vencidos={vencidos}
          onContar={() => setActiveTab('conteo')}
          onHistorial={abrirHistorial}
        />
      ) : activeTab === 'conteo' ? (
        <Contar
          movimientos={movimientos}
          fecha={fecha}
          setFecha={setFecha}
          contado={contado}
          escribir={escribir}
          elegirMotivo={elegirMotivo}
          lineas={lineasContadas}
          conDiferencia={conDiferencia.length}
          guardando={guardando}
          onConfirmar={confirmar}
        />
      ) : activeTab === 'diferencias' ? (
        <Diferencias ajustes={ajustes} mes={mes} setMes={setMes} meses={meses} />
      ) : (
        <HojasControl />
      )}

      <Modal
        isOpen={!!historial}
        onClose={() => setHistorial(null)}
        title={`Conteos — ${historial?.nombre ?? ''}`}
      >
        {historial && historial.lineas.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se contó este insumo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-2">Fecha</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-2">Debería</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-2">Contado</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-2">Dif.</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-2">En plata</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-2 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {(historial?.lineas ?? []).map((l, i) => {
                  const esInicial = l.motivo === MOTIVO_INICIAL
                  const label = MOTIVOS.find((m) => m.valor === l.motivo)?.label
                  return (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="px-2 py-2 font-mono text-gray-700">
                        {l.fecha.split('-').reverse().join('/')}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-gray-500">
                        {esInicial ? '—' : formatearCantidad(l.teorico, 1)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-gray-900">
                        {formatearCantidad(l.contado, 1)}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono ${
                        esInicial ? 'text-gray-300' : l.diferencia < 0 ? 'text-red-700' : 'text-gray-700'
                      }`}>
                        {esInicial ? '—' : `${l.diferencia > 0 ? '+' : ''}${formatearCantidad(l.diferencia, 1)}`}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono ${
                        esInicial ? 'text-gray-300' : l.valor < 0 ? 'text-red-700 font-semibold' : 'text-gray-700'
                      }`}>
                        {esInicial ? '—' : formatearMoneda(l.valor)}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-500">
                        {esInicial ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            Stock inicial
                          </span>
                        ) : label || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}

// =====================================================
// STOCK
// =====================================================

function Stock({
  movimientos, nunca, vencidos, onContar, onHistorial,
}: {
  movimientos: MovimientoInsumo[]
  nunca: number
  vencidos: number
  onContar: () => void
  onHistorial: (m: MovimientoInsumo) => void
}) {
  const router = useRouter()
  const [categoria, setCategoria] = useState<string>('todas')

  const visibles = useMemo(
    () => movimientos.filter((m) => categoria === 'todas' || m.categoria === categoria),
    [movimientos, categoria]
  )
  const categorias = useMemo(
    () => Array.from(new Set(movimientos.map((m) => m.categoria))).sort(),
    [movimientos]
  )

  if (movimientos.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <Warehouse className="w-8 h-8 mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-700">Ningún insumo está marcado para inventario.</p>
        <p className="text-xs text-gray-500 mt-1">
          Se marcan desde la ficha del insumo, con la casilla <span className="font-medium">Inventario</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(nunca > 0 || vencidos > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-800">
                {nunca > 0 && (
                  <><span className="font-mono">{nunca}</span>{' '}
                  {nunca === 1 ? 'insumo nunca se contó' : 'insumos nunca se contaron'}</>
                )}
                {nunca > 0 && vencidos > 0 && ' · '}
                {vencidos > 0 && (
                  <><span className="font-mono">{vencidos}</span> sin contar hace más de{' '}
                  <span className="font-mono">{DIAS_CONTEO_VIGENTE}</span> días</>
                )}
              </span>
              <div className="text-xs text-gray-600 mt-1">
                Un conteo viejo arrastra todo lo que pasó desde entonces sin que nadie lo
                verificara, así que su número se muestra pero no se da por bueno. Contarlos
                de nuevo los pone al día.
              </div>
              <button onClick={onContar} className="text-xs text-amber-900 underline mt-1.5">
                Contar ahora
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {['todas', ...categorias].map((c) => (
          <button
            key={c}
            onClick={() => setCategoria(c)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              categoria === c
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {c === 'todas' ? 'Todas' : CATEGORIAS[c] || c}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Insumo</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Contado</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Entró</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Salió</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Debería haber</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Vale</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => (
              <tr key={m.insumo_id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2">
                  {/* Va a la ficha del insumo: desde ahí se lo saca del control
                      de stock sin tener que ir a Insumos y buscarlo. */}
                  <ClickableItemName
                    nombre={m.nombre}
                    size="xs"
                    title="Abrir la ficha del insumo"
                    onClick={() => router.push(`/insumos?editar=${m.insumo_id}`)}
                  />
                  {/* Mismo ojo que el nombre pero en gris: el nombre lleva a la
                      ficha del insumo, esto a sus conteos. Dos destinos, un
                      lenguaje visual. */}
                  {m.fechaConteo && (
                    <button
                      onClick={() => onHistorial(m)}
                      title="Ver los conteos de este insumo"
                      className="ml-1.5 align-middle text-gray-300 hover:text-gray-600"
                    >
                      <Eye className="w-3.5 h-3.5 inline" />
                    </button>
                  )}
                  {/* Tres estados distintos, no dos: nunca contado, contado hace
                      mucho, y al día. El del medio tiene número pero envejecido. */}
                  {m.fechaConteo === null ? (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 ml-1.5">
                      sin contar
                    </span>
                  ) : !m.confiable ? (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 ml-1.5">
                      recontar · <span className="font-mono">{m.diasDesdeConteo}</span> días
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400 ml-1.5">
                      contado {m.fechaConteo.split('-').reverse().join('/')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-500">
                  {m.confiable ? formatearCantidad(m.base, 1) : '—'}
                </td>
                {/* El stock se lleva en unidades sueltas —botellas, no cajas—
                    pero la factura viene por caja. Se muestra la equivalencia
                    para que el número cuadre con el comprobante. */}
                <td className="px-3 py-2 text-right font-mono text-gray-700">
                  {formatearCantidad(m.entro, 1)}
                  {m.porPaquete > 1 && m.entro > 0 && (
                    <span className="block text-[10px] text-gray-400">
                      {formatearCantidad(m.entro / m.porPaquete, 0)} × {m.porPaquete}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">
                  {formatearCantidad(m.salio, 1)}
                </td>
                {/* Sin conteo previo el número no tiene base: se muestra atenuado
                    para que no se lea como un dato firme. Un insumo recién
                    marcado para inventario cae siempre en este caso. */}
                <td className={`px-3 py-2 text-right font-mono ${
                  !m.confiable ? 'text-gray-300' : m.stock < 0 ? 'text-red-700 font-semibold' : 'text-gray-900 font-semibold'
                }`}>
                  {formatearCantidad(m.stock, 1)}{' '}
                  <span className="text-[10px] text-gray-400 font-normal">{m.unidad}</span>
                </td>
                {/* Con IVA, la política del resto del sistema. La merma ya está
                    adentro: ver valorizar() en lib/inventario.ts */}
                <td className={`px-3 py-2 text-right font-mono ${
                  !m.confiable ? 'text-gray-300' : m.valor < 0 ? 'text-red-700' : 'text-gray-900 font-semibold'
                }`}>
                  {formatearMoneda(m.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 max-w-2xl">
        Valorizado con IVA, la misma política del resto del sistema. Lo que salió está en bruto: una receta que pide 7 kg de cebolla pelada descuenta 7,78 de
        la cámara, porque es lo que hay que agarrar del cajón. Las compras por caja se
        convierten a unidades sueltas.
      </p>
    </div>
  )
}

// =====================================================
// CONTAR
// =====================================================

function Contar({
  movimientos, fecha, setFecha, contado, escribir, elegirMotivo, lineas, conDiferencia, guardando, onConfirmar,
}: {
  movimientos: MovimientoInsumo[]
  fecha: string
  setFecha: (f: string) => void
  contado: Map<string, EnConteo>
  escribir: (id: string, texto: string) => void
  elegirMotivo: (id: string, motivo: string) => void
  lineas: { mov: MovimientoInsumo; cantidad: number; diferencia: number; motivo: string }[]
  conDiferencia: number
  guardando: boolean
  onConfirmar: () => void
}) {
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return movimientos
    return movimientos.filter((m) => m.nombre.toLowerCase().includes(q))
  }, [movimientos, busqueda])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha del conteo</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Buscar insumo</label>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar la lista…"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Cargá sólo lo que contaste: las líneas que dejes vacías no se guardan ni se tocan.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Insumo</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Debería</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Conté</th>
              <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Diferencia</th>
              <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => {
              const c = contado.get(m.insumo_id)
              const tiene = !!c && c.texto.trim() !== ''
              const dif = tiene ? parsearNumero(c!.texto) - m.stock : 0
              const hayDif = tiene && Math.abs(dif) > 0.001
              return (
                <tr key={m.insumo_id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">
                    <span className="text-gray-900">{m.nombre}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">{m.unidad}</span>
                  </td>
                  {/* El teórico se muestra siempre, aunque no sea confiable:
                      es contra este número que se calcula la diferencia, y
                      ocultarlo dejaba un "−3,9" sin nada con qué compararlo. */}
                  <td className={`px-3 py-2 text-right font-mono ${m.confiable ? 'text-gray-500' : 'text-gray-300'}`}>
                    {formatearCantidad(m.stock, 1)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={c?.texto ?? ''}
                      onChange={(e) => escribir(m.insumo_id, e.target.value)}
                      placeholder="—"
                      className="w-20 h-7 rounded border border-gray-300 px-1.5 text-xs font-mono text-right"
                    />
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    !tiene ? 'text-gray-300' : hayDif ? (dif < 0 ? 'text-red-700 font-semibold' : 'text-amber-700 font-semibold') : 'text-green-700'
                  }`}>
                    {!tiene ? '—' : `${dif > 0 ? '+' : ''}${formatearCantidad(dif, 1)}`}
                  </td>
                  <td className="px-3 py-2">
                    {hayDif ? (
                      <select
                        value={c!.motivo}
                        onChange={(e) => elegirMotivo(m.insumo_id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white max-w-[190px]"
                      >
                        <option value="">Elegir motivo…</option>
                        {MOTIVOS.map((mo) => (
                          <option key={mo.valor} value={mo.valor} title={mo.ayuda}>
                            {mo.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 max-w-lg">
          {lineas.length === 0
            ? 'Todavía no cargaste nada.'
            : `${lineas.length} ${lineas.length === 1 ? 'insumo contado' : 'insumos contados'}, ` +
              `${conDiferencia} con diferencia. Al confirmar, el stock de esos insumos pasa a ser lo que contaste.`}
        </p>
        <Button onClick={onConfirmar} disabled={guardando || lineas.length === 0}>
          {guardando ? 'Guardando…' : 'Confirmar conteo'}
        </Button>
      </div>
    </div>
  )
}

// =====================================================
// DIFERENCIAS
// =====================================================

function Diferencias({
  ajustes, mes, setMes, meses,
}: {
  ajustes: AjusteAcumulado[]
  mes: string
  setMes: (m: string) => void
  meses: { valor: string; label: string }[]
}) {
  const total = ajustes.reduce((s, a) => s + a.valor, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {meses.map((m) => (
          <button
            key={m.valor}
            onClick={() => setMes(m.valor)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              mes === m.valor
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {ajustes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <TrendingDown className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-700">Ningún conteo dio diferencia en este período.</p>
          <p className="text-xs text-gray-500 mt-1">
            Acá aparecen sólo los insumos donde lo contado no coincidió. El primer conteo de un
            insumo no cuenta: es una carga, no una diferencia.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Insumo</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Difirió</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">Ajuste</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">En plata</th>
              </tr>
            </thead>
            <tbody>
              {ajustes.map((a) => (
                <tr key={a.insumo_id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-900">{a.nombre}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">
                    {a.conDiferencia}<span className="text-gray-300"> / {a.conteos}</span>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${a.ajusteTotal < 0 ? 'text-red-700' : 'text-gray-700'}`}>
                    {a.ajusteTotal > 0 ? '+' : ''}{formatearCantidad(a.ajusteTotal, 1)}{' '}
                    <span className="text-[10px] text-gray-400">{a.unidad}</span>
                  </td>
                  {/* La plata decide si vale la pena ir a mirar: 200 g de reggianito
                      y 200 g de salmón no son lo mismo. Por eso también ordena. */}
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${a.valor < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {a.valor > 0 ? '+' : ''}{formatearMoneda(a.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300">
                <td className="px-3 py-2.5 text-xs text-gray-500" colSpan={3}>Ajustado en el período</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${total < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {total > 0 ? '+' : ''}{formatearMoneda(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
