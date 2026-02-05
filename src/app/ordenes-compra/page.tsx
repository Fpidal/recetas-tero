'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, FileText, X, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { generarPDFOrden } from '@/lib/generar-pdf-oc'
import { Button, Select, Table } from '@/components/ui'
import Link from 'next/link'

interface OrdenConProveedor {
  id: string
  numero: string | null
  proveedor_id: string
  fecha: string
  estado: 'borrador' | 'enviada' | 'recibida' | 'cancelada' | 'parcialmente_recibida'
  total: number
  notas: string | null
  proveedores: {
    nombre: string
    categoria: string | null
  }
  facturas_proveedor: {
    numero_factura: string
  }[] | null
  orden_compra_items: {
    cantidad: number
    precio_unitario: number
    insumos: {
      iva_porcentaje: number
    }
  }[]
}

function calcularTotalConIva(o: OrdenConProveedor): number {
  if (!o.orden_compra_items || o.orden_compra_items.length === 0) return o.total
  return o.orden_compra_items.reduce((sum, item) => {
    const subtotal = item.cantidad * item.precio_unitario
    const iva = subtotal * ((item.insumos?.iva_porcentaje || 21) / 100)
    return sum + subtotal + iva
  }, 0)
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

const CATEGORIAS = [
  { value: '', label: 'Todas las categorías' },
  { value: 'Almacén', label: 'Almacén' },
  { value: 'Alquiler', label: 'Alquiler' },
  { value: 'Arreglos', label: 'Arreglos' },
  { value: 'Bebidas', label: 'Bebidas' },
  { value: 'Bodega', label: 'Bodega' },
  { value: 'Carnes', label: 'Carnes' },
  { value: 'Impuestos Municipales', label: 'Impuestos Municipales' },
  { value: 'IVA', label: 'IVA' },
  { value: 'Limpieza', label: 'Limpieza' },
  { value: 'Panadería', label: 'Panadería' },
  { value: 'Pescadería', label: 'Pescadería' },
  { value: 'Planes AFIP/ARBA', label: 'Planes AFIP/ARBA' },
  { value: 'Pollo', label: 'Pollo' },
  { value: 'Quesos y Fiambres', label: 'Quesos y Fiambres' },
  { value: 'Servicio Gas', label: 'Servicio Gas' },
  { value: 'Servicio Luz', label: 'Servicio Luz' },
  { value: 'Verduras', label: 'Verduras' },
  { value: 'Otros', label: 'Otros' },
]

export default function OrdenesCompraPage() {
  const [ordenes, setOrdenes] = useState<OrdenConProveedor[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filtros
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  useEffect(() => {
    fetchOrdenes()
  }, [])

  async function fetchOrdenes() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('ordenes_compra')
      .select(`
        *,
        proveedores (nombre, categoria),
        facturas_proveedor (numero_factura),
        orden_compra_items (cantidad, precio_unitario, insumos (iva_porcentaje))
      `)
      .neq('activo', false)
      .order('fecha', { ascending: false })

    if (error) {
      console.error('Error fetching ordenes:', error)
    } else {
      setOrdenes((data as OrdenConProveedor[]) || [])
    }
    setIsLoading(false)
  }

  // Opciones de proveedores únicas extraídas de las órdenes
  const proveedoresOptions = useMemo(() => {
    const map = new Map<string, string>()
    ordenes.forEach((o) => {
      if (o.proveedor_id && o.proveedores?.nombre) {
        map.set(o.proveedor_id, o.proveedores.nombre)
      }
    })
    const sorted = Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
    return [
      { value: '', label: 'Todos los proveedores' },
      ...sorted.map(([id, nombre]) => ({ value: id, label: nombre })),
    ]
  }, [ordenes])

  // Filtrado client-side
  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((o) => {
      if (filtroFechaDesde && o.fecha < filtroFechaDesde) return false
      if (filtroFechaHasta && o.fecha > filtroFechaHasta) return false
      if (filtroProveedor && o.proveedor_id !== filtroProveedor) return false
      if (filtroCategoria && o.proveedores?.categoria !== filtroCategoria) return false
      return true
    })
  }, [ordenes, filtroFechaDesde, filtroFechaHasta, filtroProveedor, filtroCategoria])

  const hayFiltrosActivos = filtroFechaDesde || filtroFechaHasta || filtroProveedor || filtroCategoria

  // Calcular total de órdenes filtradas
  const totalOrdenesFiltradas = useMemo(() => {
    return ordenesFiltradas.reduce((sum, o) => sum + calcularTotalConIva(o), 0)
  }, [ordenesFiltradas])

  function limpiarFiltros() {
    setFiltroFechaDesde('')
    setFiltroFechaHasta('')
    setFiltroProveedor('')
    setFiltroCategoria('')
  }

  const columns = [
    {
      key: 'numero',
      header: 'N°',
      render: (o: OrdenConProveedor) => (
        <span className="font-mono text-sm font-medium text-gray-700">
          {o.numero || '—'}
        </span>
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      render: (o: OrdenConProveedor) => (
        <div>
          <span>{new Date(o.fecha).toLocaleDateString('es-AR')}</span>
          {o.facturas_proveedor && o.facturas_proveedor.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">
              Fact. {o.facturas_proveedor[0].numero_factura}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      render: (o: OrdenConProveedor) => (
        <div>
          <span className="font-medium">{o.proveedores?.nombre}</span>
          {o.proveedores?.categoria && (
            <span className="ml-2 text-xs text-gray-400">{o.proveedores.categoria}</span>
          )}
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (o: OrdenConProveedor) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            estadoColors[o.estado]
          }`}
        >
          {estadoLabels[o.estado]}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: (o: OrdenConProveedor) => (
        <span className="font-medium">
          ${Math.round(calcularTotalConIva(o)).toLocaleString('es-AR')}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right pr-4',
      render: (o: OrdenConProveedor) => (
        <div className="flex justify-end gap-2">
          {o.estado === 'cancelada' && (
            <Button variant="ghost" size="sm" onClick={async () => {
              await supabase.from('ordenes_compra').update({ activo: false } as any).eq('id', o.id)
              fetchOrdenes()
            }} title="Enviar a papelera">
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={async () => {
            const cambio = await generarPDFOrden(o.id)
            if (cambio) fetchOrdenes()
          }}>
            <FileText className="w-4 h-4" />
          </Button>
          <Link href={`/ordenes-compra/${o.id}`}>
            <Button variant="ghost" size="sm">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      ),
    },
  ]

  // Mobile card component
  const OrdenCard = ({ orden }: { orden: OrdenConProveedor }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-gray-700">
            #{orden.numero || '—'}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${estadoColors[orden.estado]}`}>
            {estadoLabels[orden.estado]}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {new Date(orden.fecha).toLocaleDateString('es-AR')}
        </span>
      </div>

      <div className="mb-3">
        <p className="font-medium text-gray-900">{orden.proveedores?.nombre}</p>
        {orden.proveedores?.categoria && (
          <p className="text-xs text-gray-400">{orden.proveedores.categoria}</p>
        )}
        {orden.facturas_proveedor && orden.facturas_proveedor.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            Fact. {orden.facturas_proveedor[0].numero_factura}
          </p>
        )}
      </div>

      <div className="flex justify-between items-center pt-3 border-t">
        <span className="text-lg font-bold text-gray-900">
          ${Math.round(calcularTotalConIva(orden)).toLocaleString('es-AR')}
        </span>
        <div className="flex gap-2">
          {orden.estado === 'cancelada' && (
            <Button variant="ghost" size="sm" onClick={async () => {
              await supabase.from('ordenes_compra').update({ activo: false } as any).eq('id', orden.id)
              fetchOrdenes()
            }}>
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={async () => {
            const cambio = await generarPDFOrden(orden.id)
            if (cambio) fetchOrdenes()
          }}>
            <FileText className="w-4 h-4" />
          </Button>
          <Link href={`/ordenes-compra/${orden.id}`}>
            <Button variant="ghost" size="sm">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Órdenes de Compra</h1>
          <p className="text-sm text-gray-600">
            {ordenesFiltradas.length} {ordenesFiltradas.length === 1 ? 'orden' : 'órdenes'}
            {' · '}
            <span className="font-semibold text-gray-900">
              ${Math.round(totalOrdenesFiltradas).toLocaleString('es-AR')}
            </span>
          </p>
        </div>
        <Link href="/ordenes-compra/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Orden
          </Button>
        </Link>
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 mb-4">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              label="Proveedor"
              id="filtroProveedor"
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
              options={proveedoresOptions}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              label="Categoría"
              id="filtroCategoria"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              options={CATEGORIAS}
            />
          </div>
          {hayFiltrosActivos && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-gray-500 col-span-2 sm:col-span-1">
              <X className="w-4 h-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
        {hayFiltrosActivos && (
          <p className="text-xs text-gray-400 mt-2">
            Mostrando {ordenesFiltradas.length} de {ordenes.length} órdenes
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando...</p>
        </div>
      ) : ordenesFiltradas.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No hay órdenes de compra registradas</p>
        </div>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {ordenesFiltradas.map((orden) => (
              <OrdenCard key={orden.id} orden={orden} />
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block">
            <Table
              columns={columns}
              data={ordenesFiltradas}
              keyExtractor={(o) => o.id}
              isLoading={isLoading}
              emptyMessage="No hay órdenes de compra registradas"
            />
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Observaciones: mercadería sujeta a control de calidad al recibir.
      </p>
    </div>
  )
}
