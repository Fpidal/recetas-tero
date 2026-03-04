'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Select } from '@/components/ui'
import { TrendingUp, TrendingDown, Minus, Users, Package, DollarSign, ChevronRight, ChevronDown } from 'lucide-react'

// ============ TIPOS ============
interface Insumo {
  id: string
  nombre: string
  categoria: string
}

interface PrecioRaw {
  insumo_id: string
  precio: number
  fecha: string
}

interface FacturaItemConFecha {
  insumo_id: string
  precio: number
  fecha: string
}

interface FacturaConDetalle {
  id: string
  fecha: string
  total: number
  tipo: string
  proveedor_id: string
  proveedores: { nombre: string } | null
  factura_items: {
    insumo_id: string
    cantidad: number
    precio_unitario: number
    insumos: { categoria: string; iva_porcentaje: number } | null
  }[]
}

// ============ CONSTANTES ============
const COLORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#ec4899', '#14b8a6', '#f59e0b']

const PERIODOS = [
  { value: 'esta_semana', label: 'Esta semana' },
  { value: 'semana_pasada', label: 'Semana pasada' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '60', label: 'Últimos 60 días' },
  { value: '90', label: 'Últimos 90 días' },
]

// Helper: obtener lunes de una semana
function getLunes(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Ajustar cuando es domingo
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Calcular rango de fechas según período
function calcularRangoFechas(periodo: string): { desde: string; hasta: string } {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const lunesActual = getLunes(hoy)

  let desde: Date
  let hasta: Date

  switch (periodo) {
    case 'esta_semana':
      // Esta semana: desde el lunes hasta hoy
      desde = new Date(lunesActual)
      hasta = new Date(hoy)
      break
    case 'semana_pasada':
      // Semana pasada: lunes a domingo
      desde = new Date(lunesActual)
      desde.setDate(desde.getDate() - 7)
      hasta = new Date(desde)
      hasta.setDate(hasta.getDate() + 6)
      break
    case '30':
    case '60':
    case '90':
      // Últimos X días
      const dias = parseInt(periodo)
      desde = new Date(hoy)
      desde.setDate(desde.getDate() - dias)
      hasta = new Date(hoy)
      break
    default:
      desde = new Date(hoy)
      desde.setDate(desde.getDate() - 30)
      hasta = new Date(hoy)
  }

  return {
    desde: desde.toISOString().split('T')[0],
    hasta: hasta.toISOString().split('T')[0],
  }
}

const CATEG_LABELS: Record<string, string> = {
  Carnes: 'Carnes',
  Almacen: 'Almacén',
  Verduras_Frutas: 'Verduras y Frutas',
  Pescados_Mariscos: 'Pescados y Mariscos',
  Lacteos_Fiambres: 'Lácteos y Fiambres',
  Bebidas: 'Bebidas',
  Salsas_Recetas: 'Salsas y Recetas',
}

const CATEG_COLORES: Record<string, string> = {
  Carnes: '#dc2626',
  Almacen: '#d97706',
  Verduras_Frutas: '#16a34a',
  Pescados_Mariscos: '#0891b2',
  Lacteos_Fiambres: '#7c3aed',
  Bebidas: '#2563eb',
  Salsas_Recetas: '#db2777',
}

type TabType = 'proveedores' | 'variacion'

interface InsumoVariacion {
  id: string
  nombre: string
  precioInicial: number
  precioFinal: number
  variacion: number
  cantidadRegistros: number
}

export default function EstadisticasPage() {
  const [activeTab, setActiveTab] = useState<TabType>('proveedores')
  const [periodo, setPeriodo] = useState('semana_pasada')
  const [isLoading, setIsLoading] = useState(true)
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null)

  // Datos para proveedores
  const [facturas, setFacturas] = useState<FacturaConDetalle[]>([])

  // Datos para variación de precios
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [preciosDeFacturas, setPreciosDeFacturas] = useState<FacturaItemConFecha[]>([])
  const [preciosAnterioresMapa, setPreciosAnterioresMapa] = useState<Map<string, number>>(new Map())
  const [rangoFechas, setRangoFechas] = useState({ desde: '', hasta: '' })

  useEffect(() => {
    fetchData()
  }, [periodo])

  async function fetchData() {
    setIsLoading(true)
    const { desde, hasta } = calcularRangoFechas(periodo)
    setRangoFechas({ desde, hasta })

    const [insumosRes, facturasRes, facturasAnterioresRes] = await Promise.all([
      supabase.from('insumos').select('id, nombre, categoria').eq('activo', true),
      supabase.from('facturas_proveedor').select(`
        id, fecha, total, tipo, proveedor_id,
        proveedores (nombre),
        factura_items (insumo_id, cantidad, precio_unitario, insumos (categoria, iva_porcentaje))
      `).eq('activo', true).gte('fecha', desde).lte('fecha', hasta),
      // Traer facturas ANTERIORES al período para obtener precios previos
      supabase.from('facturas_proveedor').select(`
        fecha,
        factura_items (insumo_id, precio_unitario)
      `).eq('activo', true).lt('fecha', desde).order('fecha', { ascending: false }),
    ])

    if (insumosRes.data) setInsumos(insumosRes.data)

    // Guardar el precio más reciente ANTERIOR al período para cada insumo
    if (facturasAnterioresRes.data) {
      const mapAnteriores = new Map<string, number>()
      // Las facturas vienen ordenadas por fecha desc, así que la primera que encontremos es la más reciente
      facturasAnterioresRes.data.forEach((factura: any) => {
        if (factura.factura_items) {
          factura.factura_items.forEach((item: any) => {
            // Solo guardar si no tenemos ya un precio para este insumo (el primero es el más reciente)
            if (item.insumo_id && !mapAnteriores.has(item.insumo_id)) {
              mapAnteriores.set(item.insumo_id, item.precio_unitario)
            }
          })
        }
      })
      setPreciosAnterioresMapa(mapAnteriores)
    }

    if (facturasRes.data) {
      const facturasList = facturasRes.data as unknown as FacturaConDetalle[]
      setFacturas(facturasList)

      // Extraer precios de los items de facturas
      const precios: FacturaItemConFecha[] = []
      facturasList.forEach(factura => {
        if (factura.factura_items) {
          factura.factura_items.forEach((item: any) => {
            if (item.insumo_id) {
              precios.push({
                insumo_id: item.insumo_id,
                precio: item.precio_unitario,
                fecha: factura.fecha,
              })
            }
          })
        }
      })
      setPreciosDeFacturas(precios)
    }

    setIsLoading(false)
  }

  // ============ CÁLCULOS PROVEEDORES ============
  const datosProveedores = useMemo(() => {
    const porProveedor = new Map<string, { nombre: string; total: number; categorias: Map<string, number> }>()

    facturas.forEach(f => {
      const provNombre = f.proveedores?.nombre || 'Sin proveedor'
      const esNC = f.tipo === 'nota_credito'

      if (!porProveedor.has(provNombre)) {
        porProveedor.set(provNombre, { nombre: provNombre, total: 0, categorias: new Map() })
      }

      const prov = porProveedor.get(provNombre)!

      f.factura_items?.forEach(item => {
        const subtotal = item.cantidad * item.precio_unitario
        const iva = subtotal * ((item.insumos?.iva_porcentaje ?? 21) / 100)
        const totalItem = esNC ? -(subtotal + iva) : (subtotal + iva)

        prov.total += totalItem

        const cat = item.insumos?.categoria || 'Otros'
        prov.categorias.set(cat, (prov.categorias.get(cat) || 0) + totalItem)
      })
    })

    return Array.from(porProveedor.values())
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [facturas])

  const totalCompras = useMemo(() => datosProveedores.reduce((s, p) => s + p.total, 0), [datosProveedores])

  const datosPieProveedores = useMemo(() => {
    return datosProveedores.slice(0, 6).map((p, idx) => ({
      name: p.nombre,
      value: p.total,
      color: COLORES[idx % COLORES.length],
    }))
  }, [datosProveedores])

  // Datos por categoría de todos los proveedores
  const datosPorCategoria = useMemo(() => {
    const porCat = new Map<string, { categoria: string; total: number; proveedores: Map<string, number> }>()

    datosProveedores.forEach(prov => {
      prov.categorias.forEach((total, cat) => {
        if (!porCat.has(cat)) {
          porCat.set(cat, { categoria: cat, total: 0, proveedores: new Map() })
        }
        const catData = porCat.get(cat)!
        catData.total += total
        catData.proveedores.set(prov.nombre, (catData.proveedores.get(prov.nombre) || 0) + total)
      })
    })

    return Array.from(porCat.values())
      .sort((a, b) => b.total - a.total)
      .map(cat => ({
        ...cat,
        proveedoresList: Array.from(cat.proveedores.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([nombre, total]) => ({ nombre, total })),
      }))
  }, [datosProveedores])

  // ============ CÁLCULOS VARIACIÓN ============
  const allCategResumen = useMemo(() => {
    if (preciosDeFacturas.length === 0 || insumos.length === 0) return []

    const insumosConPrecios = new Set(preciosDeFacturas.map(p => p.insumo_id))
    const insumosActivos = insumos.filter(i => insumosConPrecios.has(i.id))
    const categorias = Array.from(new Set(insumosActivos.map(i => i.categoria)))

    return categorias.map(cat => {
      const categInsumos = insumosActivos.filter(i => i.categoria === cat)
      const categInsumoIds = categInsumos.map(i => i.id)
      const preciosCat = preciosDeFacturas.filter(p => categInsumoIds.includes(p.insumo_id))

      if (preciosCat.length === 0) return null

      const variacionesPorInsumo: number[] = []
      const insumosDetalle: InsumoVariacion[] = []

      categInsumos.forEach(insumo => {
        const preciosInsumo = preciosCat
          .filter(p => p.insumo_id === insumo.id)
          .sort((a, b) => a.fecha.localeCompare(b.fecha))

        if (preciosInsumo.length >= 1) {
          // Precio actual: último precio del período
          const precioActual = preciosInsumo[preciosInsumo.length - 1].precio
          // Precio anterior: del mapa de precios anteriores (de facturas previas)
          const precioAnterior = preciosAnterioresMapa.get(insumo.id)

          const precioInicialFinal = precioAnterior && precioAnterior > 0 ? precioAnterior : precioActual
          let varInsumo = 0

          // Calcular variación si hay precio anterior diferente al actual
          if (precioInicialFinal !== precioActual && precioInicialFinal > 0) {
            varInsumo = ((precioActual - precioInicialFinal) / precioInicialFinal) * 100
            if (Math.abs(varInsumo) <= 200) {
              variacionesPorInsumo.push(varInsumo)
            }
          }

          insumosDetalle.push({
            id: insumo.id,
            nombre: insumo.nombre,
            precioInicial: precioInicialFinal,
            precioFinal: precioActual,
            variacion: varInsumo,
            cantidadRegistros: preciosInsumo.length,
          })
        }
      })

      // Ordenar insumos por variación absoluta
      insumosDetalle.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))

      const variacion = variacionesPorInsumo.length > 0
        ? variacionesPorInsumo.reduce((sum, v) => sum + v, 0) / variacionesPorInsumo.length
        : 0

      return {
        categoria: cat,
        label: CATEG_LABELS[cat] || cat,
        color: CATEG_COLORES[cat] || '#6b7280',
        insumos: categInsumos.length,
        variacion,
        insumosConVariacion: variacionesPorInsumo.length,
        insumosDetalle,
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.variacion) - Math.abs(a!.variacion)) as {
      categoria: string; label: string; color: string; insumos: number; variacion: number; insumosConVariacion: number; insumosDetalle: InsumoVariacion[];
    }[]
  }, [preciosDeFacturas, insumos, preciosAnterioresMapa])

  const formatMoney = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  const tabs = [
    { id: 'proveedores' as TabType, label: 'Compras por Proveedor', icon: Users },
    { id: 'variacion' as TabType, label: 'Variación de Precios', icon: TrendingUp },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>
          <p className="text-gray-600">
            {rangoFechas.desde && rangoFechas.hasta ? (
              <>
                {new Date(rangoFechas.desde + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                {' — '}
                {new Date(rangoFechas.hasta + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </>
            ) : 'Análisis de compras y precios'}
          </p>
        </div>
        <div className="w-44">
          <Select
            options={PERIODOS}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando datos...</p>
        </div>
      ) : activeTab === 'proveedores' ? (
        /* ============ TAB PROVEEDORES ============ */
        <div className="space-y-6">
          {/* Resumen rápido */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs">Total Compras</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatMoney(totalCompras)}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">Proveedores</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{datosProveedores.length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Package className="w-4 h-4" />
                <span className="text-xs">Categorías</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{datosPorCategoria.length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs">Proveedor Principal</span>
              </div>
              <p className="text-lg font-bold text-gray-900 truncate">{datosProveedores[0]?.nombre || '-'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribución por proveedor */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución por Proveedor</h3>
              {datosPieProveedores.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosPieProveedores}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }: any) => `${name || ''} (${((percent || 0) * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {datosPieProveedores.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatMoney(v || 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-12">Sin datos</p>
              )}
            </div>

            {/* Ranking proveedores */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Ranking de Proveedores</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {datosProveedores.map((prov, idx) => (
                  <div key={prov.nombre} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{prov.nombre}</p>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${(prov.total / totalCompras) * 100}%`,
                            backgroundColor: COLORES[idx % COLORES.length],
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatMoney(prov.total)}</p>
                      <p className="text-[10px] text-gray-500">{((prov.total / totalCompras) * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Compras por categoría */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Compras por Categoría</h3>
            <div className="space-y-4">
              {datosPorCategoria.map(cat => (
                <div key={cat.categoria} className="border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: CATEG_COLORES[cat.categoria] || '#6b7280' }}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {CATEG_LABELS[cat.categoria] || cat.categoria}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatMoney(cat.total)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cat.proveedoresList.slice(0, 4).map(p => (
                      <span key={p.nombre} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                        {p.nombre}: {formatMoney(p.total)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ============ TAB VARIACIÓN ============ */
        <div className="space-y-4">
          {allCategResumen.length === 0 ? (
            <div className="bg-white rounded-lg border p-12 text-center">
              <p className="text-gray-400">No hay datos de precios en el período seleccionado</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Insumos c/Var</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variación Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {allCategResumen.map((cat) => {
                    const isExpanded = categoriaExpandida === cat.categoria
                    return (
                      <React.Fragment key={cat.categoria}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setCategoriaExpandida(isExpanded ? null : cat.categoria)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {cat.insumosDetalle.length} insumos
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {cat.variacion > 0 ? (
                                <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                              ) : cat.variacion < 0 ? (
                                <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-gray-400" />
                              )}
                              <span className={`text-sm font-bold ${
                                cat.variacion > 0 ? 'text-red-600' : cat.variacion < 0 ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {cat.variacion > 0 ? '+' : ''}{cat.variacion.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={3} className="px-0 py-0">
                              <div className="bg-gray-50 border-y">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="text-[10px] text-gray-500 uppercase">
                                      <th className="px-6 py-2 text-left font-medium">Insumo</th>
                                      <th className="px-4 py-2 text-right font-medium">Precio Inicial</th>
                                      <th className="px-4 py-2 text-right font-medium">Precio Final</th>
                                      <th className="px-4 py-2 text-right font-medium">Variación</th>
                                      <th className="px-4 py-2 text-center font-medium">Compras</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {cat.insumosDetalle.map((ins) => (
                                      <tr key={ins.id} className="bg-white hover:bg-gray-50">
                                        <td className="px-6 py-2 text-sm text-gray-900">{ins.nombre}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                          {formatMoney(ins.precioInicial)}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                          {formatMoney(ins.precioFinal)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {ins.precioInicial !== ins.precioFinal ? (
                                            <div className="flex items-center justify-end gap-1">
                                              {ins.variacion > 0 ? (
                                                <TrendingUp className="w-3 h-3 text-red-500" />
                                              ) : ins.variacion < 0 ? (
                                                <TrendingDown className="w-3 h-3 text-green-500" />
                                              ) : (
                                                <Minus className="w-3 h-3 text-gray-400" />
                                              )}
                                              <span className={`text-xs font-semibold ${
                                                ins.variacion > 0 ? 'text-red-600' : ins.variacion < 0 ? 'text-green-600' : 'text-gray-500'
                                              }`}>
                                                {ins.variacion > 0 ? '+' : ''}{ins.variacion.toFixed(1)}%
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-gray-400">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <span className="text-xs text-gray-500">{ins.cantidadRegistros}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>

              {/* Promedio general */}
              <div className="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Variación promedio general: {' '}
                  <span className={`font-bold ${
                    (allCategResumen.reduce((s, r) => s + r.variacion, 0) / allCategResumen.length) > 0
                      ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {((allCategResumen.reduce((s, r) => s + r.variacion, 0) / allCategResumen.length) > 0 ? '+' : '')}
                    {(allCategResumen.reduce((s, r) => s + r.variacion, 0) / allCategResumen.length).toFixed(1)}%
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Ordenado por mayor variación
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
