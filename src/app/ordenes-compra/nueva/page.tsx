'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package, Search, PlusCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getNextOCNumber } from '@/lib/oc-numero'
import { Button, Input, Select, Modal } from '@/components/ui'
import { formatearMoneda, formatearCantidad, parsearNumero } from '@/lib/formato-numeros'

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
}

export default function NuevaOrdenCompraPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedProveedor, setSelectedProveedor] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemOrden[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precioUnitario, setPrecioUnitario] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [nextNumero, setNextNumero] = useState('')

  // Modal nuevo insumo
  const [showNuevoInsumo, setShowNuevoInsumo] = useState(false)
  const [nuevoInsumoNombre, setNuevoInsumoNombre] = useState('')
  const [nuevoInsumoCategoria, setNuevoInsumoCategoria] = useState('')
  const [nuevoInsumoUnidad, setNuevoInsumoUnidad] = useState('kg')
  const [nuevoInsumoIva, setNuevoInsumoIva] = useState('21')
  const [savingInsumo, setSavingInsumo] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)

    const [proveedoresRes, insumosRes, numero] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('v_insumos_con_precio').select('id, nombre, unidad_medida, categoria, precio_actual, iva_porcentaje').eq('activo', true).order('categoria').order('nombre'),
      getNextOCNumber()
    ])

    if (proveedoresRes.data) setProveedores(proveedoresRes.data)
    if (insumosRes.data) setInsumos(insumosRes.data)
    setNextNumero(numero)

    setIsLoading(false)
  }

  function handleSelectInsumo(insumoId: string) {
    setSelectedInsumo(insumoId)
    const insumo = insumos.find(i => i.id === insumoId)
    if (insumo && insumo.precio_actual) {
      setPrecioUnitario(formatearCantidad(insumo.precio_actual, 2))
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

    if (items.some(item => item.insumo_id === selectedInsumo)) {
      alert('Este insumo ya está en la orden')
      return
    }

    const cantidadNum = parsearNumero(cantidad)
    const precioNum = parsearNumero(precioUnitario)
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
    }

    setItems([...items, nuevoItem])
    setSelectedInsumo('')
    setCantidad('')
    setPrecioUnitario('')
  }

  function handleEliminarItem(id: string) {
    setItems(items.filter(item => item.id !== id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parsearNumero(nuevaCantidad)
    setItems(items.map(item => {
      if (item.id === id) {
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

  function handlePrecioChange(id: string, nuevoPrecio: string) {
    const precioNum = parsearNumero(nuevoPrecio)
    setItems(items.map(item => {
      if (item.id === id) {
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

  async function handleGuardarNuevoInsumo() {
    if (!nuevoInsumoNombre.trim() || !nuevoInsumoCategoria) {
      alert('Completá nombre y categoría')
      return
    }

    setSavingInsumo(true)

    const { data, error } = await supabase
      .from('insumos')
      .insert({
        nombre: nuevoInsumoNombre.trim(),
        categoria: nuevoInsumoCategoria,
        unidad_medida: nuevoInsumoUnidad,
        iva_porcentaje: parseFloat(nuevoInsumoIva),
        merma_porcentaje: 0,
        activo: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creando insumo:', error)
      alert('Error al crear el insumo')
      setSavingInsumo(false)
      return
    }

    // Agregar a la lista local
    const nuevoInsumo: Insumo = {
      id: data.id,
      nombre: data.nombre,
      unidad_medida: data.unidad_medida,
      categoria: data.categoria,
      precio_actual: null,
      iva_porcentaje: data.iva_porcentaje,
    }
    setInsumos([...insumos, nuevoInsumo].sort((a, b) => a.nombre.localeCompare(b.nombre)))

    // Seleccionar el nuevo insumo
    setSelectedInsumo(data.id)
    setFiltroCategoria(data.categoria)

    // Limpiar y cerrar modal
    setNuevoInsumoNombre('')
    setNuevoInsumoCategoria('')
    setNuevoInsumoUnidad('kg')
    setNuevoInsumoIva('21')
    setShowNuevoInsumo(false)
    setSavingInsumo(false)
  }

  // Calcular totales con desglose de IVA
  const subtotalNeto = items.reduce((sum, item) => sum + item.subtotal, 0)
  const totalIva21 = items.filter(i => i.iva_porcentaje === 21).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva105 = items.filter(i => i.iva_porcentaje === 10.5).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva = items.reduce((sum, item) => sum + item.iva_monto, 0)
  const total = subtotalNeto + totalIva

  async function handleGuardar() {
    if (!selectedProveedor) {
      alert('Seleccioná un proveedor')
      return
    }

    if (items.length === 0) {
      alert('Agregá al menos un item')
      return
    }

    setIsSaving(true)

    // Crear orden
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes_compra')
      .insert({
        proveedor_id: selectedProveedor,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'borrador',
        total: total,
        notas: notas || null,
      })
      .select()
      .single()

    if (ordenError) {
      console.error('Error creando orden:', ordenError)
      alert('Error al crear la orden')
      setIsSaving(false)
      return
    }

    // Asignar número de OC (update separado para evitar problemas de schema cache)
    const { error: numError } = await supabase
      .from('ordenes_compra')
      .update({ numero: nextNumero } as any)
      .eq('id', orden.id)

    if (numError) {
      console.error('Error asignando número OC:', numError)
    }

    // Insertar items
    const itemsData = items.map(item => ({
      orden_compra_id: orden.id,
      insumo_id: item.insumo_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
    }))

    const { error: itemsError } = await supabase
      .from('orden_compra_items')
      .insert(itemsData)

    if (itemsError) {
      console.error('Error creando items:', itemsError)
      alert('Orden creada pero hubo un error con los items')
    }

    setIsSaving(false)
    router.push('/ordenes-compra')
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
      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">
            Nueva OC{nextNumero ? ` ${nextNumero}` : ''}
          </h1>
          <p className="text-xs sm:text-base text-gray-600">Pedido a proveedor</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Proveedor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Select
            label="Proveedor *"
            options={[
              { value: '', label: 'Seleccionar proveedor...' },
              ...proveedores.map(p => ({ value: p.id, label: p.nombre }))
            ]}
            value={selectedProveedor}
            onChange={(e) => setSelectedProveedor(e.target.value)}
          />
          <Input
            label="Fecha"
            type="date"
            value={new Date().toISOString().split('T')[0]}
            disabled
          />
        </div>

        {/* Agregar item */}
        <div className="border-t pt-4 sm:pt-6">
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">Items</h3>

          {/* Mobile: Stack vertical */}
          <div className="sm:hidden space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Categoría"
                options={[
                  { value: '', label: 'Todas' },
                  { value: 'Carnes', label: 'Carnes' },
                  { value: 'Almacen', label: 'Almacén' },
                  { value: 'Verduras_Frutas', label: 'Verduras' },
                  { value: 'Pescados_Mariscos', label: 'Pescados' },
                  { value: 'Lacteos_Fiambres', label: 'Lácteos' },
                  { value: 'Bebidas', label: 'Bebidas' },
                  { value: 'Salsas_Recetas', label: 'Salsas' },
                ]}
                value={filtroCategoria}
                onChange={(e) => { setFiltroCategoria(e.target.value); setSelectedInsumo('') }}
              />
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select
                    label="Insumo"
                    options={[
                      { value: '', label: 'Seleccionar...' },
                      ...(filtroCategoria ? insumos.filter(i => i.categoria === filtroCategoria) : insumos).map(i => ({
                        value: i.id,
                        label: `${i.nombre} (${i.unidad_medida})`
                      }))
                    ]}
                    value={selectedInsumo}
                    onChange={(e) => handleSelectInsumo(e.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowNuevoInsumo(true)}
                  title="Nuevo"
                >
                  <PlusCircle className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
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
              <div className="flex-1">
                <Input
                  label="Precio $"
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioUnitario}
                  onChange={(e) => setPrecioUnitario(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button onClick={handleAgregarItem} className="flex-shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Desktop: Row */}
          <div className="hidden sm:flex gap-3 items-end mb-4">
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
            <div className="flex-1 flex gap-2 items-end">
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
              <Button
                variant="secondary"
                onClick={() => setShowNuevoInsumo(true)}
                title="Crear nuevo insumo"
              >
                <PlusCircle className="w-4 h-4" />
              </Button>
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
          {items.length > 0 ? (
            <>
              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-3 border">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">{item.insumo_nombre}</span>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        item.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                        item.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {item.iva_porcentaje}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">Cantidad</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.cantidad}
                            onChange={(e) => handleCantidadChange(item.id, e.target.value)}
                            className="w-14 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-500">{item.unidad_medida}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">Precio</p>
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 mr-0.5">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.precio_unitario}
                            onChange={(e) => handlePrecioChange(item.id, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 mb-0.5">Subtotal</p>
                        <p className="text-sm font-bold text-gray-900">
                          {formatearMoneda(item.subtotal)}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => handleEliminarItem(item.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Mobile: Totals */}
                <div className="bg-gray-50 rounded-lg p-3 border mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Subtotal Neto:</span>
                    <span className="text-gray-900">{formatearMoneda(subtotalNeto)}</span>
                  </div>
                  {totalIva21 > 0 && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">IVA 21%:</span>
                      <span className="text-gray-900">{formatearMoneda(totalIva21)}</span>
                    </div>
                  )}
                  {totalIva105 > 0 && (
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">IVA 10.5%:</span>
                      <span className="text-gray-900">{formatearMoneda(totalIva105)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t mt-2">
                    <span className="font-medium text-gray-900">Total:</span>
                    <span className="text-lg font-bold text-green-600">{formatearMoneda(total)}</span>
                  </div>
                </div>
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block border rounded-lg overflow-hidden">
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
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-900">{item.insumo_nombre}</span>
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
                          {formatearMoneda(item.subtotal)}
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
                        {formatearMoneda(subtotalNeto)}
                      </td>
                      <td></td>
                    </tr>
                    {totalIva21 > 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                          IVA 21%:
                        </td>
                        <td className="px-4 py-1 text-right text-sm text-gray-900">
                          {formatearMoneda(totalIva21)}
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
                          {formatearMoneda(totalIva105)}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    <tr className="border-t border-gray-300">
                      <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-900">
                        Total:
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                        {formatearMoneda(total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-6 sm:py-8 border rounded-lg bg-gray-50">
              <p className="text-gray-500 text-sm">No hay items agregados</p>
            </div>
          )}
        </div>

        {/* Notas */}
        <div className="border-t pt-4 sm:pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Notas adicionales para el proveedor..."
          />
        </div>

        {/* Botones */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t pt-4 sm:pt-6">
          <Button variant="secondary" onClick={() => router.back()} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Crear Orden'}
          </Button>
        </div>
      </div>

      {/* Modal Nuevo Insumo */}
      <Modal
        isOpen={showNuevoInsumo}
        onClose={() => setShowNuevoInsumo(false)}
        title="Nuevo Insumo"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={nuevoInsumoNombre}
            onChange={(e) => setNuevoInsumoNombre(e.target.value)}
            placeholder="Ej: Bife de Chorizo"
          />
          <Select
            label="Categoría *"
            value={nuevoInsumoCategoria}
            onChange={(e) => setNuevoInsumoCategoria(e.target.value)}
            options={[
              { value: '', label: 'Seleccionar...' },
              { value: 'Carnes', label: 'Carnes' },
              { value: 'Almacen', label: 'Almacén' },
              { value: 'Verduras_Frutas', label: 'Verduras y Frutas' },
              { value: 'Pescados_Mariscos', label: 'Pescados y Mariscos' },
              { value: 'Lacteos_Fiambres', label: 'Lácteos y Fiambres' },
              { value: 'Bebidas', label: 'Bebidas' },
              { value: 'Salsas_Recetas', label: 'Salsas y Recetas' },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Unidad"
              value={nuevoInsumoUnidad}
              onChange={(e) => setNuevoInsumoUnidad(e.target.value)}
              options={[
                { value: 'kg', label: 'Kilogramo (kg)' },
                { value: 'lt', label: 'Litro (lt)' },
                { value: 'unidad', label: 'Unidad' },
                { value: 'gr', label: 'Gramo (gr)' },
                { value: 'ml', label: 'Mililitro (ml)' },
              ]}
            />
            <Select
              label="IVA"
              value={nuevoInsumoIva}
              onChange={(e) => setNuevoInsumoIva(e.target.value)}
              options={[
                { value: '21', label: '21%' },
                { value: '10.5', label: '10.5%' },
                { value: '0', label: '0%' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowNuevoInsumo(false)}>
              Cancelar
            </Button>
            <Button onClick={handleGuardarNuevoInsumo} disabled={savingInsumo}>
              {savingInsumo ? 'Guardando...' : 'Crear Insumo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
