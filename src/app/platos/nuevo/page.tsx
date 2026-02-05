'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package, ChefHat } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'
import { formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'

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

interface RecetaBase {
  id: string
  nombre: string
  costo_por_porcion: number
}

interface Ingrediente {
  id: string
  tipo: 'insumo' | 'receta_base'
  item_id: string
  nombre: string
  unidad: string
  categoria: string
  cantidad: number
  costo_unitario: number // Costo final por unidad
  costo_linea: number
}

export default function NuevoPlatoPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [seccion, setSeccion] = useState('Principales')
  const [descripcion, setDescripcion] = useState('')
  const [pasoAPaso, setPasoAPaso] = useState('')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetasBase, setRecetasBase] = useState<RecetaBase[]>([])
  const [tipoIngrediente, setTipoIngrediente] = useState<'insumo' | 'receta_base'>('insumo')
  const [selectedItem, setSelectedItem] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [rendimiento, setRendimiento] = useState(1)
  const [versionReceta, setVersionReceta] = useState('1.0')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

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

    // Cargar recetas base con ingredientes para recalcular costo real
    const { data: recetasData } = await supabase
      .from('recetas_base')
      .select(`
        id, nombre, costo_por_porcion, rendimiento_porciones,
        receta_base_ingredientes (
          insumo_id,
          cantidad
        )
      `)
      .eq('activo', true)
      .order('nombre')

    // Recalcular costo_por_porcion desde precios actuales de insumos
    const recetasConCostoReal = (recetasData || []).map((r: any) => {
      let costoTotal = 0
      for (const ing of r.receta_base_ingredientes || []) {
        const insumo = insumosData?.find(i => i.id === ing.insumo_id)
        if (insumo?.costo_final) {
          costoTotal += ing.cantidad * insumo.costo_final
        }
      }
      const rendimiento = r.rendimiento_porciones > 0 ? r.rendimiento_porciones : 1
      return {
        id: r.id,
        nombre: r.nombre,
        costo_por_porcion: costoTotal > 0 ? costoTotal / rendimiento : r.costo_por_porcion,
      }
    })

    if (recetasConCostoReal) {
      setRecetasBase(recetasConCostoReal)
    }

    setIsLoading(false)
  }

  function calcularCostoLinea(costoUnitario: number, cantidad: number): number {
    return cantidad * costoUnitario
  }

  function handleAgregarIngrediente() {
    if (!selectedItem || !cantidad || parsearNumero(cantidad) <= 0) {
      alert('Seleccioná un ingrediente y una cantidad válida')
      return
    }

    // Verificar si ya existe
    const yaExiste = ingredientes.some(
      ing => ing.item_id === selectedItem && ing.tipo === tipoIngrediente
    )
    if (yaExiste) {
      alert('Este ingrediente ya está en el plato')
      return
    }

    let nuevoIngrediente: Ingrediente

    if (tipoIngrediente === 'insumo') {
      const insumo = insumos.find(i => i.id === selectedItem)
      if (!insumo) return

      const costoUnitario = insumo.costo_final || 0
      const cantidadNum = parsearNumero(cantidad)
      const costoLinea = calcularCostoLinea(costoUnitario, cantidadNum)

      nuevoIngrediente = {
        id: crypto.randomUUID(),
        tipo: 'insumo',
        item_id: insumo.id,
        nombre: insumo.nombre,
        unidad: insumo.unidad_medida,
        categoria: insumo.categoria,
        cantidad: cantidadNum,
        costo_unitario: costoUnitario,
        costo_linea: costoLinea,
      }
    } else {
      const receta = recetasBase.find(r => r.id === selectedItem)
      if (!receta) return

      const cantidadNum = parsearNumero(cantidad)
      const costoUnitario = receta.costo_por_porcion
      const costoLinea = calcularCostoLinea(costoUnitario, cantidadNum)

      nuevoIngrediente = {
        id: crypto.randomUUID(),
        tipo: 'receta_base',
        item_id: receta.id,
        nombre: receta.nombre,
        unidad: 'porción',
        categoria: 'Salsas_Recetas',
        cantidad: cantidadNum,
        costo_unitario: costoUnitario,
        costo_linea: costoLinea,
      }
    }

    setIngredientes([...ingredientes, nuevoIngrediente])
    setSelectedItem('')
    setCantidad('')
  }

  function handleEliminarIngrediente(id: string) {
    setIngredientes(ingredientes.filter(ing => ing.id !== id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parsearNumero(nuevaCantidad)
    setIngredientes(ingredientes.map(ing => {
      if (ing.id === id) {
        return { ...ing, cantidad: cantidadNum, costo_linea: calcularCostoLinea(ing.costo_unitario, cantidadNum) }
      }
      return ing
    }))
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)

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

    // Crear el plato
    const { data: plato, error: platoError } = await supabase
      .from('platos')
      .insert({
        nombre: nombre.trim(),
        seccion,
        descripcion: descripcion.trim() || null,
        paso_a_paso: pasoAPaso.trim() || null,
        rendimiento_porciones: rendimiento,
        version_receta: versionReceta.trim() || '1.0',
        costo_total: costoTotal,
        activo: true,
      })
      .select()
      .single()

    if (platoError) {
      console.error('Error creando plato:', platoError)
      alert('Error al crear el plato')
      setIsSaving(false)
      return
    }

    // Insertar ingredientes
    const ingredientesData = ingredientes.map(ing => ({
      plato_id: plato.id,
      insumo_id: ing.tipo === 'insumo' ? ing.item_id : null,
      receta_base_id: ing.tipo === 'receta_base' ? ing.item_id : null,
      cantidad: ing.cantidad,
      costo_linea: ing.costo_linea,
    }))

    const { error: ingError } = await supabase
      .from('plato_ingredientes')
      .insert(ingredientesData)

    if (ingError) {
      console.error('Error creando ingredientes:', ingError)
      alert('Plato creado pero hubo un error con los ingredientes')
    }

    setIsSaving(false)
    router.push('/platos')
  }

  const opcionesItems = tipoIngrediente === 'insumo'
    ? insumos.map(i => ({
        value: i.id,
        label: `${i.nombre} (${i.unidad_medida}) - $${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
      }))
    : recetasBase.map(r => ({
        value: r.id,
        label: `${r.nombre} - $${r.costo_por_porcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}/porción`
      }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Nuevo Plato</h1>
          <p className="text-xs sm:text-sm text-gray-600">Receta con insumos y/o recetas base</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 space-y-4">
        {/* Datos básicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Input
              label="Nombre *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Bife de Chorizo con Papas"
            />
          </div>
          <div>
            <Select
              label="Sección *"
              options={[
                { value: 'Entradas', label: 'Entradas' },
                { value: 'Principales', label: 'Principales' },
                { value: 'Pastas y Arroces', label: 'Pastas y Arroces' },
                { value: 'Ensaladas', label: 'Ensaladas' },
                { value: 'Postres', label: 'Postres' },
              ]}
              value={seccion}
              onChange={(e) => setSeccion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Rinde"
              type="number"
              min="1"
              value={rendimiento.toString()}
              onChange={(e) => setRendimiento(parseInt(e.target.value) || 1)}
              placeholder="1"
            />
            <Input
              label="Versión"
              value={versionReceta}
              onChange={(e) => setVersionReceta(e.target.value)}
              placeholder="1.0"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Descripción opcional..."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Preparación
            </label>
            <textarea
              value={pasoAPaso}
              onChange={(e) => setPasoAPaso(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="1. Salpimentar el bife&#10;2. Sellar en plancha..."
            />
          </div>
        </div>

        {/* Agregar ingrediente */}
        <div className="border-t pt-3">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Ingredientes</h3>

          {/* Selector de tipo */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => { setTipoIngrediente('insumo'); setSelectedItem('') }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors ${
                tipoIngrediente === 'insumo'
                  ? 'bg-green-100 text-green-800 border-2 border-green-500'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <Package className="w-4 h-4" />
              Insumo
            </button>
            <button
              type="button"
              onClick={() => { setTipoIngrediente('receta_base'); setSelectedItem('') }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors ${
                tipoIngrediente === 'receta_base'
                  ? 'bg-purple-100 text-purple-800 border-2 border-purple-500'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              Elaboración
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-3">
            <div className="flex-1">
              <Select
                label={tipoIngrediente === 'insumo' ? 'Insumo' : 'Elaboración'}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  ...opcionesItems
                ]}
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
              />
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1 sm:w-32">
                <Input
                  label={tipoIngrediente === 'insumo' ? 'Cantidad' : 'Porciones'}
                  type="text"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(formatearInputNumero(e.target.value))}
                  placeholder="0,00"
                />
              </div>
              <Button onClick={handleAgregarIngrediente} className="flex-shrink-0">
                <Plus className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Agregar</span>
              </Button>
            </div>
          </div>

          {/* Lista de ingredientes */}
          {ingredientes.length > 0 ? (
            <>
              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-2">
                {ingredientes.map((ing) => (
                  <div key={ing.id} className="bg-gray-50 rounded-lg p-3 border">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {ing.tipo === 'insumo' ? (
                          <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <ChefHat className="w-4 h-4 text-purple-600 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate">{ing.nombre}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEliminarIngrediente(ing.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">Cantidad</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ing.cantidad.toString().replace('.', ',')}
                            onChange={(e) => handleCantidadChange(ing.id, formatearInputNumero(e.target.value))}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-500">{ing.unidad}</span>
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
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Tipo</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Ingrediente</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Cantidad</th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">C.Unit.</th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 bg-green-50">C.Total</th>
                      <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 bg-blue-50">%</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ingredientes.map((ing) => (
                      <tr key={ing.id}>
                        <td className="px-2 py-1.5">
                          {ing.tipo === 'insumo' ? (
                            <Package className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <ChefHat className="w-3.5 h-3.5 text-purple-600" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-900">{ing.nombre}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ing.cantidad.toString().replace('.', ',')}
                            onChange={(e) => handleCantidadChange(ing.id, formatearInputNumero(e.target.value))}
                            className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                          />
                          <span className="ml-1 text-xs text-gray-500">{ing.unidad}</span>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEliminarIngrediente(ing.id)}
                          >
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
              <p className="text-sm text-gray-500">No hay ingredientes agregados</p>
              <p className="text-xs text-gray-400 mt-1">
                Agregá insumos directos o recetas base
              </p>
            </div>
          )}
        </div>

        {/* Gráfico de incidencia */}
        {ingredientes.length > 0 && costoTotal > 0 && (
          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Incidencia por Ingrediente</h3>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={(() => {
                      const filtered = ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2)
                      return filtered.map((ing) => ({
                        name: ing.nombre,
                        value: ing.costo_linea,
                        categoria: ing.categoria,
                        porcentaje: ((ing.costo_linea / costoTotal) * 100).toFixed(0),
                      }))
                    })()}
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, porcentaje }: any) => `${name} ${porcentaje}%`}
                    fontSize={11}
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
        <div className="border-t pt-3">
          <div className="bg-gray-50 rounded-lg px-4 py-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Costo Total del Plato:</span>
              <span className="text-lg font-bold text-green-600 tabular-nums">
                <span className="text-green-400 font-normal">$</span> {costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t pt-3">
          <Button variant="secondary" onClick={() => router.back()} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar Plato'}
          </Button>
        </div>
      </div>
    </div>
  )
}
