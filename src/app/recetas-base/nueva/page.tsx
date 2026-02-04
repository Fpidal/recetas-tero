'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
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
  costo_unitario: number // Costo final por unidad (precio + IVA + merma)
  costo_linea: number
}

export default function NuevaRecetaBasePage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
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

    // Obtener insumos con su precio actual más bajo
    const { data: insumosData } = await supabase
      .from('insumos')
      .select('id, nombre, unidad_medida, categoria, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)
      .order('nombre')

    // Obtener todos los precios activos
    const { data: preciosData } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio')
      .eq('es_precio_actual', true)

    // Mapear insumos con su precio más bajo y costo final
    const insumosConPrecios: Insumo[] = (insumosData || []).map(insumo => {
      const preciosInsumo = preciosData?.filter(p => p.insumo_id === insumo.id) || []
      const precioMinimo = preciosInsumo.length > 0
        ? Math.min(...preciosInsumo.map(p => p.precio))
        : null
      // Calcular costo final: precio * (1 + IVA) * (1 + merma)
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

    // Verificar si ya existe
    const yaExiste = ingredientes.some(ing => ing.insumo_id === selectedInsumo)
    if (yaExiste) {
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
    }

    setIngredientes([...ingredientes, nuevoIngrediente])
    setSelectedInsumo('')
    setCantidad('')
  }

  function handleEliminarIngrediente(id: string) {
    setIngredientes(ingredientes.filter(ing => ing.id !== id))
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

    // Crear la receta base
    const { data: receta, error: recetaError } = await supabase
      .from('recetas_base')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        rendimiento_porciones: parseInt(rendimiento) || 1,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
        activo: true,
      })
      .select()
      .single()

    if (recetaError) {
      console.error('Error creando receta:', recetaError)
      alert('Error al crear la receta')
      setIsSaving(false)
      return
    }

    // Insertar ingredientes
    const ingredientesData = ingredientes.map(ing => ({
      receta_base_id: receta.id,
      insumo_id: ing.insumo_id,
      cantidad: ing.cantidad,
      costo_linea: ing.costo_linea,
    }))

    const { error: ingError } = await supabase
      .from('receta_base_ingredientes')
      .insert(ingredientesData)

    if (ingError) {
      console.error('Error creando ingredientes:', ingError)
      alert('Receta creada pero hubo un error con los ingredientes')
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
          <h1 className="text-2xl font-bold text-gray-900">Nueva Receta Base</h1>
          <p className="text-gray-600">Salsas, guarniciones, preparados</p>
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
          <h3 className="text-lg font-medium text-gray-900 mb-4">Ingredientes</h3>

          <div className="flex gap-3 items-end mb-4">
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
            <div className="w-28">
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
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-green-50">Costo Total</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-blue-50">Incidencia</th>
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ingredientes.map((ing) => (
                    <tr key={ing.id}>
                      <td className="px-3 py-3 text-sm text-gray-900">{ing.insumo_nombre}</td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={ing.cantidad}
                          onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                        <span className="ml-1 text-sm text-gray-500">{ing.unidad_medida}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-600 tabular-nums">
                        <span className="text-gray-400">$</span><span className="ml-1">{ing.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-green-700 bg-green-50 tabular-nums">
                        <span className="text-green-500 font-normal">$</span><span className="ml-1">{ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-blue-700 bg-blue-50">
                        {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(1)}%` : '0%'}
                      </td>
                      <td className="px-2 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarIngrediente(ing.id)}
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
            {isSaving ? 'Guardando...' : 'Guardar Receta'}
          </Button>
        </div>
      </div>
    </div>
  )
}
