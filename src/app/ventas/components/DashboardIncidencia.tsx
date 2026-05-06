'use client'

import { useEffect, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Users } from 'lucide-react'
import {
  obtenerResumenMes,
  obtenerResumenSemana,
  obtenerHistorico,
  formatearMonedaVentas,
} from '@/lib/ventas-queries'
import {
  type ResumenPeriodo,
  type TipoPeriodo,
  OBJETIVO_INCIDENCIA,
  getColorIncidencia,
} from '@/types/ventas'

const COLORES_SERVICIO = {
  mediodia: '#A67B3D',
  noche: '#1B3A2D',
  eventos: '#C4704B',
}

export default function DashboardIncidencia() {
  const [tipo, setTipo] = useState<TipoPeriodo>('mensual')
  const [fechaRef, setFechaRef] = useState(new Date())

  const [resumen, setResumen] = useState<ResumenPeriodo | null>(null)
  const [resumenAnterior, setResumenAnterior] = useState<ResumenPeriodo | null>(null)
  const [tendencia, setTendencia] = useState<ResumenPeriodo[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargar()
  }, [tipo, fechaRef])

  async function cargar() {
    try {
      setCargando(true)

      // Resumen actual y anterior
      let actual: ResumenPeriodo
      let anterior: ResumenPeriodo

      if (tipo === 'mensual') {
        const año = fechaRef.getFullYear()
        const mes = fechaRef.getMonth() + 1
        const fechaAnt = new Date(año, mes - 2, 1)
        actual = await obtenerResumenMes(año, mes)
        anterior = await obtenerResumenMes(fechaAnt.getFullYear(), fechaAnt.getMonth() + 1)
      } else {
        const fechaAnt = new Date(fechaRef)
        fechaAnt.setDate(fechaAnt.getDate() - 7)
        actual = await obtenerResumenSemana(fechaRef)
        anterior = await obtenerResumenSemana(fechaAnt)
      }

      // Tendencia: últimos 6 períodos
      const tend = await obtenerHistorico(tipo, 6)

      setResumen(actual)
      setResumenAnterior(anterior)
      setTendencia(tend)
    } catch (e) {
      console.error('Error cargando dashboard:', e)
    } finally {
      setCargando(false)
    }
  }

  function navegar(direccion: -1 | 1) {
    const nueva = new Date(fechaRef)
    if (tipo === 'mensual') {
      nueva.setMonth(nueva.getMonth() + direccion)
    } else {
      nueva.setDate(nueva.getDate() + direccion * 7)
    }
    setFechaRef(nueva)
  }

  function irAHoy() {
    setFechaRef(new Date())
  }

  if (cargando && !resumen) {
    return <div className="py-12 text-center text-gray-400 text-sm">Cargando...</div>
  }

  if (!resumen) return null

  // Variaciones vs período anterior
  const varVentas = resumenAnterior?.ventasTotal
    ? ((resumen.ventasTotal - resumenAnterior.ventasTotal) / resumenAnterior.ventasTotal) * 100
    : 0
  const varCompras = resumenAnterior?.compras
    ? ((resumen.compras - resumenAnterior.compras) / resumenAnterior.compras) * 100
    : 0

  const colorIncidencia = getColorIncidencia(resumen.incidencia)

  // Datos para gráficos
  const datosTorta = [
    { nombre: 'Mediodía', valor: resumen.ventaMediodia, color: COLORES_SERVICIO.mediodia },
    { nombre: 'Noche', valor: resumen.ventaNoche, color: COLORES_SERVICIO.noche },
    { nombre: 'Eventos', valor: resumen.ventaEventos, color: COLORES_SERVICIO.eventos },
  ].filter((d) => d.valor > 0)

  const datosLinea = tendencia.map((p) => ({
    nombre: tipo === 'mensual' ? p.label.split(' ')[0].slice(0, 3) : `S${p.label.split(' ')[1]}`,
    incidencia: Number(p.incidencia.toFixed(1)),
    objetivo: OBJETIVO_INCIDENCIA,
  }))

  return (
    <div className="space-y-6">
      {/* CONTROLES */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => navegar(-1)}
            className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm sm:text-base font-semibold text-gray-900 text-center flex-1 sm:flex-initial sm:min-w-[200px] truncate">
            {resumen.label}
          </span>
          <button
            onClick={() => navegar(1)}
            className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={irAHoy}
            className="ml-1 sm:ml-2 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md border border-gray-300 flex-shrink-0"
          >
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-stretch sm:self-auto">
          <button
            onClick={() => setTipo('mensual')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tipo === 'mensual'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Mensual
          </button>
          <button
            onClick={() => setTipo('semanal')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tipo === 'semanal'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Semanal
          </button>
        </div>
      </div>

      {resumen.ventasTotal === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <p className="text-gray-500 text-sm">No hay ventas cargadas en este período.</p>
          <p className="text-gray-400 text-xs mt-1">
            Cargá ventas desde la solapa &quot;Carga diaria&quot;.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KPICard
              label="Ventas totales"
              valor={formatearMonedaVentas(resumen.ventasTotal)}
              variacion={varVentas}
              positivo
            />
            <KPICard
              label="Compras mercadería"
              valor={formatearMonedaVentas(resumen.compras)}
              variacion={varCompras}
              positivo={false}
            />
            <div className={`rounded-lg border ${colorIncidencia.bg} ${colorIncidencia.border} shadow-sm p-3 sm:p-5`}>
              <div className={`text-[10px] sm:text-xs uppercase mb-1 font-semibold ${colorIncidencia.text}`}>
                % Incidencia
              </div>
              <div className={`text-lg sm:text-2xl font-bold font-mono ${colorIncidencia.text}`}>
                {resumen.incidencia.toFixed(1)}%
              </div>
              <div className={`text-[10px] sm:text-xs mt-1 font-mono ${colorIncidencia.text}`}>
                Objetivo: ≤ {OBJETIVO_INCIDENCIA}%
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-5">
              <div className="text-[10px] sm:text-xs text-gray-500 uppercase mb-1">Margen bruto</div>
              <div className="text-lg sm:text-2xl font-bold text-gray-900 break-all font-mono">{formatearMonedaVentas(resumen.margenBruto)}</div>
              <div className="text-[10px] sm:text-xs text-gray-500 mt-1 font-mono">
                {resumen.ventasTotal > 0
                  ? `${((resumen.margenBruto / resumen.ventasTotal) * 100).toFixed(1)}% del total`
                  : '—'}
              </div>
            </div>
          </div>

          {/* GRÁFICOS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TORTA: ventas por servicio */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Ventas por servicio</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={datosTorta}
                    dataKey="valor"
                    nameKey="nombre"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry: any) => `${((entry.valor / resumen.ventasTotal) * 100).toFixed(0)}%`}
                  >
                    {datosTorta.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatearMonedaVentas(v || 0)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* LÍNEA: tendencia incidencia */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Tendencia de incidencia ({tipo === 'mensual' ? 'últimos meses' : 'últimas semanas'})
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={datosLinea}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip formatter={(v: any) => `${Number(v || 0).toFixed(1)}%`} />
                  <ReferenceLine
                    y={OBJETIVO_INCIDENCIA}
                    stroke="#3D8B5E"
                    strokeDasharray="5 5"
                    label={{ value: `Objetivo ${OBJETIVO_INCIDENCIA}%`, fontSize: 10, fill: '#3D8B5E', position: 'right' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="incidencia"
                    stroke="#1B3A2D"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ===== ANÁLISIS DE CUBIERTOS ===== */}
          {resumen.cubiertosTotal > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-gray-900">Análisis de cubiertos</h3>
              </div>

              {/* KPIs cubiertos */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <KPIMini
                  label="Cubiertos totales"
                  valor={resumen.cubiertosTotal.toLocaleString('es-AR')}
                  sub={`${(resumen.cubiertosTotal / Math.max(resumen.diasConVentas, 1)).toFixed(0)} prom/día`}
                />
                <KPIMini
                  label="Ticket promedio"
                  valor={formatearMonedaVentas(resumen.ticketPromedioGeneral)}
                  sub="general del período"
                  destacar
                />
                <KPIMini
                  label="Mediodía"
                  valor={formatearMonedaVentas(resumen.ticketPromedioMediodia)}
                  sub={`${resumen.cubiertosMediodia.toLocaleString('es-AR')} cubiertos`}
                />
                <KPIMini
                  label="Noche"
                  valor={formatearMonedaVentas(resumen.ticketPromedioNoche)}
                  sub={`${resumen.cubiertosNoche.toLocaleString('es-AR')} cubiertos`}
                />
              </div>

              {/* Tabla detalle cubiertos por servicio */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                      <th className="text-left py-2 font-medium">Servicio</th>
                      <th className="text-right py-2 font-medium">Cubiertos</th>
                      <th className="text-right py-2 font-medium">% del total</th>
                      <th className="text-right py-2 font-medium">Ventas</th>
                      <th className="text-right py-2 font-medium">Ticket prom.</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100">
                    <FilaCubiertos
                      icono="🌞"
                      nombre="Mediodía"
                      cubiertos={resumen.cubiertosMediodia}
                      ventas={resumen.ventaMediodia}
                      ticketProm={resumen.ticketPromedioMediodia}
                      cubTotal={resumen.cubiertosTotal}
                    />
                    <FilaCubiertos
                      icono="🌙"
                      nombre="Noche"
                      cubiertos={resumen.cubiertosNoche}
                      ventas={resumen.ventaNoche}
                      ticketProm={resumen.ticketPromedioNoche}
                      cubTotal={resumen.cubiertosTotal}
                    />
                    <FilaCubiertos
                      icono="🎉"
                      nombre="Eventos"
                      cubiertos={resumen.cubiertosEventos}
                      ventas={resumen.ventaEventos}
                      ticketProm={resumen.ticketPromedioEventos}
                      cubTotal={resumen.cubiertosTotal}
                      destacar
                    />
                    <tr className="font-semibold bg-gray-50">
                      <td className="py-3">Total</td>
                      <td className="text-right font-mono">{resumen.cubiertosTotal.toLocaleString('es-AR')}</td>
                      <td className="text-right text-gray-600 font-mono">100%</td>
                      <td className="text-right font-mono">{formatearMonedaVentas(resumen.ventasTotal)}</td>
                      <td className="text-right font-mono">{formatearMonedaVentas(resumen.ticketPromedioGeneral)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABLA DESGLOSE */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Desglose por servicio</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                    <th className="text-left py-2 font-medium">Servicio</th>
                    <th className="text-right py-2 font-medium">Ventas</th>
                    <th className="text-right py-2 font-medium">% del total</th>
                    <th className="text-right py-2 font-medium hidden sm:table-cell">Promedio diario</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  <FilaServicio
                    icono="🌞"
                    nombre="Mediodía"
                    ventas={resumen.ventaMediodia}
                    total={resumen.ventasTotal}
                    dias={resumen.diasConVentas}
                  />
                  <FilaServicio
                    icono="🌙"
                    nombre="Noche"
                    ventas={resumen.ventaNoche}
                    total={resumen.ventasTotal}
                    dias={resumen.diasConVentas}
                  />
                  <FilaServicio
                    icono="🎉"
                    nombre="Eventos"
                    ventas={resumen.ventaEventos}
                    total={resumen.ventasTotal}
                    dias={resumen.diasConVentas}
                    destacar
                  />
                  <tr className="font-semibold bg-gray-50">
                    <td className="py-3">Total</td>
                    <td className="text-right font-mono">{formatearMonedaVentas(resumen.ventasTotal)}</td>
                    <td className="text-right text-gray-600 font-mono">100%</td>
                    <td className="text-right hidden sm:table-cell text-gray-600">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

function KPICard({
  label,
  valor,
  variacion,
  positivo,
}: {
  label: string
  valor: string
  variacion: number
  positivo: boolean
}) {
  const sube = variacion > 0
  const baja = variacion < 0
  // "positivo" indica si subir es bueno (true para ventas, false para compras)
  const colorVar = sube
    ? positivo
      ? 'text-green-600'
      : 'text-red-600'
    : baja
    ? positivo
      ? 'text-red-600'
      : 'text-green-600'
    : 'text-gray-400'

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 sm:p-5">
      <div className="text-[10px] sm:text-xs text-gray-500 uppercase mb-1">{label}</div>
      <div className="text-lg sm:text-2xl font-bold text-gray-900 break-all font-mono">{valor}</div>
      <div className={`flex items-center gap-1 text-[10px] sm:text-xs mt-1 font-mono ${colorVar}`}>
        {sube && <TrendingUp className="w-3 h-3 flex-shrink-0" />}
        {baja && <TrendingDown className="w-3 h-3 flex-shrink-0" />}
        <span className="truncate">
          {variacion === 0
            ? 'Sin cambios'
            : `${sube ? '↑' : '↓'} ${Math.abs(variacion).toFixed(1)}% vs anterior`}
        </span>
      </div>
    </div>
  )
}

function KPIMini({
  label,
  valor,
  sub,
  destacar,
}: {
  label: string
  valor: string
  sub?: string
  destacar?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        destacar ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className={`text-[10px] uppercase font-semibold ${destacar ? 'text-blue-700' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-lg font-bold mt-0.5 font-mono ${destacar ? 'text-blue-700' : 'text-gray-900'}`}>
        {valor}
      </div>
      {sub && <div className={`text-[10px] mt-0.5 font-mono ${destacar ? 'text-blue-600' : 'text-gray-500'}`}>{sub}</div>}
    </div>
  )
}

function FilaCubiertos({
  icono,
  nombre,
  cubiertos,
  ventas,
  ticketProm,
  cubTotal,
  destacar,
}: {
  icono: string
  nombre: string
  cubiertos: number
  ventas: number
  ticketProm: number
  cubTotal: number
  destacar?: boolean
}) {
  const porcentaje = cubTotal > 0 ? (cubiertos / cubTotal) * 100 : 0
  return (
    <tr className={destacar && cubiertos > 0 ? 'bg-purple-50/50' : ''}>
      <td className="py-3 flex items-center gap-2">
        <span className="text-base">{icono}</span> {nombre}
      </td>
      <td className="text-right py-3 font-mono">{cubiertos > 0 ? cubiertos.toLocaleString('es-AR') : '—'}</td>
      <td className="text-right py-3 text-gray-600 font-mono">{cubiertos > 0 ? `${porcentaje.toFixed(1)}%` : '—'}</td>
      <td className="text-right py-3 font-mono">{ventas > 0 ? formatearMonedaVentas(ventas) : '—'}</td>
      <td className="text-right py-3 font-medium font-mono">
        {ticketProm > 0 ? formatearMonedaVentas(ticketProm) : '—'}
      </td>
    </tr>
  )
}

function FilaServicio({
  icono,
  nombre,
  ventas,
  total,
  dias,
  destacar,
}: {
  icono: string
  nombre: string
  ventas: number
  total: number
  dias: number
  destacar?: boolean
}) {
  const porcentaje = total > 0 ? (ventas / total) * 100 : 0
  const promedio = dias > 0 ? ventas / dias : 0

  return (
    <tr className={destacar && ventas > 0 ? 'bg-purple-50/50' : ''}>
      <td className="py-3 flex items-center gap-2">
        <span className="text-base">{icono}</span> {nombre}
      </td>
      <td className="text-right py-3 font-mono">{formatearMonedaVentas(ventas)}</td>
      <td className="text-right py-3 text-gray-600 font-mono">{porcentaje.toFixed(1)}%</td>
      <td className="text-right py-3 hidden sm:table-cell text-gray-600 font-mono">
        {promedio > 0 ? formatearMonedaVentas(promedio) : '—'}
      </td>
    </tr>
  )
}
