'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'

interface Proveedor {
  id: string
  nombre: string
}

interface Insumo {
  id: string
  nombre: string
  unidad_medida: string
  categoria: string
  precio_actual: number | null
  iva_porcentaje: number
}

interface ItemOrden {
  id: string
  insumo_id: string
  insumo_nombre: string
  unidad_medida: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  iva_porcentaje: number
  iva_monto: number
  isNew?: boolean
  isDeleted?: boolean
}

export default function EditarOrdenCompraPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedProveedor, setSelectedProveedor] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemOrden[]>([])
  const [itemsOriginales, setItemsOriginales] = useState<string[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precioUnitario, setPrecioUnitario] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [tieneFactura, setTieneFactura] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    // Verificar si la orden tiene factura asociada
    const { data: facturaData } = await supabase
      .from('facturas_proveedor')
      .select('id')
      .eq('orden_compra_id', id)
      .single()

    if (facturaData) {
      setTieneFactura(true)
      setIsLoading(false)
      return
    }

    const [proveedoresRes, insumosRes, ordenRes] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('v_insumos_con_precio').select('id, nombre, unidad_medida, categoria, precio_actual, iva_porcentaje').eq('activo', true).order('categoria').order('nombre'),
      supabase.from('ordenes_compra')
        .select(`
          id, proveedor_id, notas, estado,
          orden_compra_items (
            id, insumo_id, cantidad, precio_unitario, subtotal,
            insumos (nombre, unidad_medida, iva_porcentaje)
          )
        `)
        .eq('id', id)
        .single()
    ])

    if (proveedoresRes.data) setProveedores(proveedoresRes.data)
    if (insumosRes.data) setInsumos(insumosRes.data)

    if (ordenRes.data) {
      setSelectedProveedor(ordenRes.data.proveedor_id)
      setNotas(ordenRes.data.notas || '')

      const itemsData: ItemOrden[] = (ordenRes.data.orden_compra_items as any[]).map((item: any) => {
        const subtotal = parseFloat(item.subtotal)
        const ivaPorcentaje = item.insumos?.iva_porcentaje || 21
        const ivaMonto = subtotal * (ivaPorcentaje / 100)
        return {
          id: item.id,
          insumo_id: item.insumo_id,
          insumo_nombre: item.insumos?.nombre || 'Desconocido',
          unidad_medida: item.insumos?.unidad_medida || '',
          cantidad: parseFloat(item.cantidad),
          precio_unitario: parseFloat(item.precio_unitario),
          subtotal,
          iva_porcentaje: ivaPorcentaje,
          iva_monto: ivaMonto,
        }
      })

      setItems(itemsData)
      setItemsOriginales(itemsData.map(i => i.id))
    }

    setIsLoading(false)
  }

  function handleSelectInsumo(insumoId: string) {
    setSelectedInsumo(insumoId)
    const insumo = insumos.find(i => i.id === insumoId)
    if (insumo && insumo.precio_actual) {
      setPrecioUnitario(insumo.precio_actual.toString())
    } else {
      setPrecioUnitario('')
    }
  }

  function handleAgregarItem() {
    if (!selectedInsumo || !cantidad || !precioUnitario) {
      alert('Completá todos los campos del item')
      return
    }

    const insumo = insumos.find(i => i.id === selectedInsumo)
    if (!insumo) return

    if (items.some(item => item.insumo_id === selectedInsumo && !item.isDeleted)) {
      alert('Este insumo ya está en la orden')
      return
    }

    const cantidadNum = parseFloat(cantidad)
    const precioNum = parseFloat(precioUnitario)
    const subtotal = cantidadNum * precioNum
    const ivaPorcentaje = insumo.iva_porcentaje || 21
    const ivaMonto = subtotal * (ivaPorcentaje / 100)

    const nuevoItem: ItemOrden = {
      id: crypto.randomUUID(),
      insumo_id: insumo.id,
      insumo_nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      cantidad: cantidadNum,
      precio_unitario: precioNum,
      subtotal,
      iva_porcentaje: ivaPorcentaje,
      iva_monto: ivaMonto,
      isNew: true,
    }

    setItems([...items, nuevoItem])
    setSelectedInsumo('')
    setCantidad('')
    setPrecioUnitario('')
  }

  function handleEliminarItem(itemId: string) {
    const item = items.find(i => i.id === itemId)
    if (item?.isNew) {
      setItems(items.filter(i => i.id !== itemId))
    } else {
      setItems(items.map(i => i.id === itemId ? { ...i, isDeleted: true } : i))
    }
  }

  function handleCantidadChange(itemId: string, nuevaCantidad: string) {
    const cantidadNum = parseFloat(nuevaCantidad) || 0
    setItems(items.map(item => {
      if (item.id === itemId) {
        const subtotal = cantidadNum * item.precio_unitario
        const ivaMonto = subtotal * (item.iva_porcentaje / 100)
        return {
          ...item,
          cantidad: cantidadNum,
          subtotal,
          iva_monto: ivaMonto,
        }
      }
      return item
    }))
  }

  function handlePrecioChange(itemId: string, nuevoPrecio: string) {
    const precioNum = parseFloat(nuevoPrecio) || 0
    setItems(items.map(item => {
      if (item.id === itemId) {
        const subtotal = item.cantidad * precioNum
        const ivaMonto = subtotal * (item.iva_porcentaje / 100)
        return {
          ...item,
          precio_unitario: precioNum,
          subtotal,
          iva_monto: ivaMonto,
        }
      }
      return item
    }))
  }

  const itemsActivos = items.filter(i => !i.isDeleted)
  const subtotalNeto = itemsActivos.reduce((sum, item) => sum + item.subtotal, 0)
  const totalIva21 = itemsActivos.filter(i => i.iva_porcentaje === 21).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva105 = itemsActivos.filter(i => i.iva_porcentaje === 10.5).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva = itemsActivos.reduce((sum, item) => sum + item.iva_monto, 0)
  const total = subtotalNeto + totalIva

  async function handleGuardar() {
    if (!selectedProveedor) {
      alert('Seleccioná un proveedor')
      return
    }

    if (itemsActivos.length === 0) {
      alert('Agregá al menos un item')
      return
    }

    setIsSaving(true)

    // Actualizar orden
    const { error: ordenError } = await supabase
      .from('ordenes_compra')
      .update({
        proveedor_id: selectedProveedor,
        total: total,
        notas: notas || null,
      })
      .eq('id', id)

    if (ordenError) {
      console.error('Error actualizando orden:', ordenError)
      alert('Error al actualizar la orden')
      setIsSaving(false)
      return
    }

    // Eliminar items marcados
    const itemsEliminados = items.filter(i => i.isDeleted && itemsOriginales.includes(i.id))
    if (itemsEliminados.length > 0) {
      await supabase
        .from('orden_compra_items')
        .delete()
        .in('id', itemsEliminados.map(i => i.id))
    }

    // Actualizar items existentes
    const itemsExistentes = itemsActivos.filter(i => !i.isNew && itemsOriginales.includes(i.id))
    for (const item of itemsExistentes) {
      await supabase
        .from('orden_compra_items')
        .update({
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
        })
        .eq('id', item.id)
    }

    // Insertar nuevos items
    const itemsNuevos = itemsActivos.filter(i => i.isNew)
    if (itemsNuevos.length > 0) {
      await supabase
        .from('orden_compra_items')
        .insert(itemsNuevos.map(item => ({
          orden_compra_id: id,
          insumo_id: item.insumo_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
        })))
    }

    setIsSaving(false)
    router.push(`/ordenes-compra/${id}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (tieneFactura) {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">No se puede editar</h1>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800 font-medium">Esta orden de compra ya tiene una factura asociada</p>
          <p className="text-red-600 text-sm mt-2">Las órdenes con facturas no pueden ser modificadas.</p>
          <Button variant="secondary" className="mt-4" onClick={() => router.back()}>
            Volver
          </Button>
        </div>
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
          <h1 className="text-2xl font-bold text-gray-900">Editar Orden de Compra</h1>
          <p className="text-gray-600">Modificar pedido a proveedor</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Proveedor */}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Proveedor *"
            options={[
              { value: '', label: 'Seleccionar proveedor...' },
              ...proveedores.map(p => ({ value: p.id, label: p.nombre }))
            ]}
            value={selectedProveedor}
            onChange={(e) => setSelectedProveedor(e.target.value)}
          />
        </div>

        {/* Agregar item */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Items</h3>

          <div className="flex gap-3 items-end mb-4">
            <div className="w-44">
              <Select
                label="Categoría"
                options={[
                  { value: '', label: 'Todas' },
                  { value: 'Carnes', label: 'Carnes' },
                  { value: 'Almacen', label: 'Almacén' },
                  { value: 'Verduras_Frutas', label: 'Verduras y Frutas' },
                  { value: 'Pescados_Mariscos', label: 'Pescados y Mariscos' },
                  { value: 'Lacteos_Fiambres', label: 'Lácteos y Fiambres' },
                  { value: 'Bebidas', label: 'Bebidas' },
                  { value: 'Salsas_Recetas', label: 'Salsas y Recetas' },
                ]}
                value={filtroCategoria}
                onChange={(e) => { setFiltroCategoria(e.target.value); setSelectedInsumo('') }}
              />
            </div>
            <div className="flex-1">
              <Select
                label="Insumo"
                options={[
                  { value: '', label: 'Seleccionar insumo...' },
                  ...(filtroCategoria ? insumos.filter(i => i.categoria === filtroCategoria) : insumos).map(i => ({
                    value: i.id,
                    label: `${i.nombre} (${i.unidad_medida})`
                  }))
                ]}
                value={selectedInsumo}
                onChange={(e) => handleSelectInsumo(e.target.value)}
              />
            </div>
            <div className="w-28">
              <Input
                label="Cantidad"
                type="number"
                step="0.01"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="w-32">
              <Input
                label="Precio Unit. ($)"
                type="number"
                step="0.01"
                min="0"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button onClick={handleAgregarItem}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>

          {/* Lista de items */}
          {itemsActivos.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">IVA</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {itemsActivos.map((item) => (
                    <tr key={item.id} className={item.isNew ? 'bg-green-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{item.insumo_nombre}</span>
                          {item.isNew && (
                            <span className="text-xs text-green-600">(nuevo)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.cantidad}
                          onChange={(e) => handleCantidadChange(item.id, e.target.value)}
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                        <span className="ml-1 text-sm text-gray-500">{item.unidad_medida}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <span className="text-sm text-gray-500 mr-1">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.precio_unitario}
                            onChange={(e) => handlePrecioChange(item.id, e.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                          item.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.iva_porcentaje}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${item.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right text-sm text-gray-600">
                      Subtotal Neto:
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-gray-900">
                      ${subtotalNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                  {totalIva21 > 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                        IVA 21%:
                      </td>
                      <td className="px-4 py-1 text-right text-sm text-gray-900">
                        ${totalIva21.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  {totalIva105 > 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                        IVA 10.5%:
                      </td>
                      <td className="px-4 py-1 text-right text-sm text-gray-900">
                        ${totalIva105.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  <tr className="border-t border-gray-300">
                    <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-900">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                      ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 border rounded-lg bg-gray-50">
              <p className="text-gray-500">No hay items agregados</p>
            </div>
          )}
        </div>

        {/* Notas */}
        <div className="border-t pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Notas adicionales para el proveedor..."
          />
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
