'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FileDown, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import {
  obtenerCierreMes,
  obtenerAnalisisCierre,
  corteDelMesEnCurso,
  variacion,
  nombreMes,
  diaMes,
  type CierreMes as CierreMesData,
} from '@/lib/cierre-mes-queries'
import { formatearMoneda } from '@/lib/formato-numeros'
import { generarPDFCierreMes } from '@/lib/generar-pdf-cierre-mes'
import { SERVICIO_LABEL, CATEGORIAS_LABEL } from '@/types/analisis'
import { PALETA } from '@/lib/colores'
import { useObjetivos, estadoContraObjetivo } from '@/lib/empresa'

const fmt = (v: number) => formatearMoneda(v, true, 0)
/** Porcentaje con coma decimal: 25,1 */
const pct = (v: number, decimales = 1) => v.toFixed(decimales).replace('.', ',')

/** Lista de meses para el selector: los últimos 24, del más reciente al más viejo. */
function mesesDisponibles(): string[] {
  const hoy = new Date()
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export default function CierreMes() {
  const meses = useMemo(mesesDisponibles, [])
  const [mes, setMes] = useState(meses[0])
  const [data, setData] = useState<CierreMesData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  // Las secciones de análisis cargan aparte: son más consultas y no tienen
  // por qué demorar los indicadores
  const [analisis, setAnalisis] = useState<Partial<CierreMesData> | null>(null)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setError(null)
    // El mes en curso se compara contra el anterior cortado el mismo día, como
    // en el Dashboard: octubre al 21 contra septiembre entero daba compras −28%
    // sólo porque al mes le faltaban diez días
    const hastaDia = mes === meses[0] ? corteDelMesEnCurso() : undefined
    obtenerCierreMes(mes, hastaDia)
      .then((d) => { if (!cancelado) setData({ ...d, hastaDia }) })
      .catch((e) => {
        console.error('Error cargando cierre de mes:', e)
        if (!cancelado) setError(e?.message || 'No se pudo cargar el cierre del mes')
      })
      .finally(() => { if (!cancelado) setCargando(false) })
    setAnalisis(null)
    setErrorAnalisis(null)
    obtenerAnalisisCierre(mes, hastaDia)
      .then((a) => { if (!cancelado) setAnalisis(a) })
      .catch((e) => {
        console.error('Error cargando el análisis del cierre:', e)
        if (!cancelado) setErrorAnalisis(e?.message || 'No se pudo cargar el análisis del mes')
      })
    return () => { cancelado = true }
  }, [mes, meses])

  async function handlePDF() {
    if (!data) return
    try {
      setGenerandoPDF(true)
      await generarPDFCierreMes({ ...data, ...(analisis || {}) })
    } catch (e) {
      console.error('Error generando PDF:', e)
      alert('Error al generar el PDF')
    } finally {
      setGenerandoPDF(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Selector de mes + PDF */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="w-full sm:w-64">
            <label className="block text-xs font-medium text-gray-700 mb-1">Mes</label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              {meses.map((m) => (
                <option key={m} value={m}>{nombreMes(`${m}-01`)}</option>
              ))}
            </select>
            {data && (
              <p className="text-[11px] text-gray-500 mt-1">
                Comparado contra {nombreMes(data.mesPrevio)}
                {data.hastaDia ? `, los dos hasta el día ${data.hastaDia}` : ''}
              </p>
            )}
          </div>

          <button
            onClick={handlePDF}
            disabled={!data || cargando || generandoPDF || (!analisis && !errorAnalisis)}
            className="flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            {generandoPDF ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {error ? (
        <Aviso tono="error">
          {error.includes('cierre_mes')
            ? 'Falta crear la función cierre_mes() en la base. Está en supabase-cierre-mes.sql.'
            : error}
        </Aviso>
      ) : cargando || !data ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          Cargando...
        </div>
      ) : (
        <>
          <Indicadores data={data} />
          {errorAnalisis ? (
            <Aviso tono="error">{errorAnalisis}</Aviso>
          ) : !analisis ? (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
              Cargando proveedores, servicios y precios...
            </div>
          ) : (
            <>
              <ProveedoresDelMes data={{ ...data, ...analisis }} />
              <RestauranteYEventos data={{ ...data, ...analisis }} />
              <IncidenciaPorServicio data={{ ...data, ...analisis }} />
              <TuInflacion data={{ ...data, ...analisis }} />
            </>
          )}
          <ComprasPorRubro data={data} />
          <ComprasSemanales data={data} />
          <TopInsumos data={data} />
        </>
      )}
    </div>
  )
}

