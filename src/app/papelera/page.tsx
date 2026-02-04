'use client'

import { useState, useEffect } from 'react'
import { Trash2, RotateCcw, AlertTriangle, Users, Package, BookOpen, ChefHat, UtensilsCrossed, LayoutGrid, ClipboardList, ShoppingCart, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Select } from '@/components/ui'

interface ItemPapelera {
  id: string
  tipo: string
  tipoLabel: string
  nombre: string
  detalle: string
  fecha: string
  tabla: string
}

const TIPO_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  proveedor: { label: 'Proveedor', icon: Users, color: 'bg-blue-100 text-blue-800' },
  insumo: { label: 'Insumo', icon: Package, color: 'bg-green-100 text-green-800' },
  receta_base: { label: 'Elaboración', icon: BookOpen, color: 'bg-purple-100 text-purple-800' },
  plato: { label: 'Plato', icon: ChefHat, color: 'bg-orange-100 text-orange-800' },
  menu_ejecutivo: { label: 'Menú Ejecutivo', icon: UtensilsCrossed, color: 'bg-teal-100 text-teal-800' },
  menu_especial: { label: 'Menú Especial', icon: LayoutGrid, color: 'bg-indigo-100 text-indigo-800' },
  carta: { label: 'Carta', icon: ClipboardList, color: 'bg-pink-100 text-pink-800' },
  orden_compra: { label: 'Orden Compra', icon: ShoppingCart, color: 'bg-yellow-100 text-yellow-800' },
  factura: { label: 'Factura', icon: FileText, color: 'bg-red-100 text-red-800' },
}

const FILTRO_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'proveedor', label: 'Proveedores' },
  { value: 'insumo', label: 'Insumos' },
  { value: 'receta_base', label: 'Recetas Base' },
  { value: 'plato', label: 'Platos' },
  { value: 'menu_ejecutivo', label: 'Menús Ejecutivos' },
  { value: 'menu_especial', label: 'Menús Especiales' },
  { value: 'carta', label: 'Carta' },
  { value: 'orden_compra', label: 'Órdenes de Compra' },
  { value: 'factura', label: 'Facturas' },
]

