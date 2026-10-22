'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
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
  const obj = useObjetivos()
  const inc = data.incidencia
  const incPrev = data.incidenciaPrevia

  // Compras ÷ ventas: la misma cuenta que el Dashboard. Es la que define el
  // resultado del mes; la incidencia real (consumo ÷ venta) dice cómo se cocinó.
  const incCompras = data.ventas.mes > 0 ? (data.compras.mes / data.ventas.mes) * 100 : null
  const incComprasPrev = data.ventas.previo > 0 ? (data.compras.previo / data.ventas.previo) * 100 : null
  const margen = data.ventas.mes - data.compras.mes
  const margenPrev = data.ventas.previo - data.compras.previo
  const estadoCompras = incCompras !== null
    ? ESTADO_INCIDENCIA[estadoContraObjetivo(incCompras, obj.incidencia, obj.tolerancia) as keyof typeof ESTADO_INCIDENCIA]
    : null

  const principales: Indicador[] = [
    { label: 'Compras', valor: fmt(data.compras.mes), variacion: variacion(data.compras.mes, data.compras.previo), invertido: true },
    { label: 'Ventas', valor: fmt(data.ventas.mes), variacion: variacion(data.ventas.mes, data.ventas.previo) },
    {
      label: 'Incidencia compras',
      valor: incCompras !== null ? `${pct(incCompras)}%` : '—',
      variacion: incCompras !== null && incComprasPrev !== null ? incCompras - incComprasPrev : null,
      unidadVariacion: ' pts',
      invertido: true,
      nota: `compras ÷ ventas · objetivo ≤ ${obj.incidencia}%`,
      colorValor: estadoCompras ? estadoCompras.pill.split(' ')[0] : undefined,
    },
    {
      label: 'Margen bruto',
      valor: fmt(margen),
      variacion: margenPrev > 0 ? variacion(margen, margenPrev) : null,
      nota: data.ventas.mes > 0 ? `ventas − compras · ${pct((margen / data.ventas.mes) * 100)}% de la venta` : 'ventas − compras',
    },
  ]

  const operativos: Indicador[] = [
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
        ? `consumo ÷ venta · muestreo: ${inc.diasConCarga} de ${inc.diasConVenta} servicios`
        : 'sin consumo cargado',
    },
    { label: 'Cubiertos', valor: data.ventas.cubiertos.toLocaleString('es-AR'), variacion: variacion(data.ventas.cubiertos, data.ventas.cubiertosPrevio) },
    { label: 'Ticket promedio', valor: inc.ticketPromedio > 0 ? fmt(inc.ticketPromedio) : '—', variacion: variacion(inc.ticketPromedio, incPrev.ticketPromedio) },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
      {[...principales, ...operativos].map((t) => <TarjetaIndicador key={t.label} t={t} />)}
    </div>
  )
}

interface Indicador {
  label: string
  valor: string
  variacion: number | null
  invertido?: boolean
  unidadVariacion?: string
  nota?: string
  /** Clase de color del número, para lo que se mide contra un objetivo */
  colorValor?: string
}

