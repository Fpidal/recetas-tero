'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'
import { formatearMoneda, formatearCantidad, parsearNumero, formatearInputNumero } from '@/lib/formato-numeros'

interface Proveedor {
  id: string
  nombre: string
}

interface Insumo {
  id: string
  nombre: string
  unidad_medida: string
  precio_actual: number | null
  iva_porcentaje: number
  cantidad_por_paquete?: number | null
}

interface ItemFactura {
  id: string
  insumo_id: string
  insumo_nombre: string
  unidad_medida: string
  cantidad: number
  precio_unitario: number
  descuento: number
  subtotal: number
  iva_porcentaje: number
  iva_monto: number
  isNew?: boolean
  isDeleted?: boolean
}

export default function EditarFacturaPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedProveedor, setSelectedProveedor] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemFactura[]>([])
  const [itemsOriginales, setItemsOriginales] = useState<string[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precioUnitario, setPrecioUnitario] = useState('')
  const [descuento, setDescuento] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [datosOriginales, setDatosOriginales] = useState<any>(null)

  // Percepciones (objetos independientes)
  const [percepciones, setPercepciones] = useState(() => [
    { nombre: '', porcentaje: '', valor: '' },
    { nombre: '', porcentaje: '', valor: '' },
    { nombre: '', porcentaje: '', valor: '' },
  ])

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    const [proveedoresRes, insumosRes, facturaRes] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('v_insumos_con_precio').select('id, nombre, unidad_medida, precio_actual, iva_porcentaje, cantidad_por_paquete').eq('activo', true).order('nombre'),
      supabase.from('facturas_proveedor')
        .select(`
          id, proveedor_id, numero_factura, fecha, notas, percepciones,
          factura_items (
            id, insumo_id, cantidad, precio_unitario, descuento, subtotal,
            insumos (nombre, unidad_medida, iva_porcentaje)
          )
        `)
        .eq('id', id)
        .single()
    ])

    if (proveedoresRes.data) setProveedores(proveedoresRes.data)
    if (insumosRes.data) setInsumos(insumosRes.data)

    if (facturaRes.error || !facturaRes.data) {
      alert('Factura no encontrada')
      router.push('/facturas')
      return
    }

    setSelectedProveedor(facturaRes.data.proveedor_id)
    setNumeroFactura(facturaRes.data.numero_factura)
    setFecha(facturaRes.data.fecha)
    setNotas(facturaRes.data.notas || '')

    // Cargar percepciones
    if (facturaRes.data.percepciones && Array.isArray(facturaRes.data.percepciones)) {
      const percLoaded = facturaRes.data.percepciones as { nombre: string; porcentaje?: string; valor: string }[]
      // Rellenar hasta 3 filas con objetos independientes
      const percPadded = []
      for (let i = 0; i < 3; i++) {
        if (percLoaded[i]) {
          percPadded.push({
            nombre: percLoaded[i].nombre || '',
            porcentaje: percLoaded[i].porcentaje || '',
            valor: percLoaded[i].valor?.toString() || ''
          })
        } else {
          percPadded.push({ nombre: '', porcentaje: '', valor: '' })
        }
      }
      setPercepciones(percPadded)
    }

    const itemsData: ItemFactura[] = (facturaRes.data.factura_items as any[]).map((item: any) => {
      const subtotal = parseFloat(item.subtotal)
      const ivaPorcentaje = item.insumos?.iva_porcentaje ?? 21
      const ivaMonto = subtotal * (ivaPorcentaje / 100)
      return {
        id: item.id,
        insumo_id: item.insumo_id,
        insumo_nombre: item.insumos?.nombre || 'Desconocido',
        unidad_medida: item.insumos?.unidad_medida || '',
        cantidad: parseFloat(item.cantidad),
        precio_unitario: parseFloat(item.precio_unitario),
        descuento: parseFloat(item.descuento) || 0,
        subtotal,
        iva_porcentaje: ivaPorcentaje,
        iva_monto: ivaMonto,
      }
    })

    setItems(itemsData)
    setItemsOriginales(itemsData.map(i => i.id))

    // Guardar datos originales para historial de modificaciones
    const provNombre = proveedoresRes.data?.find(p => p.id === facturaRes.data.proveedor_id)?.nombre || ''
    setDatosOriginales({
      proveedor_id: facturaRes.data.proveedor_id,
      proveedor_nombre: provNombre,
      numero_factura: facturaRes.data.numero_factura,
      fecha: facturaRes.data.fecha,
      notas: facturaRes.data.notas,
      total: itemsData.reduce((sum: number, i: ItemFactura) => sum + i.subtotal + i.iva_monto, 0),
      items: itemsData.map((i: ItemFactura) => ({
        insumo_nombre: i.insumo_nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
      })),
    })

    setIsLoading(false)
  }

  function handleSelectInsumo(insumoId: string) {
    setSelectedInsumo(insumoId)
    const insumo = insumos.find(i => i.id === insumoId)
    if (insumo && insumo.precio_actual) {
      // Mostrar precio del paquete (precio unitario × cantidad por paquete)
      const cantPaq = insumo.cantidad_por_paquete ? Number(insumo.cantidad_por_paquete) : 1
      const precioPaquete = insumo.precio_actual * cantPaq
      const precioStr = precioPaquete.toFixed(2).replace('.', ',')
      setPrecioUnitario(precioStr)
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
      alert('Este insumo ya está en la factura')
      return
    }

    const cantidadNum = parsearNumero(cantidad)
    const precioNum = parsearNumero(precioUnitario)
    const descuentoNum = descuento ? parsearNumero(descuento) : 0
    const subtotal = cantidadNum * precioNum * (1 - descuentoNum / 100)
    const ivaPorcentaje = insumo.iva_porcentaje ?? 21
    const ivaMonto = subtotal * (ivaPorcentaje / 100)

    const nuevoItem: ItemFactura = {
      id: crypto.randomUUID(),
      insumo_id: insumo.id,
      insumo_nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      cantidad: cantidadNum,
      precio_unitario: precioNum,
      descuento: descuentoNum,
      subtotal,
      iva_porcentaje: ivaPorcentaje,
      iva_monto: ivaMonto,
      isNew: true,
    }

    setItems([...items, nuevoItem])
    setSelectedInsumo('')
    setCantidad('')
    setPrecioUnitario('')
    setDescuento('')
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
    const cantidadNum = parsearNumero(nuevaCantidad)
    setItems(items.map(item => {
      if (item.id === itemId) {
        const subtotal = cantidadNum * item.precio_unitario * (1 - item.descuento / 100)
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
    const precioNum = parsearNumero(nuevoPrecio)
    setItems(items.map(item => {
      if (item.id === itemId) {
        const subtotal = item.cantidad * precioNum * (1 - item.descuento / 100)
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

  function handleDescuentoChange(itemId: string, nuevoDescuento: string) {
    const descuentoNum = parsearNumero(nuevoDescuento)
    setItems(items.map(item => {
      if (item.id === itemId) {
        const subtotal = item.cantidad * item.precio_unitario * (1 - descuentoNum / 100)
        const ivaMonto = subtotal * (item.iva_porcentaje / 100)
        return {
          ...item,
          descuento: descuentoNum,
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
  const totalPercepciones = percepciones.reduce((sum, p) => sum + parsearNumero(p.valor), 0)
  const total = subtotalNeto + totalIva + totalPercepciones

  async function handleGuardar() {
    if (!selectedProveedor) {
      alert('Seleccioná un proveedor')
      return
    }

    if (!numeroFactura.trim()) {
      alert('Ingresá el número de factura')
      return
    }

    if (itemsActivos.length === 0) {
      alert('Agregá al menos un item')
      return
    }

    setIsSaving(true)

    // Registrar modificación en historial (antes de actualizar)
    if (datosOriginales) {
      const provNombre = proveedores.find(p => p.id === selectedProveedor)?.nombre || ''
      await supabase
        .from('facturas_historial')
        .insert({
          factura_id: id,
          tipo: 'modificacion',
          numero_factura: datosOriginales.numero_factura,
          proveedor_nombre: datosOriginales.proveedor_nombre,
          total: datosOriginales.total,
          datos_anteriores: datosOriginales,
          datos_nuevos: {
            proveedor_id: selectedProveedor,
            proveedor_nombre: provNombre,
            numero_factura: numeroFactura,
            fecha: fecha,
            notas: notas,
            total: total,
            items: itemsActivos.map(i => ({
              insumo_nombre: i.insumo_nombre,
              cantidad: i.cantidad,
              precio_unitario: i.precio_unitario,
              subtotal: i.subtotal,
            })),
          },
        })
    }

    // Filtrar percepciones con valor
    const percepcionesConValor = percepciones
      .filter(p => p.nombre.trim() && parsearNumero(p.valor) > 0)
      .map(p => ({ nombre: p.nombre, porcentaje: p.porcentaje, valor: parsearNumero(p.valor).toString() }))

    // Actualizar factura
    const { error: facturaError } = await supabase
      .from('facturas_proveedor')
      .update({
        proveedor_id: selectedProveedor,
        numero_factura: numeroFactura.trim(),
        fecha: fecha,
        total: total,
        notas: notas || null,
        percepciones: percepcionesConValor.length > 0 ? percepcionesConValor : null,
      })
      .eq('id', id)

    if (facturaError) {
      console.error('Error actualizando factura:', facturaError)
      alert('Error al actualizar la factura')
      setIsSaving(false)
      return
    }

    // Eliminar todos los items y reinsertar los actuales
    console.log('Eliminando items de factura:', id)
    const { error: deleteErr, count: deleteCount } = await supabase
      .from('factura_items')
      .delete()
      .eq('factura_id', id)
    console.log('Delete result:', { error: deleteErr, count: deleteCount })

    // Insertar todos los items activos
    console.log('Items a insertar:', itemsActivos.map(i => ({ nombre: i.insumo_nombre, cantidad: i.cantidad, precio: i.precio_unitario })))
    if (itemsActivos.length > 0) {
      const insertData = itemsActivos.map(item => ({
        factura_id: id,
        insumo_id: item.insumo_id,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento: item.descuento || 0,
      }))
      const { error: insertErr } = await supabase
        .from('factura_items')
        .insert(insertData)
      if (insertErr) console.error('Error insertando items:', insertErr)
      else console.log('Items insertados OK')
    }


    setIsSaving(false)
    router.push(`/facturas/${id}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="w-full lg:max-w-4xl">
      <div className="flex items-center gap-3 mb-4 lg:mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900">Editar Factura</h1>
          <p className="text-xs lg:text-base text-gray-600">Factura {numeroFactura}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Datos de la factura */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
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
            label="Número de Factura *"
            value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
            placeholder="Ej: A-0001-00012345"
          />
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {/* Agregar item */}
        <div className="border-t pt-4 lg:pt-6">
          <h3 className="text-base lg:text-lg font-medium text-gray-900 mb-3 lg:mb-4">Items</h3>

          {/* Form agregar - Mobile */}
          <div className="lg:hidden space-y-3 mb-4">
            <Select
              label="Agregar insumo"
              options={[
                { value: '', label: 'Seleccionar insumo...' },
                ...insumos
                  .filter(i => !items.some(item => item.insumo_id === i.id && !item.isDeleted))
                  .map(i => ({ value: i.id, label: i.nombre }))
              ]}
              value={selectedInsumo}
              onChange={(e) => handleSelectInsumo(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Cantidad"
                type="text"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(formatearInputNumero(e.target.value))}
                placeholder="0"
              />
              <Input
                label="Precio ($)"
                type="text"
                inputMode="decimal"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(formatearInputNumero(e.target.value))}
                placeholder="0,00"
              />
              <Input
                label="Dto %"
                type="text"
                inputMode="decimal"
                value={descuento}
                onChange={(e) => setDescuento(formatearInputNumero(e.target.value))}
                placeholder="0"
              />
            </div>
            <Button onClick={handleAgregarItem} className="w-full">
              <Plus className="w-4 h-4 mr-1" />
              Agregar Item
            </Button>
          </div>

          {/* Form agregar - Desktop */}
          <div className="hidden lg:flex gap-4 items-end mb-4">
            <div className="flex-1">
              <Select
                label="Agregar insumo"
                options={[
                  { value: '', label: 'Seleccionar insumo...' },
                  ...insumos
                    .filter(i => !items.some(item => item.insumo_id === i.id && !item.isDeleted))
                    .map(i => {
                      const cantPaq = i.cantidad_por_paquete ? Number(i.cantidad_por_paquete) : 1
                      const contenidoInfo = cantPaq > 1 ? ` - Cont: ${cantPaq}` : ''
                      return {
                        value: i.id,
                        label: `${i.nombre} (${i.unidad_medida})${contenidoInfo}`
                      }
                    })
                ]}
                value={selectedInsumo}
                onChange={(e) => handleSelectInsumo(e.target.value)}
              />
            </div>
            <div className="w-28">
              <Input
                label="Cantidad"
                type="text"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(formatearInputNumero(e.target.value))}
                placeholder="0"
              />
            </div>
            <div className="w-32">
              <Input
                label="Precio ($)"
                type="text"
                inputMode="decimal"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(formatearInputNumero(e.target.value))}
                placeholder="0,00"
              />
            </div>
            <div className="w-20">
              <Input
                label="Dto %"
                type="text"
                inputMode="decimal"
                value={descuento}
                onChange={(e) => setDescuento(formatearInputNumero(e.target.value))}
                placeholder="0"
              />
            </div>
            <Button onClick={handleAgregarItem}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>

          {/* Lista de items */}
          {itemsActivos.length > 0 ? (
            <>
              {/* Vista móvil - Cards */}
              <div className="lg:hidden space-y-2">
                {itemsActivos.map((item) => (
                  <div key={item.id} className={`border rounded-lg p-3 ${item.isNew ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{item.insumo_nombre}</span>
                        {item.isNew && <span className="text-[10px] text-green-600">(nuevo)</span>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleEliminarItem(item.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500">Cantidad</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(item.cantidad).replace('.', ',')}
                          onChange={(e) => handleCantidadChange(item.id, formatearInputNumero(e.target.value))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                        <span className="text-[10px] text-gray-400">{item.unidad_medida}</span>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Precio</label>
                        <div className="flex items-center">
                          <span className="text-xs text-gray-400 mr-0.5">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={String(item.precio_unitario).replace('.', ',')}
                            onChange={(e) => handlePrecioChange(item.id, formatearInputNumero(e.target.value))}
                            className="w-full rounded border border-gray-300 px-1 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Dto %</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.descuento ? String(item.descuento).replace('.', ',') : ''}
                          onChange={(e) => handleDescuentoChange(item.id, formatearInputNumero(e.target.value))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-center"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">IVA</label>
                        <span className={`block text-center px-2 py-1 rounded text-xs font-medium ${
                          item.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                          item.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.iva_porcentaje}%
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end mt-2 pt-2 border-t">
                      <span className="text-sm font-medium">{formatearMoneda(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
                {/* Totales móvil */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal Neto:</span>
                    <span>{formatearMoneda(subtotalNeto)}</span>
                  </div>
                  {totalIva21 > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">IVA 21%:</span>
                      <span>{formatearMoneda(totalIva21)}</span>
                    </div>
                  )}
                  {totalIva105 > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">IVA 10.5%:</span>
                      <span>{formatearMoneda(totalIva105)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="font-medium">Total:</span>
                    <span className="text-lg font-bold text-green-600">{formatearMoneda(total)}</span>
                  </div>
                </div>
              </div>

              {/* Vista desktop - Tabla */}
              <div className="hidden lg:block border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Dto %</th>
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
                          <div className="flex items-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={String(item.cantidad).replace('.', ',')}
                              onChange={(e) => handleCantidadChange(item.id, formatearInputNumero(e.target.value))}
                              className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <span className="ml-1 text-sm text-gray-500">{item.unidad_medida}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <span className="text-sm text-gray-500 mr-1">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={String(item.precio_unitario).replace('.', ',')}
                              onChange={(e) => handlePrecioChange(item.id, formatearInputNumero(e.target.value))}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.descuento ? String(item.descuento).replace('.', ',') : ''}
                            onChange={(e) => handleDescuentoChange(item.id, formatearInputNumero(e.target.value))}
                            className="w-14 rounded border border-gray-300 px-2 py-1 text-sm text-center"
                            placeholder="0"
                          />
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
                      <td colSpan={5} className="px-4 py-2 text-right text-sm text-gray-600">
                        Subtotal Neto:
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-900">
                        {formatearMoneda(subtotalNeto)}
                      </td>
                      <td></td>
                    </tr>
                    {totalIva21 > 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-1 text-right text-sm text-gray-600">
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
                        <td colSpan={5} className="px-4 py-1 text-right text-sm text-gray-600">
                          IVA 10.5%:
                        </td>
                        <td className="px-4 py-1 text-right text-sm text-gray-900">
                          {formatearMoneda(totalIva105)}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    <tr className="border-t border-gray-300">
                      <td colSpan={5} className="px-4 py-3 text-right font-medium text-gray-900">
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
            <div className="text-center py-8 border rounded-lg bg-gray-50">
              <p className="text-gray-500">No hay items agregados</p>
            </div>
          )}
        </div>

        {/* Percepciones */}
        <div className="border-t pt-4">
          <div className="lg:flex lg:justify-end">
            <div className="w-full lg:w-96 space-y-1">
              <p className="text-xs font-medium text-gray-700 mb-1">Percepciones</p>
              {percepciones.map((p, idx) => (
                <div key={idx} className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={p.nombre}
                    onChange={(e) => {
                      const newPerc = percepciones.map((perc, i) =>
                        i === idx ? { ...perc, nombre: e.target.value } : perc
                      )
                      setPercepciones(newPerc)
                    }}
                    placeholder="Percepción"
                    className="flex-1 lg:w-32 lg:flex-none rounded border border-gray-300 px-2 py-1 text-xs placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <input
                    type="text"
                    value={p.porcentaje}
                    onChange={(e) => {
                      const newPerc = percepciones.map((perc, i) =>
                        i === idx ? { ...perc, porcentaje: e.target.value } : perc
                      )
                      setPercepciones(newPerc)
                    }}
                    placeholder="%"
                    className="w-12 lg:w-14 rounded border border-gray-300 px-2 py-1 text-xs text-center placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={p.valor}
                    onChange={(e) => {
                      const newPerc = percepciones.map((perc, i) =>
                        i === idx ? { ...perc, valor: formatearInputNumero(e.target.value) } : perc
                      )
                      setPercepciones(newPerc)
                    }}
                    placeholder="0,00"
                    className="w-20 lg:w-24 rounded border border-gray-300 px-2 py-1 text-xs text-right placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              ))}
              {totalPercepciones > 0 && (
                <div className="flex justify-between pt-1 text-xs">
                  <span className="text-gray-600">Total Percepciones:</span>
                  <span className="font-medium">{formatearMoneda(totalPercepciones)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t">
                <span className="font-medium text-gray-900 text-sm">Total Final:</span>
                <span className="text-base font-bold text-green-600">{formatearMoneda(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notas */}
        <div className="border-t pt-4 lg:pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Notas adicionales..."
          />
        </div>

        {/* Botones */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t pt-4 lg:pt-6">
          <Button variant="secondary" onClick={() => router.back()} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>
    </div>
  )
}
