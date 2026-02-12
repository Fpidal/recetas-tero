'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Plus, Eye, FileText, Pencil, PackageSearch, Filter, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Table, Select } from '@/components/ui'
import Link from 'next/link'
import { formatearMoneda, formatearFecha } from '@/lib/formato-numeros'

interface Proveedor {
  id: string
  nombre: string
}

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

const PERIODOS = [
  { value: '', label: 'Todos' },
  { value: 'esta_semana', label: 'Esta semana' },
  { value: 'semana_pasada', label: 'Semana pasada' },
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

// Obtener lunes de una semana dada
function getLunesDeSemana(fecha: Date): Date {
  const dia = fecha.getDay() // 0=domingo, 1=lunes, ..., 6=sábado
  const diff = dia === 0 ? -6 : 1 - dia // si es domingo, retroceder 6 días
  const lunes = new Date(fecha)
  lunes.setDate(fecha.getDate() + diff)
  lunes.setHours(0, 0, 0, 0)
  return lunes
}

// Obtener domingo de una semana (lunes + 6 días)
function getDomingoDeSemana(lunes: Date): Date {
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return domingo
}

function FacturasContent() {
  const [facturas, setFacturas] = useState<FacturaConDetalle[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // URL params para persistir filtros
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Leer filtros desde URL
  const filtroProveedor = searchParams.get('proveedor') || ''
  const filtroFechaDesde = searchParams.get('desde') || ''
  const filtroFechaHasta = searchParams.get('hasta') || ''
  const filtroPeriodo = searchParams.get('periodo') || ''

  // Actualizar URL con nuevo filtro
  function setFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    fetchFacturas()
    fetchProveedores()
  }, [])

  async function fetchProveedores() {
    const { data } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
    setProveedores(data || [])
  }

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

  // Facturas filtradas
  const facturasFiltradas = useMemo(() => {
    return facturas.filter(f => {
      // Filtro por proveedor
      if (filtroProveedor && f.proveedor_id !== filtroProveedor) return false

      // Filtro por fecha desde
      if (filtroFechaDesde && f.fecha < filtroFechaDesde) return false

      // Filtro por fecha hasta
      if (filtroFechaHasta && f.fecha > filtroFechaHasta) return false

      // Filtro por periodo
      if (filtroPeriodo) {
        if (filtroPeriodo === 'esta_semana') {
          // Esta semana (lunes a domingo actual)
          const hoy = new Date()
          const lunesActual = getLunesDeSemana(hoy)
          const domingoActual = getDomingoDeSemana(lunesActual)
          const fechaFactura = new Date(f.fecha + 'T12:00:00') // Evitar problemas de timezone
          if (fechaFactura < lunesActual || fechaFactura > domingoActual) return false
        } else if (filtroPeriodo === 'semana_pasada') {
          // Semana pasada
          const hoy = new Date()
          const lunesActual = getLunesDeSemana(hoy)
          const lunesPasado = new Date(lunesActual)
          lunesPasado.setDate(lunesActual.getDate() - 7)
          const domingoPasado = getDomingoDeSemana(lunesPasado)
          const fechaFactura = new Date(f.fecha + 'T12:00:00')
          if (fechaFactura < lunesPasado || fechaFactura > domingoPasado) return false
        } else {
          // Filtro por mes (formato: "01" a "12")
          const mesFecha = f.fecha.substring(5, 7) // Extrae MM de YYYY-MM-DD
          if (mesFecha !== filtroPeriodo) return false
        }
      }

      return true
    })
  }, [facturas, filtroProveedor, filtroFechaDesde, filtroFechaHasta, filtroPeriodo])

  const hayFiltrosActivos = filtroProveedor || filtroFechaDesde || filtroFechaHasta || filtroPeriodo

  function limpiarFiltros() {
    router.replace(pathname, { scroll: false })
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
                OC {f.ordenes_compra.numero || formatearFecha(f.ordenes_compra.fecha)}
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
        <span>{formatearFecha(f.fecha)}</span>
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
          {formatearMoneda(f.total)}
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

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="w-4 h-4" />
            <span className="font-medium">Filtros:</span>
          </div>

          {/* Proveedor */}
          <div className="w-48">
            <Select
              value={filtroProveedor}
              onChange={(e) => setFiltro('proveedor', e.target.value)}
              options={[
                { value: '', label: 'Todos los proveedores' },
                ...proveedores.map(p => ({ value: p.id, label: p.nombre }))
              ]}
            />
          </div>

          {/* Periodo */}
          <div className="w-40">
            <Select
              value={filtroPeriodo}
              onChange={(e) => setFiltro('periodo', e.target.value)}
              options={PERIODOS}
            />
          </div>

          {/* Fecha desde */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Desde:</span>
            <input
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltro('desde', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            />
          </div>

          {/* Fecha hasta */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Hasta:</span>
            <input
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltro('hasta', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            />
          </div>

          {/* Limpiar filtros */}
          {hayFiltrosActivos && (
            <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
              <X className="w-4 h-4 mr-1" />
              Limpiar
            </Button>
          )}

          {/* Contador y Total */}
          <div className="ml-auto flex items-center gap-4">
            <span className="text-xs text-gray-400">
              {facturasFiltradas.length} de {facturas.length} facturas
            </span>
            <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-lg">
              Total: {formatearMoneda(facturasFiltradas.reduce((sum, f) => sum + f.total, 0))}
            </span>
          </div>
        </div>
      </div>

      <Table
        columns={columns}
        data={facturasFiltradas}
        keyExtractor={(f) => f.id}
        isLoading={isLoading}
        emptyMessage="No hay facturas registradas"
      />
    </div>
  )
}

export default function FacturasPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-gray-500">Cargando...</p></div>}>
      <FacturasContent />
    </Suspense>
  )
}
