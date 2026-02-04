'use client'

import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Select } from '@/components/ui'

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

const COLORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed']

const PERIODOS = [
  { value: '30', label: 'Últimos 30 días' },
  { value: '60', label: 'Últimos 60 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: '180', label: 'Últimos 180 días' },
  { value: '365', label: 'Último año' },
]

export default function PreciosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [periodo, setPeriodo] = useState('90')
  const [preciosRaw, setPreciosRaw] = useState<PrecioRaw[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchInsumos()
  }, [])

  useEffect(() => {
    if (selectedIds.length > 0) {
      fetchPrecios()
    } else {
      setPreciosRaw([])
    }
  }, [selectedIds, periodo])

  async function fetchInsumos() {
    const { data } = await supabase
      .from('insumos')
      .select('id, nombre, categoria')
      .eq('activo', true)
      .order('nombre')

    if (data) setInsumos(data)
  }

  async function fetchPrecios() {
    setIsLoading(true)
    const fechaDesde = new Date()
    fechaDesde.setDate(fechaDesde.getDate() - parseInt(periodo))

    const { data } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio, fecha')
      .in('insumo_id', selectedIds)
      .gte('fecha', fechaDesde.toISOString().split('T')[0])
      .order('fecha', { ascending: true })

    if (data) setPreciosRaw(data)
    setIsLoading(false)
  }

  function toggleInsumo(id: string) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  // Transformar datos para recharts: cada punto tiene fecha + un campo por insumo
  const chartData = useMemo(() => {
    if (preciosRaw.length === 0) return []

    const fechasMap = new Map<string, Record<string, number>>()

    preciosRaw.forEach(p => {
      const fechaKey = p.fecha
      if (!fechasMap.has(fechaKey)) {
        fechasMap.set(fechaKey, {})
      }
      const insumo = insumos.find(i => i.id === p.insumo_id)
      if (insumo) {
        fechasMap.get(fechaKey)![insumo.nombre] = p.precio
      }
    })

    // Ordenar por fecha y formatear
    return Array.from(fechasMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, precios]) => ({
        fecha: new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        ...precios,
      }))
  }, [preciosRaw, insumos])

  const selectedInsumos = insumos.filter(i => selectedIds.includes(i.id))

  // Agrupar insumos por categoría para el selector
  const insumosPorCategoria = useMemo(() => {
    const map = new Map<string, Insumo[]>()
    insumos.forEach(i => {
      const cat = i.categoria
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(i)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [insumos])

  const categLabels: Record<string, string> = {
    Carnes: 'Carnes',
    Almacen: 'Almacén',
    Verduras_Frutas: 'Verduras y Frutas',
    Pescados_Mariscos: 'Pescados y Mariscos',
    Lacteos_Fiambres: 'Lácteos y Fiambres',
    Bebidas: 'Bebidas',
    Salsas_Recetas: 'Salsas y Recetas',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Evolución de Precios</h1>
        <p className="text-gray-600">Comparativa de precios de insumos en el tiempo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Panel izquierdo: selector de insumos */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Insumos</h2>
              <span className="text-xs text-gray-500">{selectedIds.length}/5</span>
            </div>

            <div className="mb-3">
              <Select
                options={PERIODOS}
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {insumosPorCategoria.map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
                    {categLabels[cat] || cat}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(insumo => {
                      const isSelected = selectedIds.includes(insumo.id)
                      const colorIdx = selectedIds.indexOf(insumo.id)
                      return (
                        <button
                          key={insumo.id}
                          onClick={() => toggleInsumo(insumo.id)}
                          disabled={!isSelected && selectedIds.length >= 5}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-2 ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : selectedIds.length >= 5
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {isSelected && (
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: COLORES[colorIdx] }}
                            />
                          )}
                          {insumo.nombre}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedIds.length > 0 && (
              <button
                onClick={() => setSelectedIds([])}
                className="mt-3 text-xs text-red-600 hover:text-red-800 w-full text-center"
              >
                Limpiar selección
              </button>
            )}
          </div>
        </div>

        {/* Panel derecho: gráfico */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {selectedIds.length === 0 ? (
              <div className="flex items-center justify-center h-96">
                <p className="text-gray-400">Seleccioná hasta 5 insumos para comparar</p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center h-96">
                <p className="text-gray-500">Cargando datos...</p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex items-center justify-center h-96">
                <p className="text-gray-400">No hay datos de precios en el período seleccionado</p>
              </div>
            ) : (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        `$${Number(value).toLocaleString('es-AR')}`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {selectedInsumos.map((insumo, idx) => (
                      <Line
                        key={insumo.id}
                        type="monotone"
                        dataKey={insumo.nombre}
                        stroke={COLORES[idx]}
                        strokeWidth={2}
                        dot={{ fill: COLORES[idx], r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Resumen de variaciones */}
            {selectedInsumos.length > 0 && chartData.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Resumen del período</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedInsumos.map((insumo, idx) => {
                    const precios = preciosRaw.filter(p => p.insumo_id === insumo.id)
                    if (precios.length === 0) return null
                    const primero = precios[0].precio
                    const ultimo = precios[precios.length - 1].precio
                    const variacion = primero > 0 ? ((ultimo - primero) / primero) * 100 : 0

                    return (
                      <div key={insumo.id} className="flex items-center gap-3 p-2 rounded bg-gray-50">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORES[idx] }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-700 truncate">{insumo.nombre}</p>
                          <p className="text-[10px] text-gray-500">
                            ${primero.toLocaleString('es-AR')} → ${ultimo.toLocaleString('es-AR')}
                          </p>
                        </div>
                        <span className={`text-xs font-bold ${
                          variacion > 0 ? 'text-red-600' : variacion < 0 ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {variacion > 0 ? '+' : ''}{variacion.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