// =====================================================
// 1 · INDICADORES
// =====================================================

function Indicadores({ data }: { data: CierreMesData }) {
  const inc = data.incidencia
  const incPrev = data.incidenciaPrevia

  const tarjetas = [
    { label: 'Compras', valor: fmt(data.compras.mes), variacion: variacion(data.compras.mes, data.compras.previo), invertido: true },
    { label: 'Ventas', valor: fmt(data.ventas.mes), variacion: variacion(data.ventas.mes, data.ventas.previo) },
    {
      label: 'Incidencia real',
      valor: inc.diasConCarga > 0 ? `${pct(inc.incidencia)}%` : '—',
      variacion: inc.diasConCarga > 0 && incPrev.diasConCarga > 0
        ? inc.incidencia - incPrev.incidencia
        : null,
      // La incidencia se compara en puntos, no en porcentaje de porcentaje
      unidadVariacion: ' pts',
      invertido: true,
      nota: inc.diasConCarga > 0
        ? `muestreo: ${inc.diasConCarga} de ${inc.diasConVenta} servicios`
        : 'sin consumo cargado',
    },
    { label: 'Cubiertos', valor: data.ventas.cubiertos.toLocaleString('es-AR'), variacion: variacion(data.ventas.cubiertos, data.ventas.cubiertosPrevio) },
    { label: 'Ticket promedio', valor: inc.ticketPromedio > 0 ? fmt(inc.ticketPromedio) : '—', variacion: variacion(inc.ticketPromedio, incPrev.ticketPromedio) },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {tarjetas.map((t) => (
        <div key={t.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">{t.label}</div>
          <div className="text-lg font-bold text-gray-900 mt-1 font-mono break-all">{t.valor}</div>
          <Variacion valor={t.variacion} invertido={t.invertido} unidad={t.unidadVariacion} />
          {t.nota && <div className="text-[10px] text-gray-400 mt-0.5">{t.nota}</div>}
        </div>
      ))}
    </div>
  )
}

/**
 * `invertido` = subir es malo (compras, incidencia). Sin eso, un mes con 20%
 * más de costo se pintaría de verde.
 */
function Variacion({ valor, invertido, unidad = '%' }: { valor: number | null; invertido?: boolean; unidad?: string }) {
  if (valor === null || !isFinite(valor)) {
    return <div className="text-[11px] text-gray-400 mt-0.5">sin comparación</div>
  }
  const sube = valor > 0.05
  const baja = valor < -0.05
  const malo = invertido ? sube : baja
  const bueno = invertido ? baja : sube
  const color = malo ? 'text-red-600' : bueno ? 'text-green-600' : 'text-gray-400'
  const Icon = sube ? TrendingUp : baja ? TrendingDown : Minus

  return (
    <div className={`flex items-center gap-1 text-[11px] mt-0.5 font-mono ${color}`}>
      <Icon className="w-3 h-3" />
      {valor > 0 ? '+' : ''}{pct(valor)}{unidad}
    </div>
  )
}

// =====================================================
// 2 · COMPRAS POR RUBRO
// =====================================================

function ComprasPorRubro({ data }: { data: CierreMesData }) {
  const total = data.compras.mes
  if (data.rubros.length === 0) {
    return <Bloque titulo="Compras por rubro"><Aviso>No hay compras cargadas en este mes.</Aviso></Bloque>
  }

  return (
    <Bloque
      titulo="Compras por rubro"
      nota="Agrupado por la categoría del insumo, no la del proveedor. Los montos incluyen el descuento del proveedor y las percepciones, prorrateados por factura, para que los rubros sumen exactamente el total del mes."
    >
      <Tabla
        cabeceras={['Rubro', 'Mes', 'Mes anterior', 'Var.', '% del total']}
        alineacion={['left', 'right', 'right', 'right', 'right']}
      >
        {data.rubros.map((r) => {
          const v = variacion(r.monto, r.monto_previo)
          return (
            <tr key={r.rubro} className="hover:bg-gray-50">
              <td className="py-2 px-3 text-gray-900">{CATEGORIAS_LABEL[r.rubro] || r.rubro}</td>
              <td className="py-2 px-3 text-right font-mono font-medium">{fmt(r.monto)}</td>
              <td className="py-2 px-3 text-right font-mono text-gray-500">{fmt(r.monto_previo)}</td>
              <td className="py-2 px-3 text-right font-mono">
                <TextoVariacion valor={v} invertido />
              </td>
              <td className="py-2 px-3 text-right font-mono text-gray-600">
                {total > 0 ? `${pct(((r.monto / total) * 100))}%` : '—'}
              </td>
            </tr>
          )
        })}
      </Tabla>
      <PieTotal etiqueta="Total compras" valor={fmt(total)} />
    </Bloque>
  )
}

// =====================================================
// 3 · COMPRAS SEMANALES
// =====================================================

function ComprasSemanales({ data }: { data: CierreMesData }) {
  if (data.semanas.length === 0) {
    return <Bloque titulo="Compras semanales"><Aviso>No hay compras cargadas en este mes.</Aviso></Bloque>
  }

  const total = data.compras.mes
  const filas = data.semanas.map((s, i) => {
    const previa = i > 0 ? data.semanas[i - 1].monto : null
    return {
      ...s,
      etiqueta: `${diaMes(s.desde)} — ${diaMes(s.hasta)}`,
      variacion: previa !== null ? variacion(s.monto, previa) : null,
      porcentaje: total > 0 ? (s.monto / total) * 100 : 0,
    }
  })

  return (
    <Bloque
      titulo="Compras semanales del mes"
      nota="Las semanas se agrupan de lunes a domingo, pero solo se cuentan los días que caen dentro del mes. Por eso la primera y la última pueden estar cortadas, y por eso la suma de las semanas da igual al total mensual."
    >
      <Tabla
        cabeceras={['Semana', 'Monto', 'Var. s/anterior', '% del mes']}
        alineacion={['left', 'right', 'right', 'right']}
      >
        {filas.map((f) => (
          <tr key={f.desde} className="hover:bg-gray-50">
            <td className="py-2 px-3 text-gray-900">
              <span className="font-mono">{f.etiqueta}</span>
              {f.cortada && (
                <span className="text-[11px] text-gray-400 ml-2">
                  · {f.dias_en_mes} {f.dias_en_mes === 1 ? 'día' : 'días'} en el mes
                </span>
              )}
            </td>
            <td className="py-2 px-3 text-right font-mono font-medium">{fmt(f.monto)}</td>
            <td className="py-2 px-3 text-right font-mono">
              <TextoVariacion valor={f.variacion} invertido />
            </td>
            <td className="py-2 px-3 text-right font-mono text-gray-600">{pct(f.porcentaje)}%</td>
          </tr>
        ))}
      </Tabla>

      <div className="h-56 px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filas} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: any) => fmt(Number(v))} labelStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="monto" stroke={PALETA.terracotta} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <PieTotal etiqueta="Total del mes" valor={fmt(total)} />
    </Bloque>
  )
}

// =====================================================
// 4 · TOP 10 INSUMOS
// =====================================================

function TopInsumos({ data }: { data: CierreMesData }) {
  if (data.topInsumos.length === 0) {
    return <Bloque titulo="Top 10 insumos por gasto"><Aviso>No hay compras cargadas en este mes.</Aviso></Bloque>
  }
  const total = data.compras.mes

  return (
    <Bloque
      titulo="Top 10 insumos por gasto del mes"
      nota="La variación de precio compara el primer precio del mes contra el último. Si el insumo se compró una sola vez, no hay con qué compararlo."
    >
      <Tabla
        cabeceras={['Insumo', 'Rubro', 'Monto', '% compras', 'Var. precio']}
        alineacion={['left', 'left', 'right', 'right', 'right']}
      >
        {data.topInsumos.map((t) => (
          <tr key={t.insumo_id} className="hover:bg-gray-50">
            <td className="py-2 px-3 text-gray-900">{t.nombre}</td>
            <td className="py-2 px-3 text-gray-500 text-xs">{CATEGORIAS_LABEL[t.rubro] || t.rubro}</td>
            <td className="py-2 px-3 text-right font-mono font-medium">{fmt(t.monto)}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-600">
              {total > 0 ? `${pct(((t.monto / total) * 100))}%` : '—'}
            </td>
            <td className="py-2 px-3 text-right font-mono">
              <TextoVariacion valor={t.variacion_precio} invertido />
            </td>
          </tr>
        ))}
      </Tabla>
    </Bloque>
  )
}

// =====================================================
// 5 · LOS 10 PROVEEDORES DEL MES (V.66)
// =====================================================

function ProveedoresDelMes({ data }: { data: CierreMesData }) {
  const top = data.proveedores || []
  if (top.length === 0) {
    return <Bloque titulo="Los 10 proveedores del mes"><Aviso>No hay compras cargadas en este mes.</Aviso></Bloque>
  }
  const total = data.compras.mes
  const sumaTop = top.reduce((t, p) => t + p.monto, 0)
  const salieron = data.proveedoresSalieron || []

  return (
    <Bloque
      titulo="Los 10 proveedores del mes"
      nota={`Con IVA y percepciones, neto de notas de crédito, igual que el total de compras. Se compara contra ${nombreMes(data.mesPrevio)}; el puesto es el que tenía cada proveedor ese mes.`}
    >
      <Tabla
        cabeceras={['#', 'Proveedor', 'Mes', '% compras', 'Mes anterior', 'Var.', 'Puesto']}
        alineacion={['right', 'left', 'right', 'right', 'right', 'right', 'right']}
      >
        {top.map((p) => (
          <tr key={p.nombre} className="hover:bg-gray-50">
            <td className="py-2 px-3 text-right font-mono text-gray-400">{p.puesto}</td>
            <td className="py-2 px-3 text-gray-900">{p.nombre}</td>
            <td className="py-2 px-3 text-right font-mono font-medium">{fmt(p.monto)}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-600">{total > 0 ? `${pct(p.monto / total * 100)}%` : '—'}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-500">{p.montoPrevio > 0 ? fmt(p.montoPrevio) : '—'}</td>
            <td className="py-2 px-3 text-right font-mono">
              <TextoVariacion valor={p.montoPrevio > 0 ? variacion(p.monto, p.montoPrevio) : null} invertido />
            </td>
            <td className="py-2 px-3 text-right"><Puesto actual={p.puesto} previo={p.puestoPrevio} /></td>
          </tr>
        ))}
      </Tabla>
      <PieTotal etiqueta={`Los 10 primeros · ${total > 0 ? pct(sumaTop / total * 100) : '—'}% de las compras`} valor={fmt(sumaTop)} />
      {salieron.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Salieron del top 10: </span>
          {salieron.map((p, i) => (
            <span key={p.nombre}>
              {i > 0 && ' · '}
              {p.nombre} <span className="text-gray-400">({p.puestoPrevio}° el mes anterior, {p.monto > 0 ? `hoy ${p.puesto}°` : 'sin compras'})</span>
            </span>
          ))}
        </div>
      )}
    </Bloque>
  )
}

