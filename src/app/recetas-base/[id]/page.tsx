'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, RefreshCw, ClipboardList } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'

const CATEGORY_COLORS: Record<string, string> = {
  'Carnes': '#d98a8a',
  'Pescados_Mariscos': '#64b5f6',
  'Verduras_Frutas': '#ffd54f',
  'Lacteos_Fiambres': '#ffb74d',
  'Bebidas': '#4fc3f7',
  'Salsas_Recetas': '#81c784',
  'Almacen': '#bdbdbd',
}

interface Insumo {
  id: string
  nombre: string
  unidad_medida: string
  categoria: string
  precio_actual: number | null
  merma_porcentaje: number
  iva_porcentaje: number
  costo_final: number | null
}

interface Ingrediente {
  id: string
  insumo_id: string
  insumo_nombre: string
  unidad_medida: string
  categoria: string
  cantidad: number
  costo_unitario: number
  costo_linea: number
  isNew?: boolean
}

export default function EditarRecetaBasePage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [preparacion, setPreparacion] = useState('')
  const [rendimiento, setRendimiento] = useState('1')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [ingredientesOriginales, setIngredientesOriginales] = useState<string>('')
  const [ingredientesEliminados, setIngredientesEliminados] = useState<string[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [versionReceta, setVersionReceta] = useState('1.0')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    const { data: insumosRaw } = await supabase
      .from('v_insumos_con_precio')
      .select('id, nombre, unidad_medida, categoria, precio_actual, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)
      .order('nombre')

    const insumosData = (insumosRaw || []).map(insumo => ({
      ...insumo,
      costo_final: insumo.precio_actual !== null
        ? insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
        : null
    }))

    if (insumosData) setInsumos(insumosData)

    const { data: receta, error: recetaError } = await supabase
      .from('recetas_base')
      .select('*')
      .eq('id', id)
      .single()

    if (recetaError || !receta) {
      alert('Elaboración no encontrada')
      router.push('/recetas-base')
      return
    }

    setNombre(receta.nombre)
    setDescripcion(receta.descripcion || '')
    setPreparacion(receta.preparacion || '')
    setRendimiento(receta.rendimiento_porciones.toString())
    setVersionReceta(receta.version_receta || '1.0')

    const { data: ingredientesData } = await supabase
      .from('receta_base_ingredientes')
      .select(`
        id, insumo_id, cantidad, costo_linea,
        insumos (nombre, unidad_medida, categoria)
      `)
      .eq('receta_base_id', id)

    if (ingredientesData) {
      const mapped: Ingrediente[] = ingredientesData.map((ing: any) => {
        const insumoInfo = insumosData?.find(i => i.id === ing.insumo_id)
        const costoUnitario = insumoInfo?.costo_final || 0
        const cantidadNum = parseFloat(ing.cantidad)
        return {
          id: ing.id,
          insumo_id: ing.insumo_id,
          insumo_nombre: ing.insumos?.nombre || 'Desconocido',
          unidad_medida: ing.insumos?.unidad_medida || '',
          categoria: insumoInfo?.categoria || 'Almacen',
          cantidad: cantidadNum,
          costo_unitario: costoUnitario,
          costo_linea: cantidadNum * costoUnitario,
        }
      })
      setIngredientes(mapped)
      setIngredientesOriginales(JSON.stringify(mapped.map(i => ({ id: i.insumo_id, cantidad: i.cantidad }))))
    }

    setIsLoading(false)
  }

  function handleAgregarIngrediente() {
    if (!selectedInsumo || !cantidad || parseFloat(cantidad) <= 0) return

    const insumo = insumos.find(i => i.id === selectedInsumo)
    if (!insumo || ingredientes.some(ing => ing.insumo_id === selectedInsumo)) return

    const costoUnitario = insumo.costo_final || 0
    const cantidadNum = parseFloat(cantidad)

    setIngredientes([...ingredientes, {
      id: crypto.randomUUID(),
      insumo_id: insumo.id,
      insumo_nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      categoria: insumo.categoria,
      cantidad: cantidadNum,
      costo_unitario: costoUnitario,
      costo_linea: cantidadNum * costoUnitario,
      isNew: true,
    }])
    setSelectedInsumo('')
    setCantidad('')
  }

  function handleEliminarIngrediente(ing: Ingrediente) {
    if (!ing.isNew) setIngredientesEliminados([...ingredientesEliminados, ing.id])
    setIngredientes(ingredientes.filter(i => i.id !== ing.id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parseFloat(nuevaCantidad) || 0
    setIngredientes(ingredientes.map(ing =>
      ing.id === id ? { ...ing, cantidad: cantidadNum, costo_linea: ing.costo_unitario * cantidadNum } : ing
    ))
  }

  function handleRecalcularCostos() {
    setIngredientes(ingredientes.map(ing => {
      const insumo = insumos.find(i => i.id === ing.insumo_id)
      const costoUnitario = insumo?.costo_final || 0
      return { ...ing, costo_unitario: costoUnitario, costo_linea: costoUnitario * ing.cantidad }
    }))
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
  const costoPorPorcion = parseFloat(rendimiento) > 0 ? costoTotal / parseFloat(rendimiento) : 0

  async function handleGuardar() {
    if (!nombre.trim() || ingredientes.length === 0) {
      alert(!nombre.trim() ? 'El nombre es requerido' : 'Agregá al menos un ingrediente')
      return
    }

    setIsSaving(true)

    const ingredientesActuales = JSON.stringify(ingredientes.map(i => ({ id: i.insumo_id, cantidad: i.cantidad })))
    const huboCambios = ingredientesActuales !== ingredientesOriginales || ingredientesEliminados.length > 0
    const currentVersion = parseFloat(versionReceta) || 1.0
    const newVersion = huboCambios ? (currentVersion + 0.1).toFixed(1) : versionReceta

    const { error } = await supabase
      .from('recetas_base')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        preparacion: preparacion.trim() || null,
        rendimiento_porciones: parseInt(rendimiento) || 1,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
        version_receta: newVersion,
      })
      .eq('id', id)

    if (error) {
      alert('Error al actualizar')
      setIsSaving(false)
      return
    }

    if (ingredientesEliminados.length > 0) {
      await supabase.from('receta_base_ingredientes').delete().in('id', ingredientesEliminados)
    }

    for (const ing of ingredientes.filter(i => !i.isNew)) {
      await supabase.from('receta_base_ingredientes').update({ cantidad: ing.cantidad, costo_linea: ing.costo_linea }).eq('id', ing.id)
    }

    const nuevos = ingredientes.filter(i => i.isNew)
    if (nuevos.length > 0) {
      await supabase.from('receta_base_ingredientes').insert(nuevos.map(ing => ({
        receta_base_id: id, insumo_id: ing.insumo_id, cantidad: ing.cantidad, costo_linea: ing.costo_linea,
      })))
    }

    router.push('/recetas-base')
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Cargando...</p></div>
  }

  return (
    <div className="max-w-4xl lg:h-[calc(100vh-80px)] flex flex-col">
      {/* Header fijo */}
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Editar Elaboración</h1>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
        {/* Parte fija superior */}
        <div className="p-3 border-b bg-white">
          {/* Datos básicos - responsive */}
          <div className="grid grid-cols-2 sm:flex gap-2 mb-3">
            <div className="col-span-2 sm:w-52">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-2 sm:py-1.5 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ej: Salsa Criolla"
              />
            </div>
            <div className="sm:w-16">
              <label className="block text-xs font-medium text-gray-700 mb-1">Rinde</label>
              <input
                type="number"
                min="1"
                value={rendimiento}
                onChange={(e) => setRendimiento(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-2 sm:py-1.5 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="col-span-2 sm:flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-2 sm:py-1.5 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Descripción opcional..."
              />
            </div>
          </div>

          {/* Mobile: Stack vertical */}
          <div className="sm:hidden space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Insumo</label>
              <select
                value={selectedInsumo}
                onChange={(e) => setSelectedInsumo(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Seleccionar...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.unidad_medida}) - ${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0"
                />
              </div>
              <Button onClick={handleAgregarIngrediente} className="flex-shrink-0">
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="secondary" size="sm" onClick={handleRecalcularCostos} title="Recalcular">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <div className="flex-1" />
              <Button variant="secondary" size="sm" onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleGuardar} disabled={isSaving}>
                <Save className="w-4 h-4 mr-1" />
                {isSaving ? '...' : 'Guardar'}
              </Button>
            </div>
          </div>

          {/* Desktop: Row */}
          <div className="hidden sm:flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Insumo</label>
              <select
                value={selectedInsumo}
                onChange={(e) => setSelectedInsumo(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Seleccionar...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.unidad_medida}) - ${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cant.</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="0"
              />
            </div>
            <Button onClick={handleAgregarIngrediente} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
            <div className="border-l pl-2 flex gap-1">
              <Button variant="secondary" size="sm" onClick={handleRecalcularCostos} title="Recalcular">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleGuardar} disabled={isSaving}>
                <Save className="w-4 h-4 mr-1" />
                {isSaving ? '...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>

        {/* Parte con scroll */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Tabla ingredientes */}
          {ingredientes.length > 0 ? (
            <>
              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-2">
                {ingredientes.map((ing) => (
                  <div key={ing.id} className={`rounded-lg p-3 border ${ing.isNew ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">{ing.insumo_nombre}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">Cantidad</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={ing.cantidad}
                            onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-500">{ing.unidad_medida}</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 mb-0.5">Costo</p>
                        <p className="text-sm font-bold text-green-700">
                          ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 mb-0.5">Incidencia</p>
                        <p className="text-sm font-semibold text-blue-700">
                          {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(0)}%` : '0%'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Insumo</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cantidad</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">C.Unit.</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">C.Total</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-blue-50">%</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ingredientes.map((ing) => (
                      <tr key={ing.id} className={ing.isNew ? 'bg-green-50' : ''}>
                        <td className="px-2 py-1.5 text-xs text-gray-900">{ing.insumo_nombre}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={ing.cantidad}
                            onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                          />
                          <span className="ml-1 text-xs text-gray-500">{ing.unidad_medida}</span>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right text-gray-600 tabular-nums">
                          ${ing.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-bold text-green-700 bg-green-50 tabular-nums">
                          ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-semibold text-blue-700 bg-blue-50">
                          {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(0)}%` : '0%'}
                        </td>
                        <td className="px-2 py-1.5">
                          <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-4 border rounded-lg bg-gray-50">
              <p className="text-xs text-gray-500">No hay ingredientes agregados</p>
            </div>
          )}

          {/* Layout 50/50: Gráfico + Preparación */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Composición del costo */}
            <div className="border rounded-lg bg-gray-50 p-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Composición del costo</h4>
              {ingredientes.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-xs">Sin ingredientes</div>
              ) : ingredientes.length === 1 ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: CATEGORY_COLORS[ingredientes[0].categoria] || '#bdbdbd' }}>
                    100%
                  </div>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    <span className="font-medium">{ingredientes[0].insumo_nombre}</span>
                    <span className="text-gray-400"> · único</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={110}>
                    <PieChart>
                      <Pie
                        data={ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2).map(ing => ({
                          name: ing.insumo_nombre,
                          value: ing.costo_linea,
                          categoria: ing.categoria,
                          porcentaje: ((ing.costo_linea / costoTotal) * 100).toFixed(0),
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={42}
                        innerRadius={18}
                        dataKey="value"
                        label={({ name, porcentaje }: any) => `${name.substring(0, 8)} ${porcentaje}%`}
                        fontSize={9}
                      >
                        {ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2).map((ing, idx) => (
                          <Cell key={idx} fill={CATEGORY_COLORS[ing.categoria] || '#bdbdbd'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  {(() => {
                    const dominante = ingredientes.reduce((max, ing) => ing.costo_linea > max.costo_linea ? ing : max, ingredientes[0])
                    const pct = costoTotal > 0 ? ((dominante.costo_linea / costoTotal) * 100).toFixed(0) : 0
                    return (
                      <p className="text-[11px] text-gray-500 text-center mt-1">
                        Principal: <span className="font-medium text-gray-700">{dominante.insumo_nombre}</span> ({pct}%)
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Preparación */}
            <div className="border rounded-lg bg-white p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                <h4 className="text-xs font-semibold text-gray-700">Preparación</h4>
              </div>
              <textarea
                value={preparacion}
                onChange={(e) => setPreparacion(e.target.value)}
                placeholder="Ej: Picar cebolla, mezclar con tomate..."
                className="w-full h-32 text-base sm:text-xs border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Resumen de costos */}
          {ingredientes.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-600">Costo Total:</span>
                <span className="text-base font-bold text-gray-900 tabular-nums">
                  ${costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Costo por Porción ({rendimiento} porciones):</span>
                <span className="text-base font-bold text-green-600 tabular-nums">
                  ${costoPorPorcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          )}

          {/* Versión */}
          <div className="mt-2 text-[10px] text-gray-400 text-right">
            Versión {versionReceta}
          </div>
        </div>
      </div>
    </div>
  )
}
