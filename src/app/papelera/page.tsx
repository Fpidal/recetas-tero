'use client'

import { useState, useEffect } from 'react'
import { Trash2, RotateCcw, Users, Package, BookOpen, ChefHat, UtensilsCrossed, LayoutGrid, ShoppingCart, FileText, Eye, History, XCircle, Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Select, Modal } from '@/components/ui'
import { formatearMoneda } from '@/lib/formato-numeros'

interface ItemPapelera {
  id: string
  tipo: string
  tipoLabel: string
  nombre: string
  detalle: string
  fecha: string
  tabla: string
}

interface HistorialFactura {
  id: string
  factura_id: string
  tipo: 'anulacion' | 'modificacion'
  fecha_registro: string
  numero_factura: string
  proveedor_nombre: string
  total: number
  datos_anteriores: any
  datos_nuevos: any
}

const TIPO_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  proveedor: { label: 'Proveedor', icon: Users, color: 'bg-blue-100 text-blue-800' },
  insumo: { label: 'Insumo', icon: Package, color: 'bg-green-100 text-green-800' },
  receta_base: { label: 'Elaboración', icon: BookOpen, color: 'bg-purple-100 text-purple-800' },
  plato: { label: 'Plato', icon: ChefHat, color: 'bg-orange-100 text-orange-800' },
  menu_ejecutivo: { label: 'Menú Ejecutivo', icon: UtensilsCrossed, color: 'bg-teal-100 text-teal-800' },
  menu_especial: { label: 'Menú Especial', icon: LayoutGrid, color: 'bg-indigo-100 text-indigo-800' },
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
  { value: 'orden_compra', label: 'Órdenes de Compra' },
  { value: 'factura', label: 'Facturas' },
]

