'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon, Search, Package, BarChart2, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { costoFinalInsumo } from '@/lib/costos'
import { obtenerHistorialPrecios } from '@/lib/precios-queries'
import { Button, Input, Modal, Select, BotonExportar } from '@/components/ui'
import { exportarInsumos } from '@/lib/exportaciones'
import { CategoriaInsumo, UnidadMedida } from '@/types/database'
import { formatearMoneda, formatearCantidad, formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'
import ComparadorPrecios from '@/components/insumos/ComparadorPrecios'
import { PALETA } from '@/lib/colores'
import { hoyISO } from '@/lib/fechas'

/**
 * Cuánto se tiene que apartar un precio nuevo del vigente para que el sistema
 * pida una segunda mirada, en %.
 *
 * Está para atajar el error de tipeo, no el aumento. El 16/08/26 el asado a 5
 * costillas se guardó en $243 en vez de $24.300: se corrigió a los 23 segundos,
 * pero en el medio costeó recetas, y la fila falsa dejó un "+9900%" en el
 * resumen semanal. Buscando en el historial aparecen unos ocho casos parecidos
 * —Hígado de pollo, Queso reggianito, Ricota— siempre con la misma forma: un
 * factor de 10 o más, corregido en minutos.
 *
 * 50% es alto a propósito. Con la inflación de acá, subas del 20 o 30% entre
 * facturas son normales; avisar por esas convierte el aviso en algo que se
 * saltea sin leer, que es justo lo que no queremos.
 */
const UMBRAL_AVISO_PRECIO = 50 // %

interface InsumoCompleto {
  id: string
  codigo: string
  nombre: string
  categoria: CategoriaInsumo
  unidad_medida: UnidadMedida
  cantidad: number
  cantidad_por_paquete: number
  merma_porcentaje: number
  iva_porcentaje: number
  activo: boolean
  inventario: boolean
  control_menus: boolean
  precio_actual: number | null
  precio_anterior: number | null
  fecha_actualizacion: string | null
  fecha_anterior: string | null
  proveedor_id: string | null
  proveedor_nombre: string | null
}

interface InsumoForm {
  nombre: string
  categoria: CategoriaInsumo
  unidad_medida: UnidadMedida
  cantidad: string
  cantidad_por_paquete: string
  merma_porcentaje: string
  iva_porcentaje: string
  precio: string
  proveedor_id: string
  inventario: boolean
  control_menus: boolean
}

interface Proveedor {
  id: string
  nombre: string
}

const categorias: { value: CategoriaInsumo; label: string }[] = [
  { value: 'Carnes', label: 'Carnes' },
  { value: 'Almacen', label: 'Almacén' },
  { value: 'Verduras_Frutas', label: 'Verduras y Frutas' },
  { value: 'Pescados_Mariscos', label: 'Pescados y Mariscos' },
  { value: 'Lacteos_Fiambres', label: 'Lácteos y Fiambres' },
  { value: 'Bebidas', label: 'Bebidas' },
  { value: 'Otros', label: 'Otros' },
]

const unidades: { value: UnidadMedida; label: string }[] = [
  { value: 'kg', label: 'Kilogramo (kg)' },
  { value: 'gr', label: 'Gramo (gr)' },
  { value: 'lt', label: 'Litro (lt)' },
  { value: 'ml', label: 'Mililitro (ml)' },
  { value: 'unidad', label: 'Unidad' },
  { value: 'porcion', label: 'Porción' },
]

const opcionesIva: { value: string; label: string }[] = [
  { value: '21', label: '21%' },
  { value: '10.5', label: '10.5%' },
  { value: '0', label: '0% (Exento)' },
]

const initialForm: InsumoForm = {
  nombre: '',
  categoria: 'Almacen',
  unidad_medida: 'kg',
  cantidad: '1',
  cantidad_por_paquete: '1',
  merma_porcentaje: '0',
  iva_porcentaje: '21',
  precio: '',
  proveedor_id: '',
  inventario: false,
  control_menus: false,
}

interface HistorialPrecio {
  fecha: string
  precio: number
  proveedor: string
  cantidad: number | null
}

type TabType = 'insumos' | 'comparador' | 'proveedores'

export default function InsumosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  // Id que llega desde otra pantalla para abrir su ficha directo (hoy: el
  // nombre del insumo en Inventario). Sin esto había que venir acá y buscarlo.
  const editarParam = searchParams.get('editar')
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (tabParam === 'comparador') return 'comparador'
    return 'insumos'
  })
  const [insumos, setInsumos] = useState<InsumoCompleto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<InsumoForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  // Precio que se está por guardar y se apartó del vigente. Guarda el valor
  // exacto que se mostró: si después se corrige el campo, el aviso se vuelve a
  // calcular en vez de dar por visto un número que ya no es el que está.
  const [avisoPrecio, setAvisoPrecio] = useState<{
    vigenteUnitario: number
    nuevoUnitario: number
    nuevoPaquete: number
    cantPaq: number
    variacion: number
  } | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [filtroProveedor, setFiltroProveedor] = useState<string>('')
  const [filtroVariacion, setFiltroVariacion] = useState<string>('')
  const [busqueda, setBusqueda] = useState('')
  const [showHistorial, setShowHistorial] = useState(false)
  const [historialData, setHistorialData] = useState<HistorialPrecio[]>([])
  const [historialNombre, setHistorialNombre] = useState('')
  const [historialLoading, setHistorialLoading] = useState(false)

  useEffect(() => {
    fetchInsumos()
    fetchProveedores()
  }, [])

  async function fetchProveedores() {
    const { data } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')

    if (data) setProveedores(data)
  }

  async function fetchInsumos() {
    setIsLoading(true)

    const { data: insumosData, error: insumosError } = await supabase
      .from('insumos')
      .select('*')
      .eq('activo', true)
      .order('categoria')
      .order('nombre')

    if (insumosError) {
      console.error('Error fetching insumos:', insumosError)
      setIsLoading(false)
      return
    }

    const { data: preciosActuales } = await supabase
      .from('precios_insumo')
      .select(`
        insumo_id,
        precio,
        fecha,
        proveedor_id,
        proveedores (nombre),
        factura_items (facturas_proveedor (fecha))
      `)
      .eq('es_precio_actual', true)

    // Paginado: sin esto Supabase corta en 1000 filas y los precios viejos
    // quedan invisibles, así que la variación no se puede calcular.
    const todosPrecios = await obtenerHistorialPrecios()

    // Fecha real de la factura (o la copia como fallback). Es la fuente de verdad para comparar.
    const fechaRealDe = (p: any): string => p?.factura_items?.facturas_proveedor?.fecha || p?.fecha

    const insumosCompletos: InsumoCompleto[] = (insumosData || []).map(insumo => {
      const precioActual = preciosActuales?.find(p => p.insumo_id === insumo.id)
      const fechaActualReal = precioActual ? fechaRealDe(precioActual) : null
      const preciosInsumo = todosPrecios?.filter(p => p.insumo_id === insumo.id) || []

      // Precio anterior = el de FECHA DE FACTURA más reciente, anterior a la del actual (igual que el dashboard)
      const precioAnteriorReg = fechaActualReal
        ? preciosInsumo
            .filter(p => (p.precio as number) > 0 && fechaRealDe(p) < fechaActualReal)
            .sort((a, b) => fechaRealDe(b).localeCompare(fechaRealDe(a)))[0]
        : undefined

      return {
        ...insumo,
        precio_actual: precioActual?.precio || null,
        precio_anterior: precioAnteriorReg?.precio || null,
        fecha_actualizacion: fechaActualReal,
        fecha_anterior: precioAnteriorReg ? fechaRealDe(precioAnteriorReg) : null,
        proveedor_id: precioActual?.proveedor_id || null,
        proveedor_nombre: (precioActual?.proveedores as any)?.nombre || null,
      }
    })

    setInsumos(insumosCompletos)
    setIsLoading(false)
  }

  // Se espera a que la lista esté cargada: el modal se llena con los datos del
  // insumo, y antes de eso no hay de dónde sacarlos.
  useEffect(() => {
    if (!editarParam || isLoading) return
    const insumo = insumos.find((i) => i.id === editarParam)
    if (insumo) handleOpenModal(insumo)
    // Una sola vez: si se cierra el modal, no se vuelve a abrir solo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarParam, isLoading])

  function handleOpenModal(insumo?: InsumoCompleto) {
    if (insumo) {
      setEditingId(insumo.id)
      const cant = insumo.cantidad || 1
      const cantPaq = insumo.cantidad_por_paquete || 1
      const precioPaquete = insumo.precio_actual ? (insumo.precio_actual * cantPaq) : null
      setForm({
        nombre: insumo.nombre,
        categoria: insumo.categoria,
        unidad_medida: insumo.unidad_medida,
        cantidad: formatearCantidad(cant, cant % 1 === 0 ? 0 : 2),
        cantidad_por_paquete: formatearCantidad(cantPaq, cantPaq % 1 === 0 ? 0 : 2),
        merma_porcentaje: (insumo.merma_porcentaje || 0).toString().replace('.', ','),
        iva_porcentaje: (insumo.iva_porcentaje ?? 21).toString(),
        precio: precioPaquete ? formatearCantidad(precioPaquete, 2) : '',
        proveedor_id: insumo.proveedor_id || '',
        inventario: insumo.inventario || false,
        control_menus: insumo.control_menus || false,
      })
    } else {
      setEditingId(null)
      setForm(initialForm)
    }
    setAvisoPrecio(null)
    setIsModalOpen(true)
  }

  function handleCloseModal() {
    setIsModalOpen(false)
    setEditingId(null)
    setForm(initialForm)
    setAvisoPrecio(null)
    // Si se llegó acá desde otra pantalla —el nombre del insumo en Inventario—
    // al cerrar se vuelve a esa pantalla, tanto si se guardó como si no. Sin
    // esto quedabas en Insumos, y encima el `?editar=` de la URL seguía ahí y
    // el efecto de arriba volvía a abrir la ficha.
    if (editarParam) router.back()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const ivaValue = parseFloat(form.iva_porcentaje)
    const cant = parsearNumero(form.cantidad) || 1
    const cantPaq = parsearNumero(form.cantidad_por_paquete) || 1
    const data = {
      nombre: form.nombre,
      categoria: form.categoria,
      unidad_medida: form.unidad_medida,
      merma_porcentaje: parsearNumero(form.merma_porcentaje) || 0,
      iva_porcentaje: !isNaN(ivaValue) ? ivaValue : 21,
      inventario: form.inventario,
      control_menus: form.control_menus,
    }

    const precioPaquete = parsearNumero(form.precio)
    const precio = precioPaquete > 0 ? precioPaquete / cantPaq : 0
    const proveedorId = form.proveedor_id

    // ¿El precio nuevo se va lejos del que está? Se pregunta ANTES de escribir:
    // una vez guardado, el precio malo ya costeó recetas y dejó su fila en el
    // historial, y sacarlo de ahí es a mano y en la base.
    const vigente = editingId
      ? insumos.find((i) => i.id === editingId)?.precio_actual ?? 0
      : 0
    if (editingId && vigente > 0 && precio > 0) {
      const variacion = ((precio - vigente) / vigente) * 100
      const yaLoVio = avisoPrecio && avisoPrecio.nuevoUnitario === precio
      if (Math.abs(variacion) >= UMBRAL_AVISO_PRECIO && !yaLoVio) {
        setAvisoPrecio({
          vigenteUnitario: vigente,
          nuevoUnitario: precio,
          nuevoPaquete: precioPaquete,
          cantPaq,
          variacion,
        })
        setIsSaving(false)
        return
      }
    }

    setIsSaving(true)

    if (editingId) {
      const { error } = await supabase
        .from('insumos')
        .update(data)
        .eq('id', editingId)

      if (!error) {
        // Actualizar campos numéricos por separado (evita problemas de schema cache)
        await supabase
          .from('insumos')
          .update({ cantidad: cant, cantidad_por_paquete: cantPaq } as any)
          .eq('id', editingId)
      }

      if (error) {
        console.error('Error updating insumo:', error)
        alert('Error al actualizar el insumo')
        setIsSaving(false)
        return
      }

      if (precio > 0) {
        await supabase
          .from('precios_insumo')
          .update({ es_precio_actual: false })
          .eq('insumo_id', editingId)
          .eq('es_precio_actual', true)

        await supabase
          .from('precios_insumo')
          .insert({
            insumo_id: editingId,
            proveedor_id: proveedorId || null,
            precio: precio,
            fecha: hoyISO(),
            es_precio_actual: true,
          })
      }

      handleCloseModal()
      fetchInsumos()
    } else {
      const { data: newInsumo, error } = await supabase
        .from('insumos')
        .insert({ ...data, activo: true })
        .select()
        .single()

      if (error) {
        console.error('Error creating insumo:', error)
        alert('Error al crear el insumo')
        setIsSaving(false)
        return
      }

      if (newInsumo) {
        // Actualizar campos numéricos por separado (evita problemas de schema cache)
        await supabase
          .from('insumos')
          .update({ cantidad: cant, cantidad_por_paquete: cantPaq } as any)
          .eq('id', newInsumo.id)
      }

      if (precio > 0 && newInsumo) {
        await supabase
          .from('precios_insumo')
          .insert({
            insumo_id: newInsumo.id,
            proveedor_id: proveedorId || null,
            precio: precio,
            fecha: hoyISO(),
            es_precio_actual: true,
          })
      }

      handleCloseModal()
      fetchInsumos()
    }
    setIsSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este insumo?')) {
      return
    }

    const { error } = await supabase
      .from('insumos')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting insumo:', error)
      alert('Error al eliminar el insumo')
    } else {
      fetchInsumos()
    }
  }

  async function fetchHistorial(insumo: InsumoCompleto) {
    setHistorialNombre(insumo.nombre)
    setHistorialLoading(true)
    setShowHistorial(true)

    // Obtener historial desde factura_items con datos de factura y proveedor
    const { data } = await supabase
      .from('factura_items')
      .select(`
        cantidad,
        precio_unitario,
        facturas_proveedor!inner (
          fecha,
          proveedores (nombre)
        )
      `)
      .eq('insumo_id', insumo.id)
      .order('facturas_proveedor(fecha)', { ascending: true })

    if (data) {
      const ivaPorcentaje = insumo.iva_porcentaje || 0
      setHistorialData(
        data.map((d: any) => ({
          fecha: new Date(d.facturas_proveedor.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
          precio: Math.round(d.precio_unitario * (1 + ivaPorcentaje / 100)), // Precio con IVA incluido, sin decimales
          proveedor: d.facturas_proveedor.proveedores?.nombre || '-',
          cantidad: d.cantidad,
        }))
      )
    }
    setHistorialLoading(false)
  }

  function calcularVariacion(actual: number | null, anterior: number | null): number | null {
    if (!actual || !anterior || anterior === 0) return null
    return ((actual - anterior) / anterior) * 100
  }

  function calcularCostoConIva(precio: number, iva: number): number {
    return precio * (1 + iva / 100)
  }

  function calcularCostoFinal(precio: number, iva: number, merma: number): number {
    return costoFinalInsumo(precio, iva, merma)
  }

  const filteredInsumos = insumos
    .filter((i) => !filtroCategoria || i.categoria === filtroCategoria)
    .filter((i) => !filtroProveedor || i.proveedor_id === filtroProveedor)
    .filter((i) => {
      if (!filtroVariacion) return true
      const variacion = calcularVariacion(i.precio_actual, i.precio_anterior)
      if (filtroVariacion === 'aumento') return variacion !== null && variacion > 0
      if (filtroVariacion === 'baja') return variacion !== null && variacion < 0
      if (filtroVariacion === 'sin_cambio') return variacion === null || variacion === 0
      return true
    })
    .filter((i) => !busqueda || i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      if (!filtroCategoria) return a.nombre.localeCompare(b.nombre, 'es')
      return 0
    })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-'
    // Sin decimales para números grandes
    return '$' + Math.round(value).toLocaleString('es-AR')
  }

  const formatCurrencyDecimal = (value: number | null) => {
    if (value === null) return '-'
    // Sin decimales para números grandes
    return '$' + Math.round(value).toLocaleString('es-AR')
  }

  const tabs = [
    { id: 'insumos' as TabType, label: 'Insumos', icon: Package },
    { id: 'comparador' as TabType, label: 'Comparador de Precios', icon: BarChart2 },
    { id: 'proveedores' as TabType, label: 'Proveedores', icon: Users },
  ]

  // Card para mobile
  const InsumoCard = ({ insumo }: { insumo: InsumoCompleto }) => {
    const cantPaq = insumo.cantidad_por_paquete || 1
    const precioUnitario = insumo.precio_actual
    const precioPaquete = precioUnitario ? precioUnitario * cantPaq : null
    const variacion = calcularVariacion(insumo.precio_actual, insumo.precio_anterior)
    const costoFinal = precioUnitario ? calcularCostoFinal(precioUnitario, insumo.iva_porcentaje, insumo.merma_porcentaje) : null

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-400">{insumo.codigo}</span>
              <p className="font-semibold text-gray-900">{insumo.nombre}</p>
            </div>
            <p className="text-xs text-gray-500">
              {categorias.find((c) => c.value === insumo.categoria)?.label}
            </p>
          </div>
          {variacion !== null && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-mono font-medium ${
              variacion > 0 ? 'bg-red-100 text-red-700' :
              variacion < 0 ? 'bg-green-100 text-green-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {variacion > 0 ? <TrendingUp className="w-3 h-3" /> :
               variacion < 0 ? <TrendingDown className="w-3 h-3" /> :
               <Minus className="w-3 h-3" />}
              {Math.abs(variacion).toFixed(0)}%
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <p className="text-xs text-gray-500">Precio</p>
            <p className="font-mono font-medium">{formatCurrency(precioPaquete)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Costo Final</p>
            <p className="font-mono font-bold text-green-700">{formatCurrency(costoFinal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Unidad</p>
            <p>{insumo.unidad_medida} {cantPaq !== 1 && <span className="font-mono text-purple-600">x{formatearCantidad(cantPaq, cantPaq % 1 === 0 ? 0 : 1)}</span>}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">IVA / Merma</p>
            <p className="font-mono">{insumo.iva_porcentaje}% / {insumo.merma_porcentaje}%</p>
          </div>
        </div>

        {insumo.proveedor_nombre && (
          <p className="text-xs text-gray-400 mb-3 truncate">
            Proveedor: {insumo.proveedor_nombre}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => fetchHistorial(insumo)}>
            <LineChartIcon className="w-4 h-4 text-blue-500 mr-1" />
            Historial
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleOpenModal(insumo)}>
            <Pencil className="w-4 h-4 mr-1" />
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(insumo.id)}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1>Insumos</h1>
          <p className="text-sm text-gray-600">
            {activeTab === 'insumos' ? 'Mercadería y materias primas' : 'Comparar precios entre proveedores'}
          </p>
        </div>
        {activeTab === 'insumos' && (
          <div className="flex gap-2 w-full sm:w-auto">
            <BotonExportar onExportar={exportarInsumos} titulo="Descargar insumos en Excel" />
            <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Insumo
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'proveedores') {
                    router.push('/proveedores')
                  } else {
                    setActiveTab(tab.id)
                  }
                }}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {activeTab === 'comparador' ? (
        <ComparadorPrecios />
      ) : (
        <>
      <div className="mb-4 flex items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar..."
            className="pl-6 pr-2 py-1 w-28 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="py-1 px-2 w-32 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
        >
          <option value="">Categoría</option>
          {categorias.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          className="py-1 px-2 w-32 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
        >
          <option value="">Proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          value={filtroVariacion}
          onChange={(e) => setFiltroVariacion(e.target.value)}
          className="py-1 px-2 w-28 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
        >
          <option value="">Variación</option>
          <option value="aumento">Con aumento</option>
          <option value="baja">Con baja</option>
          <option value="sin_cambio">Sin cambio</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando...</p>
        </div>
      ) : (
        <>
          {/* Vista mobile - Cards */}
          <div className="md:hidden space-y-3">
            {filteredInsumos.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No hay insumos registrados</p>
              </div>
            ) : (
              filteredInsumos.map((insumo) => (
                <InsumoCard key={insumo.id} insumo={insumo} />
              ))
            )}
          </div>

          {/* Vista desktop - Tabla */}
          <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden max-w-full">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full divide-y divide-gray-200 text-xs table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-[60px] px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cód.</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Producto</th>
                    <th className="w-[70px] px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Categ.</th>
                    <th className="w-[65px] px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="w-[60px] px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Ant.</th>
                    <th className="w-[45px] px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Var</th>
                    <th className="w-[60px] px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Precio</th>
                    <th className="w-[30px] px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Un.</th>
                    <th className="w-[35px] px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Cont.</th>
                    <th className="w-[55px] px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo</th>
                    <th className="w-[40px] px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">IVA</th>
                    <th className="w-[60px] px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">IVA Incl.</th>
                    <th className="w-[35px] px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Mer.</th>
                    <th className="w-[60px] px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">C.Final</th>
                    <th className="w-[90px] px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Proveedor</th>
                    <th className="w-[70px] px-1 py-2"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredInsumos.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="px-4 py-8 text-center text-gray-500">
                        No hay insumos registrados
                      </td>
                    </tr>
                  ) : (
                    filteredInsumos.map((insumo) => {
                      const cantPaq = insumo.cantidad_por_paquete || 1
                      const precioUnitario = insumo.precio_actual
                      const precioPaquete = precioUnitario ? precioUnitario * cantPaq : null
                      const anteriorPaquete = insumo.precio_anterior ? insumo.precio_anterior * cantPaq : null
                      const variacion = calcularVariacion(insumo.precio_actual, insumo.precio_anterior)
                      const costoConIva = precioUnitario ? calcularCostoConIva(precioUnitario, insumo.iva_porcentaje) : null
                      const costoFinal = precioUnitario ? calcularCostoFinal(precioUnitario, insumo.iva_porcentaje, insumo.merma_porcentaje) : null

                      return (
                        <tr key={insumo.id} className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px]">
                            {insumo.codigo}
                          </td>
                          <td className="px-2 py-1.5 font-medium text-gray-900 truncate" title={insumo.nombre}>
                            {insumo.nombre}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 truncate">
                            {categorias.find((c) => c.value === insumo.categoria)?.label?.split(' ')[0]}
                          </td>
                          <td className="px-2 py-1.5 text-center font-mono text-gray-500">
                            {formatDate(insumo.fecha_actualizacion)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-500">
                            {formatCurrency(anteriorPaquete)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {variacion !== null ? (
                              <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-mono font-medium ${
                                variacion > 0 ? 'bg-red-100 text-red-700' :
                                variacion < 0 ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {variacion > 0 ? <TrendingUp className="w-2.5 h-2.5" /> :
                                 variacion < 0 ? <TrendingDown className="w-2.5 h-2.5" /> :
                                 <Minus className="w-2.5 h-2.5" />}
                                {Math.abs(variacion).toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-medium text-gray-900">
                            {formatCurrency(precioPaquete)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <span className="text-gray-600">{insumo.unidad_medida === 'unidad' ? 'u.' : insumo.unidad_medida}</span>
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {cantPaq !== 1 ? (
                              <span className="font-mono text-purple-600 font-medium">{formatearCantidad(cantPaq, cantPaq % 1 === 0 ? 0 : 1)}</span>
                            ) : (
                              <span className="font-mono text-gray-400">1</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-medium text-gray-700">
                            {formatCurrency(precioUnitario)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono font-medium ${
                              insumo.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                              insumo.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {insumo.iva_porcentaje}%
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-600">
                            {formatCurrency(costoConIva)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {insumo.merma_porcentaje > 0 ? (
                              <span className="font-mono text-orange-600 font-medium">{insumo.merma_porcentaje}%</span>
                            ) : (
                              <span className="font-mono text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-green-700 bg-green-50">
                            {formatCurrency(costoFinal)}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 max-w-[100px] truncate" title={insumo.proveedor_nombre || ''}>
                            {insumo.proveedor_nombre || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-1 py-1.5 text-right">
                            <div className="flex justify-end gap-0">
                              <button onClick={() => fetchHistorial(insumo)} className="p-1 hover:bg-gray-100 rounded" title="Historial de precios">
                                <LineChartIcon className="w-3.5 h-3.5 text-blue-500" />
                              </button>
                              <button onClick={() => handleOpenModal(insumo)} className="p-1 hover:bg-gray-100 rounded">
                                <Pencil className="w-3.5 h-3.5 text-gray-500" />
                              </button>
                              <button onClick={() => handleDelete(insumo.id)} className="p-1 hover:bg-gray-100 rounded">
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar Insumo' : 'Nuevo Insumo'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <Input
                label="Nombre *"
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
                placeholder="Nombre del insumo"
              />
            </div>
            <div className="pt-6 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.inventario}
                  onChange={(e) => setForm({ ...form, inventario: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">Inventario</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.control_menus}
                  onChange={(e) => setForm({ ...form, control_menus: e.target.checked })}
                  className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-gray-700">Control Menús</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Categoría *"
              id="categoria"
              options={categorias.map((c) => ({ value: c.value, label: c.label }))}
              value={form.categoria}
              onChange={(e) =>
                setForm({ ...form, categoria: e.target.value as CategoriaInsumo })
              }
            />

            <Select
              label="Unidad de Medida *"
              id="unidad_medida"
              options={unidades.map((u) => ({ value: u.value, label: u.label }))}
              value={form.unidad_medida}
              onChange={(e) =>
                setForm({ ...form, unidad_medida: e.target.value as UnidadMedida })
              }
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Input
              label="Cantidad"
              id="cantidad"
              type="text"
              inputMode="decimal"
              value={form.cantidad}
              onChange={(e) =>
                setForm({ ...form, cantidad: formatearInputNumero(e.target.value) })
              }
              placeholder="Ej: 1"
            />

            <Input
              label="Contenido"
              id="cantidad_por_paquete"
              type="text"
              inputMode="decimal"
              value={form.cantidad_por_paquete}
              onChange={(e) =>
                setForm({ ...form, cantidad_por_paquete: formatearInputNumero(e.target.value) })
              }
              placeholder="Ej: 360"
            />

            <Input
              label="Merma (%)"
              id="merma"
              type="text"
              inputMode="decimal"
              value={form.merma_porcentaje}
              onChange={(e) =>
                setForm({ ...form, merma_porcentaje: formatearInputNumero(e.target.value) })
              }
              placeholder="0"
            />

            <Select
              label="IVA"
              id="iva"
              options={opcionesIva}
              value={form.iva_porcentaje}
              onChange={(e) => setForm({ ...form, iva_porcentaje: e.target.value })}
            />
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Precio actual</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Precio"
                id="precio"
                type="text"
                inputMode="decimal"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: formatearInputNumero(e.target.value) })}
                placeholder="0,00"
              />

              <Select
                label="Proveedor"
                id="proveedor"
                options={[
                  { value: '', label: 'Seleccionar...' },
                  ...proveedores.map((p) => ({ value: p.id, label: p.nombre })),
                ]}
                value={form.proveedor_id}
                onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
              />
            </div>
            {form.precio && !form.proveedor_id && (
              <p className="text-xs text-gray-400 mt-1">Sin proveedor — se asignará después</p>
            )}
          </div>

          {(form.precio && parsearNumero(form.precio) > 0) && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Vista previa de costos:</p>
              {(() => {
                const iva = parseFloat(form.iva_porcentaje) || 0
                const merma = parsearNumero(form.merma_porcentaje) || 0
                const precioPaquete = parsearNumero(form.precio)
                const cant = parsearNumero(form.cantidad) || 1
                const cantPaq = parsearNumero(form.cantidad_por_paquete) || 1
                const precioUnitario = precioPaquete / cantPaq
                const costoConIva = calcularCostoConIva(precioUnitario, iva)
                const costoFinal = calcularCostoFinal(precioUnitario, iva, merma)

                // Formato de presentación: "1 x 360 u." o "1 kg"
                const formatoPresentacion = cantPaq > 1
                  ? `${formatearCantidad(cant, cant % 1 === 0 ? 0 : 1)} x ${formatearCantidad(cantPaq, cantPaq % 1 === 0 ? 0 : 1)} ${form.unidad_medida}`
                  : `${formatearCantidad(cant, cant % 1 === 0 ? 0 : 1)} ${form.unidad_medida}`

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">
                        Presentación
                      </p>
                      <p className="font-mono font-medium text-purple-600">{formatoPresentacion}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Precio unit.</p>
                      <p className="font-mono font-medium">{formatCurrencyDecimal(precioUnitario)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">+ IVA (<span className="font-mono">{iva}%</span>)</p>
                      <p className="font-mono font-medium">{formatCurrencyDecimal(costoConIva)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">+ Merma (<span className="font-mono">{merma}%</span>)</p>
                      <p className="font-mono font-bold text-green-700">{formatCurrencyDecimal(costoFinal)}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* El aviso va acá abajo y no en un modal aparte: el campo del precio
              queda a la vista, así corregir el número no obliga a cerrar nada.
              El primer clic en Guardar muestra esto; el segundo guarda. */}
          {avisoPrecio && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-900 mb-2">
                Revisá el precio antes de guardar
              </p>
              <div className="flex items-baseline gap-2 text-sm text-gray-800 flex-wrap">
                <span className="font-mono line-through text-gray-500">
                  {formatCurrencyDecimal(avisoPrecio.vigenteUnitario)}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-mono font-semibold text-amber-900">
                  {formatCurrencyDecimal(avisoPrecio.nuevoUnitario)}
                </span>
                <span className="font-mono text-xs font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                  {avisoPrecio.variacion > 0 ? '+' : ''}
                  {formatearCantidad(avisoPrecio.variacion, 1)}%
                </span>
                <span className="text-xs text-gray-500">por {form.unidad_medida}</span>
              </div>
              {avisoPrecio.cantPaq > 1 && (
                <p className="text-xs text-gray-600 mt-1.5">
                  Estás cargando{' '}
                  <span className="font-mono">{formatCurrencyDecimal(avisoPrecio.nuevoPaquete)}</span>{' '}
                  por paquete de{' '}
                  <span className="font-mono">
                    {formatearCantidad(avisoPrecio.cantPaq, avisoPrecio.cantPaq % 1 === 0 ? 0 : 2)}
                  </span>{' '}
                  {form.unidad_medida}.
                </p>
              )}
              <p className="text-xs text-gray-600 mt-2">
                Si el número es correcto, volvé a apretar Guardar. Si no, corregilo
                arriba: una vez guardado, el precio pasa a costear todas las recetas
                que llevan este insumo.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={handleCloseModal} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
              {isSaving
                ? 'Guardando...'
                : avisoPrecio
                  ? 'Guardar igual'
                  : editingId
                    ? 'Actualizar'
                    : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showHistorial}
        onClose={() => setShowHistorial(false)}
        title={`Historial — ${historialNombre}`}
      >
        {historialLoading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-500">Cargando historial...</p>
          </div>
        ) : historialData.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-500">No hay datos de precios para este insumo</p>
          </div>
        ) : (
          <div>
            <div className="h-48 sm:h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historialData}>
                  <XAxis dataKey="fecha" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: any) => [`$${Number(value).toLocaleString('es-AR')}`, 'Precio']}
                    labelFormatter={(label) => `Fecha: ${label}`}
                    contentStyle={{ fontFamily: 'monospace' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="precio"
                    stroke={PALETA.terracotta}
                    strokeWidth={2}
                    dot={{ fill: PALETA.terracotta, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 max-h-40 overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">Cant.</th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">Precio</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">Proveedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...historialData].reverse().map((item, idx) => (
                    <tr key={idx} className={idx === 0 ? 'bg-blue-50' : ''}>
                      <td className="px-3 py-1 font-mono">{item.fecha}</td>
                      <td className="px-3 py-1 text-right font-mono">{item.cantidad ? formatearCantidad(item.cantidad) : '-'}</td>
                      <td className="px-3 py-1 text-right font-mono font-medium">${item.precio.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-1 text-gray-600">{item.proveedor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
        </>
      )}
    </div>
  )
}
