'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Package, BookOpen, ChefHat } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'

interface Insumo {
  id: string
  nombre: string
  unidad_medida: string
  categoria: string
}

interface RecetaBase {
  id: string
  nombre: string
  costo_total: number
  costo_por_porcion: number
  rendimiento_porciones: number
}

interface Plato {
  id: string
  nombre: string
  costo_total: number
  seccion: string
}

interface ItemMenu {
  id: string
  tipo: 'insumo' | 'receta_base' | 'plato'
  referencia_id: string
  nombre: string
  cantidad: number
  unidad: string
  costo_unitario: number
  costo_linea: number
  es_bebida: boolean
  isNew?: boolean
}

const TIPO_OPTIONS = [
  { value: 'insumo', label: 'Insumo' },
  { value: 'receta_base', label: 'Elaboración' },
  { value: 'plato', label: 'Receta (Plato)' },
]

export default function EditarMenuEjecutivoPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [items, setItems] = useState<ItemMenu[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Datos para selectores
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetasBase, setRecetasBase] = useState<RecetaBase[]>([])
  const [platos, setPlatos] = useState<Plato[]>([])

  // Estado para agregar nuevo item
  const [nuevoTipo, setNuevoTipo] = useState<'insumo' | 'receta_base' | 'plato'>('insumo')
  const [nuevoReferenciaId, setNuevoReferenciaId] = useState('')
  const [nuevoCantidad, setNuevoCantidad] = useState('')
  const [nuevoEsBebida, setNuevoEsBebida] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    // Cargar opciones
    const [insumosRes, recetasRes, platosRes] = await Promise.all([
      supabase.from('insumos').select('id, nombre, unidad_medida, categoria').eq('activo', true).order('nombre'),
      supabase.from('recetas_base').select('id, nombre, costo_total, costo_por_porcion, rendimiento_porciones').eq('activo', true).order('nombre'),
      supabase.from('platos').select('id, nombre, costo_total, seccion').eq('activo', true).order('nombre'),
    ])

    if (insumosRes.data) setInsumos(insumosRes.data)
    if (recetasRes.data) setRecetasBase(recetasRes.data)
    if (platosRes.data) setPlatos(platosRes.data)

    // Cargar menú
    const { data: menu, error } = await supabase
      .from('menus_ejecutivos')
      .select(`
        id, nombre, descripcion, costo_total,
        menu_ejecutivo_items (
          id, tipo, insumo_id, receta_base_id, plato_id, cantidad, es_bebida, costo_linea,
          insumos (nombre, unidad_medida),
          recetas_base (nombre, unidad_medida, costo_total, rendimiento),
          platos (nombre, costo_total)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !menu) {
      alert('Menú no encontrado')
      router.push('/menus-ejecutivos')
      return
    }

    setNombre(menu.nombre)
    setDescripcion(menu.descripcion || '')

    // Mapear items
    const mappedItems: ItemMenu[] = (menu.menu_ejecutivo_items as any[]).map((item: any) => {
      let tipo: 'insumo' | 'receta_base' | 'plato' = item.tipo || 'insumo'
      let referencia_id = ''
      let nombreItem = ''
      let unidad = ''
      let costoUnitario = 0

      if (item.insumo_id && item.insumos) {
        tipo = 'insumo'
        referencia_id = item.insumo_id
        nombreItem = item.insumos.nombre
        unidad = item.insumos.unidad_medida
        costoUnitario = item.costo_linea / item.cantidad
      } else if (item.receta_base_id && item.recetas_base) {
        tipo = 'receta_base'
        referencia_id = item.receta_base_id
        nombreItem = item.recetas_base.nombre
        unidad = 'porción'
        costoUnitario = item.recetas_base.rendimiento_porciones > 0
          ? item.recetas_base.costo_total / item.recetas_base.rendimiento_porciones
          : item.recetas_base.costo_total
      } else if (item.plato_id && item.platos) {
        tipo = 'plato'
        referencia_id = item.plato_id
        nombreItem = item.platos.nombre
        unidad = 'porción'
        costoUnitario = item.platos.costo_total
      }

      return {
        id: item.id,
        tipo,
        referencia_id,
        nombre: nombreItem,
        cantidad: parseFloat(item.cantidad),
        unidad,
        costo_unitario: costoUnitario,
        costo_linea: parseFloat(item.costo_linea),
        es_bebida: item.es_bebida,
      }
    })

    setItems(mappedItems)
    setIsLoading(false)
  }

  async function getPrecioInsumo(insumoId: string): Promise<number> {
    const { data } = await supabase
      .from('precios_insumo')
      .select('precio')
      .eq('insumo_id', insumoId)
      .order('fecha', { ascending: false })
      .limit(1)
      .single()
    return data?.precio || 0
  }

  const referenciaOptions = useMemo(() => {
    if (nuevoTipo === 'insumo') {
      return [
        { value: '', label: 'Seleccionar insumo...' },
        ...insumos.map(i => ({ value: i.id, label: `${i.nombre} (${i.unidad_medida})` }))
      ]
    } else if (nuevoTipo === 'receta_base') {
      return [
        { value: '', label: 'Seleccionar elaboración...' },
        ...recetasBase.map(r => ({ value: r.id, label: `${r.nombre} ($${(r.costo_por_porcion || 0).toFixed(2)}/porción)` }))
      ]
    } else {
      return [
        { value: '', label: 'Seleccionar plato...' },
        ...platos.map(p => ({ value: p.id, label: `${p.nombre} ($${p.costo_total.toFixed(2)})` }))
      ]
    }
  }, [nuevoTipo, insumos, recetasBase, platos])

  async function handleAgregarItem() {
    if (!nuevoReferenciaId || !nuevoCantidad) return

    const cantidad = parseFloat(nuevoCantidad)
    if (isNaN(cantidad) || cantidad <= 0) return

    let nombreItem = ''
    let unidad = ''
    let costoUnitario = 0

    if (nuevoTipo === 'insumo') {
      const insumo = insumos.find(i => i.id === nuevoReferenciaId)
      if (!insumo) return
      nombreItem = insumo.nombre
      unidad = insumo.unidad_medida
      costoUnitario = await getPrecioInsumo(insumo.id)
    } else if (nuevoTipo === 'receta_base') {
      const receta = recetasBase.find(r => r.id === nuevoReferenciaId)
      if (!receta) return
      nombreItem = receta.nombre
      unidad = 'porción'
      costoUnitario = receta.costo_por_porcion || (receta.rendimiento_porciones > 0 ? receta.costo_total / receta.rendimiento_porciones : receta.costo_total)
    } else {
      const plato = platos.find(p => p.id === nuevoReferenciaId)
      if (!plato) return
      nombreItem = plato.nombre
      unidad = 'porción'
      costoUnitario = plato.costo_total
    }

    const nuevoItem: ItemMenu = {
      id: crypto.randomUUID(),
      tipo: nuevoTipo,
      referencia_id: nuevoReferenciaId,
      nombre: nombreItem,
      cantidad,
      unidad,
      costo_unitario: costoUnitario,
      costo_linea: cantidad * costoUnitario,
      es_bebida: nuevoEsBebida,
      isNew: true,
    }

    setItems([...items, nuevoItem])
    setNuevoReferenciaId('')
    setNuevoCantidad('')
    setNuevoEsBebida(false)
  }

  function handleEliminarItem(itemId: string) {
    setItems(items.filter(i => i.id !== itemId))
  }

  const costoTotal = items.reduce((sum, item) => sum + item.costo_linea, 0)

  async function handleGuardar() {
    if (!nombre.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    if (items.length === 0) {
      alert('Agregá al menos un item al menú')
      return
    }

    setIsSaving(true)

    // Actualizar menú
    const { error: menuError } = await supabase
      .from('menus_ejecutivos')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        costo_total: costoTotal,
      })
      .eq('id', id)

    if (menuError) {
      console.error('Error actualizando menú:', menuError)
      alert('Error al actualizar el menú')
      setIsSaving(false)
      return
    }

    // Eliminar items existentes y crear nuevos
    await supabase.from('menu_ejecutivo_items').delete().eq('menu_ejecutivo_id', id)

    const itemsToInsert = items.map(item => ({
      menu_ejecutivo_id: id,
      tipo: item.tipo,
      insumo_id: item.tipo === 'insumo' ? item.referencia_id : null,
      receta_base_id: item.tipo === 'receta_base' ? item.referencia_id : null,
      plato_id: item.tipo === 'plato' ? item.referencia_id : null,
      cantidad: item.cantidad,
      es_bebida: item.es_bebida,
      costo_linea: item.costo_linea,
    }))

    const { error: itemsError } = await supabase
      .from('menu_ejecutivo_items')
      .insert(itemsToInsert)

    if (itemsError) {
      console.error('Error creando items:', itemsError)
      alert('Error al actualizar los items del menú')
      setIsSaving(false)
      return
    }

    router.push('/menus-ejecutivos')
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'insumo': return <Package className="w-4 h-4 text-green-600" />
      case 'receta_base': return <BookOpen className="w-4 h-4 text-purple-600" />
      case 'plato': return <ChefHat className="w-4 h-4 text-orange-600" />
      default: return null
    }
  }

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'insumo': return 'Insumo'
      case 'receta_base': return 'Elaboración'
      case 'plato': return 'Receta'
      default: return tipo
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Editar Menú Ejecutivo</h1>
          <p className="text-gray-600">Modificá el menú con insumos, recetas base y platos</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Datos básicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre del Menú"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Menú del día - Lunes"
            required
          />
          <Input
            label="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Entrada + Principal + Postre"
          />
        </div>

        {/* Agregar items */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Agregar Componentes</h3>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-40">
              <Select
                label="Tipo"
                options={TIPO_OPTIONS}
                value={nuevoTipo}
                onChange={(e) => {
                  setNuevoTipo(e.target.value as any)
                  setNuevoReferenciaId('')
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Select
                label={nuevoTipo === 'insumo' ? 'Insumo' : nuevoTipo === 'receta_base' ? 'Elaboración' : 'Plato'}
                options={referenciaOptions}
                value={nuevoReferenciaId}
                onChange={(e) => setNuevoReferenciaId(e.target.value)}
              />
            </div>
            <div className="w-24">
              <Input
                label="Cantidad"
                type="number"
                step="0.01"
                value={nuevoCantidad}
                onChange={(e) => setNuevoCantidad(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="esBebida"
                checked={nuevoEsBebida}
                onChange={(e) => setNuevoEsBebida(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="esBebida" className="text-sm text-gray-600">Bebida</label>
            </div>
            <Button onClick={handleAgregarItem} disabled={!nuevoReferenciaId || !nuevoCantidad}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>
        </div>

        {/* Lista de items */}
        {items.length > 0 && (
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Componentes del Menú</h3>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Línea</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getTipoIcon(item.tipo)}
                          <span className="text-xs text-gray-500">{getTipoLabel(item.tipo)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{item.nombre}</span>
                        {item.es_bebida && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Bebida</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {item.cantidad} {item.unidad}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        ${item.costo_unitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        ${item.costo_linea.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEliminarItem(item.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700">
                      Costo Total:
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                      ${costoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 border-t pt-6">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving || !nombre.trim() || items.length === 0}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>
    </div>
  )
}
