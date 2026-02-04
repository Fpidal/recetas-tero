'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, RefreshCw } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'

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
  costo_unitario: number // Costo final por unidad (precio + IVA + merma)
  costo_linea: number
  isNew?: boolean
}

export default function EditarRecetaBasePage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [rendimiento, setRendimiento] = useState('1')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [ingredientesEliminados, setIngredientesEliminados] = useState<string[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    // Cargar insumos
    const { data: insumosRaw } = await supabase
      .from('v_insumos_con_precio')
      .select('id, nombre, unidad_medida, categoria, precio_actual, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)
      .order('nombre')

    // Calcular costo final para cada insumo
    const insumosData = (insumosRaw || []).map(insumo => ({
      ...insumo,
      costo_final: insumo.precio_actual !== null
        ? insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
        : null
    }))

    if (insumosData) {
      setInsumos(insumosData)
    }

    // Cargar receta
    const { data: receta, error: recetaError } = await supabase
      .from('recetas_base')
      .select('*')
      .eq('id', id)
      .single()

    if (recetaError || !receta) {
      alert('Receta no encontrada')
      router.push('/recetas-base')
      return
    }

    setNombre(receta.nombre)
    setDescripcion(receta.descripcion || '')
    setRendimiento(receta.rendimiento_porciones.toString())

    // Cargar ingredientes
    const { data: ingredientesData } = await supabase
      .from('receta_base_ingredientes')
      .select(`
        id,
        insumo_id,
        cantidad,
        costo_linea,
        insumos (
          nombre,
          unidad_medida,
          categoria,
          merma_porcentaje,
          iva_porcentaje
        )
      `)
      .eq('receta_base_id', id)

    if (ingredientesData) {
      const mappedIngredientes: Ingrediente[] = ingredientesData.map((ing: any) => {
        const insumoInfo = insumosData?.find(i => i.id === ing.insumo_id)
        const costoUnitario = insumoInfo?.costo_final || 0
        const cantidadNum = parseFloat(ing.cantidad)
        return {
          id: ing.id,
          insumo_id: ing.insumo_id,
          insumo_nombre: ing.insumos?.nombre || 'Desconocido',
          unidad_medida: ing.insumos?.unidad_medida || '',
          categoria: insumoInfo?.categoria || ing.insumos?.categoria || 'Almacen',
          cantidad: cantidadNum,
          costo_unitario: costoUnitario,
          costo_linea: cantidadNum * costoUnitario,
        }
      })
      setIngredientes(mappedIngredientes)
    }

    setIsLoading(false)
  }

  function calcularCostoLinea(costoUnitario: number, cantidad: number): number {
    return cantidad * costoUnitario
  }

  function handleAgregarIngrediente() {
    if (!selectedInsumo || !cantidad || parseFloat(cantidad) <= 0) {
      alert('Seleccioná un insumo y una cantidad válida')
      return
    }

    const insumo = insumos.find(i => i.id === selectedInsumo)
    if (!insumo) return

    if (ingredientes.some(ing => ing.insumo_id === selectedInsumo)) {
      alert('Este insumo ya está en la receta')
      return
    }

    const costoUnitario = insumo.costo_final || 0
    const cantidadNum = parseFloat(cantidad)
    const costoLinea = calcularCostoLinea(costoUnitario, cantidadNum)

    const nuevoIngrediente: Ingrediente = {
      id: crypto.randomUUID(),
      insumo_id: insumo.id,
      insumo_nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      categoria: insumo.categoria,
      cantidad: cantidadNum,
      costo_unitario: costoUnitario,
      costo_linea: costoLinea,
      isNew: true,
    }

    setIngredientes([...ingredientes, nuevoIngrediente])
    setSelectedInsumo('')
    setCantidad('')
  }

  function handleEliminarIngrediente(ing: Ingrediente) {
    if (!ing.isNew) {
      setIngredientesEliminados([...ingredientesEliminados, ing.id])
    }
    setIngredientes(ingredientes.filter(i => i.id !== ing.id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parseFloat(nuevaCantidad) || 0
    setIngredientes(ingredientes.map(ing => {
      if (ing.id === id) {
        return {
          ...ing,
          cantidad: cantidadNum,
          costo_linea: calcularCostoLinea(ing.costo_unitario, cantidadNum)
        }
      }
      return ing
    }))
  }

  async function handleRecalcularCostos() {
    // Recalcular costos con precios actuales
    const updated = ingredientes.map(ing => {
      const insumo = insumos.find(i => i.id === ing.insumo_id)
      const costoUnitario = insumo?.costo_final || 0
      return {
        ...ing,
        costo_unitario: costoUnitario,
        costo_linea: calcularCostoLinea(costoUnitario, ing.cantidad)
      }
    })
    setIngredientes(updated)
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
  const costoPorPorcion = parseFloat(rendimiento) > 0 ? costoTotal / parseFloat(rendimiento) : 0

  async function handleGuardar() {
    if (!nombre.trim()) {
      alert('El nombre es requerido')
      return
    }

    if (ingredientes.length === 0) {
      alert('Agregá al menos un ingrediente')
      return
    }

    setIsSaving(true)

    // Actualizar receta
    const { error: recetaError } = await supabase
      .from('recetas_base')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        rendimiento_porciones: parseInt(rendimiento) || 1,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
      })
      .eq('id', id)

    if (recetaError) {
      console.error('Error actualizando receta:', recetaError)
      alert('Error al actualizar la receta')
      setIsSaving(false)
      return
    }

    // Eliminar ingredientes marcados
    if (ingredientesEliminados.length > 0) {
      await supabase
        .from('receta_base_ingredientes')
        .delete()
        .in('id', ingredientesEliminados)
    }

    // Actualizar ingredientes existentes
    for (const ing of ingredientes.filter(i => !i.isNew)) {
      await supabase
        .from('receta_base_ingredientes')
        .update({
          cantidad: ing.cantidad,
          costo_linea: ing.costo_linea,
        })
        .eq('id', ing.id)
    }

    // Insertar nuevos ingredientes
    const nuevos = ingredientes.filter(i => i.isNew)
    if (nuevos.length > 0) {
      await supabase
        .from('receta_base_ingredientes')
        .insert(nuevos.map(ing => ({
          receta_base_id: id,
          insumo_id: ing.insumo_id,
          cantidad: ing.cantidad,
          costo_linea: ing.costo_linea,
        })))
    }

    setIsSaving(false)
    router.push('/recetas-base')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar Receta Base</h1>
          <p className="text-gray-600">{nombre}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Datos básicos */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input
              label="Nombre *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Salsa Criolla"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Descripción opcional..."
            />
          </div>
          <Input
            label="Rendimiento (porciones)"
            type="number"
            min="1"
            value={rendimiento}
            onChange={(e) => setRendimiento(e.target.value)}
          />
        </div>

        {/* Agregar ingrediente */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Ingredientes</h3>
            <Button variant="secondary" size="sm" onClick={handleRecalcularCostos}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Recalcular Costos
            </Button>
          </div>

          <div className="flex gap-4 items-end mb-4">
            <div className="flex-1">
              <Select
                label="Insumo"
                options={[
                  { value: '', label: 'Seleccionar insumo...' },
                  ...insumos.map(i => ({
                    value: i.id,
                    label: `${i.nombre} (${i.unidad_medida}) - $${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                  }))
                ]}
                value={selectedInsumo}
                onChange={(e) => setSelectedInsumo(e.target.value)}
              />
            </div>
            <div className="w-32">
              <Input
                label="Cantidad"
                type="number"
                step="0.001"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button onClick={handleAgregarIngrediente}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>

          {/* Lista de ingredientes */}
          {ingredientes.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-green-50">Costo Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-blue-50">Incidencia</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ingredientes.map((ing) => (
                    <tr key={ing.id} className={ing.isNew ? 'bg-green-50' : ''}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {ing.insumo_nombre}
                        {ing.isNew && (
                          <span className="ml-2 text-xs text-green-600">(nuevo)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={ing.cantidad}
                          onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                        <span className="ml-1 text-sm text-gray-500">{ing.unidad_medida}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 tabular-nums">
                        <span className="text-gray-400">$</span><span className="ml-1">{ing.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-green-700 bg-green-50 tabular-nums">
                        <span className="text-green-500 font-normal">$</span><span className="ml-1">{ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-blue-700 bg-blue-50">
                        {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(1)}%` : '0%'}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarIngrediente(ing)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 border rounded-lg bg-gray-50">
              <p className="text-gray-500">No hay ingredientes agregados</p>
            </div>
          )}
        </div>

        {/* Gráfico de incidencia */}
        {ingredientes.length > 0 && costoTotal > 0 && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Incidencia por Ingrediente</h3>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={(() => {
                      const filtered = ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2)
                      return filtered.map((ing) => ({
                        name: ing.insumo_nombre,
                        value: ing.costo_linea,
                        categoria: ing.categoria,
                        porcentaje: ((ing.costo_linea / costoTotal) * 100).toFixed(1),
                      }))
                    })()}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, porcentaje }: any) => `${name} ${porcentaje}%`}
                  >
                    {ingredientes
                      .filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2)
                      .map((ing, idx) => (
                        <Cell key={idx} fill={CATEGORY_COLORS[ing.categoria] || '#bdbdbd'} />
                      ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Resumen de costos */}
        <div className="border-t pt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Costo Total:</span>
              <span className="text-xl font-bold text-gray-900 tabular-nums">
                <span className="text-gray-400 font-normal">$</span> {costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Costo por Porción ({rendimiento} porciones):</span>
              <span className="text-xl font-bold text-green-600 tabular-nums">
                <span className="text-green-400 font-normal">$</span> {costoPorPorcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex justify-end gap-3 border-t pt-6">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>
    </div>
  )
}
