'use client'

import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Select } from '@/components/ui'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Insumo {
  id: string
  nombre: string
  categoria: string
}

interface PrecioRaw {
  insumo_id: string
  precio: number
  fecha: string
  es_precio_actual?: boolean
}

const COLORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed']

const PERIODOS = [
  { value: '30', label: 'Últimos 30 días' },
  { value: '60', label: 'Últimos 60 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: '180', label: 'Últimos 180 días' },
  { value: '365', label: 'Último año' },
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

export default function PreciosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [periodo, setPeriodo] = useState('90')
  const [preciosRaw, setPreciosRaw] = useState<PrecioRaw[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [modo, setModo] = useState<'insumo' | 'categoria'>('insumo')
  const [selectedCategoria, setSelectedCategoria] = useState('')
  const [categPreciosRaw, setCategPreciosRaw] = useState<PrecioRaw[]>([])
  const [isLoadingCateg, setIsLoadingCateg] = useState(false)
  const [allCategPreciosRaw, setAllCategPreciosRaw] = useState<PrecioRaw[]>([])
  const [isLoadingAllCateg, setIsLoadingAllCateg] = useState(false)

  useEffect(() => {
    fetchInsumos()
  }, [])

  // Fetch precios modo insumo
  useEffect(() => {
    if (modo !== 'insumo') return
    if (selectedIds.length > 0) {
      fetchPrecios()
    } else {
      setPreciosRaw([])
    }
  }, [selectedIds, periodo, modo])

  // Fetch precios modo categoría específica
  useEffect(() => {
    if (modo !== 'categoria') return
    if (selectedCategoria) {
      fetchPreciosCategoria()
    } else {
      setCategPreciosRaw([])
    }
  }, [selectedCategoria, periodo, modo])

  // Fetch todos los precios para comparativa de categorías
  useEffect(() => {
    if (modo !== 'categoria') return
    if (!selectedCategoria) {
      fetchAllCategPrecios()
    }
  }, [periodo, modo, selectedCategoria, insumos])

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

  async function fetchPreciosCategoria() {
    setIsLoadingCateg(true)
    const categInsumoIds = insumos.filter(i => i.categoria === selectedCategoria).map(i => i.id)

    if (categInsumoIds.length === 0) {
      setCategPreciosRaw([])
      setIsLoadingCateg(false)
      return
    }

    const fechaDesde = new Date()
    fechaDesde.setDate(fechaDesde.getDate() - parseInt(periodo))

    const { data } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio, fecha, es_precio_actual')
      .in('insumo_id', categInsumoIds)
      .gte('fecha', fechaDesde.toISOString().split('T')[0])
      .order('fecha', { ascending: true })

    if (data) setCategPreciosRaw(data)
    setIsLoadingCateg(false)
  }

  async function fetchAllCategPrecios() {
    if (insumos.length === 0) return
    setIsLoadingAllCateg(true)

    const fechaDesde = new Date()
    fechaDesde.setDate(fechaDesde.getDate() - parseInt(periodo))

    const { data } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio, fecha')
      .gte('fecha', fechaDesde.toISOString().split('T')[0])
      .order('fecha', { ascending: true })

    if (data) setAllCategPreciosRaw(data)
    setIsLoadingAllCateg(false)
  }

  function toggleInsumo(id: string) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  // Chart data para modo insumo
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

    return Array.from(fechasMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, precios]) => ({
        fecha: new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        ...precios,
      }))
  }, [preciosRaw, insumos])

  const selectedInsumos = insumos.filter(i => selectedIds.includes(i.id))

  // Agrupar insumos por categoría
  const insumosPorCategoria = useMemo(() => {
    const map = new Map<string, Insumo[]>()
    insumos.forEach(i => {
      const cat = i.categoria
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(i)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [insumos])

  // Categorías disponibles para selector
  const categoriaOptions = useMemo(() => {
    return [
      { value: '', label: 'Comparativa general' },
      ...insumosPorCategoria.map(([cat]) => ({
        value: cat,
        label: CATEG_LABELS[cat] || cat,
      })),
    ]
  }, [insumosPorCategoria])

  // Datos de resumen por categoría
  const categResumen = useMemo(() => {
    if (categPreciosRaw.length === 0 || !selectedCategoria) return []

    const categInsumos = insumos.filter(i => i.categoria === selectedCategoria)

    return categInsumos.map(insumo => {
      const precios = categPreciosRaw
        .filter(p => p.insumo_id === insumo.id)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      if (precios.length === 0) return null

      // Usar el precio actual (es_precio_actual = true) como último
      const precioActualReg = precios.find(p => p.es_precio_actual)
      const preciosAnteriores = precios.filter(p => !p.es_precio_actual)

      // Si no hay precio actual en el período, usar el más reciente
      const ultimo = precioActualReg?.precio || precios[precios.length - 1].precio
      // El anterior es el más reciente de los no actuales, o el primero del período
      const primero = preciosAnteriores.length > 0
        ? preciosAnteriores[preciosAnteriores.length - 1].precio
        : precios[0].precio

      const variacion = primero > 0 ? ((ultimo - primero) / primero) * 100 : 0
      const min = Math.min(...precios.map(p => p.precio))
      const max = Math.max(...precios.map(p => p.precio))

      return {
        id: insumo.id,
        nombre: insumo.nombre,
        primero,
        ultimo,
        variacion,
        min,
        max,
        registros: precios.length,
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.variacion) - Math.abs(a!.variacion)) as {
      id: string; nombre: string; primero: number; ultimo: number;
      variacion: number; min: number; max: number; registros: number;
    }[]
  }, [categPreciosRaw, selectedCategoria, insumos])

  // Chart data para comparativa de todas las categorías (variación % acumulada)
  // Solo considera insumos que tienen precios cargados en el período
  const allCategChartData = useMemo(() => {
    if (allCategPreciosRaw.length === 0 || insumos.length === 0) return []

    // Solo insumos que tienen precios en el período
    const insumosConPrecios = new Set(allCategPreciosRaw.map(p => p.insumo_id))
    const insumosActivos = insumos.filter(i => insumosConPrecios.has(i.id))

    const categorias = Array.from(new Set(insumosActivos.map(i => i.categoria)))

    // Para cada insumo, guardar su precio base (primer precio del período)
    const precioBaseInsumo: Record<string, number> = {}
    const preciosPorInsumoFecha: Record<string, Record<string, number>> = {}

    // Agrupar precios por insumo y fecha
    allCategPreciosRaw.forEach(p => {
      if (!preciosPorInsumoFecha[p.insumo_id]) {
        preciosPorInsumoFecha[p.insumo_id] = {}
      }
      // Si hay múltiples precios en la misma fecha, quedarse con el último
      preciosPorInsumoFecha[p.insumo_id][p.fecha] = p.precio
    })

    // Calcular precio base de cada insumo (primer precio cronológico)
    Object.entries(preciosPorInsumoFecha).forEach(([insumoId, fechasPrecios]) => {
      const fechasOrdenadas = Object.keys(fechasPrecios).sort()
      if (fechasOrdenadas.length > 0) {
        precioBaseInsumo[insumoId] = fechasPrecios[fechasOrdenadas[0]]
      }
    })

    // Obtener todas las fechas únicas ordenadas
    const todasFechas = Array.from(new Set(allCategPreciosRaw.map(p => p.fecha))).sort()

    // Construir data para el chart
    return todasFechas.map(fecha => {
      const punto: Record<string, any> = {
        fecha: new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
      }

      categorias.forEach(cat => {
        const categInsumos = insumosActivos.filter(i => i.categoria === cat)
        const variacionesDelDia: number[] = []

        categInsumos.forEach(insumo => {
          const precioBase = precioBaseInsumo[insumo.id]
          const precioDelDia = preciosPorInsumoFecha[insumo.id]?.[fecha]

          // Solo incluir si tiene precio base y precio en esta fecha
          if (precioBase && precioBase > 0 && precioDelDia !== undefined) {
            const variacion = ((precioDelDia - precioBase) / precioBase) * 100
            // Filtrar outliers: variaciones mayores a 200% son probables errores
            if (Math.abs(variacion) <= 200) {
              variacionesDelDia.push(variacion)
            }
          }
        })

        // La variación de la categoría en este día es el PROMEDIO de las variaciones individuales
        if (variacionesDelDia.length > 0) {
          const promedio = variacionesDelDia.reduce((sum, v) => sum + v, 0) / variacionesDelDia.length
          punto[CATEG_LABELS[cat] || cat] = parseFloat(promedio.toFixed(1))
        }
      })

      return punto
    })
  }, [allCategPreciosRaw, insumos])

  // Resumen de categorías para la tabla
  // Solo considera insumos que tienen precios cargados en el período seleccionado
  const allCategResumen = useMemo(() => {
    if (allCategPreciosRaw.length === 0 || insumos.length === 0) return []

    // Obtener IDs de insumos que tienen precios en el período
    const insumosConPrecios = new Set(allCategPreciosRaw.map(p => p.insumo_id))

    // Solo considerar insumos que realmente tienen precios cargados en el período
    const insumosActivos = insumos.filter(i => insumosConPrecios.has(i.id))

    const categorias = Array.from(new Set(insumosActivos.map(i => i.categoria)))

    return categorias.map(cat => {
      const categInsumos = insumosActivos.filter(i => i.categoria === cat)
      const categInsumoIds = categInsumos.map(i => i.id)
      const preciosCat = allCategPreciosRaw.filter(p => categInsumoIds.includes(p.insumo_id))

      if (preciosCat.length === 0) return null

      // Calcular variación individual de cada insumo que tiene 2+ registros
      // Excluir variaciones extremas (>200%) que son probables errores de carga
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
            // Filtrar outliers: variaciones mayores a 200% son probables errores
            if (Math.abs(varInsumo) <= 200) {
              variacionesPorInsumo.push(varInsumo)
            }
          }
        }
      })

      // La variación de la categoría es el PROMEDIO de las variaciones individuales
      const variacion = variacionesPorInsumo.length > 0
        ? variacionesPorInsumo.reduce((sum, v) => sum + v, 0) / variacionesPorInsumo.length
        : 0

      return {
        categoria: cat,
        label: CATEG_LABELS[cat] || cat,
        color: CATEG_COLORES[cat] || '#6b7280',
        insumos: categInsumos.length, // Solo insumos con precios en el período
        variacion,
        registros: preciosCat.length,
        insumosConVariacion: variacionesPorInsumo.length,
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.variacion) - Math.abs(a!.variacion)) as {
      categoria: string; label: string; color: string; insumos: number; variacion: number; registros: number; insumosConVariacion: number;
    }[]
  }, [allCategPreciosRaw, insumos])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Evolución de Precios</h1>
        <p className="text-gray-600">Comparativa de precios de insumos en el tiempo</p>
      </div>

      {/* Toggle modo */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setModo('insumo')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            modo === 'insumo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Por Insumo
        </button>
        <button
          onClick={() => setModo('categoria')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            modo === 'categoria' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Por Categoría
        </button>
      </div>

      {modo === 'insumo' ? (
        /* ============ MODO INSUMO ============ */
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
                      {CATEG_LABELS[cat] || cat}
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
      ) : (
        /* ============ MODO CATEGORÍA ============ */
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex items-center gap-4">
            <div className="w-64">
              <Select
                label="Categoría"
                options={categoriaOptions}
                value={selectedCategoria}
                onChange={(e) => setSelectedCategoria(e.target.value)}
              />
            </div>
            <div className="w-52">
              <Select
                label="Período"
                options={PERIODOS}
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              />
            </div>
            {selectedCategoria && (
              <button
                onClick={() => setSelectedCategoria('')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                ← Volver a comparativa
              </button>
            )}
            {selectedCategoria && categResumen.length > 0 && (
              <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
                <span>{categResumen.length} insumos</span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-red-500" />
                  {categResumen.filter(r => r.variacion > 0).length} subieron
                </span>
                <span className="flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-green-500" />
                  {categResumen.filter(r => r.variacion < 0).length} bajaron
                </span>
              </div>
            )}
          </div>

          {/* Contenido */}
          {!selectedCategoria ? (
            /* Vista comparativa de todas las categorías */
            isLoadingAllCateg ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <p className="text-gray-500">Cargando datos...</p>
              </div>
            ) : allCategChartData.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <p className="text-gray-400">No hay datos de precios en el período seleccionado</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Gráfico comparativo */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Variación % por Categoría</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={allCategChartData}>
                        <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `${v}%`}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {allCategResumen.map((cat) => (
                          <Line
                            key={cat.categoria}
                            type="monotone"
                            dataKey={cat.label}
                            stroke={cat.color}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 text-center">
                    Variación % respecto al primer día del período (promedio de insumos con movimiento)
                  </p>
                </div>

                {/* Tabla resumen de categorías */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Insumos</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variación</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Registros</th>
                        <th className="px-4 py-3"></th>
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
                            {cat.insumos}
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
                          <td className="px-4 py-3 text-center text-xs text-gray-400">
                            {cat.registros}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setSelectedCategoria(cat.categoria)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Ver detalle →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : isLoadingCateg ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <p className="text-gray-500">Cargando datos...</p>
            </div>
          ) : categResumen.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <p className="text-gray-400">No hay datos de precios en el período seleccionado</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Anterior</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Mín.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Máx.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variación</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Reg.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {categResumen.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{item.nombre}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        ${item.primero.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        ${item.ultimo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-400">
                        ${item.min.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-400">
                        ${item.max.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.variacion > 0 ? (
                            <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                          ) : item.variacion < 0 ? (
                            <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Minus className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          <span className={`text-sm font-bold ${
                            item.variacion > 0 ? 'text-red-600' : item.variacion < 0 ? 'text-green-600' : 'text-gray-500'
                          }`}>
                            {item.variacion > 0 ? '+' : ''}{item.variacion.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-400">
                        {item.registros}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Resumen promedio */}
              <div className="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Promedio de variación: {' '}
                  <span className={`font-bold ${
                    (categResumen.reduce((s, r) => s + r.variacion, 0) / categResumen.length) > 0
                      ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {((categResumen.reduce((s, r) => s + r.variacion, 0) / categResumen.length) > 0 ? '+' : '')}
                    {(categResumen.reduce((s, r) => s + r.variacion, 0) / categResumen.length).toFixed(1)}%
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Ordenado por mayor variación absoluta
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
