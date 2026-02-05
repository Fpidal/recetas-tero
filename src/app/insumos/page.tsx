'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus, LineChart as LineChartIcon, Search } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button, Input, Modal, Select } from '@/components/ui'
import { CategoriaInsumo, UnidadMedida } from '@/types/database'
import { formatearMoneda, formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'

interface InsumoCompleto {
  id: string
  nombre: string
  categoria: CategoriaInsumo
  unidad_medida: UnidadMedida
  cantidad_por_paquete: number
  merma_porcentaje: number
  iva_porcentaje: number
  activo: boolean
  precio_actual: number | null
  precio_anterior: number | null
  fecha_actualizacion: string | null
  proveedor_id: string | null
  proveedor_nombre: string | null
}

interface InsumoForm {
  nombre: string
  categoria: CategoriaInsumo
  unidad_medida: UnidadMedida
  cantidad_por_paquete: string
  merma_porcentaje: string
  iva_porcentaje: string
  precio: string
  proveedor_id: string
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
  { value: 'Salsas_Recetas', label: 'Salsas y Recetas' },
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
  cantidad_por_paquete: '1',
  merma_porcentaje: '0',
  iva_porcentaje: '21',
  precio: '',
  proveedor_id: '',
}

interface HistorialPrecio {
  fecha: string
  precio: number
  proveedor: string
}

export default function InsumosPage() {
  const [insumos, setInsumos] = useState<InsumoCompleto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<InsumoForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
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
        proveedores (nombre)
      `)
      .eq('es_precio_actual', true)

    const { data: todosPrecios } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio, fecha, es_precio_actual')
      .order('fecha', { ascending: false })

    const insumosCompletos: InsumoCompleto[] = (insumosData || []).map(insumo => {
      const precioActual = preciosActuales?.find(p => p.insumo_id === insumo.id)
      const preciosInsumo = todosPrecios?.filter(p => p.insumo_id === insumo.id) || []
      const precioAnterior = preciosInsumo.find(p => !p.es_precio_actual)

      return {
        ...insumo,
        precio_actual: precioActual?.precio || null,
        precio_anterior: precioAnterior?.precio || null,
        fecha_actualizacion: precioActual?.fecha || null,
        proveedor_id: precioActual?.proveedor_id || null,
        proveedor_nombre: (precioActual?.proveedores as any)?.nombre || null,
      }
    })

    setInsumos(insumosCompletos)
    setIsLoading(false)
  }

  function handleOpenModal(insumo?: InsumoCompleto) {
    if (insumo) {
      setEditingId(insumo.id)
      const cantPaq = insumo.cantidad_por_paquete || 1
      const precioPaquete = insumo.precio_actual ? (insumo.precio_actual * cantPaq) : null
      setForm({
        nombre: insumo.nombre,
        categoria: insumo.categoria,
        unidad_medida: insumo.unidad_medida,
        cantidad_por_paquete: cantPaq.toString(),
        merma_porcentaje: (insumo.merma_porcentaje || 0).toString(),
        iva_porcentaje: (insumo.iva_porcentaje ?? 21).toString(),
        precio: precioPaquete?.toString() || '',
        proveedor_id: insumo.proveedor_id || '',
      })
    } else {
      setEditingId(null)
      setForm(initialForm)
    }
    setIsModalOpen(true)
  }

  function handleCloseModal() {
    setIsModalOpen(false)
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)

    const ivaValue = parseFloat(form.iva_porcentaje)
    const cantPaq = parseFloat(form.cantidad_por_paquete) || 1
    const data = {
      nombre: form.nombre,
      categoria: form.categoria,
      unidad_medida: form.unidad_medida,
      merma_porcentaje: parseFloat(form.merma_porcentaje) || 0,
      iva_porcentaje: !isNaN(ivaValue) ? ivaValue : 21,
    }

    const precioPaquete = parsearNumero(form.precio)
    const precio = precioPaquete > 0 ? precioPaquete / cantPaq : 0
    const proveedorId = form.proveedor_id

    if (editingId) {
      const { error } = await supabase
        .from('insumos')
        .update(data)
        .eq('id', editingId)

      if (!error) {
        await supabase
          .from('insumos')
          .update({ cantidad_por_paquete: cantPaq } as any)
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
            fecha: new Date().toISOString().split('T')[0],
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
        await supabase
          .from('insumos')
          .update({ cantidad_por_paquete: cantPaq } as any)
          .eq('id', newInsumo.id)
      }

      if (precio > 0 && newInsumo) {
        await supabase
          .from('precios_insumo')
          .insert({
            insumo_id: newInsumo.id,
            proveedor_id: proveedorId || null,
            precio: precio,
            fecha: new Date().toISOString().split('T')[0],
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

    const { data } = await supabase
      .from('precios_insumo')
      .select(`
        precio,
        fecha,
        proveedores (nombre)
      `)
      .eq('insumo_id', insumo.id)
      .order('fecha', { ascending: true })

    if (data) {
      setHistorialData(
        data.map((d: any) => ({
          fecha: new Date(d.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
          precio: d.precio,
          proveedor: d.proveedores?.nombre || '-',
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
    const conIva = precio * (1 + iva / 100)
    return conIva * (1 + merma / 100)
  }

  const filteredInsumos = insumos
    .filter((i) => !filtroCategoria || i.categoria === filtroCategoria)
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
    return formatearMoneda(value, true)
  }

  const formatCurrencyDecimal = (value: number | null) => {
    if (value === null) return '-'
    return formatearMoneda(value, true)
  }

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
            <p className="font-semibold text-gray-900">{insumo.nombre}</p>
            <p className="text-xs text-gray-500">
              {categorias.find((c) => c.value === insumo.categoria)?.label}
            </p>
          </div>
          {variacion !== null && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
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
            <p className="font-medium">{formatCurrency(precioPaquete)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Costo Final</p>
            <p className="font-bold text-green-700">{formatCurrency(costoFinal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Unidad</p>
            <p>{insumo.unidad_medida} {cantPaq > 1 && <span className="text-purple-600">x{cantPaq}</span>}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">IVA / Merma</p>
            <p>{insumo.iva_porcentaje}% / {insumo.merma_porcentaje}%</p>
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
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Insumos</h1>
          <p className="text-sm text-gray-600">Mercadería y materias primas</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Insumo
        </Button>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar insumo..."
            className="pl-9 pr-3 py-2.5 sm:py-2 w-full sm:w-64 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <Select
          options={[
            { value: '', label: 'Todas las categorías' },
            ...categorias.map((c) => ({ value: c.value, label: c.label })),
          ]}
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="w-full sm:w-64"
        />
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
          <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Producto</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Categ.</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Ant.</th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Var</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Precio</th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Un.</th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Cant.</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo</th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">IVA</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">+IVA</th>
                    <th className="px-1 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Mer.</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">C.Final</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Proveedor</th>
                    <th className="px-1 py-2"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredInsumos.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-4 py-8 text-center text-gray-500">
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
                          <td className="px-2 py-1.5 font-medium text-gray-900">
                            {insumo.nombre}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600">
                            {categorias.find((c) => c.value === insumo.categoria)?.label?.split(' ')[0]}
                          </td>
                          <td className="px-2 py-1.5 text-center text-gray-500">
                            {formatDate(insumo.fecha_actualizacion)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-500">
                            {formatCurrency(anteriorPaquete)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {variacion !== null ? (
                              <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium ${
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
                          <td className="px-2 py-1.5 text-right font-medium text-gray-900">
                            {formatCurrency(precioPaquete)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <span className="text-gray-600">{insumo.unidad_medida}</span>
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {cantPaq > 1 ? (
                              <span className="text-purple-600 font-medium">{cantPaq}</span>
                            ) : (
                              <span className="text-gray-400">1</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium text-gray-700">
                            {formatCurrency(precioUnitario)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium ${
                              insumo.iva_porcentaje === 21 ? 'bg-blue-100 text-blue-800' :
                              insumo.iva_porcentaje === 10.5 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {insumo.iva_porcentaje}%
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-600">
                            {formatCurrency(costoConIva)}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            {insumo.merma_porcentaje > 0 ? (
                              <span className="text-orange-600 font-medium">{insumo.merma_porcentaje}%</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-bold text-green-700 bg-green-50">
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
          <Input
            label="Nombre *"
            id="nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            placeholder="Nombre del insumo"
          />

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

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Cant. por Paquete"
              id="cantidad_por_paquete"
              type="number"
              step="1"
              min="1"
              value={form.cantidad_por_paquete}
              onChange={(e) =>
                setForm({ ...form, cantidad_por_paquete: e.target.value })
              }
              placeholder="Ej: 12"
            />

            <Input
              label="Merma (%)"
              id="merma"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.merma_porcentaje}
              onChange={(e) =>
                setForm({ ...form, merma_porcentaje: e.target.value })
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
                const merma = parseFloat(form.merma_porcentaje) || 0
                const precioPaquete = parsearNumero(form.precio)
                const cantPaq = parseFloat(form.cantidad_por_paquete) || 1
                const precioUnitario = precioPaquete / cantPaq
                const costoConIva = calcularCostoConIva(precioUnitario, iva)
                const costoFinal = calcularCostoFinal(precioUnitario, iva, merma)

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">
                        {cantPaq > 1 ? `Paquete (${cantPaq} u.)` : 'Precio'}
                      </p>
                      <p className="font-medium">{formatCurrency(precioPaquete)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Precio unit.</p>
                      <p className="font-medium">{formatCurrencyDecimal(precioUnitario)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">+ IVA ({iva}%)</p>
                      <p className="font-medium">{formatCurrencyDecimal(costoConIva)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">+ Merma ({merma}%)</p>
                      <p className="font-bold text-green-700">{formatCurrencyDecimal(costoFinal)}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={handleCloseModal} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
              {isSaving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
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
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: any) => [`$${Number(value).toLocaleString('es-AR')}`, 'Precio']}
                    labelFormatter={(label) => `Fecha: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="precio"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ fill: '#2563eb', r: 3 }}
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
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">Precio</th>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">Proveedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...historialData].reverse().map((item, idx) => (
                    <tr key={idx} className={idx === 0 ? 'bg-blue-50' : ''}>
                      <td className="px-3 py-1">{item.fecha}</td>
                      <td className="px-3 py-1 text-right font-medium">${item.precio.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-1 text-gray-600">{item.proveedor}</td>
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
