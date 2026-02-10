'use client'

import { useState, useEffect } from 'react'
import { Warehouse, Eye, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Modal } from '@/components/ui'
import { formatearMoneda, formatearCantidad } from '@/lib/formato-numeros'

interface InsumoInventario {
  id: string
  nombre: string
  categoria: string
  unidad_medida: string
  stock_total: number
}

interface MovimientoDetalle {
  factura_id: string
  numero_factura: string
  fecha: string
  cantidad: number
  precio_unitario: number
  proveedor_nombre: string
}

const CATEGORIAS: Record<string, string> = {
  'Carnes': 'Carnes',
  'Almacen': 'Almacén',
  'Verduras_Frutas': 'Verduras y Frutas',
  'Pescados_Mariscos': 'Pescados y Mariscos',
  'Lacteos_Fiambres': 'Lácteos y Fiambres',
  'Bebidas': 'Bebidas',
  'Salsas_Recetas': 'Salsas y Recetas',
}

export default function InventarioPage() {
  const [inventario, setInventario] = useState<InsumoInventario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [modalDetalle, setModalDetalle] = useState<InsumoInventario | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoDetalle[]>([])
  const [loadingMovimientos, setLoadingMovimientos] = useState(false)

  useEffect(() => {
    fetchInventario()
  }, [])

  async function fetchInventario() {
    setIsLoading(true)

    // Obtener insumos con inventario = true
    const { data: insumosData } = await supabase
      .from('insumos')
      .select('id, nombre, categoria, unidad_medida')
      .eq('activo', true)
      .eq('inventario', true)
      .order('categoria')
      .order('nombre')

    if (!insumosData || insumosData.length === 0) {
      setInventario([])
      setIsLoading(false)
      return
    }

    // Obtener cantidades de factura_items para estos insumos (solo facturas activas)
    const { data: itemsData } = await supabase
      .from('factura_items')
      .select(`
        insumo_id,
        cantidad,
        facturas_proveedor!inner (activo)
      `)
      .in('insumo_id', insumosData.map(i => i.id))
      .eq('facturas_proveedor.activo', true)

    // Calcular stock total por insumo
    const stockMap = new Map<string, number>()
    for (const item of (itemsData || [])) {
      const current = stockMap.get(item.insumo_id) || 0
      stockMap.set(item.insumo_id, current + (item.cantidad || 0))
    }

    // Armar lista de inventario
    const inventarioData: InsumoInventario[] = insumosData.map(insumo => ({
      id: insumo.id,
      nombre: insumo.nombre,
      categoria: insumo.categoria,
      unidad_medida: insumo.unidad_medida,
      stock_total: stockMap.get(insumo.id) || 0,
    }))

    setInventario(inventarioData)
    setIsLoading(false)
  }

  async function fetchMovimientos(insumo: InsumoInventario) {
    setModalDetalle(insumo)
    setLoadingMovimientos(true)

    const { data } = await supabase
      .from('factura_items')
      .select(`
        cantidad,
        precio_unitario,
        facturas_proveedor!inner (
          id,
          numero_factura,
          fecha,
          activo,
          proveedores (nombre)
        )
      `)
      .eq('insumo_id', insumo.id)
      .eq('facturas_proveedor.activo', true)
      .order('facturas_proveedor(fecha)', { ascending: false })

    const movimientosData: MovimientoDetalle[] = (data || []).map((item: any) => ({
      factura_id: item.facturas_proveedor.id,
      numero_factura: item.facturas_proveedor.numero_factura,
      fecha: item.facturas_proveedor.fecha,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      proveedor_nombre: item.facturas_proveedor.proveedores?.nombre || '-',
    }))

    setMovimientos(movimientosData)
    setLoadingMovimientos(false)
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-600">
            {inventario.length === 0
              ? 'No hay insumos marcados para inventario'
              : `${inventario.length} insumo(s) en control de stock`}
          </p>
        </div>
      </div>

      {inventario.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Warehouse className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No hay insumos en inventario</p>
          <p className="text-gray-400 text-sm mt-2">
            Marcá insumos con el tilde Inventario para que aparezcan acá
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Insumo</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Unidad</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-blue-50">Stock</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {inventario.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-900">{item.nombre}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="text-xs text-gray-600">
                      {CATEGORIAS[item.categoria] || item.categoria}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="text-xs text-gray-500">{item.unidad_medida}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right bg-blue-50">
                    <span className={`text-xs font-bold ${item.stock_total > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                      {formatearCantidad(item.stock_total)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => fetchMovimientos(item)}
                      title="Ver movimientos"
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Eye className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de movimientos */}
      <Modal
        isOpen={!!modalDetalle}
        onClose={() => setModalDetalle(null)}
        title={`Movimientos — ${modalDetalle?.nombre}`}
        size="lg"
      >
        {loadingMovimientos ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-gray-500">Cargando movimientos...</p>
          </div>
        ) : movimientos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No hay movimientos registrados</p>
          </div>
        ) : (
          <div>
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Stock total:</span>{' '}
                <span className="text-lg font-bold">
                  {formatearCantidad(modalDetalle?.stock_total || 0)} {modalDetalle?.unidad_medida}
                </span>
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Factura</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movimientos.map((mov, idx) => (
                    <tr key={idx} className={idx === 0 ? 'bg-blue-50' : ''}>
                      <td className="px-3 py-2 text-gray-600">
                        {new Date(mov.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {mov.numero_factura}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {mov.proveedor_nombre}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blue-700">
                        +{formatearCantidad(mov.cantidad)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {formatearMoneda(mov.precio_unitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
