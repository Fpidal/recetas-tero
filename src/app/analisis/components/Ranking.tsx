'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatearMonedaAnalisis } from '@/lib/consumo-queries'
import {
  obtenerRanking,
  obtenerUltimaFechaConCarga,
  armarMatriz,
  seccionesDe,
  MINIMO_PARA_MATRIZ,
  CUADRANTE_LABEL,
  CUADRANTE_AYUDA,
  type RankingPeriodo,
  type ProductoRanking,
  type Cuadrante,
} from '@/lib/ranking-queries'
import { SERVICIO_LABEL, type Servicio } from '@/types/analisis'

/**
 * Ranking de ventas e ingeniería de menú.
 *
 * Dos vistas de lo mismo: la tabla para el detalle, la matriz para la lectura
 * de un vistazo. Los filtros son compartidos porque son la misma pregunta.
 */

type Columna = 'unidades' | 'facturacion' | 'contribucion' | 'costo' | 'foodCost'

const COLOR_CUADRANTE: Record<Cuadrante, { punto: string; texto: string; fondo: string; borde: string }> = {
  estrella:     { punto: 'bg-green-600',  texto: 'text-green-700',  fondo: 'bg-green-50',  borde: 'border-green-200' },
  caballo:      { punto: 'bg-yellow-600', texto: 'text-yellow-700', fondo: 'bg-yellow-50', borde: 'border-yellow-200' },
  rompecabezas: { punto: 'bg-blue-600',   texto: 'text-blue-700',   fondo: 'bg-blue-50',   borde: 'border-blue-200' },
  perro:        { punto: 'bg-red-600',    texto: 'text-red-700',    fondo: 'bg-red-50',    borde: 'border-red-200' },
}