function TarjetaIndicador({ t }: { t: Indicador }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
      <div className="text-[10px] uppercase text-gray-500 font-semibold">{t.label}</div>
      <div className={`text-lg xl:text-base 2xl:text-lg font-bold mt-1 font-mono break-all ${t.colorValor ?? 'text-gray-900'}`}>{t.valor}</div>
      <Variacion valor={t.variacion} invertido={t.invertido} unidad={t.unidadVariacion} />
      {t.nota && <div className="text-[10px] text-gray-400 mt-0.5">{t.nota}</div>}
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
// Secciones de análisis (V.66) — siguen la maqueta aprobada el 21/10/26:
// tarjetas con la cifra arriba y el detalle abajo, no tablas sueltas
// =====================================================

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 pt-2">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{titulo}</h3>
        {descripcion && <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

function Tarjeta({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 min-w-0 ${className}`}>{children}</div>
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{children}</div>
}

function CifraGrande({ children }: { children: React.ReactNode }) {
  return <div className="text-2xl font-semibold text-gray-900 mt-1 font-mono break-all">{children}</div>
}

/** "al 21/10" para el mes en curso, nada para un mes cerrado */
function sufijoCorte(data: CierreMesData) {
  return data.hastaDia ? ` al ${String(data.hastaDia).padStart(2, '0')}/${data.mes.slice(5, 7)}` : ''
}

// =====================================================
// 5 · LOS 10 PROVEEDORES DEL MES
// =====================================================

function ProveedoresDelMes({ data }: { data: CierreMesData }) {
  const top = data.proveedores || []
  if (top.length === 0) {
    return (
      <Seccion titulo="Los 10 proveedores del mes">
        <Tarjeta><span className="text-sm text-gray-500">No hay compras cargadas en este mes.</span></Tarjeta>
      </Seccion>
    )
  }
  const total = data.compras.mes
  const sumaTop = top.reduce((t, p) => t + p.monto, 0)
  const maximo = top[0]?.monto || 1
  const salieron = data.proveedoresSalieron || []
  const cuenta = data.proveedoresConCompras

  return (
    <Seccion
      titulo="Los 10 proveedores del mes"
      descripcion={`A quién le compraste más este mes y cómo cambió contra ${nombreMes(data.mesPrevio)}${data.hastaDia ? ' cortado al mismo día' : ''}. El puesto compara el lugar de cada proveedor en el ranking.`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tarjeta>
          <Etiqueta>Compras{sufijoCorte(data)}</Etiqueta>
          <CifraGrande>{fmt(total)}</CifraGrande>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            {nombreMes(data.mesPrevio).split(' ')[0]}: <span className="font-mono">{fmt(data.compras.previo)}</span>
            <TextoVariacion valor={variacion(total, data.compras.previo)} invertido />
          </div>
        </Tarjeta>
        <Tarjeta>
          <Etiqueta>Los 10 primeros</Etiqueta>
          <CifraGrande>{total > 0 ? `${pct((sumaTop / total) * 100, 0)}%` : '—'}</CifraGrande>
          <div className="text-xs text-gray-500 mt-1"><span className="font-mono">{fmt(sumaTop)}</span> de las compras del mes</div>
        </Tarjeta>
        <Tarjeta>
          <Etiqueta>Proveedores con factura</Etiqueta>
          <CifraGrande>{cuenta ? cuenta.mes : '—'}</CifraGrande>
          {cuenta && (
            <div className="text-xs text-gray-500 mt-1">
              {nombreMes(data.mesPrevio).split(' ')[0]}: <span className="font-mono">{cuenta.previo}</span>
            </div>
          )}
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Tarjeta className="lg:col-span-2 !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] text-gray-500 uppercase">
                  <th className="py-2 px-3 font-medium text-right w-8"></th>
                  <th className="py-2 px-3 font-medium text-left">Proveedor</th>
                  <th className="py-2 px-3 font-medium text-right">Mes</th>
                  <th className="py-2 px-3 font-medium text-right">% mes</th>
                  <th className="py-2 px-3 font-medium text-right">Anterior</th>
                  <th className="py-2 px-3 font-medium text-right">Var.</th>
                  <th className="py-2 px-3 font-medium text-right">Puesto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {top.map((p) => (
                  <tr key={p.nombre} className="hover:bg-gray-50">
                    <td className="py-2 px-3 text-right font-mono text-gray-400">{p.puesto}</td>
                    <td className="py-2 px-3 text-gray-900 min-w-[140px]">
                      {p.nombre}
                      <div className="h-1.5 rounded-full bg-forest/70 mt-1" style={{ width: `${(p.monto / maximo) * 100}%` }} />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium">{fmt(p.monto)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-600">{total > 0 ? `${pct((p.monto / total) * 100)}%` : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-500">{p.montoPrevio > 0 ? fmt(p.montoPrevio) : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      <TextoVariacion valor={p.montoPrevio > 0 ? variacion(p.monto, p.montoPrevio) : null} invertido />
                    </td>
                    <td className="py-2 px-3 text-right"><Puesto actual={p.puesto} previo={p.puestoPrevio} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
            Con IVA y percepciones, neto de notas de crédito, igual que el total de compras.
          </p>
        </Tarjeta>

        <Tarjeta>
          <Etiqueta>Salieron del top 10</Etiqueta>
          {salieron.length === 0 ? (
            <p className="text-sm text-gray-500 mt-2">Los mismos diez que el mes anterior.</p>
          ) : (
            <div className="mt-1 divide-y divide-gray-100">
              {salieron.map((p) => (
                <div key={p.nombre} className="flex justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="text-gray-900">{p.nombre}</div>
                    <div className="text-[11px] text-gray-400">{p.puestoPrevio}° el mes anterior</div>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <div>{fmt(p.montoPrevio)} → {fmt(p.monto)}</div>
                    <div className="text-[11px] text-gray-400">
                      {p.monto > 0 ? <>hoy {p.puesto}° · <TextoVariacion valor={variacion(p.monto, p.montoPrevio)} invertido /></> : 'sin compras'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </Seccion>
  )
}

function Puesto({ actual, previo }: { actual: number | null; previo: number | null }) {
  if (previo === null) {
    return <span className="text-[11px] font-semibold text-terracotta bg-terracotta-bg px-1.5 py-0.5 rounded-full">nuevo</span>
  }
  if (actual === null || actual === previo) return <span className="text-gray-300 font-mono text-xs">=</span>
  const sube = actual < previo
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${sube ? 'text-green-600' : 'text-red-600'}`}>
      {sube ? '▲' : '▼'} {Math.abs(previo - actual)}
    </span>
  )
}

// =====================================================
// 6 · RESTAURANTE Y EVENTOS (reemplaza a "Ventas por servicio")
// =====================================================

function RestauranteYEventos({ data }: { data: CierreMesData }) {
  if (data.faltaVentas) {
    return (
      <Seccion titulo="Restaurante y eventos">
        <Aviso tono="atencion">
          No hay ventas cargadas en {nombreMes(data.mes)}. Cargalas en la sección{' '}
          <strong>Ventas</strong> para ver este bloque y la incidencia real.
        </Aviso>
      </Seccion>
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
  const restPrev = prev ? suma(de(prev, 'mediodia'), de(prev, 'noche')) : null
  const evePrev = prev ? de(prev, 'eventos') : null
  const total = data.ventas.mes
  const compras = data.compras.mes
  const pRest = total > 0 ? (rest.venta / total) * 100 : 0
  const pEve = total > 0 ? (eve.venta / total) * 100 : 0
  const ticket = (p: Par) => (p.cubiertos > 0 ? fmt(p.venta / p.cubiertos) : '—')
  const mesPrevio = nombreMes(data.mesPrevio).split(' ')[0]

  const lineas: { nombre: string; actual: Par; previo: Par | null; sub?: boolean }[] = [
    { nombre: 'Restaurante', actual: rest, previo: restPrev },
    { nombre: SERVICIO_LABEL.mediodia, actual: med, previo: prev ? de(prev, 'mediodia') : null, sub: true },
    { nombre: SERVICIO_LABEL.noche, actual: noc, previo: prev ? de(prev, 'noche') : null, sub: true },
    { nombre: SERVICIO_LABEL.eventos, actual: eve, previo: evePrev },
  ]

  return (
    <Seccion
      titulo="Restaurante y eventos"
      descripcion="Los eventos venden mucho en pocos días y con otro ticket. Mezclados con el salón, mueven todos los promedios del mes."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Tarjeta>
          <Etiqueta>Venta del mes{sufijoCorte(data)}</Etiqueta>
          <CifraGrande>{fmt(total)}</CifraGrande>
          <div className="flex h-7 rounded-md overflow-hidden text-[11px] font-semibold text-white mt-3 mb-2 bg-gray-100">
            {pRest > 0 && (
              <div className="bg-forest flex items-center px-2 whitespace-nowrap overflow-hidden" style={{ width: `${pRest}%` }}>
                {pct(pRest, 0)}%
              </div>
            )}
            {pEve > 0 && (
              <div className="bg-terracotta flex items-center px-2 whitespace-nowrap overflow-hidden" style={{ width: `${pEve}%` }}>
                {pct(pEve, 0)}%
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-forest inline-block" />Restaurante (mediodía y noche)</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-terracotta inline-block" />Eventos</span>
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            {lineas.map((l) => (
              <div key={l.nombre} className={`flex justify-between gap-3 py-2 text-sm ${l.sub ? 'pl-3 text-gray-500' : ''}`}>
                <span className={l.sub ? '' : 'font-medium text-gray-800'}>{l.nombre}</span>
                <span className="text-right font-mono text-xs">
                  {fmt(l.actual.venta)} · {l.actual.cubiertos.toLocaleString('es-AR')} cub. · ticket {ticket(l.actual)}
                  {l.previo && l.previo.venta > 0 && (
                    <span className="block text-[11px] text-gray-400">
                      {mesPrevio}: {fmt(l.previo.venta)} · <TextoVariacion valor={variacion(l.actual.venta, l.previo.venta)} />
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta>
          <Etiqueta>Compras sobre venta</Etiqueta>
          <div className="mt-1 divide-y divide-gray-100">
            <Ratio
              titulo="Sobre la venta total"
              valor={total > 0 ? (compras / total) * 100 : null}
              detalle={eve.venta > 0 ? `${fmt(compras)} de compras ÷ ${fmt(total)}. Lo baja la venta de eventos.` : `${fmt(compras)} de compras ÷ ${fmt(total)}.`}
            />
            {eve.venta > 0 && (
              <Ratio
                titulo="Sobre la venta del restaurante"
                valor={rest.venta > 0 ? (compras / rest.venta) * 100 : null}
                detalle={`Las mismas compras ÷ ${fmt(rest.venta)}. Lo sube lo comprado para los eventos.`}
              />
            )}
            {data.ventas.previo > 0 && (
              <Ratio
                titulo={`${nombreMes(data.mesPrevio)}${evePrev && evePrev.venta === 0 ? ', sin eventos' : ''}`}
                valor={(data.compras.previo / data.ventas.previo) * 100}
                detalle={`${fmt(data.compras.previo)} ÷ ${fmt(data.ventas.previo)}${data.hastaDia ? ', al mismo día' : ''}.`}
              />
            )}
          </div>
        </Tarjeta>
      </div>

      {eve.venta > 0 && (
        <Aviso tono="atencion">
          <strong>Ninguno de los dos porcentajes es el real.</strong> Las facturas no dicen si la compra fue
          para el salón o para un evento, así que la cuenta no se puede separar. La incidencia real (abajo)
          no tiene este problema: se calcula con el consumo de cada servicio.
        </Aviso>
      )}

      {data.faltaConsumo && (
        <Aviso tono="atencion">
          No hay consumo cargado en {nombreMes(data.mes)}, así que no se puede calcular la
          incidencia real. Cargalo en <strong>Análisis → Carga diaria</strong>.
        </Aviso>
      )}
    </Seccion>
  )
}

function Ratio({ titulo, valor, detalle }: { titulo: string; valor: number | null; detalle: string }) {
  return (
    <div className="py-2.5">
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-sm text-gray-700">{titulo}</span>
        <span className="font-mono text-lg font-medium">{valor === null ? '—' : `${pct(valor)}%`}</span>
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5">{detalle}</div>
    </div>
  )
}

// =====================================================
// 7 · INCIDENCIA REAL POR SERVICIO
// =====================================================

const ESTADO_INCIDENCIA = {
  ok: { texto: 'Dentro del objetivo', pill: 'text-green-700 bg-green-50', barra: '#2F7A4F' },
  warning: { texto: 'En tolerancia', pill: 'text-amber-700 bg-amber-50', barra: '#B7791F' },
  danger: { texto: 'Fuera del objetivo', pill: 'text-red-700 bg-red-50', barra: '#C0392B' },
} as const

function IncidenciaPorServicio({ data }: { data: CierreMesData }) {
  const obj = useObjetivos()
  const servicios = data.incidenciaPorServicio || []
  if (servicios.length === 0) return null

  return (
    <Seccion
      titulo="Incidencia real por servicio"
      descripcion={`El costo de lo que salió de cocina sobre la venta de ese servicio, contra el objetivo de Configuración: ${obj.incidencia}%, con ${obj.tolerancia} puntos de tolerancia. Sólo cuenta los servicios con consumo cargado.`}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {servicios.map((s) => (
          <TarjetaServicio key={s.servicio} servicio={s} mes={data.mes} objetivo={obj.incidencia} tolerancia={obj.tolerancia} />
        ))}
      </div>
    </Seccion>
  )
}

function TarjetaServicio({
  servicio: s,
  mes,
  objetivo,
  tolerancia,
}: {
  servicio: NonNullable<CierreMesData['incidenciaPorServicio']>[number]
  mes: string
  objetivo: number
  tolerancia: number
}) {
  const tiene = s.resumen.diasConCarga > 0 && s.resumen.ventaConCosto > 0
  const valor = s.resumen.incidencia
  const estado = tiene ? ESTADO_INCIDENCIA[estadoContraObjetivo(valor, objetivo, tolerancia) as keyof typeof ESTADO_INCIDENCIA] : null
  // Escala del medidor: de 0 a objetivo + 10 puntos (40% con el objetivo de 30)
  const tope = objetivo + 10
  const aPct = (v: number) => `${Math.min(100, Math.max(0, (v / tope) * 100))}%`
  const serie = [...s.historia, { mes, incidencia: tiene ? valor : null }]
  const conDato = serie.filter((p) => p.incidencia !== null)
  const primero = conDato[0]
  const corto = (f: string) => nombreMes(f).slice(0, 3).toLowerCase()

  let tendencia = ''
  if (tiene && primero && primero.mes !== mes && primero.incidencia !== null) {
    const dif = valor - primero.incidencia
    if (Math.abs(dif) >= 1) tendencia = `${dif > 0 ? 'subió' : 'bajó'} ${pct(Math.abs(dif))} puntos desde ${nombreMes(primero.mes).split(' ')[0].toLowerCase()}`
  }
  const cerca = tiene && valor <= objetivo && objetivo - valor < 1.5 ? `a ${pct(objetivo - valor)} puntos del objetivo` : ''

  return (
    <Tarjeta>
      <div className="flex justify-between items-start gap-2">
        <div>
          <Etiqueta>{SERVICIO_LABEL[s.servicio]}</Etiqueta>
          <div className={`text-2xl font-semibold mt-1 font-mono ${tiene ? 'text-gray-900' : 'text-gray-300'}`}>
            {tiene ? `${pct(valor)}%` : '—'}
          </div>
        </div>
        {estado ? (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${estado.pill}`}>{estado.texto}</span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-gray-500 bg-gray-100">Sin consumo cargado</span>
        )}
      </div>

      {/* Medidor: relleno hasta el valor, franja de tolerancia y línea del objetivo */}
      <div className="relative h-2.5 rounded-full bg-gray-100 mt-4 mb-1.5" aria-hidden="true">
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: aPct(objetivo),
            width: `calc(${aPct(objetivo + tolerancia)} - ${aPct(objetivo)})`,
            background: 'repeating-linear-gradient(45deg, rgba(183,121,31,.22) 0 4px, transparent 4px 8px)',
          }}
        />
        {tiene && estado && (
          <div className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: aPct(valor), background: estado.barra }} />
        )}
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-gray-900" style={{ left: aPct(objetivo) }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 font-mono">
        <span>0%</span><span>objetivo {objetivo}%</span><span>{tope}%</span>
      </div>

      {conDato.length >= 2 && (
        <div className="h-14 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
              <XAxis dataKey="mes" hide />
              <YAxis hide domain={[(min: number) => Math.min(min, objetivo) - 2, (max: number) => Math.max(max, objetivo) + 1]} />
              <ReferenceLine y={objetivo} stroke="#1A1A1A" strokeDasharray="3 3" strokeWidth={0.8} />
              <Tooltip
                formatter={(v: any) => [`${pct(Number(v))}%`, 'Incidencia']}
                labelFormatter={(l: any) => nombreMes(String(l))}
                contentStyle={{ fontSize: 11 }}
              />
              <Line type="monotone" dataKey="incidencia" stroke={estado?.barra || '#9B948C'} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {conDato.length >= 2 && (
        <div className="flex justify-between text-[10px] text-gray-400 font-mono">
          <span>{corto(conDato[0].mes)} {pct(conDato[0].incidencia as number)}</span>
          <span>{corto(conDato[conDato.length - 1].mes)} {pct(conDato[conDato.length - 1].incidencia as number)}</span>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        {tiene ? (
          <>
            {s.resumen.diasConCarga} de {s.resumen.diasConVenta} servicios con consumo
            {(tendencia || cerca) && <> · <strong className="text-gray-700">{tendencia || cerca}</strong></>}
          </>
        ) : s.resumen.diasConVenta > 0 ? (
          `0 de ${s.resumen.diasConVenta} con consumo. Sin cargar lo que se usó no hay forma de saber si deja margen.`
        ) : (
          'Sin ventas en el mes.'
        )}
      </p>
    </Tarjeta>
  )
}

// =====================================================
// 8 · TU INFLACIÓN
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
  const desde = nombreMes(c.desde).split(' ')[0].toLowerCase()
  const hasta = nombreMes(data.mes).split(' ')[0].toLowerCase()
  const grafico = c.meses.map((m) => ({
    mes: nombreMes(m.mes).slice(0, 3).toLowerCase(),
    canasta: m.canasta,
    ticket: m.ticket,
    ipc: m.ipc,
  }))

  return (
    <Seccion
      titulo="Tu inflación"
      descripcion="Cuánto subió lo que comprás, contra lo que subió lo que cobrás. Cada insumo pesa según lo que gastás en él: una suba del morrón importa más que una de la sal."
    >
      <div className={`grid grid-cols-1 gap-3 ${hayIpc ? 'sm:grid-cols-3' : 'sm:grid-cols-3'}`}>
        <Tarjeta>
          <Etiqueta>Tu canasta, {desde} → {hasta}</Etiqueta>
          <CifraGrande><TextoVariacion valor={acCanasta} invertido /></CifraGrande>
          <div className="text-xs text-gray-500 mt-1">Ponderada por gasto, {c.insumos} insumos</div>
        </Tarjeta>
        <Tarjeta>
          <Etiqueta>Ticket restaurante, {desde} → {hasta}</Etiqueta>
          <CifraGrande><TextoVariacion valor={acTicket} /></CifraGrande>
          <div className="text-xs text-gray-500 mt-1">Mediodía y noche, sin eventos</div>
        </Tarjeta>
        {hayIpc ? (
          <Tarjeta>
            <Etiqueta>IPC INDEC, {desde} → {hasta}</Etiqueta>
            <CifraGrande><TextoVariacion valor={acIpc} invertido /></CifraGrande>
            <div className="text-xs text-gray-500 mt-1">Inflación general</div>
          </Tarjeta>
        ) : (
          <Tarjeta>
            <Etiqueta>Lectura</Etiqueta>
            <p className="text-sm text-gray-700 mt-2">
              {acCanasta === null || acTicket === null
                ? 'Faltan meses con datos para comparar.'
                : acTicket >= acCanasta
                  ? <>Tu ticket subió <strong className="font-mono">{pct(acTicket - acCanasta)}</strong> puntos más que lo que comprás: el margen se sostiene.</>
                  : <>Lo que comprás subió <strong className="font-mono">{pct(acCanasta - acTicket)}</strong> puntos más que tu ticket: el margen se achica.</>}
            </p>
          </Tarjeta>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Tarjeta>
          <Etiqueta>Mes a mes</Etiqueta>
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={36} />
                <ReferenceLine y={0} stroke="#9B948C" />
                <Tooltip formatter={(v: any, n: any) => [v === null ? '—' : `${pct(Number(v))}%`, n]} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="canasta" name="Tu canasta" fill={PALETA.terracotta} radius={[2, 2, 0, 0]} />
                <Bar dataKey="ticket" name="Ticket" fill="#1B3A2D" radius={[2, 2, 0, 0]} />
                {hayIpc && <Bar dataKey="ipc" name="IPC" fill="#8A8F98" radius={[2, 2, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-terracotta inline-block" />Tu canasta</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-forest inline-block" />Ticket restaurante</span>
            {hayIpc && <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-gray-400 inline-block" />IPC</span>}
          </div>
          {data.hastaDia && <p className="text-[11px] text-gray-400 mt-2">{nombreMes(data.mes).split(' ')[0]}, al día {data.hastaDia}.</p>}
        </Tarjeta>

        <Tarjeta className="!p-0 overflow-hidden">
          <div className="px-4 pt-4"><Etiqueta>Por rubro, {desde} → {hasta}</Etiqueta></div>
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
          <PieTotal etiqueta="Total" valor={fmt(gasto)} />
          <p className="px-4 py-2.5 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100 leading-snug">
            Precio por kilo o litro, mediana del mes. Una variación de más de 80% en un mes se deja afuera como
            sospechosa: casi siempre es un error de carga.
          </p>
        </Tarjeta>
      </div>
    </Seccion>
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