function Puesto({ actual, previo }: { actual: number | null; previo: number | null }) {
  if (previo === null) {
    return <span className="text-[11px] font-semibold text-terracotta bg-terracotta-bg px-1.5 py-0.5 rounded">nuevo</span>
  }
  if (actual === null || actual === previo) return <span className="text-gray-300 font-mono text-xs">=</span>
  const sube = actual < previo
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${sube ? 'text-green-600' : 'text-red-600'}`}>
      {sube ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(previo - actual)}
    </span>
  )
}

// =====================================================
// 6 · RESTAURANTE Y EVENTOS (V.66, reemplaza a "Ventas por servicio")
// =====================================================

function RestauranteYEventos({ data }: { data: CierreMesData }) {
  if (data.faltaVentas) {
    return (
      <Bloque titulo="Restaurante y eventos">
        <Aviso tono="atencion">
          No hay ventas cargadas en {nombreMes(data.mes)}. Cargalas en la sección{' '}
          <strong>Ventas</strong> para ver este bloque y la incidencia real.
        </Aviso>
      </Bloque>
    )
  }

  type Par = { venta: number; cubiertos: number }
  const de = (lista: CierreMesData['ventasPorServicio'] | undefined, s: string): Par =>
    lista?.find((v) => v.servicio === s) || { venta: 0, cubiertos: 0 }
  const suma = (a: Par, b: Par): Par => ({ venta: a.venta + b.venta, cubiertos: a.cubiertos + b.cubiertos })
  const prev = data.ventasPorServicioPrevio
  const med = de(data.ventasPorServicio, 'mediodia')
  const noc = de(data.ventasPorServicio, 'noche')
  const eve = de(data.ventasPorServicio, 'eventos')
  const rest = suma(med, noc)
  const filas: { nombre: string; actual: Par; previo: Par | null; destacada?: boolean }[] = [
    { nombre: SERVICIO_LABEL.mediodia, actual: med, previo: prev ? de(prev, 'mediodia') : null },
    { nombre: SERVICIO_LABEL.noche, actual: noc, previo: prev ? de(prev, 'noche') : null },
    { nombre: 'Restaurante', actual: rest, previo: prev ? suma(de(prev, 'mediodia'), de(prev, 'noche')) : null, destacada: true },
    { nombre: SERVICIO_LABEL.eventos, actual: eve, previo: prev ? de(prev, 'eventos') : null, destacada: true },
  ]
  const total = data.ventas.mes
  const compras = data.compras.mes
  const nota =
    total > 0
      ? eve.venta > 0 && rest.venta > 0
        ? `Compras sobre venta: ${pct(compras / total * 100)}% de la venta total y ${pct(compras / rest.venta * 100)}% de la del restaurante. Ninguno es el real: las facturas no dicen si la compra fue para el salón o para un evento.`
        : `Compras sobre venta: ${pct(compras / total * 100)}%. Sin eventos en el mes, es todo del restaurante.`
      : undefined

  return (
    <Bloque titulo="Restaurante y eventos" nota={nota}>
      {total > 0 && (
        <div className="px-4 pt-4">
          <div className="flex h-6 rounded overflow-hidden text-[11px] font-semibold text-white">
            {rest.venta > 0 && (
              <div className="bg-forest flex items-center px-2 whitespace-nowrap" style={{ width: `${(rest.venta / total) * 100}%` }}>
                Restaurante {pct(rest.venta / total * 100, 0)}%
              </div>
            )}
            {eve.venta > 0 && (
              <div className="bg-terracotta flex items-center px-2 whitespace-nowrap" style={{ width: `${(eve.venta / total) * 100}%` }}>
                Eventos {pct(eve.venta / total * 100, 0)}%
              </div>
            )}
          </div>
        </div>
      )}
      <Tabla
        cabeceras={['', 'Venta', '% venta', 'Cubiertos', 'Ticket', 'Mes anterior', 'Var.']}
        alineacion={['left', 'right', 'right', 'right', 'right', 'right', 'right']}
      >
        {filas.map((f) => (
          <tr key={f.nombre} className="hover:bg-gray-50">
            <td className={`py-2 px-3 ${f.destacada ? 'font-semibold text-gray-900' : 'pl-6 text-gray-500'}`}>{f.nombre}</td>
            <td className="py-2 px-3 text-right font-mono font-medium">{fmt(f.actual.venta)}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-600">{total > 0 ? `${pct(f.actual.venta / total * 100)}%` : '—'}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-600">{f.actual.cubiertos.toLocaleString('es-AR')}</td>
            <td className="py-2 px-3 text-right font-mono">{f.actual.cubiertos > 0 ? fmt(f.actual.venta / f.actual.cubiertos) : '—'}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-500">{f.previo && f.previo.venta > 0 ? fmt(f.previo.venta) : '—'}</td>
            <td className="py-2 px-3 text-right font-mono">
              <TextoVariacion valor={f.previo && f.previo.venta > 0 ? variacion(f.actual.venta, f.previo.venta) : null} />
            </td>
          </tr>
        ))}
      </Tabla>
      <PieTotal etiqueta="Total ventas" valor={fmt(total)} />

      {data.faltaConsumo && (
        <div className="px-4 pb-4">
          <Aviso tono="atencion">
            No hay consumo cargado en {nombreMes(data.mes)}, así que no se puede calcular la
            incidencia real. Cargalo en <strong>Análisis → Carga diaria</strong>.
          </Aviso>
        </div>
      )}
    </Bloque>
  )
}

// =====================================================
// 7 · INCIDENCIA REAL POR SERVICIO (V.66)
// =====================================================

const ESTADO_INCIDENCIA = {
  ok: { texto: 'Dentro', clase: 'text-green-700 bg-green-50' },
  warning: { texto: 'En tolerancia', clase: 'text-amber-700 bg-amber-50' },
  danger: { texto: 'Fuera', clase: 'text-red-700 bg-red-50' },
} as const

function IncidenciaPorServicio({ data }: { data: CierreMesData }) {
  const obj = useObjetivos()
  const servicios = data.incidenciaPorServicio || []
  if (servicios.length === 0) return null
  const meses = servicios[0].historia.map((h) => h.mes)
  const corto = (f: string) => nombreMes(f).slice(0, 3).toLowerCase()

  return (
    <Bloque
      titulo={`Incidencia real por servicio · objetivo ${obj.incidencia}% (± ${obj.tolerancia} pts)`}
      nota="Costo de lo que salió de cocina sobre la venta de ese servicio. Sólo cuenta los servicios con consumo cargado; el muestreo va al lado. El objetivo se cambia en Configuración."
    >
      <Tabla
        cabeceras={['Servicio', ...meses.map(corto), corto(data.mes).toUpperCase(), 'Estado', 'Con consumo']}
        alineacion={['left', ...meses.map(() => 'right' as const), 'right', 'left', 'right']}
      >
        {servicios.map((s) => {
          const tiene = s.resumen.diasConCarga > 0 && s.resumen.ventaConCosto > 0
          const estado = tiene
            ? ESTADO_INCIDENCIA[estadoContraObjetivo(s.resumen.incidencia, obj.incidencia, obj.tolerancia) as keyof typeof ESTADO_INCIDENCIA]
            : null
          return (
            <tr key={s.servicio} className="hover:bg-gray-50">
              <td className="py-2 px-3 text-gray-900">{SERVICIO_LABEL[s.servicio]}</td>
              {s.historia.map((h) => (
                <td key={h.mes} className="py-2 px-3 text-right font-mono text-gray-400">
                  {h.incidencia === null ? '—' : `${pct(h.incidencia)}%`}
                </td>
              ))}
              <td className="py-2 px-3 text-right font-mono font-semibold">{tiene ? `${pct(s.resumen.incidencia)}%` : '—'}</td>
              <td className="py-2 px-3">
                {estado ? (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${estado.clase}`}>{estado.texto}</span>
                ) : (
                  <span className="text-[11px] text-gray-400">Sin consumo</span>
                )}
              </td>
              <td className="py-2 px-3 text-right font-mono text-gray-500 text-xs">
                {s.resumen.diasConCarga} de {s.resumen.diasConVenta}
              </td>
            </tr>
          )
        })}
      </Tabla>
    </Bloque>
  )
}

