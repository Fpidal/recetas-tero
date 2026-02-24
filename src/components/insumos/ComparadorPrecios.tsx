'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, X, FileDown, ChevronDown, ChevronUp, Search, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Modal, Input } from '@/components/ui'
import { formatearMoneda, formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'
import { generarPDFComparacion } from '@/lib/generar-pdf-comparacion'

interface Comparacion {
  id: string
  nombre: string
  categoria: string
  created_at: string
}

interface ComparacionProveedor {
  id: string
  comparacion_id: string
  proveedor_id: string | null
  nombre_temporal: string | null
  orden: number
  nombre?: string // computed from proveedor or nombre_temporal
}

interface ComparacionItem {
  id: string
  comparacion_id: string
  insumo_id: string
  comparacion_proveedor_id: string
  precio: number | null
}

interface Insumo {
  id: string
  nombre: string
  categoria: string
  unidad_medida: string
  precio_actual?: number | null
  proveedor_nombre?: string | null
}

interface Proveedor {
  id: string
  nombre: string
}

interface PrecioHistorico {
  insumo_id: string
  proveedor_id: string
  precio: number
  fecha: string
}

const CATEGORIAS = [
  { value: 'Carnes', label: 'Carnes' },
  { value: 'Pescados_Mariscos', label: 'Pescados y Mariscos' },
  { value: 'Almacen', label: 'Almacén' },
  { value: 'Verduras_Frutas', label: 'Verduras y Frutas' },
  { value: 'Lacteos_Fiambres', label: 'Lácteos y Fiambres' },
  { value: 'Bebidas', label: 'Bebidas' },
]

export default function ComparadorPrecios() {
  // Comparaciones
  const [comparaciones, setComparaciones] = useState<Comparacion[]>([])
  const [activeComparacionId, setActiveComparacionId] = useState<string | null>(null)
  const [isLoadingComparaciones, setIsLoadingComparaciones] = useState(true)

  // Modal nueva comparación
  const [showNuevaModal, setShowNuevaModal] = useState(false)
  const [nuevaForm, setNuevaForm] = useState({ nombre: '', categoria: 'Carnes' })
  const [isCreating, setIsCreating] = useState(false)

  // Modal confirmar eliminar
  const [deleteComparacionId, setDeleteComparacionId] = useState<string | null>(null)

  // Datos de la comparación activa
  const [proveedoresComparacion, setProveedoresComparacion] = useState<ComparacionProveedor[]>([])
  const [itemsComparacion, setItemsComparacion] = useState<ComparacionItem[]>([])
  const [insumosSeleccionados, setInsumosSeleccionados] = useState<string[]>([])

  // Configuración (colapsable)
  const [showConfig, setShowConfig] = useState(true)

  // Datos maestros
  const [allInsumos, setAllInsumos] = useState<Insumo[]>([])
  const [allProveedores, setAllProveedores] = useState<Proveedor[]>([])
  const [preciosHistoricos, setPreciosHistoricos] = useState<PrecioHistorico[]>([])

  // Búsqueda insumos
  const [busquedaInsumo, setBusquedaInsumo] = useState('')

  // Proveedores seleccionados (temporales hasta armar tabla)
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState<string[]>([])
  const [nombreProveedorTemp, setNombreProveedorTemp] = useState('')
  const [proveedoresTemporales, setProveedoresTemporales] = useState<string[]>([])

  // Edición inline de precios
  const [editingCell, setEditingCell] = useState<{ insumoId: string; proveedorId: string } | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const activeComparacion = comparaciones.find(c => c.id === activeComparacionId)

  // Cargar comparaciones al montar
  useEffect(() => {
    fetchComparaciones()
    fetchMasterData()
  }, [])

  // Cargar datos cuando cambia la comparación activa
  useEffect(() => {
    if (activeComparacionId) {
      fetchComparacionData(activeComparacionId)
    } else {
      setProveedoresComparacion([])
      setItemsComparacion([])
      setInsumosSeleccionados([])
      setProveedoresSeleccionados([])
      setProveedoresTemporales([])
    }
  }, [activeComparacionId])

  async function fetchComparaciones() {
    setIsLoadingComparaciones(true)
    const { data } = await supabase
      .from('comparaciones_precios')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setComparaciones(data)
    setIsLoadingComparaciones(false)
  }

  async function fetchMasterData() {
    // Insumos con precio actual
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, nombre, categoria, unidad_medida, precio_actual')
      .eq('activo', true)
      .order('nombre')

    if (insumosData) {
      // Obtener proveedor actual de cada insumo
      const { data: preciosActuales } = await supabase
        .from('precios_insumo')
        .select('insumo_id, proveedores(nombre)')
        .eq('es_precio_actual', true)

      const proveedorMap = new Map<string, string>()
      preciosActuales?.forEach((p: any) => {
        if (p.proveedores?.nombre) {
          proveedorMap.set(p.insumo_id, p.proveedores.nombre)
        }
      })

      setAllInsumos(insumosData.map(i => ({
        ...i,
        proveedor_nombre: proveedorMap.get(i.id) || null
      })))
    }

    // Proveedores
    const { data: provData } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')

    if (provData) setAllProveedores(provData)
  }

  async function fetchComparacionData(comparacionId: string) {
    // Proveedores de la comparación
    const { data: provData } = await supabase
      .from('comparacion_proveedores')
      .select('*, proveedores(nombre)')
      .eq('comparacion_id', comparacionId)
      .order('orden')

    if (provData) {
      setProveedoresComparacion(provData.map((p: any) => ({
        ...p,
        nombre: p.proveedores?.nombre || p.nombre_temporal || 'Sin nombre'
      })))

      // Si hay proveedores, marcarlos como seleccionados
      const provIds = provData.filter(p => p.proveedor_id).map(p => p.proveedor_id)
      const tempNames = provData.filter(p => p.nombre_temporal).map(p => p.nombre_temporal)
      setProveedoresSeleccionados(provIds)
      setProveedoresTemporales(tempNames)
    }

    // Items de la comparación
    const { data: itemsData } = await supabase
      .from('comparacion_items')
      .select('*')
      .eq('comparacion_id', comparacionId)

    if (itemsData) {
      setItemsComparacion(itemsData)
      // Obtener insumos únicos seleccionados
      const insumoIds = Array.from(new Set(itemsData.map(i => i.insumo_id)))
      setInsumosSeleccionados(insumoIds)
    }

    // Si ya hay datos, colapsar config
    if (provData && provData.length > 0) {
      setShowConfig(false)
    } else {
      setShowConfig(true)
    }
  }

  async function handleCrearComparacion() {
    if (!nuevaForm.nombre.trim()) return

    setIsCreating(true)
    const { data, error } = await supabase
      .from('comparaciones_precios')
      .insert({
        nombre: nuevaForm.nombre.trim(),
        categoria: nuevaForm.categoria
      })
      .select()
      .single()

    if (data && !error) {
      setComparaciones([data, ...comparaciones])
      setActiveComparacionId(data.id)
      setShowNuevaModal(false)
      setNuevaForm({ nombre: '', categoria: 'Carnes' })
      setShowConfig(true)
    }
    setIsCreating(false)
  }

  async function handleEliminarComparacion() {
    if (!deleteComparacionId) return

    await supabase
      .from('comparaciones_precios')
      .delete()
      .eq('id', deleteComparacionId)

    setComparaciones(comparaciones.filter(c => c.id !== deleteComparacionId))
    if (activeComparacionId === deleteComparacionId) {
      setActiveComparacionId(null)
    }
    setDeleteComparacionId(null)
  }

  function toggleInsumo(insumoId: string) {
    setInsumosSeleccionados(prev =>
      prev.includes(insumoId)
        ? prev.filter(id => id !== insumoId)
        : [...prev, insumoId]
    )
  }

  function toggleProveedor(proveedorId: string) {
    setProveedoresSeleccionados(prev =>
      prev.includes(proveedorId)
        ? prev.filter(id => id !== proveedorId)
        : [...prev, proveedorId]
    )
  }

  function agregarProveedorTemporal() {
    if (!nombreProveedorTemp.trim()) return
    if (proveedoresTemporales.includes(nombreProveedorTemp.trim())) return

    setProveedoresTemporales([...proveedoresTemporales, nombreProveedorTemp.trim()])
    setNombreProveedorTemp('')
  }

  function quitarProveedorTemporal(nombre: string) {
    setProveedoresTemporales(proveedoresTemporales.filter(n => n !== nombre))
  }

  async function handleArmarTabla() {
    if (!activeComparacionId) return
    if (insumosSeleccionados.length === 0) {
      alert('Seleccioná al menos un insumo')
      return
    }
    if (proveedoresSeleccionados.length === 0 && proveedoresTemporales.length === 0) {
      alert('Seleccioná al menos un proveedor')
      return
    }

    // 1. Eliminar proveedores e items existentes
    await supabase
      .from('comparacion_proveedores')
      .delete()
      .eq('comparacion_id', activeComparacionId)

    // 2. Crear proveedores
    const proveedoresToInsert = [
      ...proveedoresSeleccionados.map((id, idx) => ({
        comparacion_id: activeComparacionId,
        proveedor_id: id,
        nombre_temporal: null,
        orden: idx
      })),
      ...proveedoresTemporales.map((nombre, idx) => ({
        comparacion_id: activeComparacionId,
        proveedor_id: null,
        nombre_temporal: nombre,
        orden: proveedoresSeleccionados.length + idx
      }))
    ]

    const { data: newProvs } = await supabase
      .from('comparacion_proveedores')
      .insert(proveedoresToInsert)
      .select()

    if (!newProvs) return

    // 3. Buscar precios históricos para proveedores reales
    const proveedorIdsReales = proveedoresSeleccionados
    let preciosHist: PrecioHistorico[] = []

    if (proveedorIdsReales.length > 0) {
      const { data: facturaItems } = await supabase
        .from('factura_items')
        .select(`
          insumo_id,
          precio_unitario,
          facturas_proveedor!inner(proveedor_id, fecha, activo)
        `)
        .in('insumo_id', insumosSeleccionados)
        .eq('facturas_proveedor.activo', true)
        .order('facturas_proveedor(fecha)', { ascending: false })

      if (facturaItems) {
        // Agrupar por insumo+proveedor y quedarse con el más reciente
        const precioMap = new Map<string, PrecioHistorico>()
        facturaItems.forEach((item: any) => {
          const key = `${item.insumo_id}-${item.facturas_proveedor.proveedor_id}`
          if (!precioMap.has(key)) {
            precioMap.set(key, {
              insumo_id: item.insumo_id,
              proveedor_id: item.facturas_proveedor.proveedor_id,
              precio: item.precio_unitario,
              fecha: item.facturas_proveedor.fecha
            })
          }
        })
        preciosHist = Array.from(precioMap.values())
      }
    }

    // 4. Crear items para cada combinación insumo x proveedor
    const itemsToInsert: any[] = []
    for (const insumoId of insumosSeleccionados) {
      for (const prov of newProvs) {
        // Buscar precio histórico si es proveedor real
        let precio: number | null = null
        if (prov.proveedor_id) {
          const hist = preciosHist.find(
            h => h.insumo_id === insumoId && h.proveedor_id === prov.proveedor_id
          )
          if (hist) precio = hist.precio
        }

        itemsToInsert.push({
          comparacion_id: activeComparacionId,
          insumo_id: insumoId,
          comparacion_proveedor_id: prov.id,
          precio
        })
      }
    }

    await supabase
      .from('comparacion_items')
      .insert(itemsToInsert)

    // 5. Recargar datos
    await fetchComparacionData(activeComparacionId)
    setShowConfig(false)
  }

  async function handleSavePrecio(insumoId: string, proveedorId: string, valor: string) {
    const precio = parsearNumero(valor)
    const precioFinal = precio > 0 ? precio : null

    // Buscar item existente
    const existingItem = itemsComparacion.find(
      i => i.insumo_id === insumoId && i.comparacion_proveedor_id === proveedorId
    )

    if (existingItem) {
      await supabase
        .from('comparacion_items')
        .update({ precio: precioFinal, updated_at: new Date().toISOString() })
        .eq('id', existingItem.id)

      setItemsComparacion(itemsComparacion.map(i =>
        i.id === existingItem.id ? { ...i, precio: precioFinal } : i
      ))
    } else if (activeComparacionId) {
      const { data } = await supabase
        .from('comparacion_items')
        .insert({
          comparacion_id: activeComparacionId,
          insumo_id: insumoId,
          comparacion_proveedor_id: proveedorId,
          precio: precioFinal
        })
        .select()
        .single()

      if (data) {
        setItemsComparacion([...itemsComparacion, data])
      }
    }

    setEditingCell(null)
    setEditingValue('')
  }

  // Filtrar insumos por categoría de la comparación activa
  const insumosFiltrados = useMemo(() => {
    if (!activeComparacion) return []
    return allInsumos
      .filter(i => i.categoria === activeComparacion.categoria)
      .filter(i => !busquedaInsumo || i.nombre.toLowerCase().includes(busquedaInsumo.toLowerCase()))
  }, [allInsumos, activeComparacion, busquedaInsumo])

  // Calcular mejor precio por fila
  const mejorPrecioPorInsumo = useMemo(() => {
    const result: Record<string, { precio: number; proveedorId: string; proveedorNombre: string }> = {}

    insumosSeleccionados.forEach(insumoId => {
      let mejorPrecio = Infinity
      let mejorProvId = ''
      let mejorProvNombre = ''

      proveedoresComparacion.forEach(prov => {
        const item = itemsComparacion.find(
          i => i.insumo_id === insumoId && i.comparacion_proveedor_id === prov.id
        )
        if (item?.precio && item.precio < mejorPrecio) {
          mejorPrecio = item.precio
          mejorProvId = prov.id
          mejorProvNombre = prov.nombre || ''
        }
      })

      if (mejorPrecio < Infinity) {
        result[insumoId] = { precio: mejorPrecio, proveedorId: mejorProvId, proveedorNombre: mejorProvNombre }
      }
    })

    return result
  }, [insumosSeleccionados, proveedoresComparacion, itemsComparacion])

  function handleExportPDF() {
    if (!activeComparacion) return

    const insumosData = insumosSeleccionados.map(id => {
      const insumo = allInsumos.find(i => i.id === id)
      return insumo ? { id, nombre: insumo.nombre, unidad_medida: insumo.unidad_medida } : null
    }).filter(Boolean) as { id: string; nombre: string; unidad_medida: string }[]

    // Transformar items a precios con proveedor_id
    const precios = itemsComparacion.map(item => ({
      insumo_id: item.insumo_id,
      proveedor_id: item.comparacion_proveedor_id,
      precio: item.precio
    }))

    generarPDFComparacion({
      nombre: activeComparacion.nombre,
      categoria: CATEGORIAS.find(c => c.value === activeComparacion.categoria)?.label || activeComparacion.categoria,
      proveedores: proveedoresComparacion.map(p => ({ id: p.id, nombre: p.nombre || '' })),
      insumos: insumosData,
      precios
    })
  }

  return (
    <div>
      {/* Tabs de comparaciones */}
      <div className="flex items-center gap-2 border-b border-gray-200 mb-4 overflow-x-auto pb-px">
        <button
          onClick={() => setShowNuevaModal(true)}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-t-lg border border-b-0 border-green-200 hover:bg-green-100 whitespace-nowrap flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva
        </button>

        {isLoadingComparaciones ? (
          <span className="text-sm text-gray-400 px-3">Cargando...</span>
        ) : (
          comparaciones.map(comp => (
            <div
              key={comp.id}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeComparacionId === comp.id
                  ? 'bg-white text-green-700 border-green-500 border-b-2 border-b-green-500 -mb-px'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
              onClick={() => setActiveComparacionId(comp.id)}
            >
              {comp.nombre}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteComparacionId(comp.id)
                }}
                className="ml-1 p-0.5 hover:bg-red-100 rounded"
              >
                <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Contenido */}
      {!activeComparacionId ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500 mb-4">Seleccioná o creá una comparación para comenzar</p>
          <Button onClick={() => setShowNuevaModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Comparación
          </Button>
        </div>
      ) : (
        <div>
          {/* Header con nombre y botón PDF */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{activeComparacion?.nombre}</h2>
              <p className="text-sm text-gray-500">
                {CATEGORIAS.find(c => c.value === activeComparacion?.categoria)?.label}
              </p>
            </div>
            {proveedoresComparacion.length > 0 && (
              <Button onClick={handleExportPDF} className="bg-green-600 hover:bg-green-700">
                <FileDown className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
            )}
          </div>

          {/* Configuración (colapsable) */}
          <div className="mb-4 border rounded-lg">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg"
            >
              <span className="font-medium text-gray-700">Configuración</span>
              {showConfig ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
            </button>

            {showConfig && (
              <div className="p-4 space-y-6">
                {/* Paso 1: Seleccionar insumos */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">1. Seleccionar insumos</h3>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={busquedaInsumo}
                      onChange={(e) => setBusquedaInsumo(e.target.value)}
                      placeholder="Buscar insumo..."
                      className="pl-9 pr-3 py-2 w-full rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  {/* Chips de seleccionados */}
                  {insumosSeleccionados.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {insumosSeleccionados.map(id => {
                        const insumo = allInsumos.find(i => i.id === id)
                        return insumo ? (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
                          >
                            {insumo.nombre}
                            <button onClick={() => toggleInsumo(id)} className="hover:text-green-600">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ) : null
                      })}
                    </div>
                  )}

                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {insumosFiltrados.map(insumo => (
                      <label
                        key={insumo.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={insumosSeleccionados.includes(insumo.id)}
                          onChange={() => toggleInsumo(insumo.id)}
                          className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{insumo.nombre}</p>
                          <p className="text-xs text-gray-500">
                            {insumo.unidad_medida}
                            {insumo.precio_actual && ` · ${formatearMoneda(insumo.precio_actual)}`}
                            {insumo.proveedor_nombre && ` · ${insumo.proveedor_nombre}`}
                          </p>
                        </div>
                      </label>
                    ))}
                    {insumosFiltrados.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">No hay insumos en esta categoría</p>
                    )}
                  </div>
                </div>

                {/* Paso 2: Seleccionar proveedores */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">2. Seleccionar proveedores</h3>

                  {/* Chips de seleccionados */}
                  {(proveedoresSeleccionados.length > 0 || proveedoresTemporales.length > 0) && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {proveedoresSeleccionados.map(id => {
                        const prov = allProveedores.find(p => p.id === id)
                        return prov ? (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                          >
                            {prov.nombre}
                            <button onClick={() => toggleProveedor(id)} className="hover:text-blue-600">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ) : null
                      })}
                      {proveedoresTemporales.map(nombre => (
                        <span
                          key={nombre}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full"
                        >
                          {nombre} (temp)
                          <button onClick={() => quitarProveedorTemporal(nombre)} className="hover:text-orange-600">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Lista proveedores existentes */}
                    <div className="max-h-40 overflow-y-auto border rounded-lg">
                      {allProveedores.map(prov => (
                        <label
                          key={prov.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={proveedoresSeleccionados.includes(prov.id)}
                            onChange={() => toggleProveedor(prov.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900">{prov.nombre}</span>
                        </label>
                      ))}
                    </div>

                    {/* Agregar proveedor temporal */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Agregar proveedor temporal:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={nombreProveedorTemp}
                          onChange={(e) => setNombreProveedorTemp(e.target.value)}
                          placeholder="Nombre del proveedor"
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          onKeyDown={(e) => e.key === 'Enter' && agregarProveedorTemporal()}
                        />
                        <Button onClick={agregarProveedorTemporal} variant="secondary" size="sm">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botón armar tabla */}
                <div className="flex justify-end">
                  <Button onClick={handleArmarTabla} className="bg-green-600 hover:bg-green-700">
                    <Check className="w-4 h-4 mr-2" />
                    Armar tabla
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Tabla comparadora */}
          {proveedoresComparacion.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-[#1A3A0A] text-white text-xs">
                      <th className="px-3 py-2 text-left font-medium">PRODUCTO</th>
                      {proveedoresComparacion.map(prov => (
                        <th key={prov.id} className="px-3 py-2 text-right font-medium min-w-[100px]">
                          {prov.nombre}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium bg-[#2D5016] min-w-[90px]">MÁS BAJO</th>
                      <th className="px-3 py-2 text-left font-medium bg-[#2D5016] min-w-[100px]">PROVEEDOR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {insumosSeleccionados.map((insumoId, idx) => {
                      const insumo = allInsumos.find(i => i.id === insumoId)
                      const mejor = mejorPrecioPorInsumo[insumoId]

                      return (
                        <tr key={insumoId} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">
                            {insumo?.nombre || 'Desconocido'}
                          </td>
                          {proveedoresComparacion.map(prov => {
                            const item = itemsComparacion.find(
                              i => i.insumo_id === insumoId && i.comparacion_proveedor_id === prov.id
                            )
                            const isEditing = editingCell?.insumoId === insumoId && editingCell?.proveedorId === prov.id
                            const isMejor = mejor && item?.precio === mejor.precio && mejor.proveedorId === prov.id

                            return (
                              <td
                                key={prov.id}
                                className={`px-3 py-2 text-sm text-right cursor-pointer ${
                                  isMejor
                                    ? 'bg-[#FFF9C4] font-bold text-[#7A6000] border border-[#F0D800]'
                                    : item?.precio
                                    ? ''
                                    : 'bg-[#F5F5F5] text-gray-400'
                                }`}
                                onClick={() => {
                                  setEditingCell({ insumoId, proveedorId: prov.id })
                                  setEditingValue(item?.precio?.toString().replace('.', ',') || '')
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoFocus
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(formatearInputNumero(e.target.value))}
                                    onBlur={() => handleSavePrecio(insumoId, prov.id, editingValue)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSavePrecio(insumoId, prov.id, editingValue)
                                      if (e.key === 'Escape') setEditingCell(null)
                                    }}
                                    className="w-full px-1 py-0.5 text-right text-sm border border-green-500 rounded focus:outline-none"
                                  />
                                ) : item?.precio ? (
                                  formatearMoneda(item.precio)
                                ) : (
                                  '—'
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-sm text-right font-bold bg-[#E8F5E0] text-green-800">
                            {mejor ? formatearMoneda(mejor.precio) : '—'}
                          </td>
                          <td className="px-3 py-2 text-sm bg-[#E8F5E0] text-green-800 font-medium">
                            {mejor?.proveedorNombre || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal nueva comparación */}
      <Modal
        isOpen={showNuevaModal}
        onClose={() => setShowNuevaModal(false)}
        title="Nueva Comparación"
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={nuevaForm.nombre}
            onChange={(e) => setNuevaForm({ ...nuevaForm, nombre: e.target.value })}
            placeholder="Ej: Mariscos Feb 2026"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
            <select
              value={nuevaForm.categoria}
              onChange={(e) => setNuevaForm({ ...nuevaForm, categoria: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {CATEGORIAS.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowNuevaModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCrearComparacion} disabled={isCreating || !nuevaForm.nombre.trim()}>
              {isCreating ? 'Creando...' : 'Crear'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal confirmar eliminar */}
      <Modal
        isOpen={!!deleteComparacionId}
        onClose={() => setDeleteComparacionId(null)}
        title="Eliminar comparación"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            ¿Estás seguro de que querés eliminar la comparación{' '}
            <strong>{comparaciones.find(c => c.id === deleteComparacionId)?.nombre}</strong>?
          </p>
          <p className="text-sm text-gray-500">Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setDeleteComparacionId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEliminarComparacion} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