/** Primer y último día del mes de una fecha */
function mesDe(fechaISO: string): { desde: string; hasta: string } {
  const [a, m] = fechaISO.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

function lunesDe(fechaISO: string): { desde: string; hasta: string } {
  const [a, m, d] = fechaISO.split('-').map(Number)
  const f = new Date(a, m - 1, d)
  const diff = f.getDay() === 0 ? 6 : f.getDay() - 1 // lunes a domingo, como el resto del sistema
  const lunes = new Date(a, m - 1, d - diff)
  const domingo = new Date(a, m - 1, d - diff + 6)
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { desde: iso(lunes), hasta: iso(domingo) }
}

interface Props {
  fecha: string
  servicio: Servicio
  setServicio: (s: Servicio) => void
}

export default function Ranking({ fecha, servicio, setServicio }: Props) {
  // Fecha de referencia propia: se arranca de la compartida, pero navegar acá
  // no mueve la de las otras solapas. Mismo criterio que Resumen.
  const [fechaRef, setFechaRef] = useState(fecha)
  const [rango, setRango] = useState<'semana' | 'mes'>('mes')
  const [filtrarServicio, setFiltrarServicio] = useState(false)
  const [datos, setDatos] = useState<RankingPeriodo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ultimaCarga, setUltimaCarga] = useState<string | null>(null)
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null)
  const [orden, setOrden] = useState<Columna>('unidades')

  const periodo = useMemo(
    () => (rango === 'mes' ? mesDe(fechaRef) : lunesDe(fechaRef)),
    [rango, fechaRef]
  )

  /** Mueve la referencia un mes o una semana, segun el rango elegido */
  function mover(pasos: number) {
    const [a, m, d] = fechaRef.split('-').map(Number)
    const f = rango === 'mes'
      ? new Date(a, m - 1 + pasos, 1)
      : new Date(a, m - 1, d + pasos * 7)
    setFechaRef(
      `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
    )
  }

  const esPeriodoActual = useMemo(() => {
    const hoy = new Date()
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    return periodo.desde <= hoyISO && hoyISO <= periodo.hasta
  }, [periodo])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    obtenerRanking(periodo.desde, periodo.hasta, filtrarServicio ? servicio : undefined)
      .then((r) => { if (vivo) { setDatos(r); setCargando(false) } })
      .catch((e) => {
        console.error('Error cargando ranking:', e)
        // Un error NO es lo mismo que un período sin datos. Mostrarlo como
        // "no hay consumo" manda a buscar el problema al lugar equivocado.
        if (vivo) { setError(e?.message || String(e)); setDatos(null); setCargando(false) }
      })
    return () => { vivo = false }
  }, [periodo.desde, periodo.hasta, filtrarServicio, servicio])

  // Cuando el período elegido está vacío, el dato útil es dónde sí hay carga.
  useEffect(() => {
    if (cargando || error || (datos && datos.productos.length > 0)) return
    obtenerUltimaFechaConCarga()
      .then(setUltimaCarga)
      .catch(() => setUltimaCarga(null))
  }, [cargando, error, datos])

  const secciones = useMemo(() => (datos ? seccionesDe(datos.productos) : []), [datos])

  useEffect(() => {
    if (secciones.length > 0 && (!seccionActiva || !secciones.includes(seccionActiva))) {
      setSeccionActiva(secciones[0])
    }
  }, [secciones, seccionActiva])

  const matriz = useMemo(
    () => (datos && seccionActiva ? armarMatriz(datos.productos, seccionActiva) : null),
    [datos, seccionActiva]
  )

  const totales = useMemo(() => {
    if (!datos) return null
    const p = datos.productos
    return {
      unidades: p.reduce((s, x) => s + x.unidades, 0),
      facturacion: p.reduce((s, x) => s + (x.facturacion ?? 0), 0),
      contribucion: p.reduce((s, x) => s + (x.contribucion ?? 0), 0),
      sinPrecio: p.filter((x) => x.precio === null).length,
    }
  }, [datos])

  const sinDatos = !cargando && !error && (!datos || datos.productos.length === 0)

  // Los filtros se renderizan SIEMPRE, en el mismo lugar del árbol. Antes se
  // desmontaban durante la carga y al no haber datos, y daba la sensación de
  // que los botones no respondían.
  const filtros = (
    <Filtros {...{ rango, setRango, filtrarServicio, setFiltrarServicio, servicio, setServicio, periodo, mover, esPeriodoActual }} />
  )

  if (cargando || error || sinDatos) {
    return (
      <div className="space-y-4">
        {filtros}
        {cargando && (
          <div className="text-sm text-gray-500 py-12 text-center">Cargando…</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">No se pudo calcular el ranking</p>
            <p className="text-xs text-red-700 font-mono break-words">{error}</p>
            <p className="text-xs text-gray-600 mt-2">
              Si dice que falta la columna <span className="font-mono">cubiertos</span>, quedó sin
              correr el SQL de <span className="font-mono">supabase-menus-cubiertos.sql</span>.
            </p>
          </div>
        )}
        {sinDatos && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-600">
              No hay consumo cargado entre el{' '}
              <span className="font-mono">{periodo.desde.split('-').reverse().slice(0, 2).join('/')}</span>{' '}
              y el{' '}
              <span className="font-mono">{periodo.hasta.split('-').reverse().slice(0, 2).join('/')}</span>
              {filtrarServicio && <> para <span className="font-medium">{SERVICIO_LABEL[servicio]}</span></>}.
            </p>
            {ultimaCarga && (
              <p className="text-sm text-gray-500 mt-2">
                El último día con carga es el{' '}
                <span className="font-mono font-medium text-gray-700">
                  {ultimaCarga.split('-').reverse().join('/')}
                </span>.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // Redundante para el runtime -el bloque de arriba ya cubre el caso- pero
  // TypeScript no puede estrechar `datos` a través de esa condición compuesta.
  if (!datos || !totales) return null

  const fcGlobal =
    totales.facturacion > 0
      ? ((totales.facturacion - totales.contribucion) / totales.facturacion) * 100
      : null

  return (
    <div className="space-y-6">
      {filtros}

      {/* Resumen del período */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        <Celda rotulo="Muestreo" cifra={`${datos.diasConCarga}`} pie="días con carga" />
        <Celda rotulo="Unidades" cifra={totales.unidades.toLocaleString('es-AR')} pie={`${datos.productos.length} productos`} />
        <Celda
          rotulo="Facturación"
          cifra={formatearMonedaAnalisis(totales.facturacion)}
          pie={datos.preciosSonDeHoy ? 'a precio de carta' : 'a precio de HOY'}
        />
        <Celda rotulo="Costo" cifra={formatearMonedaAnalisis(datos.costoProductos)} pie="congelado al cargar" />
        <Celda
          rotulo="Contribución"
          cifra={formatearMonedaAnalisis(totales.contribucion)}
          pie={fcGlobal !== null ? `food cost ${fcGlobal.toFixed(1)}%` : '—'}
        />
      </div>

      {/* Cobertura: qué parte del costo llega hasta acá */}
      <div className="bg-slate-50 border border-gray-200 border-l-[3px] border-l-slate-500 rounded-lg px-4 py-3">
        <p className="text-sm text-gray-700">
          Estos productos cubren el{' '}
          <span className="font-mono font-semibold">{(datos.cobertura * 100).toFixed(1)}%</span>{' '}
          del costo del período. El resto —
          <span className="font-mono">{formatearMonedaAnalisis(datos.costoTotal - datos.costoProductos)}</span>{' '}
          en insumos y elaboraciones cargados sueltos— no tiene un producto de carta al que atribuirse.
        </p>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2 max-w-xs">
          <div className="h-full bg-slate-500" style={{ width: `${datos.cobertura * 100}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          En el mediodía esa diferencia es el menú ejecutivo, que se carga por insumo. Lo que queda
          en el ranking es el consumo de carta.
        </p>
      </div>

      {/* Aviso de precios viejos */}
      {!datos.preciosSonDeHoy && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-gray-700">
          <span className="font-semibold text-amber-800">Las unidades son del período; los precios son de hoy.</span>{' '}
          El costo quedó congelado al cargar, pero el precio sale de la carta actual. Para un período
          pasado eso mezcla dos momentos y el food cost sale más bajo de lo que fue.{' '}
          <span className="font-medium">Las unidades sí son exactas</span> — es el dato que no caduca.
        </div>
      )}

      {/* Productos sin precio */}
      {totales.sinPrecio > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600">
          <span className="font-mono font-semibold">{totales.sinPrecio}</span>{' '}
          {totales.sinPrecio === 1 ? 'producto no tiene precio' : 'productos no tienen precio'} de carta
          cargado. Aparecen con unidades y costo, pero sin facturación ni cuadrante.
        </div>
      )}

      {/* ---- Matriz ---- */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Ingeniería de menú</h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-4 max-w-2xl">
          Una matriz por sección. Las entradas y los postres son porciones más chicas y dejan menos
          en pesos: comparadas contra los principales caerían todas del lado malo por construcción.
        </p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {secciones.map((s) => (
            <button
              key={s}
              onClick={() => setSeccionActiva(s)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                s === seccionActiva
                  ? 'bg-white border-gray-300 text-gray-900 font-semibold'
                  : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {matriz && matriz.items.length < MINIMO_PARA_MATRIZ ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
            <span className="font-medium">{seccionActiva}</span> tiene solo{' '}
            <span className="font-mono">{matriz.items.length}</span>{' '}
            {matriz.items.length === 1 ? 'producto' : 'productos'} con ventas en el período. Con
            menos de <span className="font-mono">{MINIMO_PARA_MATRIZ}</span> los cuadrantes no
            discriminan nada —cualquiera cae en cualquier lado— así que va la tabla de abajo y no
            la matriz.
          </div>
        ) : matriz ? (
          <>
            <Matriz matriz={matriz} />
            <div className="mt-5">
              <LeyendaCuadrantes />
            </div>
          </>
        ) : null}
      </div>

      {/* ---- Tabla ---- */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Detalle</h2>
        <Tabla productos={datos.productos} secciones={secciones} orden={orden} setOrden={setOrden} />
      </div>
    </div>
  )
}

// =====================================================

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "2026-08-01" + "2026-08-31" -> "Agosto 2026"  |  "17/08 – 23/08" */
function rotuloPeriodo(rango: 'semana' | 'mes', desde: string, hasta: string): string {
  if (rango === 'mes') {
    const [a, m] = desde.split('-').map(Number)
    return `${MESES[m - 1]} ${a}`
  }
  const dm = (f: string) => f.split('-').reverse().slice(0, 2).join('/')
  return `${dm(desde)} – ${dm(hasta)}`
}

function Filtros({
  rango, setRango, filtrarServicio, setFiltrarServicio, servicio, setServicio,
  periodo, mover, esPeriodoActual,
}: any) {
  return (
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

      {/* Navegación del período. Sin esto solo se veía el mes en curso. */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => mover(-1)}
          aria-label={rango === 'mes' ? 'Mes anterior' : 'Semana anterior'}
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-gray-900 min-w-[150px] text-center">
          {rotuloPeriodo(rango, periodo.desde, periodo.hasta)}
        </span>
        <button
          onClick={() => mover(1)}
          disabled={esPeriodoActual}
          aria-label={rango === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {rango === 'semana' && (
        <span className="text-xs text-gray-400">lunes a domingo</span>
      )}

      <div className="flex-1" />

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={filtrarServicio}
          onChange={(e) => setFiltrarServicio(e.target.checked)}
          className="rounded border-gray-300"
        />
        Solo un servicio
      </label>
      {filtrarServicio && (
        <select
          value={servicio}
          onChange={(e) => setServicio(e.target.value as Servicio)}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
        >
          {(['mediodia', 'noche', 'eventos'] as Servicio[]).map((s) => (
            <option key={s} value={s}>{SERVICIO_LABEL[s]}</option>
          ))}
        </select>
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

function Matriz({ matriz }: { matriz: ReturnType<typeof armarMatriz> }) {
  const conDatos = matriz.items.filter((i) => i.contribucionUnitaria !== null)
  if (conDatos.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
        Ningún producto de esta sección tiene precio de carta cargado, así que no hay eje de
        contribución para dibujar.
      </div>
    )
  }

  const cus = conDatos.map((i) => i.contribucionUnitaria!)
  const parts = matriz.items.map((i) => i.participacion)
  const minX = Math.min(...cus, matriz.umbralContribucion) * 0.82
  const maxX = Math.max(...cus, matriz.umbralContribucion) * 1.12
  const maxY = Math.max(...parts, matriz.umbralPopularidad) * 1.16

  const px = (v: number) => ((v - minX) / (maxX - minX || 1)) * 100
  const py = (v: number) => (v / (maxY || 1)) * 100
  const cx = px(matriz.umbralContribucion)
  const cy = py(matriz.umbralPopularidad)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
      <div className="bg-white border border-gray-200 rounded-lg p-4 pt-6 pb-9 pl-12 relative">
        <div className="relative w-full" style={{ aspectRatio: '1 / 0.8' }}>
          {/* Cuadrantes: arriba = se vende más, derecha = deja más */}
          <div className="absolute bg-green-50"  style={{ left: `${cx}%`, bottom: `${cy}%`, width: `${100 - cx}%`, height: `${100 - cy}%` }} />
          <div className="absolute bg-yellow-50" style={{ left: 0, bottom: `${cy}%`, width: `${cx}%`, height: `${100 - cy}%` }} />
          <div className="absolute bg-blue-50"   style={{ left: `${cx}%`, bottom: 0, width: `${100 - cx}%`, height: `${cy}%` }} />
          <div className="absolute bg-red-50"    style={{ left: 0, bottom: 0, width: `${cx}%`, height: `${cy}%` }} />

          <span className="absolute text-[10px] uppercase tracking-wider font-semibold text-green-700/70"  style={{ right: 6, top: 4 }}>Estrella</span>
          <span className="absolute text-[10px] uppercase tracking-wider font-semibold text-yellow-700/70" style={{ left: 6, top: 4 }}>Caballo</span>
          <span className="absolute text-[10px] uppercase tracking-wider font-semibold text-blue-700/70"   style={{ right: 6, bottom: 4 }}>Rompecabezas</span>
          <span className="absolute text-[10px] uppercase tracking-wider font-semibold text-red-700/70"    style={{ left: 6, bottom: 4 }}>Perro</span>

          <div className="absolute bg-gray-300 w-px top-0 bottom-0" style={{ left: `${cx}%` }} />
          <div className="absolute bg-gray-300 h-px left-0 right-0" style={{ bottom: `${cy}%` }} />

          {matriz.items.map((i, idx) =>
            i.contribucionUnitaria === null ? null : (
              <div
                key={i.clave}
                title={`${i.nombre} — ${i.participacion.toFixed(1)}% de los cubiertos, ${formatearMonedaAnalisis(i.contribucionUnitaria)} por cubierto`}
                className={`absolute w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center text-[9px] font-mono font-bold text-white ${COLOR_CUADRANTE[i.cuadrante].punto}`}
                style={{
                  left: `${px(i.contribucionUnitaria)}%`,
                  bottom: `${py(i.participacion)}%`,
                  transform: 'translate(-50%, 50%)',
                }}
              >
                {idx + 1}
              </div>
            )
          )}
        </div>
        <span className="absolute text-[10px] uppercase tracking-wider text-gray-400 bottom-3 left-1/2 -translate-x-1/2">
          Contribución por cubierto →
        </span>
        <span
          className="absolute text-[10px] uppercase tracking-wider text-gray-400 left-3 top-1/2"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg) translateY(50%)' }}
        >
          Participación →
        </span>
      </div>

      <div>
        <ul className="space-y-2">
          {matriz.items.map((i, idx) => (
            <li key={i.clave} className="flex items-start gap-2.5 text-sm">
              <span className={`flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-mono font-bold text-white mt-0.5 ${
                i.contribucionUnitaria === null ? 'bg-gray-300' : COLOR_CUADRANTE[i.cuadrante].punto
              }`}>
                {idx + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-gray-900 block truncate">{i.nombre}</span>
                <span className={`text-xs font-medium ${
                  i.contribucionUnitaria === null ? 'text-gray-400' : COLOR_CUADRANTE[i.cuadrante].texto
                }`}>
                  {i.contribucionUnitaria === null ? 'Sin precio' : CUADRANTE_LABEL[i.cuadrante]}
                </span>
              </span>
              <span className="font-mono text-xs text-gray-500 whitespace-nowrap text-right">
                {i.cubiertosServidos.toLocaleString('es-AR')} cub
                {i.cubiertos !== 1 && <span className="text-gray-400"> ({i.unidades}×{i.cubiertos})</span>}
                <br />
                {i.contribucionUnitaria !== null ? `${formatearMonedaAnalisis(i.contribucionUnitaria)}/cub` : '—'}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-dashed border-gray-200">
          Umbrales de <span className="font-medium text-gray-700">{matriz.seccion}</span> —
          popularidad <span className="font-mono">{matriz.umbralPopularidad.toFixed(1)}%</span> de
          los cubiertos (70% del promedio de {matriz.items.length} productos), contribución{' '}
          <span className="font-mono">{formatearMonedaAnalisis(matriz.umbralContribucion)}</span> por
          cubierto (promedio ponderado de la sección).
        </p>
      </div>
    </div>
  )
}

function Tabla({
  productos, secciones, orden, setOrden,
}: {
  productos: ProductoRanking[]
  secciones: string[]
  orden: Columna
  setOrden: (c: Columna) => void
}) {
  const valor = (p: ProductoRanking, c: Columna): number => {
    switch (c) {
      case 'unidades': return p.unidades
      case 'facturacion': return p.facturacion ?? -1
      case 'contribucion': return p.contribucion ?? -1
      case 'costo': return p.costo
      case 'foodCost': return p.foodCost ?? 999
    }
  }

  const COLS: { key: Columna; label: string }[] = [
    { key: 'unidades', label: 'Unid.' },
    { key: 'costo', label: 'Costo' },
    { key: 'facturacion', label: 'Facturación' },
    { key: 'contribucion', label: 'Contribución' },
    { key: 'foodCost', label: 'F.C.' },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">
              Producto
            </th>
            <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5">
              Precio
            </th>
            {COLS.map((c) => (
              <th key={c.key} className="text-right px-3 py-2.5">
                <button
                  onClick={() => setOrden(c.key)}
                  className={`text-[10px] uppercase tracking-wider font-medium hover:text-gray-700 ${
                    orden === c.key ? 'text-gray-900 underline underline-offset-4' : 'text-gray-400'
                  }`}
                >
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secciones.map((s) => {
            const items = productos
              .filter((p) => p.seccion === s)
              .sort((a, b) => valor(b, orden) - valor(a, orden))
            return (
              <Fragment key={s}>
                <tr>
                  <td colSpan={7} className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-3 py-1.5">
                    {s}
                  </td>
                </tr>
                {items.map((p) => (
                  <tr key={p.clave} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-900">
                      {p.nombre}
                      {p.cubiertos !== 1 && (
                        <span className="text-xs text-gray-400 font-mono ml-1.5">
                          ({p.cubiertos} cub.)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                      {p.precio !== null ? formatearMonedaAnalisis(p.precio) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-900">{p.unidades.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{formatearMonedaAnalisis(p.costo)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                      {p.facturacion !== null ? formatearMonedaAnalisis(p.facturacion) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium text-gray-900">
                      {p.contribucion !== null ? formatearMonedaAnalisis(p.contribucion) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                      {p.foodCost !== null ? `${p.foodCost.toFixed(1)}%` : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Qué hacer con cada cuadrante. Va debajo de la matriz. */
function LeyendaCuadrantes() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {(Object.keys(CUADRANTE_LABEL) as Cuadrante[]).map((c) => (
        <div key={c} className={`bg-white border border-gray-200 border-l-[3px] rounded-lg px-3 py-2.5 ${COLOR_CUADRANTE[c].borde}`}>
          <div className={`text-sm font-semibold mb-0.5 ${COLOR_CUADRANTE[c].texto}`}>
            {CUADRANTE_LABEL[c]}
          </div>
          <div className="text-xs text-gray-500 leading-snug">{CUADRANTE_AYUDA[c]}</div>
        </div>
      ))}
    </div>
  )
}
