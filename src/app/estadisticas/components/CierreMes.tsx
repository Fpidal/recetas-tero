'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { FileDown, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import {
  obtenerCierreMes,
  variacion,
  nombreMes,
  diaMes,
  type CierreMes as CierreMesData,
} from '@/lib/cierre-mes-queries'
import { formatearMoneda } from '@/lib/formato-numeros'
import { generarPDFCierreMes } from '@/lib/generar-pdf-cierre-mes'
import { SERVICIO_LABEL, CATEGORIAS_LABEL } from '@/types/analisis'
import { PALETA } from '@/lib/colores'

const fmt = (v: number) => formatearMoneda(v, true, 0)

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

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setError(null)
    obtenerCierreMes(mes)
      .then((d) => { if (!cancelado) setData(d) })
      .catch((e) => {
        console.error('Error cargando cierre de mes:', e)
        if (!cancelado) setError(e?.message || 'No se pudo cargar el cierre del mes')
      })
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [mes])

  async function handlePDF() {
    if (!data) return
    try {
      setGenerandoPDF(true)
      await generarPDFCierreMes(data)
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
              </p>
            )}
          </div>

          <button
            onClick={handlePDF}
            disabled={!data || cargando || generandoPDF}
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
          <ComprasPorRubro data={data} />
          <ComprasSemanales data={data} />
          <TopInsumos data={data} />
          <VentasPorServicio data={data} />
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
      valor: inc.diasConCarga > 0 ? `${inc.incidencia.toFixed(1)}%` : '—',
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
      {valor > 0 ? '+' : ''}{valor.toFixed(1)}{unidad}
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
                {total > 0 ? `${((r.monto / total) * 100).toFixed(1)}%` : '—'}
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
            <td className="py-2 px-3 text-right font-mono text-gray-600">{f.porcentaje.toFixed(1)}%</td>
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
              {total > 0 ? `${((t.monto / total) * 100).toFixed(1)}%` : '—'}
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
// 5 · VENTAS POR SERVICIO
// =====================================================

function VentasPorServicio({ data }: { data: CierreMesData }) {
  if (data.faltaVentas) {
    return (
      <Bloque titulo="Ventas por servicio">
        <Aviso tono="atencion">
          No hay ventas cargadas en {nombreMes(data.mes)}. Cargalas en la sección{' '}
          <strong>Ventas</strong> para ver este bloque y la incidencia real.
        </Aviso>
      </Bloque>
    )
  }

  const filas = data.ventasPorServicio.filter((v) => v.venta > 0 || v.cubiertos > 0)

  return (
    <Bloque titulo="Ventas por servicio">
      <Tabla
        cabeceras={['Servicio', 'Venta', 'Cubiertos', 'Ticket promedio']}
        alineacion={['left', 'right', 'right', 'right']}
      >
        {filas.map((v) => (
          <tr key={v.servicio} className="hover:bg-gray-50">
            <td className="py-2 px-3 text-gray-900">
              {SERVICIO_LABEL[v.servicio]}
            </td>
            <td className="py-2 px-3 text-right font-mono font-medium">{fmt(v.venta)}</td>
            <td className="py-2 px-3 text-right font-mono text-gray-600">
              {v.cubiertos.toLocaleString('es-AR')}
            </td>
            <td className="py-2 px-3 text-right font-mono">
              {v.cubiertos > 0 ? fmt(v.venta / v.cubiertos) : '—'}
            </td>
          </tr>
        ))}
      </Tabla>
      <PieTotal etiqueta="Total ventas" valor={fmt(data.ventas.mes)} />

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
      {valor > 0 ? '+' : ''}{valor.toFixed(1)}%
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