// =====================================================
// 8 · TU INFLACIÓN (V.66)
// =====================================================

function TuInflacion({ data }: { data: CierreMesData }) {
  const c = data.canasta
  if (!c || c.meses.length === 0) return null
  const acumular = (vals: (number | null)[]): number | null =>
    vals.some((v) => v === null) ? null : (vals.reduce<number>((t, v) => t * (1 + (v ?? 0) / 100), 1) - 1) * 100
  const hayIpc = c.meses.some((m) => m.ipc !== null)
  const acCanasta = acumular(c.meses.map((m) => m.canasta))
  const acTicket = acumular(c.meses.map((m) => m.ticket))
  const acIpc = hayIpc ? acumular(c.meses.map((m) => m.ipc)) : null
  const gasto = c.rubros.reduce((t, r) => t + r.gasto, 0)

  let lectura = ''
  if (acCanasta !== null && acTicket !== null) {
    lectura =
      acTicket >= acCanasta
        ? `Tu ticket subió ${pct(acTicket - acCanasta)} puntos más que lo que comprás: el margen se sostiene.`
        : `Lo que comprás subió ${pct(acCanasta - acTicket)} puntos más que tu ticket: el margen se achica.`
  }

  return (
    <Bloque
      titulo={`Tu inflación · ${nombreMes(c.desde)} a ${nombreMes(data.mes)}`}
      nota={`Canasta: precio por kilo o litro de ${c.insumos} insumos, mediana del mes, ponderado por lo que se gastó en cada uno. Una variación de más de 80% en un mes se deja afuera como sospechosa. Ticket del restaurante: mediodía y noche, sin eventos.`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        <Cifra titulo="Tu canasta" valor={acCanasta} detalle="Cuánto más pagás por lo mismo" invertido />
        <Cifra titulo="Ticket restaurante" valor={acTicket} detalle="Cuánto más cobrás por cubierto" />
        {hayIpc && <Cifra titulo="IPC INDEC" valor={acIpc} detalle="Inflación general" invertido />}
      </div>
      {lectura && <p className="px-4 -mt-1 pb-3 text-sm text-gray-700">{lectura}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-gray-100">
        <div className="lg:border-r border-gray-100 min-w-0">
          <Tabla
            cabeceras={['Mes', 'Tu canasta', 'Ticket', ...(hayIpc ? ['IPC'] : [])]}
            alineacion={['left', 'right', 'right', 'right']}
          >
            {c.meses.map((m) => (
              <tr key={m.mes} className="hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-900">{nombreMes(m.mes)}</td>
                <td className="py-2 px-3 text-right font-mono"><TextoVariacion valor={m.canasta} invertido /></td>
                <td className="py-2 px-3 text-right font-mono"><TextoVariacion valor={m.ticket} /></td>
                {hayIpc && (
                  <td className="py-2 px-3 text-right font-mono text-gray-500">
                    {m.ipc === null ? 'sin publicar' : `${pct(m.ipc)}%`}
                  </td>
                )}
              </tr>
            ))}
          </Tabla>
        </div>
        <div className="min-w-0">
          <Tabla cabeceras={['Rubro', 'Gasto', 'Variación']} alineacion={['left', 'right', 'right']}>
            {[...c.rubros]
              .sort((a, b) => (b.variacion ?? -Infinity) - (a.variacion ?? -Infinity))
              .map((r) => (
                <tr key={r.rubro} className="hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-900">{CATEGORIAS_LABEL[r.rubro] || r.rubro}</td>
                  <td className="py-2 px-3 text-right font-mono text-gray-500">{fmt(r.gasto)}</td>
                  <td className="py-2 px-3 text-right font-mono"><TextoVariacion valor={r.variacion} invertido /></td>
                </tr>
              ))}
          </Tabla>
          <PieTotal etiqueta="Gasto del período" valor={fmt(gasto)} />
        </div>
      </div>
    </Bloque>
  )
}

function Cifra({ titulo, valor, detalle, invertido }: { titulo: string; valor: number | null; detalle: string; invertido?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-[10px] uppercase text-gray-500 font-semibold">{titulo}</div>
      <div className="text-lg font-bold mt-1 font-mono">
        <TextoVariacion valor={valor} invertido={invertido} />
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5">{detalle}</div>
    </div>
  )
}

// =====================================================
// Piezas compartidas
// =====================================================

function Bloque({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      </div>
      {children}
      {nota && (
        <p className="px-4 py-2.5 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100 leading-snug">
          {nota}
        </p>
      )}
    </div>
  )
}

function Tabla({
  cabeceras,
  alineacion,
  children,
}: {
  cabeceras: string[]
  alineacion: ('left' | 'right')[]
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
            {cabeceras.map((c, i) => (
              // Las clases van completas y no armadas con template: Tailwind
              // purga lo que no encuentra escrito literal en el código.
              <th
                key={c}
                className={`py-2 px-3 font-medium ${alineacion[i] === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

function PieTotal({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
      <span className="text-xs font-semibold text-gray-700">{etiqueta}</span>
      <span className="text-sm font-bold text-gray-900 font-mono">{valor}</span>
    </div>
  )
}

function TextoVariacion({ valor, invertido }: { valor: number | null; invertido?: boolean }) {
  if (valor === null || !isFinite(valor)) return <span className="text-gray-300">—</span>
  const sube = valor > 0.05
  const baja = valor < -0.05
  const malo = invertido ? sube : baja
  const bueno = invertido ? baja : sube
  const color = malo ? 'text-red-600' : bueno ? 'text-green-600' : 'text-gray-400'
  return (
    <span className={color}>
      {valor > 0 ? '+' : ''}{pct(valor)}%
    </span>
  )
}

function Aviso({ children, tono = 'info' }: { children: React.ReactNode; tono?: 'info' | 'atencion' | 'error' }) {
  const estilo = {
    info: 'bg-gray-50 text-gray-500 border-gray-200',
    atencion: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-red-50 text-red-900 border-red-200',
  }[tono]
  return (
    <div className={`m-4 p-3 rounded-md border text-sm flex items-start gap-2 ${estilo}`}>
      {tono !== 'info' && <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
      <span>{children}</span>
    </div>
  )
}