export default function PapeleraPage() {
  const router = useRouter()
  const [items, setItems] = useState<ItemPapelera[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [tabActiva, setTabActiva] = useState<'papelera' | 'historial'>('papelera')
  const [historial, setHistorial] = useState<HistorialFactura[]>([])
  const [historialFiltro, setHistorialFiltro] = useState<'todos' | 'anulacion' | 'modificacion'>('todos')
  const [historialExpandido, setHistorialExpandido] = useState<string | null>(null)
  const [modalDetalle, setModalDetalle] = useState<HistorialFactura | null>(null)

  // Función para obtener la URL de vista según el tipo
  function getViewUrl(item: ItemPapelera): string | null {
    switch (item.tipo) {
      case 'factura': return `/facturas/${item.id}`
      default: return null
    }
  }

  useEffect(() => {
    fetchPapelera()
    fetchHistorial()
  }, [])

  async function fetchHistorial() {
    const { data } = await supabase
      .from('facturas_historial')
      .select('*')
      .order('fecha_registro', { ascending: false })

    setHistorial(data || [])
  }

  async function fetchPapelera() {
    setIsLoading(true)

    const [
      proveedores,
      insumos,
      recetasBase,
      platos,
      menusEjecutivos,
      menusEspeciales,
      ordenes,
      facturas,
    ] = await Promise.all([
      supabase.from('proveedores').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('insumos').select('id, nombre, unidad_medida, updated_at').eq('activo', false),
      supabase.from('recetas_base').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('platos').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('menus_ejecutivos').select('id, nombre, updated_at').eq('activo', false),
      supabase.from('menus_especiales').select('id, nombre, updated_at').eq('activo', false),
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

    try {
      if (item.tabla === 'ordenes_compra') {
        // Eliminar items primero
        await supabase.from('orden_compra_items').delete().eq('orden_compra_id', item.id)
        // Desvincular facturas que referencian esta OC
        await supabase.from('facturas_proveedor').update({ orden_compra_id: null }).eq('orden_compra_id', item.id)
      }

      if (item.tabla === 'facturas_proveedor') {
        // Obtener los items de la factura para limpiar referencias
        const { data: facturaItems } = await supabase
          .from('factura_items')
          .select('id')
          .eq('factura_id', item.id)

        if (facturaItems && facturaItems.length > 0) {
          const itemIds = facturaItems.map(fi => fi.id)
          // Desvincular precios_insumo que referencian estos items
          await supabase
            .from('precios_insumo')
            .update({ factura_item_id: null })
            .in('factura_item_id', itemIds)
        }

        // Eliminar items de factura
        await supabase.from('factura_items').delete().eq('factura_id', item.id)

        // Eliminar historial de esta factura (si existe)
        await supabase.from('facturas_historial').delete().eq('factura_id', item.id)
      }

      const { error } = await supabase
        .from(item.tabla)
        .delete()
        .eq('id', item.id)

      if (error) {
        console.error('Error eliminando:', error)
        alert(`Error al eliminar: ${error.message}`)
        return
      }

      setItems(items.filter(i => i.id !== item.id))
    } catch (err: any) {
      console.error('Error inesperado:', err)
      alert(`Error inesperado: ${err.message || 'Desconocido'}`)
    }
  }

  async function handleVaciarPapelera() {
    const confirmar = confirm(`¿Vaciar toda la papelera? Se eliminarán ${itemsFiltrados.length} elemento(s) definitivamente.`)
    if (!confirmar) return

    let errores = 0
    for (const item of itemsFiltrados) {
      try {
        if (item.tabla === 'ordenes_compra') {
          await supabase.from('orden_compra_items').delete().eq('orden_compra_id', item.id)
          await supabase.from('facturas_proveedor').update({ orden_compra_id: null }).eq('orden_compra_id', item.id)
        }
        if (item.tabla === 'facturas_proveedor') {
          const { data: facturaItems } = await supabase
            .from('factura_items')
            .select('id')
            .eq('factura_id', item.id)

          if (facturaItems && facturaItems.length > 0) {
            const itemIds = facturaItems.map(fi => fi.id)
            await supabase
              .from('precios_insumo')
              .update({ factura_item_id: null })
              .in('factura_item_id', itemIds)
          }
          await supabase.from('factura_items').delete().eq('factura_id', item.id)
          await supabase.from('facturas_historial').delete().eq('factura_id', item.id)
        }
        await supabase.from(item.tabla).delete().eq('id', item.id)
      } catch (err) {
        console.error(`Error eliminando ${item.nombre}:`, err)
        errores++
      }
    }

    if (errores > 0) {
      alert(`Se completó con ${errores} error(es). Algunos elementos pueden no haberse eliminado.`)
    }

    fetchPapelera() // Recargar para ver el estado actual
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

  const historialFiltrado = historialFiltro === 'todos'
    ? historial
    : historial.filter(h => h.tipo === historialFiltro)

  const anulaciones = historial.filter(h => h.tipo === 'anulacion')
  const modificaciones = historial.filter(h => h.tipo === 'modificacion')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Papelera</h1>
          <p className="text-gray-600 text-sm">Elementos eliminados e historial de facturas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        <button
          onClick={() => setTabActiva('papelera')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tabActiva === 'papelera'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Trash2 className="w-4 h-4 inline mr-1.5" />
          Papelera ({items.length})
        </button>
        <button
          onClick={() => setTabActiva('historial')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tabActiva === 'historial'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <History className="w-4 h-4 inline mr-1.5" />
          Historial Facturas ({historial.length})
        </button>
      </div>

      {/* Tab Papelera */}
      {tabActiva === 'papelera' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div></div>
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
                          {getViewUrl(item) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(getViewUrl(item)!)}
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4 text-gray-500" />
                            </Button>
                          )}
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
        </>
      )}

      {/* Tab Historial */}
      {tabActiva === 'historial' && (
        <>
          {/* Filtros de historial */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setHistorialFiltro('todos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                historialFiltro === 'todos'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos ({historial.length})
            </button>
            <button
              onClick={() => setHistorialFiltro('anulacion')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                historialFiltro === 'anulacion'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              <XCircle className="w-3 h-3 inline mr-1" />
              Anulaciones ({anulaciones.length})
            </button>
            <button
              onClick={() => setHistorialFiltro('modificacion')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                historialFiltro === 'modificacion'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}
            >
              <Pencil className="w-3 h-3 inline mr-1" />
              Modificaciones ({modificaciones.length})
            </button>
          </div>

          {/* Tabla historial */}
          {historialFiltrado.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay registros en el historial</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Registro</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {historialFiltrado.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {h.tipo === 'anulacion' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3" />
                            Anulación
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Pencil className="w-3 h-3" />
                            Modificación
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{h.numero_factura}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{h.proveedor_nombre}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium">{formatearMoneda(h.total)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">
                          {new Date(h.fecha_registro).toLocaleString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setModalDetalle(h)}
                        >
                          <Eye className="w-4 h-4 text-gray-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">
            * Este historial es de solo lectura y no se puede modificar ni eliminar.
          </p>
        </>
      )}

      {/* Modal detalle historial */}
      <Modal
        isOpen={!!modalDetalle}
        onClose={() => setModalDetalle(null)}
        title={modalDetalle?.tipo === 'anulacion' ? 'Detalle de Anulación' : 'Detalle de Modificación'}
        size="lg"
      >
        {modalDetalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Factura</p>
                <p className="font-medium">{modalDetalle.numero_factura}</p>
              </div>
              <div>
                <p className="text-gray-500">Proveedor</p>
                <p className="font-medium">{modalDetalle.proveedor_nombre}</p>
              </div>
              <div>
                <p className="text-gray-500">Total</p>
                <p className="font-medium">{formatearMoneda(modalDetalle.total)}</p>
              </div>
              <div>
                <p className="text-gray-500">Fecha de registro</p>
                <p className="font-medium">
                  {new Date(modalDetalle.fecha_registro).toLocaleString('es-AR')}
                </p>
              </div>
            </div>

            {modalDetalle.tipo === 'modificacion' && modalDetalle.datos_anteriores && modalDetalle.datos_nuevos && (
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-3">Cambios realizados</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-red-700 mb-2">Datos Anteriores</p>
                    <div className="text-xs space-y-1">
                      <p><span className="text-gray-500">Fecha:</span> {modalDetalle.datos_anteriores.fecha}</p>
                      <p><span className="text-gray-500">Total:</span> {formatearMoneda(modalDetalle.datos_anteriores.total)}</p>
                      <p className="text-gray-500 mt-2">Items:</p>
                      {modalDetalle.datos_anteriores.items?.map((item: any, idx: number) => (
                        <p key={idx} className="pl-2">• {item.insumo_nombre}: {item.cantidad} x {formatearMoneda(item.precio_unitario)}</p>
                      ))}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-green-700 mb-2">Datos Nuevos</p>
                    <div className="text-xs space-y-1">
                      <p><span className="text-gray-500">Fecha:</span> {modalDetalle.datos_nuevos.fecha}</p>
                      <p><span className="text-gray-500">Total:</span> {formatearMoneda(modalDetalle.datos_nuevos.total)}</p>
                      <p className="text-gray-500 mt-2">Items:</p>
                      {modalDetalle.datos_nuevos.items?.map((item: any, idx: number) => (
                        <p key={idx} className="pl-2">• {item.insumo_nombre}: {item.cantidad} x {formatearMoneda(item.precio_unitario)}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {modalDetalle.tipo === 'anulacion' && modalDetalle.datos_anteriores && (
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-3">Datos de la factura anulada</h4>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs space-y-1">
                    <p><span className="text-gray-500">Fecha:</span> {modalDetalle.datos_anteriores.fecha}</p>
                    {modalDetalle.datos_anteriores.notas && (
                      <p><span className="text-gray-500">Notas:</span> {modalDetalle.datos_anteriores.notas}</p>
                    )}
                    <p className="text-gray-500 mt-2">Items:</p>
                    {modalDetalle.datos_anteriores.items?.map((item: any, idx: number) => (
                      <p key={idx} className="pl-2">• {item.insumo_nombre}: {item.cantidad} x {formatearMoneda(item.precio_unitario)}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
