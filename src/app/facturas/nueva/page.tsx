'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package, AlertCircle, FileDown, PlusCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getNextOCNumber } from '@/lib/oc-numero'
import { Button, Input, Select, Modal } from '@/components/ui'
import { formatearMoneda, formatearCantidad, parsearNumero, formatearInputNumero, formatearFecha } from '@/lib/formato-numeros'

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
  cantidad_por_paquete?: number | null
}

interface OrdenCompra {
  id: string
  fecha: string
  total: number
  proveedor_id: string
  proveedor_nombre: string
  items: {
    insumo_id: string
    insumo_nombre: string
    unidad_medida: string
    cantidad: number
    precio_unitario: number
    iva_porcentaje: number
  }[]
}

interface ItemFactura {
  id: string
  insumo_id: string
  insumo_nombre: string
  unidad_medida: string
  cantidad: number | string  // string mientras edita
  precio_unitario: number | string  // string mientras edita
  descuento: number | string  // string mientras edita
  subtotal: number
  iva_porcentaje: number
  iva_monto: number
  diferencia?: 'precio' | 'cantidad' | 'nuevo' | null
}

export default function NuevaFacturaPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [ordenesPendientes, setOrdenesPendientes] = useState<OrdenCompra[]>([])
  const [selectedProveedor, setSelectedProveedor] = useState('')
  const [selectedOrden, setSelectedOrden] = useState<OrdenCompra | null>(null)
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  })
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemFactura[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precioUnitario, setPrecioUnitario] = useState('')
  const [descuento, setDescuento] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOrdenOpen, setIsModalOrdenOpen] = useState(false)

  // Percepciones (objetos independientes)
  const [percepciones, setPercepciones] = useState(() => [
    { nombre: '', porcentaje: '', valor: '' },
    { nombre: '', porcentaje: '', valor: '' },
    { nombre: '', porcentaje: '', valor: '' },
  ])

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

    const [proveedoresRes, insumosRes, ordenesRes] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('v_insumos_con_precio').select('id, nombre, unidad_medida, categoria, precio_actual, cantidad_por_paquete, iva_porcentaje').eq('activo', true).order('nombre'),
      supabase.from('ordenes_compra')
        .select(`
          id, fecha, total, proveedor_id,
          proveedores (nombre),
          orden_compra_items (
            insumo_id, cantidad, precio_unitario,
            insumos (nombre, unidad_medida, iva_porcentaje)
          )
        `)
        .eq('estado', 'enviada')
        .order('fecha', { ascending: false })
    ])

    if (proveedoresRes.data) setProveedores(proveedoresRes.data)
    if (insumosRes.data) setInsumos(insumosRes.data)

    if (ordenesRes.data) {
      const ordenes: OrdenCompra[] = ordenesRes.data.map((o: any) => ({
        id: o.id,
        fecha: o.fecha,
        total: o.total,
        proveedor_id: o.proveedor_id,
        proveedor_nombre: o.proveedores?.nombre || 'Desconocido',
        items: o.orden_compra_items.map((item: any) => ({
          insumo_id: item.insumo_id,
          insumo_nombre: item.insumos?.nombre || 'Desconocido',
          unidad_medida: item.insumos?.unidad_medida || '',
          cantidad: parseFloat(item.cantidad),
          precio_unitario: parseFloat(item.precio_unitario),
          iva_porcentaje: item.insumos?.iva_porcentaje ?? 21,
        }))
      }))
      setOrdenesPendientes(ordenes)
    }

    setIsLoading(false)
  }

  function handleImportarOrden(orden: OrdenCompra) {
    setSelectedOrden(orden)
    setSelectedProveedor(orden.proveedor_id)

    // Convertir items de la orden a items de factura
    const itemsFactura: ItemFactura[] = orden.items.map(item => {
      // Usar IVA actual del insumo, no el de la OC
      const insumoActual = insumos.find(i => i.id === item.insumo_id)
      const ivaPorcentaje = insumoActual?.iva_porcentaje ?? item.iva_porcentaje
      const subtotal = item.cantidad * item.precio_unitario
      const ivaMonto = subtotal * (ivaPorcentaje / 100)
      return {
        id: crypto.randomUUID(),
        insumo_id: item.insumo_id,
        insumo_nombre: item.insumo_nombre,
        unidad_medida: item.unidad_medida,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento: 0,
        subtotal,
        iva_porcentaje: ivaPorcentaje,
        iva_monto: ivaMonto,
        diferencia: null,
      }
    })

    setItems(itemsFactura)
    setIsModalOrdenOpen(false)
  }

  function handleSelectInsumo(insumoId: string) {
    setSelectedInsumo(insumoId)
    const insumo = insumos.find(i => i.id === insumoId)
    if (insumo && insumo.precio_actual) {
      // Mostrar precio del paquete (precio unitario × cantidad por paquete)
      const cantPaq = insumo.cantidad_por_paquete ? Number(insumo.cantidad_por_paquete) : 1
      const precioPaquete = insumo.precio_actual * cantPaq
      // Formatear con coma decimal
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

    if (items.some(item => item.insumo_id === selectedInsumo)) {
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
      diferencia: selectedOrden ? 'nuevo' : null,
    }

    setItems([...items, nuevoItem])
    setSelectedInsumo('')
    setCantidad('')
    setPrecioUnitario('')
    setDescuento('')
  }

  function handleEliminarItem(id: string) {
    setItems(items.filter(item => item.id !== id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    setItems(items.map(item => {
      if (item.id === id) {
        const cantidadNum = parsearNumero(nuevaCantidad)
        const precioNum = typeof item.precio_unitario === 'string' ? parsearNumero(item.precio_unitario) : item.precio_unitario
        const descuentoNum = typeof item.descuento === 'string' ? parsearNumero(item.descuento) : item.descuento
        // Detectar diferencia con orden original
        let diferencia = item.diferencia
        if (selectedOrden && diferencia !== 'nuevo') {
          const itemOrden = selectedOrden.items.find(i => i.insumo_id === item.insumo_id)
          if (itemOrden && cantidadNum !== itemOrden.cantidad) {
            diferencia = 'cantidad'
          } else if (itemOrden && precioNum !== itemOrden.precio_unitario) {
            diferencia = 'precio'
          } else {
            diferencia = null
          }
        }
        const subtotal = cantidadNum * precioNum * (1 - descuentoNum / 100)
        const ivaMonto = subtotal * (item.iva_porcentaje / 100)
        return {
          ...item,
          cantidad: nuevaCantidad, // Mantener como string mientras edita
          subtotal,
          iva_monto: ivaMonto,
          diferencia,
        }
      }
      return item
    }))
  }

  function handlePrecioChange(id: string, nuevoPrecio: string) {
    setItems(items.map(item => {
      if (item.id === id) {
        const precioNum = parsearNumero(nuevoPrecio)
        const cantidadNum = typeof item.cantidad === 'string' ? parsearNumero(item.cantidad) : item.cantidad
        const descuentoNum = typeof item.descuento === 'string' ? parsearNumero(item.descuento) : item.descuento
        // Detectar diferencia con orden original
        let diferencia = item.diferencia
        if (selectedOrden && diferencia !== 'nuevo') {
          const itemOrden = selectedOrden.items.find(i => i.insumo_id === item.insumo_id)
          if (itemOrden && precioNum !== itemOrden.precio_unitario) {
            diferencia = 'precio'
          } else if (itemOrden && cantidadNum !== itemOrden.cantidad) {
            diferencia = 'cantidad'
          } else {
            diferencia = null
          }
        }
        const subtotal = cantidadNum * precioNum * (1 - descuentoNum / 100)
        const ivaMonto = subtotal * (item.iva_porcentaje / 100)
        return {
          ...item,
          precio_unitario: nuevoPrecio, // Mantener como string mientras edita
          subtotal,
          iva_monto: ivaMonto,
          diferencia,
        }
      }
      return item
    }))
  }

  function handleDescuentoChange(id: string, nuevoDescuento: string) {
    setItems(items.map(item => {
      if (item.id === id) {
        const descuentoNum = nuevoDescuento ? parsearNumero(nuevoDescuento) : 0
        const cantidadNum = typeof item.cantidad === 'string' ? parsearNumero(item.cantidad) : item.cantidad
        const precioNum = typeof item.precio_unitario === 'string' ? parsearNumero(item.precio_unitario) : item.precio_unitario
        const subtotal = cantidadNum * precioNum * (1 - descuentoNum / 100)
        const ivaMonto = subtotal * (item.iva_porcentaje / 100)
        return {
          ...item,
          descuento: nuevoDescuento, // Mantener como string mientras edita
          subtotal,
          iva_monto: ivaMonto,
        }
      }
      return item
    }))
  }

  function handleIvaChange(id: string, nuevoIva: number) {
    setItems(items.map(item => {
      if (item.id === id) {
        const ivaMonto = item.subtotal * (nuevoIva / 100)
        return {
          ...item,
          iva_porcentaje: nuevoIva,
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
  const totalIva0 = items.filter(i => i.iva_porcentaje === 0).reduce((sum, item) => sum + item.subtotal, 0)
  const totalIva = items.reduce((sum, item) => sum + item.iva_monto, 0)
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

    if (items.length === 0) {
      alert('Agregá al menos un item')
      return
    }

    setIsSaving(true)

    // Filtrar percepciones con valor
    const percepcionesConValor = percepciones
      .filter(p => p.nombre.trim() && parsearNumero(p.valor) > 0)
      .map(p => ({ nombre: p.nombre, porcentaje: p.porcentaje, valor: parsearNumero(p.valor).toString() }))

    // Crear factura
    const { data: factura, error: facturaError } = await supabase
      .from('facturas_proveedor')
      .insert({
        proveedor_id: selectedProveedor,
        numero_factura: numeroFactura.trim(),
        fecha: fecha,
        total: total,
        orden_compra_id: selectedOrden?.id || null,
        notas: notas || null,
        percepciones: percepcionesConValor.length > 0 ? percepcionesConValor : null,
      })
      .select()
      .single()

    if (facturaError) {
      console.error('Error creando factura:', facturaError)
      alert('Error al crear la factura')
      setIsSaving(false)
      return
    }

    // Insertar items (esto dispara el trigger que actualiza precios)
    const itemsData = items.map(item => ({
      factura_id: factura.id,
      insumo_id: item.insumo_id,
      cantidad: typeof item.cantidad === 'string' ? parsearNumero(item.cantidad) : item.cantidad,
      precio_unitario: typeof item.precio_unitario === 'string' ? parsearNumero(item.precio_unitario) : item.precio_unitario,
      descuento: typeof item.descuento === 'string' ? parsearNumero(item.descuento) : (item.descuento || 0),
    }))

    const { error: itemsError } = await supabase
      .from('factura_items')
      .insert(itemsData)

    if (itemsError) {
      console.error('Error creando items:', itemsError)
      alert('Factura creada pero hubo un error con los items')
    }

    // Detectar faltantes y gestionar OC
    if (selectedOrden) {
      // Items que NO vinieron (faltante total) → generan nueva OC
      const faltantesTotal: { insumo_id: string; insumo_nombre: string; cantidad: number; precio_unitario: number }[] = []
      // Items con diferencia de cantidad (vinieron pero distinta cantidad) → solo marcar como parcial
      let hayDiferenciaCantidad = false

      for (const itemOC of selectedOrden.items) {
        const itemFactura = items.find(i => i.insumo_id === itemOC.insumo_id)
        if (!itemFactura) {
          // Item de la OC no está en la factura → faltante total
          faltantesTotal.push({
            insumo_id: itemOC.insumo_id,
            insumo_nombre: itemOC.insumo_nombre,
            cantidad: itemOC.cantidad,
            precio_unitario: itemOC.precio_unitario,
          })
        } else {
          const cantidadFactura = typeof itemFactura.cantidad === 'string' ? parsearNumero(itemFactura.cantidad) : itemFactura.cantidad
          if (cantidadFactura !== itemOC.cantidad) {
            // Diferencia de cantidad (más o menos) → solo marcar como parcial, NO genera OC
            hayDiferenciaCantidad = true
          }
        }
      }

      console.log('Faltantes totales:', faltantesTotal.length, faltantesTotal)
      console.log('Hay diferencia de cantidad:', hayDiferenciaCantidad)

      if (faltantesTotal.length > 0) {
        // Crear OC solo para items que NO vinieron
        const fechaOC = formatearFecha(selectedOrden.fecha)
        const numeroOC = await getNextOCNumber()
        const { data: nuevaOC, error: ocError } = await supabase
          .from('ordenes_compra')
          .insert({
            proveedor_id: selectedOrden.proveedor_id,
            fecha: new Date().toISOString().split('T')[0],
            estado: 'borrador',
            total: 0,
            notas: `Faltante de OC del ${fechaOC} – Factura ${numeroFactura.trim()}`,
            orden_origen_id: selectedOrden.id,
          })
          .select()
          .single()

        console.log('Nueva OC faltante:', nuevaOC, 'Error:', ocError)

        if (nuevaOC && !ocError) {
          // Asignar número (update separado)
          await supabase
            .from('ordenes_compra')
            .update({ numero: numeroOC } as any)
            .eq('id', nuevaOC.id)
          // Insertar items faltantes (el trigger calcula el total)
          const itemsFaltantes = faltantesTotal.map(f => ({
            orden_compra_id: nuevaOC.id,
            insumo_id: f.insumo_id,
            cantidad: f.cantidad,
            precio_unitario: f.precio_unitario,
          }))

          const { error: itemsErr } = await supabase.from('orden_compra_items').insert(itemsFaltantes)
          if (itemsErr) console.error('Error insertando items faltantes:', itemsErr)
        }

        // Marcar OC original como parcialmente recibida
        const { error: updateErr } = await supabase
          .from('ordenes_compra')
          .update({ estado: 'parcialmente_recibida' })
          .eq('id', selectedOrden.id)

        if (updateErr) console.error('Error actualizando estado OC:', updateErr)

        const nombresInsumos = faltantesTotal.slice(0, 3).map(f => f.insumo_nombre).join(', ')
        const masTexto = faltantesTotal.length > 3 ? ` y ${faltantesTotal.length - 3} más` : ''
        alert(`Se generó OC de faltantes con ${faltantesTotal.length} ítem(s): ${nombresInsumos}${masTexto}`)
      } else if (hayDiferenciaCantidad) {
        // Solo diferencia de cantidad → marcar como parcial pero SIN generar OC
        await supabase
          .from('ordenes_compra')
          .update({ estado: 'parcialmente_recibida' })
          .eq('id', selectedOrden.id)
      } else {
        // Sin diferencias → marcar como recibida
        await supabase
          .from('ordenes_compra')
          .update({ estado: 'recibida' })
          .eq('id', selectedOrden.id)
      }
    }

    setIsSaving(false)
    router.push('/facturas')
  }

  function getDiferenciaStyle(diferencia: string | null | undefined) {
    switch (diferencia) {
      case 'precio':
        return 'bg-yellow-50'
      case 'cantidad':
        return 'bg-orange-50'
      case 'nuevo':
        return 'bg-green-50'
      default:
        return ''
    }
  }

  function getDiferenciaBadge(diferencia: string | null | undefined) {
    switch (diferencia) {
      case 'precio':
        return <span className="ml-2 text-xs px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">Precio dif.</span>
      case 'cantidad':
        return <span className="ml-2 text-xs px-1.5 py-0.5 bg-orange-200 text-orange-800 rounded">Cant. dif.</span>
      case 'nuevo':
        return <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded">Nuevo</span>
      default:
        return null
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
          <h1 className="text-2xl font-bold text-gray-900">Nueva Factura</h1>
          <p className="text-gray-600">Registro de compra a proveedor</p>
        </div>
      </div>

      {/* Importar desde orden */}
      {ordenesPendientes.length > 0 && !selectedOrden && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileDown className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-blue-800">Tenés órdenes de compra pendientes</p>
                <p className="text-sm text-blue-600">Podés importar los items desde una orden enviada</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setIsModalOrdenOpen(true)}>
              Importar desde Orden
            </Button>
          </div>
        </div>
      )}

      {/* Orden seleccionada */}
      {selectedOrden && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">
                Importado desde orden del {formatearFecha(selectedOrden.fecha)}
              </p>
              <p className="text-sm text-green-600">
                {selectedOrden.proveedor_nombre} - Total original: {formatearMoneda(selectedOrden.total)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedOrden(null); setItems([]); setSelectedProveedor('') }}
            >
              Quitar
            </Button>
          </div>
        </div>
      )}

      {/* Aviso de actualización */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-amber-800 font-medium">Los precios se actualizan automáticamente</p>
          <p className="text-sm text-amber-600">Al guardar, los precios de los insumos se actualizarán con los valores de esta factura.</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Datos de la factura */}
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Proveedor *"
            options={[
              { value: '', label: 'Seleccionar proveedor...' },
              ...proveedores.map(p => ({ value: p.id, label: p.nombre }))
            ]}
            value={selectedProveedor}
            onChange={(e) => setSelectedProveedor(e.target.value)}
            disabled={!!selectedOrden}
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
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Items</h3>

          <div className="flex gap-4 items-end mb-4">
            <div className="flex-1 flex gap-2 items-end">
              <div className="flex-1">
                <Select
                  label="Agregar insumo"
                  options={[
                    { value: '', label: 'Seleccionar insumo...' },
                    ...insumos
                      .filter(i => !items.some(item => item.insumo_id === i.id))
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
          {items.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
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
                  {items.map((item) => (
                    <tr key={item.id} className={getDiferenciaStyle(item.diferencia)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{item.insumo_nombre}</span>
                          {getDiferenciaBadge(item.diferencia)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={typeof item.cantidad === 'string' ? item.cantidad : String(item.cantidad).replace('.', ',')}
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
                            value={typeof item.precio_unitario === 'string' ? item.precio_unitario : String(item.precio_unitario).replace('.', ',')}
                            onChange={(e) => handlePrecioChange(item.id, formatearInputNumero(e.target.value))}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={typeof item.descuento === 'string' ? item.descuento : (item.descuento > 0 ? String(item.descuento).replace('.', ',') : '')}
                            onChange={(e) => handleDescuentoChange(item.id, formatearInputNumero(e.target.value))}
                            className="w-14 rounded border border-gray-300 px-2 py-1 text-sm text-center"
                            placeholder="0"
                          />
                          <span className="ml-1 text-xs text-gray-500">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={item.iva_porcentaje}
                          onChange={(e) => handleIvaChange(item.id, parseFloat(e.target.value))}
                          className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${
                            item.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                            item.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}
                        >
                          <option value={21}>21%</option>
                          <option value={10.5}>10.5%</option>
                          <option value={0}>0%</option>
                        </select>
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
                  {totalIva0 > 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                        Exento (0%):
                      </td>
                      <td className="px-4 py-1 text-right text-sm text-gray-900">
                        {formatearMoneda(totalIva0)}
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
          ) : (
            <div className="text-center py-8 border rounded-lg bg-gray-50">
              <p className="text-gray-500">No hay items agregados</p>
            </div>
          )}
        </div>

        {/* Percepciones */}
        <div className="border-t pt-4">
          <div className="flex justify-end">
            <div className="w-96 space-y-1">
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
                    className="w-32 rounded border border-gray-300 px-2 py-1 text-xs placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                    className="w-14 rounded border border-gray-300 px-2 py-1 text-xs text-center placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-right placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
        <div className="border-t pt-6">
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
        <div className="flex justify-end gap-3 border-t pt-6">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar Factura'}
          </Button>
        </div>
      </div>

      {/* Modal seleccionar orden */}
      <Modal
        isOpen={isModalOrdenOpen}
        onClose={() => setIsModalOrdenOpen(false)}
        title="Importar desde Orden de Compra"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Seleccioná una orden enviada para importar sus items. Después podés modificar cantidades y precios.
          </p>

          {ordenesPendientes.length === 0 ? (
            <p className="text-center py-4 text-gray-500">No hay órdenes pendientes</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {ordenesPendientes.map((orden) => (
                <div
                  key={orden.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleImportarOrden(orden)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{orden.proveedor_nombre}</p>
                      <p className="text-sm text-gray-500">
                        {formatearFecha(orden.fecha)} - {orden.items.length} items
                      </p>
                    </div>
                    <p className="font-medium text-green-600">
                      {formatearMoneda(orden.total)}
                    </p>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {orden.items.slice(0, 3).map(i => i.insumo_nombre).join(', ')}
                    {orden.items.length > 3 && ` y ${orden.items.length - 3} más...`}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="secondary" onClick={() => setIsModalOrdenOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

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
