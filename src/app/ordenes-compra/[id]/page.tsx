'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, X, Package, Pencil, LogOut, Plus } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Select } from '@/components/ui'
import { getNextOCNumber } from '@/lib/oc-numero'

interface OrdenDetalle {
  id: string
  numero: string | null
  proveedor_id: string
  proveedor_nombre: string
  proveedor_telefono: string | null
  proveedor_contacto: string | null
  proveedor_email: string | null
  proveedor_direccion: string | null
  fecha: string
  estado: 'borrador' | 'enviada' | 'recibida' | 'cancelada' | 'parcialmente_recibida'
  total: number
  notas: string | null
  orden_origen_id: string | null
  items: {
    id: string
    insumo_id: string
    insumo_nombre: string
    unidad_medida: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    iva_porcentaje: number
    iva_monto: number
  }[]
}

interface FacturaItem {
  insumo_id: string
  cantidad: number
  precio_unitario: number
}

const estadoColors: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-800',
  enviada: 'bg-blue-100 text-blue-800',
  recibida: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
  parcialmente_recibida: 'bg-yellow-100 text-yellow-800',
}

const estadoLabels: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
  parcialmente_recibida: 'Parcial',
}

export default function VerOrdenCompraPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [orden, setOrden] = useState<OrdenDetalle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [tieneFactura, setTieneFactura] = useState(false)
  const [ordenOrigenFecha, setOrdenOrigenFecha] = useState<string | null>(null)
  const [facturaItems, setFacturaItems] = useState<FacturaItem[]>([])

  useEffect(() => {
    fetchOrden()
  }, [id])

  async function fetchOrden() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('ordenes_compra')
      .select(`
        id,
        numero,
        proveedor_id,
        fecha,
        estado,
        total,
        notas,
        orden_origen_id,
        proveedores (nombre, telefono, contacto, email, direccion),
        orden_compra_items (
          id,
          insumo_id,
          cantidad,
          precio_unitario,
          subtotal,
          insumos (nombre, unidad_medida, iva_porcentaje)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      console.error('Error fetching orden:', error)
      alert('Orden no encontrada')
      router.push('/ordenes-compra')
      return
    }

    const prov = data.proveedores as any
    const ordenData: OrdenDetalle = {
      id: data.id,
      numero: (data as any).numero || null,
      proveedor_id: data.proveedor_id,
      proveedor_nombre: prov?.nombre || 'Desconocido',
      proveedor_telefono: prov?.telefono || null,
      proveedor_contacto: prov?.contacto || null,
      proveedor_email: prov?.email || null,
      proveedor_direccion: prov?.direccion || null,
      fecha: data.fecha,
      estado: data.estado,
      total: data.total,
      notas: data.notas,
      orden_origen_id: (data as any).orden_origen_id || null,
      items: (data.orden_compra_items as any[]).map((item: any) => {
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
      }),
    }

    setOrden(ordenData)

    // Verificar si tiene factura asociada y cargar sus items
    const { data: facturaData } = await supabase
      .from('facturas_proveedor')
      .select('id, factura_items (insumo_id, cantidad, precio_unitario)')
      .eq('orden_compra_id', id)
      .maybeSingle()

    setTieneFactura(!!facturaData)
    if (facturaData?.factura_items) {
      setFacturaItems((facturaData.factura_items as any[]).map((fi: any) => ({
        insumo_id: fi.insumo_id,
        cantidad: parseFloat(fi.cantidad),
        precio_unitario: parseFloat(fi.precio_unitario),
      })))
    }

    // Si esta OC es faltante de otra, buscar fecha de OC original
    if (ordenData.orden_origen_id) {
      const { data: origenData } = await supabase
        .from('ordenes_compra')
        .select('fecha')
        .eq('id', ordenData.orden_origen_id)
        .single()

      if (origenData) {
        setOrdenOrigenFecha(origenData.fecha)
      }
    }

    setIsLoading(false)
  }

  async function handleCambiarEstado(nuevoEstado: string) {
    if (!orden) return

    setIsSaving(true)

    const { error } = await supabase
      .from('ordenes_compra')
      .update({ estado: nuevoEstado })
      .eq('id', orden.id)

    if (error) {
      alert('Error al cambiar el estado')
    } else {
      setOrden({ ...orden, estado: nuevoEstado as any })
    }

    setIsSaving(false)
  }

  async function handleGenerarOCFaltantes() {
    if (!orden || !esParcial) return

    // Verificar si ya existe una OC de faltantes para esta orden
    const { data: ocExistente } = await supabase
      .from('ordenes_compra')
      .select('id, numero')
      .eq('orden_origen_id', orden.id)
      .maybeSingle()

    if (ocExistente) {
      alert(`Ya existe una OC de faltantes: ${ocExistente.numero || 'sin número'}`)
      window.location.href = `/ordenes-compra/${ocExistente.id}`
      return
    }

    const itemsFaltantes: { insumo_id: string; cantidad: number; precio_unitario: number; subtotal: number }[] = []

    for (const item of orden.items) {
      const fi = facturaItems.find(f => f.insumo_id === item.insumo_id)
      if (!fi) {
        // No entregado → cantidad completa
        itemsFaltantes.push({
          insumo_id: item.insumo_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.cantidad * item.precio_unitario,
        })
      } else if (fi.cantidad < item.cantidad) {
        // Parcial → diferencia
        const cantFaltante = item.cantidad - fi.cantidad
        itemsFaltantes.push({
          insumo_id: item.insumo_id,
          cantidad: cantFaltante,
          precio_unitario: item.precio_unitario,
          subtotal: cantFaltante * item.precio_unitario,
        })
      }
    }

    if (itemsFaltantes.length === 0) {
      alert('No hay faltantes para generar una nueva OC')
      return
    }

    setIsSaving(true)

    const numeroOC = await getNextOCNumber()
    const totalOC = itemsFaltantes.reduce((sum, i) => sum + i.subtotal, 0)

    const { data: nuevaOC, error } = await supabase
      .from('ordenes_compra')
      .insert({
        proveedor_id: orden.proveedor_id,
        fecha: new Date().toISOString().split('T')[0],
        estado: 'borrador',
        total: totalOC,
        notas: `Faltante de OC ${orden.numero || ''} del ${new Date(orden.fecha + 'T12:00:00').toLocaleDateString('es-AR')}`,
        orden_origen_id: orden.id,
      })
      .select()
      .single()

    if (error || !nuevaOC) {
      alert('Error al crear la OC de faltantes')
      setIsSaving(false)
      return
    }

    // Asignar número
    await supabase
      .from('ordenes_compra')
      .update({ numero: numeroOC } as any)
      .eq('id', nuevaOC.id)

    // Insertar items
    const itemsData = itemsFaltantes.map(i => ({
      orden_compra_id: nuevaOC.id,
      insumo_id: i.insumo_id,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
    }))

    const { error: itemsErr } = await supabase.from('orden_compra_items').insert(itemsData)
    if (itemsErr) {
      console.error('Error insertando items:', itemsErr)
      alert('OC creada pero hubo un error con los items')
    }

    setIsSaving(false)
    alert(`OC de faltantes ${numeroOC} creada con ${itemsFaltantes.length} ítem(s)`)
    router.push('/ordenes-compra')
  }

  // Determinar estado de entrega de cada ítem comparando con factura
  function getItemEstado(item: OrdenDetalle['items'][0]): 'completo' | 'parcial' | 'no_entregado' | null {
    if (facturaItems.length === 0) return null // no hay factura vinculada
    const fi = facturaItems.find(f => f.insumo_id === item.insumo_id)
    if (!fi) return 'no_entregado'
    if (fi.cantidad < item.cantidad) return 'parcial'
    return 'completo'
  }

  const esParcial = orden?.estado === 'parcialmente_recibida' && facturaItems.length > 0

  // Calcular totales con desglose de IVA
  const subtotalNeto = orden?.items.reduce((sum, item) => sum + item.subtotal, 0) || 0
  const totalIva21 = orden?.items.filter(i => i.iva_porcentaje === 21).reduce((sum, item) => sum + item.iva_monto, 0) || 0
  const totalIva105 = orden?.items.filter(i => i.iva_porcentaje === 10.5).reduce((sum, item) => sum + item.iva_monto, 0) || 0
  const totalIva = orden?.items.reduce((sum, item) => sum + item.iva_monto, 0) || 0
  const totalConIva = subtotalNeto + totalIva

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!orden) return null

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Orden de Compra{orden.numero ? ` ${orden.numero}` : ''}
          </h1>
          <p className="text-gray-600">{orden.proveedor_nombre}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${estadoColors[orden.estado]}`}>
          {estadoLabels[orden.estado]}
        </span>
      </div>

      {/* Banner: esta OC fue generada por faltantes */}
      {orden.orden_origen_id && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <p className="text-sm text-yellow-800">
            Esta orden fue generada por faltantes de OC del{' '}
            <span className="font-medium">
              {ordenOrigenFecha ? new Date(ordenOrigenFecha + 'T12:00:00').toLocaleDateString('es-AR') : '...'}
            </span>
          </p>
          <Link href={`/ordenes-compra/${orden.orden_origen_id}`}>
            <Button variant="ghost" size="sm" className="text-yellow-700">
              Ver OC original
            </Button>
          </Link>
        </div>
      )}


      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Info */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Proveedor</p>
            <p className="font-medium">{orden.proveedor_nombre}</p>
            {orden.proveedor_contacto && (
              <p className="text-sm text-gray-500">{orden.proveedor_contacto}</p>
            )}
            {orden.proveedor_telefono && (
              <p className="text-sm text-gray-500">{orden.proveedor_telefono}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Fecha</p>
            <p className="font-medium">{new Date(orden.fecha).toLocaleDateString('es-AR')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Estado</p>
            {(orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida') ? (
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium mt-1 ${estadoColors[orden.estado]}`}>
                {estadoLabels[orden.estado]}
              </span>
            ) : (
              <Select
                options={[
                  { value: 'borrador', label: 'Borrador' },
                  { value: 'enviada', label: 'Enviada' },
                  { value: 'cancelada', label: 'Cancelada' },
                ]}
                value={orden.estado}
                onChange={(e) => handleCambiarEstado(e.target.value)}
                disabled={isSaving}
              />
            )}
          </div>
        </div>

        {/* Items */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Items</h3>

          <div className="border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insumo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">IVA</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Items de la OC */}
                {orden.items.map((item) => {
                  const estado = getItemEstado(item)
                  const esCompleto = esParcial && estado === 'completo'
                  const esModificado = esParcial && (estado === 'parcial' || estado === 'no_entregado')
                  const fi = facturaItems.find(f => f.insumo_id === item.insumo_id)

                  return (
                    <tr key={item.id} className={esCompleto ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Package className={`w-4 h-4 ${
                            esCompleto ? 'text-gray-300' :
                            esModificado ? 'text-orange-400' : 'text-gray-400'
                          }`} />
                          <span className={`text-sm ${
                            esCompleto ? 'text-gray-400' :
                            esModificado ? 'font-bold text-gray-900' : 'text-gray-900'
                          }`}>{item.insumo_nombre}</span>
                          {esModificado && estado === 'parcial' && fi && (
                            <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">
                              Recibido {fi.cantidad % 1 === 0 ? fi.cantidad : fi.cantidad.toLocaleString('es-AR')} de {item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toLocaleString('es-AR')}
                            </span>
                          )}
                          {esModificado && estado === 'no_entregado' && (
                            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">No entregado</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-sm ${esCompleto ? 'text-gray-400' : esModificado ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                        {item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toLocaleString('es-AR')} {item.unidad_medida}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${esCompleto ? 'text-gray-400' : esModificado ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                        ${item.precio_unitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          esCompleto ? 'bg-gray-100 text-gray-400' :
                          item.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                          item.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.iva_porcentaje}%
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${esCompleto ? 'text-gray-400' : esModificado ? 'font-bold text-gray-900' : 'font-medium'}`}>
                        ${item.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-sm text-gray-600">
                    Subtotal Neto:
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-900">
                    ${subtotalNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                {totalIva21 > 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                      IVA 21%:
                    </td>
                    <td className="px-4 py-1 text-right text-sm text-gray-900">
                      ${totalIva21.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
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
                  </tr>
                )}
                <tr className="border-t border-gray-300">
                  <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-900">
                    Total:
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                    ${totalConIva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Notas */}
        {orden.notas && (
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Notas</h3>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{orden.notas}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">
          Observaciones: mercadería sujeta a control de calidad al recibir.
        </p>

        {/* Acciones */}
        <div className="flex justify-between items-center border-t pt-6">
          <div className="flex gap-2">
            {orden.estado === 'borrador' && (
              <Button variant="secondary" onClick={() => handleCambiarEstado('cancelada')}>
                <X className="w-4 h-4 mr-2" />
                Cancelar Orden
              </Button>
            )}
            {esParcial && (
              <Button onClick={handleGenerarOCFaltantes} disabled={isSaving}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva OC Faltantes
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {orden.estado !== 'recibida' && orden.estado !== 'parcialmente_recibida' && orden.estado !== 'cancelada' && (
              <Button variant="secondary" onClick={() => router.push(`/ordenes-compra/${orden.id}/editar`)}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
            <Button variant="ghost" onClick={() => router.push('/ordenes-compra')}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
