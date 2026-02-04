'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, ClipboardList } from 'lucide-react'
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
  merma_porcentaje: number
  iva_porcentaje: number
  precio_actual: number | null
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
}

export default function NuevaRecetaBasePage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [preparacion, setPreparacion] = useState('')
  const [rendimiento, setRendimiento] = useState('1')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchInsumos()
  }, [])

  async function fetchInsumos() {
    setIsLoading(true)

    const { data: insumosData } = await supabase
      .from('insumos')
      .select('id, nombre, unidad_medida, categoria, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)
      .order('nombre')

    const { data: preciosData } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio')
      .eq('es_precio_actual', true)

    const insumosConPrecios: Insumo[] = (insumosData || []).map(insumo => {
      const preciosInsumo = preciosData?.filter(p => p.insumo_id === insumo.id) || []
      const precioMinimo = preciosInsumo.length > 0
        ? Math.min(...preciosInsumo.map(p => p.precio))
        : null
      const costoFinal = precioMinimo !== null
        ? precioMinimo * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
        : null
      return {
        ...insumo,
        precio_actual: precioMinimo,
        costo_final: costoFinal,
      }
    })

    setInsumos(insumosConPrecios)
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
    }])
    setSelectedInsumo('')
    setCantidad('')
  }

  function handleEliminarIngrediente(id: string) {
    setIngredientes(ingredientes.filter(ing => ing.id !== id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parseFloat(nuevaCantidad) || 0
    setIngredientes(ingredientes.map(ing =>
      ing.id === id ? { ...ing, cantidad: cantidadNum, costo_linea: ing.costo_unitario * cantidadNum } : ing
    ))
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
  const costoPorPorcion = parseFloat(rendimiento) > 0 ? costoTotal / parseFloat(rendimiento) : 0

  async function handleGuardar() {
    if (!nombre.trim() || ingredientes.length === 0) {
      alert(!nombre.trim() ? 'El nombre es requerido' : 'Agregá al menos un ingrediente')
      return
    }

    setIsSaving(true)

    const { data: receta, error: recetaError } = await supabase
      .from('recetas_base')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        preparacion: preparacion.trim() || null,
        rendimiento_porciones: parseInt(rendimiento) || 1,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
        version_receta: '1.0',
        activo: true,
      })
      .select()
      .single()

    if (recetaError) {
      alert('Error al crear la receta')
      setIsSaving(false)
      return
    }

    const ingredientesData = ingredientes.map(ing => ({
      receta_base_id: receta.id,
      insumo_id: ing.insumo_id,
      cantidad: ing.cantidad,
      costo_linea: ing.costo_linea,
    }))

    await supabase.from('receta_base_ingredientes').insert(ingredientesData)

    router.push('/recetas-base')
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Cargando...</p></div>
  }

  return (
    <div className="max-w-4xl h-[calc(100vh-80px)] flex flex-col">
      {/* Header fijo */}
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Nueva Elaboración</h1>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
        {/* Parte fija superior */}
        <div className="p-3 border-b bg-white">
          {/* Datos básicos */}
          <div className="flex gap-2 mb-3">
            <div className="w-52">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ej: Salsa Criolla"
              />
            </div>
            <div className="w-16">
              <label className="block text-xs font-medium text-gray-700 mb-1">Rinde</label>
              <input
                type="number"
                min="1"
                value={rendimiento}
                onChange={(e) => setRendimiento(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Descripción opcional..."
              />
            </div>
          </div>

          {/* Fila agregar + botones */}
          <div className="flex gap-2 items-end">
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
            <div className="border rounded-lg overflow-hidden">
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
                    <tr key={ing.id}>
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
                        <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4 border rounded-lg bg-gray-50">
              <p className="text-xs text-gray-500">No hay ingredientes agregados</p>
            </div>
          )}

          {/* Layout 50/50: Gráfico + Preparación */}
          <div className="mt-3 grid grid-cols-2 gap-3">
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
                className="w-full h-32 text-xs border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-gray-300"
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
        </div>
      </div>
    </div>
  )
}
