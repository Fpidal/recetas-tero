'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatearMonedaAnalisis } from '@/lib/consumo-queries'
import {
  obtenerConsumoPorCubierto,
  UMBRAL_VARIACION,
  MINIMO_COSTO_POR_CUBIERTO,
  type ConsumoPorCubierto,
  type InsumoPorCubierto,
} from '@/lib/por-cubierto-queries'
import { SERVICIO_LABEL, CATEGORIAS_LABEL, type Servicio } from '@/types/analisis'

/**
 * Lo que consume cada persona que se sienta.
 *
 * La pregunta que contesta no es "cuánto gastamos" —eso está en Resumen— sino
 * "¿cambió algo que no debería haber cambiado?". Por eso el orden por defecto
 * es por variación y no por monto.
 */

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function mesDe(f: string) {
  const [a, m] = f.split('-').map(Number)
  const ult = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ult).padStart(2, '0')}` }
}

function semanaDe(f: string) {
  const [a, m, d] = f.split('-').map(Number)
  const x = new Date(a, m - 1, d)
  const diff = x.getDay() === 0 ? 6 : x.getDay() - 1
  const iso = (y: Date) =>
    `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  return { desde: iso(new Date(a, m - 1, d - diff)), hasta: iso(new Date(a, m - 1, d - diff + 6)) }
}

/**
 * Por cubierto las cantidades son diminutas, y en kilos no se leen: 2 gramos
 * de champignon salían "0,002 kg", y al lado "0,001 kg" del período anterior
 * con un +173% que parecía no tener nada que ver — el redondeo se comía la
 * diferencia. Pasando a gramos son 2,17 y 0,79, y el porcentaje se entiende.
 */
