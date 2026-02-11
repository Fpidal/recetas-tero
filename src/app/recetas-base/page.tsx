'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ChefHat, Search, Eye, X, ClipboardList, ImageIcon, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import Link from 'next/link'

interface RecetaConCosto {
  id: string
  nombre: string
  descripcion: string | null
  rendimiento_porciones: number
  costo_total: number
  costo_por_porcion: number
}

interface RecetaDetalle {
  id: string
  nombre: string
  descripcion: string | null
  preparacion: string | null
  observaciones: string | null
  imagen_url: string | null
  rendimiento_porciones: number
  version_receta: string | null
  ingredientes: {
    nombre: string
    cantidad: number
    unidad_medida: string
    costo_linea: number
  }[]
  costo_total: number
  costo_por_porcion: number
}

export default function RecetasBasePage() {
  const [recetas, setRecetas] = useState<RecetaConCosto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [recetaDetalle, setRecetaDetalle] = useState<RecetaDetalle | null>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  useEffect(() => {
    fetchRecetas()
  }, [])

  async function fetchRecetas() {
    setIsLoading(true)

    // Obtener recetas con ingredientes
    const { data: recetasData, error } = await supabase
      .from('recetas_base')
      .select(`
        id, nombre, descripcion, rendimiento_porciones,
        receta_base_ingredientes!receta_base_ingredientes_receta_base_id_fkey (
          insumo_id,
          cantidad
        )
      `)
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching recetas:', error)
      setIsLoading(false)
      return
    }

    // Obtener precios actuales de insumos
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    // Calcular costos reales
    const recetasConCosto: RecetaConCosto[] = (recetasData || []).map((receta: any) => {
      let costoTotal = 0

      for (const ing of receta.receta_base_ingredientes || []) {
        const insumo = insumosData?.find(i => i.id === ing.insumo_id)
        if (insumo && insumo.precio_actual) {
          const costoFinal = insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
          costoTotal += ing.cantidad * costoFinal
        }
      }

      const costoPorPorcion = receta.rendimiento_porciones > 0
        ? costoTotal / receta.rendimiento_porciones
        : 0

      return {
        id: receta.id,
        nombre: receta.nombre,
        descripcion: receta.descripcion,
        rendimiento_porciones: receta.rendimiento_porciones,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
      }
    })

    setRecetas(recetasConCosto)
    setIsLoading(false)
  }

  async function handleVerDetalle(id: string) {
    setModalOpen(true)
    setLoadingDetalle(true)
    setRecetaDetalle(null)

    try {
      // Obtener receta
      const { data: receta, error: recetaError } = await supabase
        .from('recetas_base')
        .select('*')
        .eq('id', id)
        .single()

      console.log('Receta:', receta, 'Error:', recetaError)

      if (recetaError || !receta) {
        console.error('Error cargando receta:', recetaError)
        setLoadingDetalle(false)
        return
      }

      // Obtener ingredientes
      const { data: ingredientesData, error: ingError } = await supabase
        .from('receta_base_ingredientes')
        .select(`
          cantidad, costo_linea,
          insumos (nombre, unidad_medida)
        `)
        .eq('receta_base_id', id)

      console.log('Ingredientes:', ingredientesData, 'Error:', ingError)

      const ingredientes = (ingredientesData || []).map((ing: any) => ({
        nombre: ing.insumos?.nombre || 'Desconocido',
        cantidad: ing.cantidad,
        unidad_medida: ing.insumos?.unidad_medida || '',
        costo_linea: ing.costo_linea || 0,
      }))

      const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
      const costoPorPorcion = receta.rendimiento_porciones > 0 ? costoTotal / receta.rendimiento_porciones : 0

      setRecetaDetalle({
        ...receta,
        observaciones: receta.observaciones || null,
        ingredientes,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
      })
    } catch (err) {
      console.error('Error:', err)
    }
    setLoadingDetalle(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar esta elaboración?')) return

    const { error } = await supabase
      .from('recetas_base')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar la elaboración')
    } else {
      fetchRecetas()
    }
  }

  const recetasFiltradas = busqueda
    ? recetas.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : recetas

  // Card component for mobile
  const RecetaCard = ({ receta }: { receta: RecetaConCosto }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="p-1.5 bg-purple-100 rounded-lg flex-shrink-0">
            <ChefHat className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{receta.nombre}</p>
            {receta.descripcion && (
              <p className="text-xs text-gray-400 italic">({receta.descripcion})</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <p className="text-[10px] text-gray-500">Rinde</p>
          <p className="text-sm font-medium">{receta.rendimiento_porciones} porc.</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Costo Total</p>
          <p className="text-sm font-medium">
            ${receta.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500">$/Porción</p>
          <p className="text-sm font-bold text-green-700">
            ${receta.costo_por_porcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button variant="ghost" size="sm" onClick={() => handleVerDetalle(receta.id)}>
          <Eye className="w-4 h-4 text-blue-500" />
        </Button>
        <Link href={`/recetas-base/${receta.id}`}>
          <Button variant="ghost" size="sm">
            <Pencil className="w-4 h-4 mr-1" />
            Editar
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => handleDelete(receta.id)}>
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Elaboraciones</h1>
          <p className="text-sm text-gray-600">Salsas, guarniciones y preparados</p>
        </div>
        <Link href="/recetas-base/nueva" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Elaboración
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar elaboración..."
            className="pl-9 pr-3 py-2.5 sm:py-2 w-full sm:w-64 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando...</p>
        </div>
      ) : recetas.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No hay elaboraciones registradas</p>
        </div>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {recetasFiltradas.map((r) => (
              <RecetaCard key={r.id} receta={r} />
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-4 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Rinde</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo Total</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">$/Porción</th>
                  <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recetasFiltradas.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-purple-100 rounded-lg">
                          <ChefHat className="w-4 h-4 text-purple-600" />
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {r.nombre}
                          {r.descripcion && (
                            <span className="ml-2 text-xs text-gray-400 italic font-normal">({r.descripcion})</span>
                          )}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-gray-600">
                      {r.rendimiento_porciones}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-medium tabular-nums">
                      <span className="text-gray-400">$</span><span className="ml-1">{r.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-bold text-green-700 bg-green-50 tabular-nums">
                      <span className="text-green-500 font-normal">$</span><span className="ml-1">{r.costo_por_porcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleVerDetalle(r.id)}>
                          <Eye className="w-3.5 h-3.5 text-blue-500" />
                        </Button>
                        <Link href={`/recetas-base/${r.id}`}>
                          <Button variant="ghost" size="sm">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal de Vista Previa */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <ChefHat className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {loadingDetalle ? 'Cargando...' : recetaDetalle?.nombre}
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingDetalle ? (
                <div className="flex items-center justify-center h-48">
                  <p className="text-gray-500">Cargando detalles...</p>
                </div>
              ) : recetaDetalle ? (
                <div className="space-y-4">
                  {/* Info básica y costos */}
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {recetaDetalle.descripcion && (
                      <span className="text-gray-500 italic">{recetaDetalle.descripcion}</span>
                    )}
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                      Rinde: <strong>{recetaDetalle.rendimiento_porciones}</strong> porc.
                    </span>
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                      ${recetaDetalle.costo_por_porcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })} / porción
                    </span>
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                      Total: ${recetaDetalle.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>

                  {/* Grid: Ingredientes + Foto */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Ingredientes */}
                    <div className="border rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase">Ingredientes</h4>
                      <div className="space-y-1">
                        {recetaDetalle.ingredientes.map((ing, idx) => {
                          const cantStr = ing.cantidad < 1 && (ing.unidad_medida === 'kg' || ing.unidad_medida === 'lt')
                            ? `${Math.round(ing.cantidad * 1000)} ${ing.unidad_medida === 'kg' ? 'g' : 'ml'}`
                            : `${ing.cantidad % 1 === 0 ? ing.cantidad : ing.cantidad.toFixed(2)} ${ing.unidad_medida}`
                          return (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-gray-700">{ing.nombre}</span>
                              <span className="text-gray-500">{cantStr}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Foto */}
                    <div className="border rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase">Foto</h4>
                      {recetaDetalle.imagen_url ? (
                        <img
                          src={recetaDetalle.imagen_url}
                          alt={recetaDetalle.nombre}
                          className="w-full h-40 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-40 bg-gray-50 rounded-lg">
                          <ImageIcon className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preparación */}
                  {recetaDetalle.preparacion && (
                    <div className="border rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                        <h4 className="text-xs font-semibold text-gray-700 uppercase">Preparación</h4>
                      </div>
                      <div className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                        {recetaDetalle.preparacion}
                      </div>
                    </div>
                  )}

                  {/* Observaciones */}
                  {recetaDetalle.observaciones && (
                    <div className="border rounded-lg p-3 bg-amber-50">
                      <h4 className="text-xs font-semibold text-amber-700 mb-2 uppercase">Observaciones y Tips</h4>
                      <div className="text-xs text-amber-800 whitespace-pre-line leading-relaxed">
                        {recetaDetalle.observaciones}
                      </div>
                    </div>
                  )}

                  {/* Versión */}
                  {recetaDetalle.version_receta && (
                    <div className="text-right text-[10px] text-gray-400">
                      Versión {recetaDetalle.version_receta}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-48">
                  <p className="text-red-500">Error al cargar la receta</p>
                </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="flex justify-between p-4 border-t bg-gray-50">
              <div>
                {recetaDetalle && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const r = recetaDetalle
                      const ingredientesText = r.ingredientes
                        .map(ing => {
                          const cant = ing.cantidad < 1 && (ing.unidad_medida === 'kg' || ing.unidad_medida === 'lt')
                            ? `${Math.round(ing.cantidad * 1000)} ${ing.unidad_medida === 'kg' ? 'g' : 'ml'}`
                            : `${ing.cantidad % 1 === 0 ? ing.cantidad : ing.cantidad.toFixed(2)} ${ing.unidad_medida}`
                          return `• ${ing.nombre}: ${cant}`
                        })
                        .join('\n')

                      let mensaje = `*${r.nombre}*\n`
                      if (r.descripcion) mensaje += `_${r.descripcion}_\n`
                      mensaje += `Rinde: ${r.rendimiento_porciones} porciones\n\n`
                      mensaje += `*INGREDIENTES:*\n${ingredientesText}\n\n`
                      if (r.preparacion) mensaje += `*PREPARACIÓN:*\n${r.preparacion}\n\n`
                      if (r.observaciones) mensaje += `*TIPS:*\n${r.observaciones}\n`

                      window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank')
                    }}
                    className="text-green-600 hover:text-green-700"
                  >
                    <Share2 className="w-4 h-4 mr-1" />
                    WhatsApp
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {recetaDetalle && (
                  <Link href={`/recetas-base/${recetaDetalle.id}`}>
                    <Button size="sm">
                      <Pencil className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                  </Link>
                )}
                <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
