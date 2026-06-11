'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package, ChefHat, RefreshCw } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'
import { formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'

const CATEGORY_COLORS: Record<string, string> = {
  'Carnes': '#9B2C2C',
  'Pescados_Mariscos': '#4A6572',
  'Verduras_Frutas': '#3D8B5E',
  'Lacteos_Fiambres': '#5C7A5E',
  'Bebidas': '#C4704B',
  'Almacen': '#A67B3D',
  'Elaboracion': '#7C3AED',
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
  cantidadInput: string
  cantidadBase: number
  costo_unitario: number
  costo_linea: number
  isNew?: boolean
}

function factorDisplay(unidad: string): number {
  return unidad === 'lt' ? 1000 : 1
}
function unidadDisplay(unidad: string): string {
  return unidad === 'lt' ? 'ml' : unidad
}
function baseADisplayStr(base: number, unidad: string): string {
  const v = base * factorDisplay(unidad)
  return v % 1 === 0 ? String(v) : v.toString().replace('.', ',')
}

export default function EditarTragoPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewMode = searchParams.get('view') === 'true'
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vaso, setVaso] = useState('')
  const [tecnica, setTecnica] = useState('')
  const [pasoAPaso, setPasoAPaso] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [margenObjetivo, setMargenObjetivo] = useState('25')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [ingredientesEliminados, setIngredientesEliminados] = useState<string[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetasBase, setRecetasBase] = useState<RecetaBase[]>([])
  const [tipoIngrediente, setTipoIngrediente] = useState<'insumo' | 'receta_base'>('insumo')
  const [filtroCategoria, setFiltroCategoria] = useState('Bebidas')
  const [selectedItem, setSelectedItem] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isInPapelera, setIsInPapelera] = useState(false)

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
    if (recetasConCostoReal) setRecetasBase(recetasConCostoReal)

    // Cargar trago
    const { data: trago, error: tragoError } = await supabase
      .from('tragos')
      .select('*')
      .eq('id', id)
      .single()

    if (tragoError || !trago) {
      alert('Trago no encontrado')
      router.push('/tragos')
      return
    }

    setNombre(trago.nombre)
    setDescripcion(trago.descripcion || '')
    setVaso(trago.vaso || '')
    setTecnica(trago.tecnica || '')
    setPasoAPaso(trago.paso_a_paso || '')
    setPrecioVenta(trago.precio_venta ? baseADisplayStr(Number(trago.precio_venta), 'unidad') : '')
    setMargenObjetivo(trago.margen_objetivo ? baseADisplayStr(Number(trago.margen_objetivo), 'unidad') : '25')
    setIsInPapelera(trago.activo === false)
    setIsReadOnly(trago.activo === false || viewMode)

    // Cargar ingredientes
    const { data: ingredientesData } = await supabase
      .from('trago_ingredientes')
      .select(`
        id, insumo_id, receta_base_id, cantidad, costo_linea,
        insumos (nombre, unidad_medida, categoria),
        recetas_base (nombre, costo_por_porcion)
      `)
      .eq('trago_id', id)

    if (ingredientesData) {
      const mapped: Ingrediente[] = ingredientesData.map((ing: any) => {
        if (ing.insumo_id) {
          const insumoInfo = insumosData?.find(i => i.id === ing.insumo_id)
          const costoUnitario = insumoInfo?.costo_final || 0
          const cantidadBase = Number(ing.cantidad) || 0
          const unidad = ing.insumos?.unidad_medida || ''
          return {
            id: ing.id,
            tipo: 'insumo' as const,
            item_id: ing.insumo_id,
            nombre: ing.insumos?.nombre || 'Desconocido',
            unidad,
            categoria: insumoInfo?.categoria || ing.insumos?.categoria || 'Bebidas',
            cantidadInput: baseADisplayStr(cantidadBase, unidad),
            cantidadBase,
            costo_unitario: costoUnitario,
            costo_linea: cantidadBase * costoUnitario,
          }
        } else {
          const recetaInfo = recetasConCostoReal?.find(r => r.id === ing.receta_base_id)
          const costoUnitario = recetaInfo?.costo_por_porcion || 0
          const cantidadBase = Number(ing.cantidad) || 0
          return {
            id: ing.id,
            tipo: 'receta_base' as const,
            item_id: ing.receta_base_id,
            nombre: ing.recetas_base?.nombre || 'Desconocido',
            unidad: 'porción',
            categoria: 'Elaboracion',
            cantidadInput: baseADisplayStr(cantidadBase, 'porción'),
            cantidadBase,
            costo_unitario: costoUnitario,
            costo_linea: cantidadBase * costoUnitario,
          }
        }
      })
      setIngredientes(mapped)
    }

    setIsLoading(false)
  }

  function handleAgregarIngrediente() {
    if (!selectedItem || !cantidad || parsearNumero(cantidad) <= 0) {
      alert('Seleccioná un ingrediente y una cantidad válida')
      return
    }

    const yaExiste = ingredientes.some(
      ing => ing.item_id === selectedItem && ing.tipo === tipoIngrediente
    )
    if (yaExiste) {
      alert('Este ingrediente ya está en el trago')
      return
    }

    let nuevoIngrediente: Ingrediente

    if (tipoIngrediente === 'insumo') {
      const insumo = insumos.find(i => i.id === selectedItem)
      if (!insumo) return

      const costoUnitario = insumo.costo_final || 0
      const cantidadBase = parsearNumero(cantidad) / factorDisplay(insumo.unidad_medida)

      nuevoIngrediente = {
        id: crypto.randomUUID(),
        tipo: 'insumo',
        item_id: insumo.id,
        nombre: insumo.nombre,
        unidad: insumo.unidad_medida,
        categoria: insumo.categoria,
        cantidadInput: cantidad,
        cantidadBase,
        costo_unitario: costoUnitario,
        costo_linea: cantidadBase * costoUnitario,
        isNew: true,
      }
    } else {
      const receta = recetasBase.find(r => r.id === selectedItem)
      if (!receta) return

      const cantidadBase = parsearNumero(cantidad)
      const costoUnitario = receta.costo_por_porcion

      nuevoIngrediente = {
        id: crypto.randomUUID(),
        tipo: 'receta_base',
        item_id: receta.id,
        nombre: receta.nombre,
        unidad: 'porción',
        categoria: 'Elaboracion',
        cantidadInput: cantidad,
        cantidadBase,
        costo_unitario: costoUnitario,
        costo_linea: cantidadBase * costoUnitario,
        isNew: true,
      }
    }

    setIngredientes([...ingredientes, nuevoIngrediente])
    setSelectedItem('')
    setCantidad('')
  }

  function handleEliminarIngrediente(ing: Ingrediente) {
    if (!ing.isNew) {
      setIngredientesEliminados([...ingredientesEliminados, ing.id])
    }
    setIngredientes(ingredientes.filter(i => i.id !== ing.id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    setIngredientes(ingredientes.map(ing => {
      if (ing.id === id) {
        const cantidadBase = parsearNumero(nuevaCantidad) / factorDisplay(ing.unidad)
        return { ...ing, cantidadInput: nuevaCantidad, cantidadBase, costo_linea: cantidadBase * ing.costo_unitario }
      }
      return ing
    }))
  }

  function handleRecalcularCostos() {
    setIngredientes(ingredientes.map(ing => {
      if (ing.tipo === 'insumo') {
        const insumo = insumos.find(i => i.id === ing.item_id)
        const costoUnitario = insumo?.costo_final || 0
        return { ...ing, costo_unitario: costoUnitario, costo_linea: ing.cantidadBase * costoUnitario }
      } else {
        const receta = recetasBase.find(r => r.id === ing.item_id)
        const costoUnitario = receta?.costo_por_porcion || 0
        return { ...ing, costo_unitario: costoUnitario, costo_linea: ing.cantidadBase * costoUnitario }
      }
    }))
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
  const precioVentaNum = parsearNumero(precioVenta)
  const beverageCost = precioVentaNum > 0 ? (costoTotal / precioVentaNum) * 100 : 0
  const markup = costoTotal > 0 && precioVentaNum > 0 ? precioVentaNum / costoTotal : 0
  const margenObjetivoNum = parsearNumero(margenObjetivo) || 25
  const precioSugerido = costoTotal > 0 && margenObjetivoNum > 0 ? costoTotal / (margenObjetivoNum / 100) : 0

  function bcClasses(bc: number): string {
    if (bc <= 22) return 'text-green-600'
    if (bc <= 28) return 'text-amber-500'
    return 'text-red-600'
  }

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

    const { error: tragoError } = await supabase
      .from('tragos')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        vaso: vaso.trim() || null,
        tecnica: tecnica.trim() || null,
        paso_a_paso: pasoAPaso.trim() || null,
        precio_venta: precioVentaNum,
        margen_objetivo: margenObjetivoNum,
        costo_total: costoTotal,
      })
      .eq('id', id)

    if (tragoError) {
      console.error('Error actualizando trago:', tragoError)
      alert('Error al actualizar el trago')
      setIsSaving(false)
      return
    }

    if (ingredientesEliminados.length > 0) {
      await supabase.from('trago_ingredientes').delete().in('id', ingredientesEliminados)
    }

    for (const ing of ingredientes.filter(i => !i.isNew)) {
      await supabase
        .from('trago_ingredientes')
        .update({ cantidad: ing.cantidadBase, costo_linea: ing.costo_linea })
        .eq('id', ing.id)
    }

    const nuevos = ingredientes.filter(i => i.isNew)
    if (nuevos.length > 0) {
      await supabase
        .from('trago_ingredientes')
        .insert(nuevos.map(ing => ({
          trago_id: id,
          insumo_id: ing.tipo === 'insumo' ? ing.item_id : null,
          receta_base_id: ing.tipo === 'receta_base' ? ing.item_id : null,
          cantidad: ing.cantidadBase,
          costo_linea: ing.costo_linea,
        })))
    }

    setIsSaving(false)
    router.push('/tragos')
  }

  const insumosFiltrados = filtroCategoria
    ? insumos.filter(i => i.categoria === filtroCategoria)
    : insumos

  const selectedInsumo = insumos.find(i => i.id === selectedItem)
  const unidadCantidad = tipoIngrediente === 'insumo'
    ? (selectedInsumo ? unidadDisplay(selectedInsumo.unidad_medida) : 'ml')
    : 'porción'

  const opcionesItems = tipoIngrediente === 'insumo'
    ? insumosFiltrados.map(i => ({
        value: i.id,
        label: `${i.nombre} (${unidadDisplay(i.unidad_medida)}) - $${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/${i.unidad_medida}`
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
        <div className="flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            {isReadOnly ? 'Ver Trago' : 'Editar Trago'}
          </h1>
          {isInPapelera && <span className="text-xs text-red-500">En papelera</span>}
        </div>
        {ingredientes.length > 0 && (
          <div className="flex gap-2">
            <div className="bg-green-50 rounded-lg px-3 py-1 text-center">
              <p className="text-[10px] text-gray-500">Costo</p>
              <p className="text-base sm:text-lg font-bold text-green-600 tabular-nums font-mono">
                ${costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </p>
            </div>
            {precioVentaNum > 0 && (
              <div className="bg-gray-100 rounded-lg px-3 py-1 text-center">
                <p className="text-[10px] text-gray-500">Bev. Cost</p>
                <p className={`text-base sm:text-lg font-bold tabular-nums font-mono ${bcClasses(beverageCost)}`}>
                  {beverageCost.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 space-y-4">
        {/* Datos básicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={isReadOnly}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Ej: Gin Tonic"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vaso</label>
            <input
              value={vaso}
              onChange={(e) => setVaso(e.target.value)}
              disabled={isReadOnly}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Ej: Copa balón"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Técnica</label>
            <input
              value={tecnica}
              onChange={(e) => setTecnica(e.target.value)}
              disabled={isReadOnly}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Ej: Refrescado"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={isReadOnly}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Descripción opcional..."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Preparación</label>
            <textarea
              value={pasoAPaso}
              onChange={(e) => setPasoAPaso(e.target.value)}
              disabled={isReadOnly}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="1. Llenar la copa con hielo..."
            />
          </div>
        </div>

        {/* Agregar ingrediente */}
        {!isReadOnly && (
          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Ingredientes</h3>

            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => { setTipoIngrediente('insumo'); setSelectedItem(''); setFiltroCategoria('Bebidas') }}
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
              <Button variant="secondary" size="sm" onClick={handleRecalcularCostos} title="Recalcular costos" className="ml-auto">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-3">
              {tipoIngrediente === 'insumo' && (
                <div className="sm:w-40">
                  <Select
                    label="Categoría"
                    options={[
                      { value: '', label: 'Todas' },
                      { value: 'Bebidas', label: 'Bebidas' },
                      { value: 'Almacen', label: 'Almacén' },
                      { value: 'Verduras_Frutas', label: 'Verduras/Frutas' },
                      { value: 'Lacteos_Fiambres', label: 'Lácteos' },
                    ]}
                    value={filtroCategoria}
                    onChange={(e) => { setFiltroCategoria(e.target.value); setSelectedItem('') }}
                  />
                </div>
              )}
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
                    label={`Cantidad (${unidadCantidad})`}
                    type="text"
                    inputMode="decimal"
                    value={cantidad}
                    onChange={(e) => setCantidad(formatearInputNumero(e.target.value))}
                    placeholder="0"
                  />
                </div>
                <Button onClick={handleAgregarIngrediente} className="flex-shrink-0">
                  <Plus className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Agregar</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de ingredientes */}
        <div className={isReadOnly ? 'border-t pt-3' : ''}>
          {ingredientes.length > 0 ? (
            <>
              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-2">
                {ingredientes.map((ing) => (
                  <div key={ing.id} className={`rounded-lg p-3 border ${ing.isNew ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {ing.tipo === 'insumo' ? (
                          <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <ChefHat className="w-4 h-4 text-purple-600 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate">{ing.nombre}</span>
                      </div>
                      {!isReadOnly && (
                        <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">Cantidad</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ing.cantidadInput}
                            onChange={(e) => handleCantidadChange(ing.id, formatearInputNumero(e.target.value))}
                            disabled={isReadOnly}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                          <span className="text-xs text-gray-500">{unidadDisplay(ing.unidad)}</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 mb-0.5">Costo</p>
                        <p className="text-sm font-bold text-green-700 font-mono">
                          ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 mb-0.5">Incidencia</p>
                        <p className="text-sm font-semibold text-blue-700 font-mono">
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
                      {!isReadOnly && <th className="px-2 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ingredientes.map((ing) => (
                      <tr key={ing.id} className={ing.isNew ? 'bg-green-50' : ''}>
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
                            value={ing.cantidadInput}
                            onChange={(e) => handleCantidadChange(ing.id, formatearInputNumero(e.target.value))}
                            disabled={isReadOnly}
                            className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                          <span className="ml-1 text-xs text-gray-500">{unidadDisplay(ing.unidad)}</span>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right text-gray-600 tabular-nums font-mono">
                          ${ing.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-bold text-green-700 bg-green-50 tabular-nums font-mono">
                          ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-right font-semibold text-blue-700 bg-blue-50 font-mono">
                          {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(0)}%` : '0%'}
                        </td>
                        {!isReadOnly && (
                          <td className="px-2 py-1.5">
                            <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-4 border rounded-lg bg-gray-50">
              <p className="text-sm text-gray-500">No hay ingredientes agregados</p>
            </div>
          )}
        </div>

        {/* Resumen de costos y rentabilidad */}
        <div className="border-t pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Costo del trago:</span>
                <span className="text-lg font-bold text-green-600 tabular-nums font-mono">
                  <span className="text-green-400 font-normal">$</span> {costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                <span>Margen objetivo:</span>
                <span className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={margenObjetivo}
                    onChange={(e) => setMargenObjetivo(formatearInputNumero(e.target.value))}
                    disabled={isReadOnly}
                    className="w-12 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-right font-mono disabled:bg-gray-100"
                  />
                  <span>%</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Precio sugerido:</span>
                <span className="font-mono">${precioSugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Precio de venta</label>
              <input
                type="text"
                inputMode="decimal"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(formatearInputNumero(e.target.value))}
                disabled={isReadOnly}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="0"
              />
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className="text-gray-600">Beverage Cost:</span>
                <span className={`font-bold tabular-nums font-mono ${bcClasses(beverageCost)}`}>
                  {precioVentaNum > 0 ? `${beverageCost.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Markup:</span>
                <span className="font-mono">{markup > 0 ? `×${markup.toFixed(1)}` : '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t pt-3">
          <Button variant="secondary" onClick={() => router.back()} className="w-full sm:w-auto">
            {isReadOnly ? 'Volver' : 'Cancelar'}
          </Button>
          {!isReadOnly && (
            <Button onClick={handleGuardar} disabled={isSaving} className="w-full sm:w-auto">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Guardando...' : 'Guardar Trago'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