function fmtCant(v: number, unidad: string): string {
  let n = v
  let u = unidad
  if (v < 0.1) {
    if (unidad === 'kg') { n = v * 1000; u = 'g' }
    else if (unidad === 'lt') { n = v * 1000; u = 'ml' }
  }
  const dec = n < 1 ? 2 : n < 10 ? 2 : n < 100 ? 1 : 0
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${u}`
}

interface Props {
  fecha: string
  servicio: Servicio
  setServicio: (s: Servicio) => void
}

export default function PorCubierto({ fecha, servicio, setServicio }: Props) {
  const [fechaRef, setFechaRef] = useState(fecha)
  const [rango, setRango] = useState<'semana' | 'mes'>('mes')
  const [filtrarServicio, setFiltrarServicio] = useState(false)
  const [soloMovidos, setSoloMovidos] = useState(true)
  const [datos, setDatos] = useState<ConsumoPorCubierto | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const periodo = useMemo(
    () => (rango === 'mes' ? mesDe(fechaRef) : semanaDe(fechaRef)),
    [rango, fechaRef]
  )

  function mover(pasos: number) {
    const [a, m, d] = fechaRef.split('-').map(Number)
    const f = rango === 'mes' ? new Date(a, m - 1 + pasos, 1) : new Date(a, m - 1, d + pasos * 7)
    setFechaRef(
      `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
    )
  }

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    obtenerConsumoPorCubierto(periodo.desde, periodo.hasta, filtrarServicio ? servicio : undefined)
      .then((r) => { if (vivo) { setDatos(r); setCargando(false) } })
      .catch((e) => {
        console.error('Error en consumo por cubierto:', e)
        if (vivo) { setError(e?.message || String(e)); setCargando(false) }
      })
    return () => { vivo = false }
  }, [periodo.desde, periodo.hasta, filtrarServicio, servicio])

  /**
   * Lo que se muestra por defecto: lo que se movió Y pesa.
   * Un insumo de $8 por cubierto puede duplicarse sin que importe.
   */
  const visibles = useMemo(() => {
    if (!datos) return []
    const lista = soloMovidos
      ? datos.insumos.filter(
          (i) =>
            i.variacion !== null &&
            Math.abs(i.variacion) >= UMBRAL_VARIACION &&
            i.costoPorCubierto >= MINIMO_COSTO_POR_CUBIERTO
        )
      : datos.insumos.filter((i) => i.costoPorCubierto > 0)

    return [...lista].sort((a, b) =>
      soloMovidos
        ? Math.abs(b.variacion ?? 0) - Math.abs(a.variacion ?? 0)
        : b.costoPorCubierto - a.costoPorCubierto
    )
  }, [datos, soloMovidos])

  const rotulo =
    rango === 'mes'
      ? `${MESES[Number(periodo.desde.split('-')[1]) - 1]} ${periodo.desde.split('-')[0]}`
      : `${periodo.desde.split('-').reverse().slice(0, 2).join('/')} – ${periodo.hasta.split('-').reverse().slice(0, 2).join('/')}`

  const hoy = new Date()
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const esActual = periodo.desde <= hoyISO && hoyISO <= periodo.hasta

  const filtros = (
    <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-gray-200">
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        {(['semana', 'mes'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRango(r)}
            className={`text-sm px-3 py-1.5 ${
              rango === r ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {r === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => mover(-1)} aria-label="Anterior"
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-gray-900 min-w-[150px] text-center">{rotulo}</span>
        <button onClick={() => mover(1)} disabled={esActual} aria-label="Siguiente"
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1" />

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" checked={filtrarServicio}
          onChange={(e) => setFiltrarServicio(e.target.checked)} className="rounded border-gray-300" />
        Solo un servicio
      </label>
      {filtrarServicio && (
        <select value={servicio} onChange={(e) => setServicio(e.target.value as Servicio)}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5">
          {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
            <option key={s} value={s}>{SERVICIO_LABEL[s]}</option>
          ))}
        </select>
      )}
    </div>
  )

  if (cargando || error || !datos || datos.cubiertos === 0) {
    return (
      <div className="space-y-4">
        {filtros}
        {cargando && <div className="text-sm text-gray-500 py-12 text-center">Cargando…</div>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">No se pudo calcular</p>
            <p className="text-xs text-red-700 font-mono break-words">{error}</p>
          </div>
        )}
        {!cargando && !error && datos && datos.cubiertos === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-600">
              No hay cubiertos cargados en los días con consumo de este período.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Esta vista divide el consumo por la cantidad de personas, así que necesita las dos
              cosas: el consumo en Análisis y los cubiertos en Ventas.
            </p>
          </div>
        )}
        {!cargando && !error && !datos && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-500">Sin datos en este período.</p>
          </div>
        )}
      </div>
    )
  }

  const muestreoParcial = datos.diasConVenta > 0 && datos.diasConCarga < datos.diasConVenta

  return (
    <div className="space-y-5">
      {filtros}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        <Celda rotulo="Cubiertos" cifra={datos.cubiertos.toLocaleString('es-AR')}
          pie={`de ${datos.diasConCarga} ${datos.diasConCarga === 1 ? 'día' : 'días'} con carga`} />
        <Celda rotulo="Costo por cubierto"
          cifra={formatearMonedaAnalisis(datos.costoTotalPorCubierto)} pie="todo el consumo" />
        <Celda rotulo="Consumo total" cifra={formatearMonedaAnalisis(datos.costoTotal)} pie="del período" />
        <Celda rotulo="Período anterior"
          cifra={datos.cubiertosPrevios.toLocaleString('es-AR')} pie="cubiertos, para comparar" />
      </div>

      {/* La semana tiene 6-8 servicios y el menú del mediodía cambia todos los
          días: un ingrediente que entra el martes de una semana y no de la otra
          duplica su consumo por cubierto sin que haya pasado nada. Se avisa en
          vez de esconder el modo semana, porque para el pan y las servilletas
          —que se consumen igual todos los días— sí sirve. */}
      {rango === 'semana' && (
        <div className="bg-slate-50 border border-gray-200 border-l-[3px] border-l-slate-500 rounded-lg px-4 py-2.5 text-sm text-gray-700">
          <span className="font-medium">En semanas, los ingredientes de plato varían por el menú, no por descontrol.</span>{' '}
          Son {datos.diasConCarga} servicios y el menú del mediodía cambia todos los días: si un
          ingrediente entra el martes de una semana y no de la otra, su consumo por cubierto se
          dispara sin que haya pasado nada. Para eso conviene el mes.
          <br />
          Lo que sí se lee bien acá es lo que se consume igual todos los días — pan, servilletas,
          aceite, queso rallado — porque ahí una variación no tiene otra explicación.
        </div>
      )}

      {muestreoParcial && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-gray-700">
          Se cargó consumo en <span className="font-mono font-semibold">{datos.diasConCarga}</span> de{' '}
          <span className="font-mono font-semibold">{datos.diasConVenta}</span> días con venta. Los
          cubiertos se cuentan solo de los días cargados, así que la cuenta por persona es correcta —
          pero es una muestra, no el mes entero.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {soloMovidos ? 'Lo que se movió' : 'Todo, por cubierto'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            {soloMovidos ? (
              <>
                Insumos cuyo consumo por persona cambió más de{' '}
                <span className="font-mono">{UMBRAL_VARIACION}%</span> contra el período anterior,
                entre los que pesan más de{' '}
                <span className="font-mono">{formatearMonedaAnalisis(MINIMO_COSTO_POR_CUBIERTO)}</span>{' '}
                por cubierto. Si el pan pasa de 30 a 45 gramos por persona, eso no es que se vendió
                distinto.
              </>
            ) : (
              'Ordenado por lo que pesa cada uno en el costo de cada cubierto.'
            )}
          </p>
        </div>
        <button
          onClick={() => setSoloMovidos(!soloMovidos)}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
        >
          {soloMovidos ? 'Ver todos' : 'Ver solo los que se movieron'}
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-600">
            Ningún insumo se movió más de{' '}
            <span className="font-mono">{UMBRAL_VARIACION}%</span> por cubierto.
          </p>
          <p className="text-xs text-gray-500 mt-1.5">
            {datos.cubiertosPrevios === 0
              ? 'Aunque acá falta la mitad: el período anterior no tiene cubiertos cargados, así que no hay con qué comparar.'
              : 'Es la respuesta que se busca. Con "Ver todos" está el detalle completo.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200">
                {['Insumo', 'Por cubierto', 'Antes', 'Variación', '$ / cubierto', 'Total'].map((h, i) => (
                  <th key={h} className={`text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5 ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => (
                <Fila key={`${i.refId}-${i.nombre}`} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Celda({ rotulo, cifra, pie }: { rotulo: string; cifra: string; pie: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{rotulo}</div>
      <div className="font-mono text-lg font-semibold text-gray-900">{cifra}</div>
      <div className="text-xs text-gray-500 mt-0.5">{pie}</div>
    </div>
  )
}

function Fila({ i }: { i: InsumoPorCubierto }) {
  // Subir el consumo por persona es lo que hay que mirar; bajar casi nunca es
  // un problema, así que no se pinta de verde como si fuera un logro.
  const subio = (i.variacion ?? 0) > 0
  const color = i.variacion === null ? 'text-gray-400' : subio ? 'text-red-700' : 'text-gray-500'

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-3 py-2.5">
        <span className="text-gray-900">{i.nombre}</span>
        <span className="text-xs text-gray-400 ml-1.5">
          {CATEGORIAS_LABEL[i.categoria] || i.categoria}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-gray-900">{fmtCant(i.porCubierto, i.unidad)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-gray-500">
        {i.porCubiertoPrevio !== null ? fmtCant(i.porCubiertoPrevio, i.unidad) : <span className="text-gray-300">—</span>}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono font-medium ${color}`}>
        {i.variacion !== null
          ? `${i.variacion > 0 ? '+' : ''}${i.variacion.toFixed(1)}%`
          : <span className="text-gray-300">sin comparar</span>}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-gray-700">{formatearMonedaAnalisis(i.costoPorCubierto)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatearMonedaAnalisis(i.costo)}</td>
    </tr>
  )
}
