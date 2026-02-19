'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Package, FileText, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { formatearMoneda, formatearCantidad, formatearFecha } from '@/lib/formato-numeros'

interface Percepcion {
  nombre: string
  porcentaje?: string
  valor: string
}

interface FacturaDetalle {
  id: string
  proveedor_nombre: string
  numero_factura: string
  fecha: string
  total: number
  notas: string | null
  orden_compra_id: string | null
  percepciones: Percepcion[]
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

interface OCItem {
  insumo_id: string
  insumo_nombre: string
  unidad_medida: string
  cantidad: number
  precio_unitario: number
}

export default function VerFacturaPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [factura, setFactura] = useState<FacturaDetalle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [ocItems, setOcItems] = useState<OCItem[]>([])
  const [isReadOnly, setIsReadOnly] = useState(false)

  useEffect(() => {
    fetchFactura()
  }, [id])

  async function fetchFactura() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('facturas_proveedor')
      .select(`
        id,
        numero_factura,
        fecha,
        total,
        notas,
        orden_compra_id,
        percepciones,
        activo,
        proveedores (nombre),
        factura_items (
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
      console.error('Error fetching factura:', error)
      alert('Factura no encontrada')
      router.push('/facturas')
      return
    }

    const facturaData: FacturaDetalle = {
      id: data.id,
      proveedor_nombre: (data.proveedores as any)?.nombre || 'Desconocido',
      numero_factura: data.numero_factura,
      fecha: data.fecha,
      total: data.total,
      notas: data.notas,
      orden_compra_id: data.orden_compra_id,
      percepciones: Array.isArray(data.percepciones) ? data.percepciones : [],
      items: (data.factura_items as any[]).map((item: any) => {
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
          subtotal,
          iva_porcentaje: ivaPorcentaje,
          iva_monto: ivaMonto,
        }
      }),
    }

    setFactura(facturaData)
    setIsReadOnly((data as any).activo === false)

    // Si tiene OC vinculada, cargar items de la OC para comparación
    if (data.orden_compra_id) {
      const { data: ocData } = await supabase
        .from('orden_compra_items')
        .select('insumo_id, cantidad, precio_unitario, insumos (nombre, unidad_medida)')
        .eq('orden_compra_id', data.orden_compra_id)

      if (ocData) {
        setOcItems((ocData as any[]).map((oc: any) => ({
          insumo_id: oc.insumo_id,
          insumo_nombre: oc.insumos?.nombre || 'Desconocido',
          unidad_medida: oc.insumos?.unidad_medida || '',
          cantidad: parseFloat(oc.cantidad),
          precio_unitario: parseFloat(oc.precio_unitario),
        })))
      }
    }

    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!factura) return null

  async function handleEliminar() {
    if (!factura) return
    const confirmar = confirm(`¿Estás seguro de anular la factura ${factura.numero_factura}?`)
    if (!confirmar) return

    setIsDeleting(true)

    // Registrar anulación en historial (antes de eliminar)
    await supabase
      .from('facturas_historial')
      .insert({
        factura_id: factura.id,
        tipo: 'anulacion',
        numero_factura: factura.numero_factura,
        proveedor_nombre: factura.proveedor_nombre,
        total: factura.total,
        datos_anteriores: {
          fecha: factura.fecha,
          items: factura.items,
          notas: factura.notas,
        },
      })

    // Si la factura tenía OC vinculada, volver la OC a estado 'enviada'
    if (factura.orden_compra_id) {
      await supabase
        .from('ordenes_compra')
        .update({ estado: 'enviada' })
        .eq('id', factura.orden_compra_id)

      // Cancelar OC de faltante si existía
      await supabase
        .from('ordenes_compra')
        .update({ estado: 'cancelada' })
        .eq('orden_origen_id', factura.orden_compra_id)
    }

    // Soft delete: marcar como inactiva
    const { error } = await supabase
      .from('facturas_proveedor')
      .update({ activo: false } as any)
      .eq('id', factura.id)

    if (error) {
      console.error('Error eliminando factura:', error)
      alert('Error al eliminar la factura')
      setIsDeleting(false)
      return
    }

    router.push('/facturas')
  }

  // Helper: badge de comparación con OC
  function getComparacionBadge(item: FacturaDetalle['items'][0]) {
    if (ocItems.length === 0) return null
    const ocItem = ocItems.find(oc => oc.insumo_id === item.insumo_id)
    if (!ocItem) {
      // Item nuevo, no estaba en la OC
      return <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded">Nuevo</span>
    }

    const badges = []

    // Badge de cantidad
    if (item.cantidad >= ocItem.cantidad) {
      badges.push(<span key="cant" className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Completo</span>)
    } else {
      badges.push(
        <span key="cant" className="ml-2 text-xs px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded">
          Parcial ({item.cantidad} de {ocItem.cantidad})
        </span>
      )
    }

    // Badge de precio diferente
    if (item.precio_unitario !== ocItem.precio_unitario) {
      badges.push(
        <span key="precio" className="ml-1 text-xs px-1.5 py-0.5 bg-orange-200 text-orange-800 rounded" title={`OC: ${formatearMoneda(ocItem.precio_unitario)}`}>
          Precio dif.
        </span>
      )
    }

    return <>{badges}</>
  }

  // Items de la OC que no están en la factura
  const itemsNoEntregados = ocItems.filter(
    oc => !factura.items.some(fi => fi.insumo_id === oc.insumo_id)
  )

  // Calcular totales de IVA
  const subtotalNeto = factura.items.reduce((sum, item) => sum + item.subtotal, 0)
  const totalIva21 = factura.items.filter(i => i.iva_porcentaje === 21).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva105 = factura.items.filter(i => i.iva_porcentaje === 10.5).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva = factura.items.reduce((sum, item) => sum + item.iva_monto, 0)
  const totalPercepciones = factura.percepciones.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0)
  const totalConIva = subtotalNeto + totalIva + totalPercepciones

  return (
    <div className="w-full lg:max-w-4xl">
      <div className="flex items-center gap-3 mb-4 lg:mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg lg:text-2xl font-bold text-gray-900 truncate">Factura {factura.numero_factura}</h1>
          <p className="text-xs lg:text-base text-gray-600 truncate">{factura.proveedor_nombre}</p>
        </div>
        <FileText className="w-6 h-6 lg:w-8 lg:h-8 text-gray-400 flex-shrink-0" />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Info */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          <div className="col-span-2 lg:col-span-1">
            <p className="text-xs lg:text-sm text-gray-500">Proveedor</p>
            <p className="font-medium text-sm lg:text-base">{factura.proveedor_nombre}</p>
          </div>
          <div>
            <p className="text-xs lg:text-sm text-gray-500">Nº Factura</p>
            <p className="font-medium text-sm lg:text-base">{factura.numero_factura}</p>
          </div>
          <div>
            <p className="text-xs lg:text-sm text-gray-500">Fecha</p>
            <p className="font-medium text-sm lg:text-base">{formatearFecha(factura.fecha)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="border-t pt-4 lg:pt-6">
          <h3 className="text-base lg:text-lg font-medium text-gray-900 mb-3 lg:mb-4">Items</h3>

          {/* Vista móvil - Cards */}
          <div className="lg:hidden space-y-2">
            {factura.items.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-900 truncate">{item.insumo_nombre}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2 ${
                    item.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                    item.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {item.iva_porcentaje}%
                  </span>
                </div>
                {getComparacionBadge(item) && (
                  <div className="mb-2">{getComparacionBadge(item)}</div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">
                    {item.cantidad} {item.unidad_medida} × {formatearMoneda(item.precio_unitario)}
                  </span>
                  <span className="font-medium">{formatearMoneda(item.subtotal)}</span>
                </div>
              </div>
            ))}
            {itemsNoEntregados.map((oc) => (
              <div key={`no-${oc.insumo_id}`} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-gray-300" />
                  <span className="text-sm text-gray-400 line-through">{oc.insumo_nombre}</span>
                </div>
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">No entregado</span>
              </div>
            ))}
            {/* Totales móvil */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 mt-3">
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
              {factura.percepciones.filter(p => p.nombre && parseFloat(p.valor) > 0).map((p, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-600">{p.nombre}:</span>
                  <span>{formatearMoneda(parseFloat(p.valor))}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-medium">Total:</span>
                <span className="text-lg font-bold text-green-600">{formatearMoneda(totalConIva)}</span>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">IVA</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {factura.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{item.insumo_nombre}</span>
                        {getComparacionBadge(item)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.cantidad} {item.unidad_medida}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">
                      {formatearMoneda(item.precio_unitario)}
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
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {formatearMoneda(item.subtotal)}
                    </td>
                  </tr>
                ))}
                {itemsNoEntregados.map((oc) => (
                  <tr key={`no-${oc.insumo_id}`} className="bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-300" />
                        <span className="text-sm text-gray-400 line-through">{oc.insumo_nombre}</span>
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">No entregado</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {oc.cantidad} {oc.unidad_medida}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-400">—</td>
                    <td className="px-4 py-3 text-center text-gray-400">—</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-400">—</td>
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
                </tr>
                {totalIva21 > 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                      IVA 21%:
                    </td>
                    <td className="px-4 py-1 text-right text-sm text-gray-900">
                      {formatearMoneda(totalIva21)}
                    </td>
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
                  </tr>
                )}
                {factura.percepciones.length > 0 && factura.percepciones.some(p => parseFloat(p.valor) > 0) && (
                  <>
                    {factura.percepciones.filter(p => p.nombre && parseFloat(p.valor) > 0).map((p, idx) => (
                      <tr key={idx}>
                        <td colSpan={4} className="px-4 py-1 text-right text-sm text-gray-600">
                          {p.nombre}{p.porcentaje ? ` (${p.porcentaje}%)` : ''}:
                        </td>
                        <td className="px-4 py-1 text-right text-sm text-gray-900">
                          {formatearMoneda(parseFloat(p.valor))}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
                <tr className="border-t border-gray-300">
                  <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-900">
                    Total:
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                    {formatearMoneda(totalConIva)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Notas */}
        {factura.notas && (
          <div className="border-t pt-4 lg:pt-6">
            <h3 className="text-xs lg:text-sm font-medium text-gray-500 mb-2">Notas</h3>
            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{factura.notas}</p>
          </div>
        )}

        {/* Info de actualización de precios */}
        <div className="border-t pt-4 lg:pt-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 lg:p-4">
            <p className="text-xs lg:text-sm text-green-800">
              Los precios de esta factura fueron actualizados automáticamente.
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 border-t pt-4 lg:pt-6">
          {!isReadOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEliminar}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs lg:text-sm w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4 mr-1 lg:mr-2" />
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
              <Button size="sm" onClick={() => router.push(`/facturas/${factura.id}/editar`)} className="text-xs lg:text-sm w-full sm:w-auto">
                <Pencil className="w-4 h-4 mr-1 lg:mr-2" />
                Editar Factura
              </Button>
            </>
          )}
          {isReadOnly && (
            <span className="text-xs text-red-500 px-2 py-1">En papelera</span>
          )}
        </div>
      </div>
    </div>
  )
}
