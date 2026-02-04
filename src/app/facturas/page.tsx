'use client'

import { useState, useEffect } from 'react'
import { Plus, Eye, FileText, Pencil, PackageSearch } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Table } from '@/components/ui'
import Link from 'next/link'

interface FacturaConDetalle {
  id: string
  proveedor_id: string
  numero_factura: string
  fecha: string
  total: number
  notas: string | null
  orden_compra_id: string | null
  proveedores: {
    nombre: string
  }
  ordenes_compra: {
    numero: string | null
    fecha: string
    estado: string
    orden_compra_items: {
      insumo_id: string
      cantidad: number
      precio_unitario: number
    }[]
  } | null
  factura_items: {
    insumo_id: string
    cantidad: number
    precio_unitario: number
  }[]
}

interface SemaforoInfo {
  faltantes: number    // items de OC que no están en factura
  parciales: number    // items con cantidad menor
  precioDif: number    // items con precio diferente
  nuevos: number       // items en factura que no estaban en OC
}

function calcularSemaforo(f: FacturaConDetalle): SemaforoInfo | null {
  if (!f.orden_compra_id || !f.ordenes_compra?.orden_compra_items) return null

  const ocItems = f.ordenes_compra.orden_compra_items
  const factItems = f.factura_items || []

  let faltantes = 0
  let parciales = 0
  let precioDif = 0

  for (const oc of ocItems) {
    const fi = factItems.find(i => i.insumo_id === oc.insumo_id)
    if (!fi) {
      faltantes++
    } else {
      if (fi.cantidad < oc.cantidad) parciales++
      if (fi.precio_unitario !== oc.precio_unitario) precioDif++
    }
  }

  // Items nuevos: en factura pero no en OC
  const nuevos = factItems.filter(
    fi => !ocItems.some(oc => oc.insumo_id === fi.insumo_id)
  ).length

  return { faltantes, parciales, precioDif, nuevos }
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<FacturaConDetalle[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchFacturas()
  }, [])

  async function fetchFacturas() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('facturas_proveedor')
      .select(`
        *,
        proveedores (nombre),
        ordenes_compra (numero, fecha, estado, orden_compra_items (insumo_id, cantidad, precio_unitario)),
        factura_items (insumo_id, cantidad, precio_unitario)
      `)
      .neq('activo', false)
      .order('fecha', { ascending: false })

    if (error) {
      console.error('Error fetching facturas:', error)
    } else {
      setFacturas((data as FacturaConDetalle[]) || [])
    }
    setIsLoading(false)
  }

  function renderSemaforo(f: FacturaConDetalle) {
    const info = calcularSemaforo(f)
    if (!info) return null

    const { faltantes, parciales, precioDif, nuevos } = info
    const hayAlgo = faltantes > 0 || parciales > 0 || precioDif > 0 || nuevos > 0

    // Entrega exacta → sin indicador
    if (!hayAlgo) return null

    return (
      <div className="flex flex-col items-center gap-0.5">
        {faltantes > 0 && (
          <span
            className="w-3 h-3 rounded-full bg-red-500 inline-block"
            title={`${faltantes} no entregado(s)`}
          />
        )}
        {parciales > 0 && (
          <span
            className="w-3 h-3 rounded-full bg-orange-400 inline-block"
            title={`${parciales} con cantidad menor`}
          />
        )}
        {precioDif > 0 && (
          <span
            className="w-3 h-3 rounded-full bg-yellow-400 inline-block"
            title={`${precioDif} con precio diferente`}
          />
        )}
        {nuevos > 0 && (
          <span
            className="w-3 h-3 rounded-full bg-green-500 inline-block"
            title={`${nuevos} agregado(s) fuera de OC`}
          />
        )}
      </div>
    )
  }

  const columns = [
    {
      key: 'numero',
      header: 'Número',
      render: (f: FacturaConDetalle) => (
        <div className="flex items-center gap-3">
          {renderSemaforo(f)}
          <FileText className="w-4 h-4 text-gray-400" />
          <div>
            <span className="font-medium">{f.numero_factura}</span>
            {f.orden_compra_id && f.ordenes_compra && (
              <p className="text-xs text-gray-400 mt-0.5">
                OC {f.ordenes_compra.numero || new Date(f.ordenes_compra.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      render: (f: FacturaConDetalle) => (
        <span>{new Date(f.fecha).toLocaleDateString('es-AR')}</span>
      ),
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      render: (f: FacturaConDetalle) => (
        <span>{f.proveedores?.nombre}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      render: (f: FacturaConDetalle) => (
        <span className="font-medium">
          ${f.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      render: (f: FacturaConDetalle) => (
        <div className="flex justify-end gap-2">
          {f.orden_compra_id && (
            <Link href={`/ordenes-compra/${f.orden_compra_id}`}>
              <Button variant="ghost" size="sm" title="Ver Orden de Compra">
                <PackageSearch className="w-4 h-4" />
              </Button>
            </Link>
          )}
          <Link href={`/facturas/${f.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <Link href={`/facturas/${f.id}/editar`}>
            <Button variant="ghost" size="sm">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-gray-600">Registro de compras a proveedores</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> No entregado</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> Cantidad menor</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Precio diferente</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Agregado</span>
          </div>
          <Link href="/facturas/nueva">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Factura
            </Button>
          </Link>
        </div>
      </div>

      <Table
        columns={columns}
        data={facturas}
        keyExtractor={(f) => f.id}
        isLoading={isLoading}
        emptyMessage="No hay facturas registradas"
      />
    </div>
  )
}
