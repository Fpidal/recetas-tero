'use client'

import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Select } from '@/components/ui'
import { TrendingUp, TrendingDown, Minus, Users, Package, DollarSign } from 'lucide-react'

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

interface FacturaConDetalle {
  id: string
  fecha: string
  total: number
  tipo: string
  proveedor_id: string
  proveedores: { nombre: string } | null
  factura_items: {
    cantidad: number
    precio_unitario: number
    insumos: { categoria: string; iva_porcentaje: number } | null
  }[]
}

// ============ CONSTANTES ============
const COLORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#ec4899', '#14b8a6', '#f59e0b']

const PERIODOS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '60', label: 'Últimos 60 días' },
  { value: '90', label: 'Últimos 90 días' },
]

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

export default function EstadisticasPage() {
  const [activeTab, setActiveTab] = useState<TabType>('proveedores')
  const [periodo, setPeriodo] = useState('30')
  const [isLoading, setIsLoading] = useState(true)

  // Datos para proveedores
  const [facturas, setFacturas] = useState<FacturaConDetalle[]>([])

  // Datos para variación de precios
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [allCategPreciosRaw, setAllCategPreciosRaw] = useState<PrecioRaw[]>([])

  useEffect(() => {
    fetchData()
  }, [periodo])

  async function fetchData() {
    setIsLoading(true)
    const fechaDesde = new Date()
    fechaDesde.setDate(fechaDesde.getDate() - parseInt(periodo))
    const fechaDesdeStr = fechaDesde.toISOString().split('T')[0]

    const [insumosRes, facturasRes, preciosRes] = await Promise.all([
      supabase.from('insumos').select('id, nombre, categoria').eq('activo', true),
      supabase.from('facturas_proveedor').select(`
        id, fecha, total, tipo, proveedor_id,
        proveedores (nombre),
        factura_items (cantidad, precio_unitario, insumos (categoria, iva_porcentaje))
      `).neq('activo', false).gte('fecha', fechaDesdeStr),
      supabase.from('precios_insumo').select('insumo_id, precio, fecha').gte('fecha', fechaDesdeStr).order('fecha', { ascending: true }),
    ])

    if (insumosRes.data) setInsumos(insumosRes.data)
    if (facturasRes.data) setFacturas(facturasRes.data as unknown as FacturaConDetalle[])
    if (preciosRes.data) setAllCategPreciosRaw(preciosRes.data)

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
    if (allCategPreciosRaw.length === 0 || insumos.length === 0) return []

    const insumosConPrecios = new Set(allCategPreciosRaw.map(p => p.insumo_id))
    const insumosActivos = insumos.filter(i => insumosConPrecios.has(i.id))
    const categorias = Array.from(new Set(insumosActivos.map(i => i.categoria)))

    return categorias.map(cat => {
      const categInsumos = insumosActivos.filter(i => i.categoria === cat)
      const categInsumoIds = categInsumos.map(i => i.id)
      const preciosCat = allCategPreciosRaw.filter(p => categInsumoIds.includes(p.insumo_id))

      if (preciosCat.length === 0) return null

      const variacionesPorInsumo: number[] = []

      categInsumos.forEach(insumo => {
        const preciosInsumo = preciosCat
          .filter(p => p.insumo_id === insumo.id)
          .sort((a, b) => a.fecha.localeCompare(b.fecha))

        if (preciosInsumo.length >= 2) {
          const primero = preciosInsumo[0].precio
          const ultimo = preciosInsumo[preciosInsumo.length - 1].precio
          if (primero > 0) {
            const varInsumo = ((ultimo - primero) / primero) * 100
            if (Math.abs(varInsumo) <= 200) {
              variacionesPorInsumo.push(varInsumo)
            }
          }
        }
      })

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
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.variacion) - Math.abs(a!.variacion)) as {
      categoria: string; label: string; color: string; insumos: number; variacion: number; insumosConVariacion: number;
    }[]
  }, [allCategPreciosRaw, insumos])

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
          <p className="text-gray-600">Análisis de compras y precios</p>
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
                  {allCategResumen.map((cat) => (
                    <tr key={cat.categoria} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {cat.insumosConVariacion} / {cat.insumos}
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
                  ))}
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