export default function PapeleraPage() {
  const [items, setItems] = useState<ItemPapelera[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    fetchPapelera()
  }, [])

  async function fetchPapelera() {
    setIsLoading(true)

    const [
      proveedores,
      insumos,
      recetasBase,
      platos,
      menusEjecutivos,
      menusEspeciales,
      carta,
      ordenes,
      facturas,
    ] = await Promise.all([
      supabase.from('proveedores').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('insumos').select('id, nombre, unidad_medida, updated_at').eq('activo', false),
      supabase.from('recetas_base').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('platos').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('menus_ejecutivos').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('menus_especiales').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('carta').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('ordenes_compra').select('id, numero, fecha, updated_at, proveedores (nombre)').eq('activo', false),
      supabase.from('facturas_proveedor').select('id, numero_factura, fecha, updated_at, proveedores (nombre)').eq('activo', false),
    ])

    const allItems: ItemPapelera[] = []

    // Proveedores
    ;(proveedores.data || []).forEach((p: any) => {
      allItems.push({
        id: p.id, tipo: 'proveedor', tipoLabel: 'Proveedor',
        nombre: p.nombre, detalle: '',
        fecha: p.updated_at || '', tabla: 'proveedores',
      })
    })

    // Insumos
    ;(insumos.data || []).forEach((i: any) => {
      allItems.push({
        id: i.id, tipo: 'insumo', tipoLabel: 'Insumo',
        nombre: i.nombre, detalle: i.unidad_medida || '',
        fecha: i.updated_at || '', tabla: 'insumos',
      })
    })

    // Recetas Base
    ;(recetasBase.data || []).forEach((r: any) => {
      allItems.push({
        id: r.id, tipo: 'receta_base', tipoLabel: 'Elaboración',
        nombre: r.nombre, detalle: '',
        fecha: r.updated_at || '', tabla: 'recetas_base',
      })
    })

    // Platos
    ;(platos.data || []).forEach((p: any) => {
      allItems.push({
        id: p.id, tipo: 'plato', tipoLabel: 'Plato',
        nombre: p.nombre, detalle: '',
        fecha: p.updated_at || '', tabla: 'platos',
      })
    })

    // Menús Ejecutivos
    ;(menusEjecutivos.data || []).forEach((m: any) => {
      allItems.push({
        id: m.id, tipo: 'menu_ejecutivo', tipoLabel: 'Menú Ejecutivo',
        nombre: m.nombre, detalle: '',
        fecha: m.updated_at || '', tabla: 'menus_ejecutivos',
      })
    })

    // Menús Especiales
    ;(menusEspeciales.data || []).forEach((m: any) => {
      allItems.push({
        id: m.id, tipo: 'menu_especial', tipoLabel: 'Menú Especial',
        nombre: m.nombre, detalle: '',
        fecha: m.updated_at || '', tabla: 'menus_especiales',
      })
    })

    // Carta
    ;(carta.data || []).forEach((c: any) => {
      allItems.push({
        id: c.id, tipo: 'carta', tipoLabel: 'Carta',
        nombre: c.nombre, detalle: '',
        fecha: c.updated_at || '', tabla: 'carta',
      })
    })

    // Órdenes de Compra canceladas
    ;(ordenes.data || []).forEach((o: any) => {
      allItems.push({
        id: o.id, tipo: 'orden_compra', tipoLabel: 'Orden Compra',
        nombre: o.numero || 'Sin número',
        detalle: (o.proveedores as any)?.nombre || '',
        fecha: o.updated_at || o.fecha || '', tabla: 'ordenes_compra',
      })
    })

    // Facturas
    ;(facturas.data || []).forEach((f: any) => {
      allItems.push({
        id: f.id, tipo: 'factura', tipoLabel: 'Factura',
        nombre: f.numero_factura,
        detalle: (f.proveedores as any)?.nombre || '',
        fecha: f.updated_at || f.fecha || '', tabla: 'facturas_proveedor',
      })
    })

    // Ordenar por fecha más reciente
    allItems.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    setItems(allItems)
    setIsLoading(false)
  }

  async function handleRestaurar(item: ItemPapelera) {
    if (item.tabla === 'ordenes_compra') {
      await supabase
        .from('ordenes_compra')
        .update({ estado: 'borrador', activo: true })
        .eq('id', item.id)
    } else {
      await supabase
        .from(item.tabla)
        .update({ activo: true })
        .eq('id', item.id)
    }

    setItems(items.filter(i => i.id !== item.id))
  }

  async function handleEliminarDefinitivo(item: ItemPapelera) {
    const confirmar = confirm(`¿Eliminar definitivamente "${item.nombre}"? Esta acción no se puede deshacer.`)
    if (!confirmar) return

    if (item.tabla === 'ordenes_compra') {
      // Eliminar items primero
      await supabase.from('orden_compra_items').delete().eq('orden_compra_id', item.id)
    }

    if (item.tabla === 'facturas_proveedor') {
      // Eliminar items primero
      await supabase.from('factura_items').delete().eq('factura_id', item.id)
    }

    const { error } = await supabase
      .from(item.tabla)
      .delete()
      .eq('id', item.id)

    if (error) {
      console.error('Error eliminando:', error)
      alert('Error al eliminar. Puede tener registros dependientes.')
      return
    }

    setItems(items.filter(i => i.id !== item.id))
  }

  async function handleVaciarPapelera() {
    const confirmar = confirm(`¿Vaciar toda la papelera? Se eliminarán ${itemsFiltrados.length} elemento(s) definitivamente.`)
    if (!confirmar) return

    for (const item of itemsFiltrados) {
      if (item.tabla === 'ordenes_compra') {
        await supabase.from('orden_compra_items').delete().eq('orden_compra_id', item.id)
      }
      if (item.tabla === 'facturas_proveedor') {
        await supabase.from('factura_items').delete().eq('factura_id', item.id)
      }
      await supabase.from(item.tabla).delete().eq('id', item.id)
    }

    setItems(items.filter(i => !itemsFiltrados.includes(i)))
  }

  const itemsFiltrados = filtroTipo
    ? items.filter(i => i.tipo === filtroTipo)
    : items

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Papelera</h1>
          <p className="text-gray-600">
            {items.length === 0
              ? 'No hay elementos eliminados'
              : `${items.length} elemento(s) eliminado(s)`}
          </p>
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            onClick={handleVaciarPapelera}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Vaciar papelera
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <>
          {/* Filtro */}
          <div className="mb-4 w-56">
            <Select
              label="Filtrar por tipo"
              id="filtroTipo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              options={FILTRO_OPTIONS}
            />
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detalle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Eliminado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemsFiltrados.map((item) => {
                  const config = TIPO_CONFIG[item.tipo]
                  const Icon = config?.icon || Trash2

                  return (
                    <tr key={`${item.tipo}-${item.id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config?.color || 'bg-gray-100 text-gray-800'}`}>
                          <Icon className="w-3 h-3" />
                          {item.tipoLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{item.nombre}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">{item.detalle}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-400">
                          {item.fecha ? new Date(item.fecha).toLocaleDateString('es-AR') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestaurar(item)}
                            title="Restaurar"
                          >
                            <RotateCcw className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEliminarDefinitivo(item)}
                            title="Eliminar definitivamente"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filtroTipo && (
            <p className="text-xs text-gray-400 mt-2">
              Mostrando {itemsFiltrados.length} de {items.length} elementos
            </p>
          )}
        </>
      )}

      {items.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">La papelera está vacía</p>
        </div>
      )}
    </div>
  )
}
