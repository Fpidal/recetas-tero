'use client'

import { useState, useEffect } from 'react'
import { Plus, AlertTriangle, CheckCircle, AlertCircle, Pencil, Trash2, X, Save, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select, Modal } from '@/components/ui'

const SECCIONES_ORDEN = ['Entradas', 'Principales', 'Pastas y Arroces', 'Ensaladas', 'Postres']

interface PlatoConCosto {
  id: string
  nombre: string
  seccion: string
  ingredientes_texto: string
  updated_at: string
  costo_total: number
}

interface CartaItem {
  id: string
  plato_id: string
  plato_nombre: string
  plato_seccion: string
  plato_ingredientes: string
  plato_dias_actualizacion: number
  plato_costo: number
  precio_sugerido: number
  precio_carta: number
  margen_objetivo: number
  food_cost_real: number
  estado_margen: 'ok' | 'warning' | 'danger'
}

export default function CartaPage() {
  const [items, setItems] = useState<CartaItem[]>([])
  const [itemsFueraCarta, setItemsFueraCarta] = useState<CartaItem[]>([])
  const [platosDisponibles, setPlatosDisponibles] = useState<PlatoConCosto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [seccionesExpandidas, setSeccionesExpandidas] = useState<Set<string>>(new Set(SECCIONES_ORDEN))
  const [tabActiva, setTabActiva] = useState<'en_carta' | 'fuera_carta'>('en_carta')

  // Form para agregar
  const [selectedPlato, setSelectedPlato] = useState('')
  const [precioCartaNew, setPrecioCartaNew] = useState('')
  const [margenObjetivoNew, setMargenObjetivoNew] = useState('30')

  // Form para editar inline
  const [editPrecio, setEditPrecio] = useState('')
  const [editMargen, setEditMargen] = useState('')

  const [isSaving, setIsSaving] = useState(false)

  function toggleSeccion(seccion: string) {
    setSeccionesExpandidas(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(seccion)) {
        nuevo.delete(seccion)
      } else {
        nuevo.add(seccion)
      }
      return nuevo
    })
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Función para calcular costo final de un insumo
  function getCostoFinalInsumo(insumoId: string, insumosData: any[]): number {
    const insumo = insumosData?.find(i => i.id === insumoId)
    if (!insumo || !insumo.precio_actual) return 0
    return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
  }

  // Función para calcular costo real de un plato
  function calcularCostoPlato(
    platoIngredientes: any[],
    insumosData: any[],
    recetasBaseData: any[]
  ): number {
    let costoTotal = 0

    for (const ing of platoIngredientes) {
      if (ing.insumo_id) {
        costoTotal += ing.cantidad * getCostoFinalInsumo(ing.insumo_id, insumosData)
      } else if (ing.receta_base_id) {
        // Recalcular costo por porción de la receta base
        const receta = recetasBaseData?.find((r: any) => r.id === ing.receta_base_id)
        if (receta) {
          let costoReceta = 0
          for (const rIng of receta.receta_base_ingredientes || []) {
            costoReceta += rIng.cantidad * getCostoFinalInsumo(rIng.insumo_id, insumosData)
          }
          const costoPorPorcion = receta.rendimiento_porciones > 0
            ? costoReceta / receta.rendimiento_porciones
            : 0
          costoTotal += ing.cantidad * costoPorPorcion
        }
      }
    }

    return costoTotal
  }

  async function fetchData() {
    setIsLoading(true)

    // Obtener precios actuales de insumos
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    // Obtener recetas base con ingredientes
    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`
        id, rendimiento_porciones,
        receta_base_ingredientes (insumo_id, cantidad)
      `)
      .eq('activo', true)

    // Obtener platos con ingredientes
    const { data: platosData } = await supabase
      .from('platos')
      .select(`
        id, nombre, seccion, updated_at,
        plato_ingredientes (insumo_id, receta_base_id, cantidad, insumos (nombre), recetas_base (nombre))
      `)
      .eq('activo', true)
      .order('nombre')

    // Calcular costos reales de cada plato
    const platosConCosto: PlatoConCosto[] = (platosData || []).map((plato: any) => {
      const nombres = (plato.plato_ingredientes || [])
        .map((ing: any) => ing.insumos?.nombre || ing.recetas_base?.nombre || '')
        .filter(Boolean)

      return {
        id: plato.id,
        nombre: plato.nombre,
        seccion: plato.seccion || 'Principales',
        ingredientes_texto: nombres.join(' · '),
        updated_at: plato.updated_at,
        costo_total: calcularCostoPlato(
          plato.plato_ingredientes || [],
          insumosData || [],
          recetasBaseData || []
        ),
      }
    })

    // Cargar carta (activos e inactivos)
    const { data: cartaData, error: cartaError } = await supabase
      .from('carta')
      .select('id, plato_id, precio_sugerido, precio_carta, margen_objetivo, food_cost_real, activo')

    if (cartaError) {
      console.error('Error fetching carta:', cartaError)
      setIsLoading(false)
      return
    }

    // Función para mapear items
    function mapCartaItem(item: any): CartaItem {
      const plato = platosConCosto.find(p => p.id === item.plato_id)
      const costoReal = plato?.costo_total || 0
      const foodCost = item.precio_carta > 0 ? (costoReal / item.precio_carta) * 100 : 0
      const precioSugerido = item.margen_objetivo > 0 ? costoReal / (item.margen_objetivo / 100) : 0

      let estado: 'ok' | 'warning' | 'danger' = 'ok'
      if (foodCost > item.margen_objetivo * 1.1) {
        estado = 'danger'
      } else if (foodCost > item.margen_objetivo) {
        estado = 'warning'
      }

      return {
        id: item.id,
        plato_id: item.plato_id,
        plato_nombre: plato?.nombre || 'Desconocido',
        plato_seccion: plato?.seccion || 'Principales',
        plato_ingredientes: plato?.ingredientes_texto || '',
        plato_dias_actualizacion: plato?.updated_at
          ? Math.floor((Date.now() - new Date(plato.updated_at).getTime()) / (1000 * 60 * 60 * 24))
          : -1,
        plato_costo: costoReal,
        precio_sugerido: precioSugerido,
        precio_carta: item.precio_carta,
        margen_objetivo: item.margen_objetivo,
        food_cost_real: foodCost,
        estado_margen: estado,
      }
    }

    // Separar activos e inactivos
    const activos = (cartaData || []).filter((item: any) => item.activo !== false)
    const inactivos = (cartaData || []).filter((item: any) => item.activo === false)

    setItems(activos.map(mapCartaItem))
    setItemsFueraCarta(inactivos.map(mapCartaItem))

    // Platos disponibles (no en carta activa ni inactiva)
    const platosEnCarta = cartaData?.map((c: any) => c.plato_id) || []
    setPlatosDisponibles(platosConCosto.filter(p => !platosEnCarta.includes(p.id)))

    setIsLoading(false)
  }

  function calcularPrecioSugerido(costo: number, margen: number): number {
    return margen > 0 ? costo / (margen / 100) : 0
  }

  function calcularFoodCost(costo: number, precio: number): number {
    return precio > 0 ? (costo / precio) * 100 : 0
  }

  async function handleAgregar() {
    if (!selectedPlato || !precioCartaNew) {
      alert('Seleccioná un plato y un precio')
      return
    }

    const plato = platosDisponibles.find(p => p.id === selectedPlato)
    if (!plato) return

    setIsSaving(true)

    const margen = parseFloat(margenObjetivoNew) || 30
    const precio = parseFloat(precioCartaNew)
    const precioSugerido = calcularPrecioSugerido(plato.costo_total, margen)
    const foodCost = calcularFoodCost(plato.costo_total, precio)

    const { error } = await supabase
      .from('carta')
      .insert({
        plato_id: plato.id,
        precio_carta: precio,
        margen_objetivo: margen,
        precio_sugerido: precioSugerido,
        food_cost_real: foodCost,
        activo: true,
      })

    if (error) {
      console.error('Error agregando a carta:', error)
      alert('Error al agregar el plato a la carta')
    } else {
      setIsModalOpen(false)
      setSelectedPlato('')
      setPrecioCartaNew('')
      setMargenObjetivoNew('30')
      fetchData()
    }

    setIsSaving(false)
  }

  function handleStartEdit(item: CartaItem) {
    setEditingId(item.id)
    setEditPrecio(item.precio_carta.toString())
    setEditMargen(item.margen_objetivo.toString())
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditPrecio('')
    setEditMargen('')
  }

  async function handleSaveEdit(item: CartaItem) {
    setIsSaving(true)

    const precio = parseFloat(editPrecio) || 0
    const margen = parseFloat(editMargen) || 30
    const precioSugerido = calcularPrecioSugerido(item.plato_costo, margen)
    const foodCost = calcularFoodCost(item.plato_costo, precio)

    const { error } = await supabase
      .from('carta')
      .update({
        precio_carta: precio,
        margen_objetivo: margen,
        precio_sugerido: precioSugerido,
        food_cost_real: foodCost,
      })
      .eq('id', item.id)

    if (error) {
      console.error('Error actualizando carta:', error)
      alert('Error al actualizar')
    } else {
      handleCancelEdit()
      fetchData()
    }

    setIsSaving(false)
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este plato de la carta?')) return

    const { error } = await supabase
      .from('carta')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar')
    } else {
      fetchData()
    }
  }

  async function handleToggleEnCarta(id: string, nuevoEstado: boolean) {
    const { error } = await supabase
      .from('carta')
      .update({ activo: nuevoEstado })
      .eq('id', id)

    if (error) {
      alert('Error al cambiar estado')
    } else {
      fetchData()
    }
  }

  function getEstadoIcon(estado: string) {
    switch (estado) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'danger':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      default:
        return null
    }
  }

  function getEstadoClass(estado: string) {
    switch (estado) {
      case 'ok':
        return 'bg-green-100 text-green-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'danger':
        return 'bg-red-100 text-red-800'
      default:
        return ''
    }
  }

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  // Agrupar items por sección según tab activa
  const itemsActuales = tabActiva === 'en_carta' ? items : itemsFueraCarta
  const itemsPorSeccion = SECCIONES_ORDEN
    .map(seccion => ({
      seccion,
      items: itemsActuales.filter(i => i.plato_seccion === seccion).sort((a, b) => a.plato_nombre.localeCompare(b.plato_nombre)),
    }))
    .filter(grupo => grupo.items.length > 0)

  // Preview al agregar
  const platoPreview = platosDisponibles.find(p => p.id === selectedPlato)
  const previewPrecio = parseFloat(precioCartaNew) || 0
  const previewMargen = parseFloat(margenObjetivoNew) || 30
  const previewSugerido = platoPreview ? calcularPrecioSugerido(platoPreview.costo_total, previewMargen) : 0
  const previewFoodCost = platoPreview && previewPrecio > 0
    ? calcularFoodCost(platoPreview.costo_total, previewPrecio)
    : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Carta</h1>
          <p className="text-xs text-gray-600">Precios y análisis de food cost</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} disabled={platosDisponibles.length === 0} size="sm">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Agregar
        </Button>
      </div>

      {/* Resumen - solo para tab En Carta */}
      {tabActiva === 'en_carta' && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="text-[10px] font-medium text-green-800">OK</span>
            </div>
            <p className="text-lg font-bold text-green-600 mt-0.5">
              {items.filter(i => i.estado_margen === 'ok').length}
            </p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-[10px] font-medium text-yellow-800">Atención</span>
            </div>
            <p className="text-lg font-bold text-yellow-600 mt-0.5">
              {items.filter(i => i.estado_margen === 'warning').length}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[10px] font-medium text-red-800">Fuera</span>
            </div>
            <p className="text-lg font-bold text-red-600 mt-0.5">
              {items.filter(i => i.estado_margen === 'danger').length}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        <button
          onClick={() => setTabActiva('en_carta')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            tabActiva === 'en_carta'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          En Carta ({items.length})
        </button>
        <button
          onClick={() => setTabActiva('fuera_carta')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            tabActiva === 'fuera_carta'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Fuera de Carta ({itemsFueraCarta.length})
        </button>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="text-center py-6 text-xs">Cargando...</div>
      ) : itemsActuales.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg border">
          <p className="text-xs text-gray-500">
            {tabActiva === 'en_carta' ? 'No hay platos en la carta' : 'No hay platos fuera de carta'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {tabActiva === 'en_carta'
              ? 'Agregá platos para ver el análisis de food cost'
              : 'Los platos que saques de la carta aparecerán aquí'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Plato</th>
                <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">En Carta</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Sug.</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Carta</th>
                <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">M.Obj</th>
                <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">FC</th>
                <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">Contrib.</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {itemsPorSeccion.map((grupo) => (
                <>
                  <tr
                    key={`seccion-${grupo.seccion}`}
                    className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => toggleSeccion(grupo.seccion)}
                  >
                    <td colSpan={9} className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {seccionesExpandidas.has(grupo.seccion) ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                        )}
                        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                          {grupo.seccion}
                        </span>
                        <span className="text-[10px] text-gray-400">({grupo.items.length})</span>
                      </div>
                    </td>
                  </tr>
                  {seccionesExpandidas.has(grupo.seccion) && grupo.items.map((item) => (
                <tr key={item.id} className={item.estado_margen === 'danger' ? 'bg-red-50' : ''}>
                  <td className="px-2 py-1.5">
                    <div>
                      <span className="text-xs font-medium text-gray-900">{item.plato_nombre}</span>
                      <p className="text-[9px] text-gray-400">
                        {item.plato_dias_actualizacion === 0
                          ? 'Hoy'
                          : item.plato_dias_actualizacion === 1
                          ? 'Hace 1 día'
                          : item.plato_dias_actualizacion > 0
                          ? `Hace ${item.plato_dias_actualizacion}d`
                          : ''}
                      </p>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleEnCarta(item.id, tabActiva !== 'en_carta')
                      }}
                      className={`relative inline-flex h-4 w-[30px] items-center rounded-full transition-colors ${
                        tabActiva === 'en_carta' ? 'bg-primary-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                          tabActiva === 'en_carta' ? 'translate-x-[15px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right text-[11px] text-gray-600 tabular-nums">
                    <span className="text-gray-400">$</span>{item.plato_costo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[11px] text-gray-500 tabular-nums">
                    <span className="text-gray-400">$</span>{item.precio_sugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        value={editPrecio}
                        onChange={(e) => setEditPrecio(e.target.value)}
                        className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-right"
                      />
                    ) : (
                      <span className="text-xs font-medium tabular-nums">
                        <span className="text-gray-400 font-normal">$</span>{item.precio_carta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        value={editMargen}
                        onChange={(e) => setEditMargen(e.target.value)}
                        className="w-12 rounded border border-gray-300 px-1 py-0.5 text-[11px] text-center"
                      />
                    ) : (
                      <span className="text-[11px] text-gray-600">{item.margen_objetivo}%</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {getEstadoIcon(item.estado_margen)}
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getEstadoClass(item.estado_margen)}`}>
                        {item.food_cost_real.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right text-[11px] font-bold text-green-700 bg-green-50 tabular-nums">
                    <span className="text-green-500 font-normal">$</span>{(item.precio_carta - item.plato_costo).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-0.5">
                      {editingId === item.id ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(item)} disabled={isSaving}>
                            <Save className="w-3.5 h-3.5 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                            <X className="w-3.5 h-3.5 text-gray-500" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleStartEdit(item)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEliminar(item.id)}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Agregar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar Plato a la Carta"
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Plato"
            options={[
              { value: '', label: 'Seleccionar plato...' },
              ...platosDisponibles.map(p => ({
                value: p.id,
                label: `${p.nombre} (costo: ${fmt(p.costo_total)})`
              }))
            ]}
            value={selectedPlato}
            onChange={(e) => setSelectedPlato(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Precio en Carta ($)"
              type="number"
              value={precioCartaNew}
              onChange={(e) => setPrecioCartaNew(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Margen Objetivo (%)"
              type="number"
              value={margenObjetivoNew}
              onChange={(e) => setMargenObjetivoNew(e.target.value)}
              placeholder="30"
            />
          </div>

          {/* Preview */}
          {platoPreview && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Costo del plato:</span>
                <span className="font-medium tabular-nums"><span className="text-gray-400 font-normal">$</span> {platoPreview.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Precio sugerido (para {previewMargen}% FC):</span>
                <span className="font-medium text-blue-600 tabular-nums"><span className="text-blue-400 font-normal">$</span> {previewSugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
              {previewPrecio > 0 && (
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-600">Food Cost resultante:</span>
                  <span className={`font-bold ${
                    previewFoodCost <= previewMargen ? 'text-green-600' :
                    previewFoodCost <= previewMargen * 1.1 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {previewFoodCost.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAgregar} disabled={isSaving || !selectedPlato || !precioCartaNew}>
              {isSaving ? 'Guardando...' : 'Agregar a Carta'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
