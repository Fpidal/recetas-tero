'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, UtensilsCrossed, Search, ChevronDown, ChevronRight, Salad, Beef, Fish, Cake, Wheat, Soup, Package, BookOpen, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import Link from 'next/link'

const SECCIONES_ORDEN = ['Entradas', 'Principales', 'Pastas y Arroces', 'Ensaladas', 'Postres']

interface PlatoConCosto {
  id: string
  nombre: string
  descripcion: string | null
  seccion: string
  ingredientes_texto: string
  costo_total: number
}

interface InsumoEnRecetas {
  id: string
  nombre: string
  tipo: 'insumo' | 'elaboracion'
  cantidadRecetas: number
  recetas: { id: string; nombre: string; seccion: string }[]
}

// Helper para obtener ícono según sección/nombre del plato
function getPlateIcon(seccion: string, nombrePlato?: string): LucideIcon {
  const s = seccion.toLowerCase()
  const n = nombrePlato?.toLowerCase() || ''

  if (s.includes('entrada')) return Salad
  if (s.includes('ensalada')) return Salad
  if (s.includes('pasta') || s.includes('arroz')) return Wheat
  if (s.includes('pescado') || s.includes('marisco') || n.includes('langostino') || n.includes('salmon') || n.includes('trucha')) return Fish
  if (s.includes('postre')) return Cake
  if (s.includes('sopa') || s.includes('guiso')) return Soup
  if (s.includes('principal') || s.includes('carne') || n.includes('bife') || n.includes('lomo') || n.includes('costilla') || n.includes('entraña')) return Beef

  return UtensilsCrossed // default
}

export default function PlatosPage() {
  const [platos, setPlatos] = useState<PlatoConCosto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [seccionesExpandidas, setSeccionesExpandidas] = useState<Set<string>>(new Set(SECCIONES_ORDEN))
  const [tab, setTab] = useState<'recetas' | 'insumos'>('recetas')
  const [insumosEnRecetas, setInsumosEnRecetas] = useState<InsumoEnRecetas[]>([])
  const [isLoadingInsumos, setIsLoadingInsumos] = useState(false)
  const [insumoExpandido, setInsumoExpandido] = useState<string | null>(null)
  const [busquedaInsumos, setBusquedaInsumos] = useState('')

  useEffect(() => {
    fetchPlatos()
  }, [])

  useEffect(() => {
    if (tab === 'insumos' && insumosEnRecetas.length === 0) {
      fetchInsumosEnRecetas()
    }
  }, [tab])

  async function fetchInsumosEnRecetas() {
    setIsLoadingInsumos(true)

    // Cargar todos los platos activos con sus ingredientes
    const { data: platosData } = await supabase
      .from('platos')
      .select(`
        id, nombre, seccion,
        plato_ingredientes (
          insumo_id,
          receta_base_id,
          insumos (id, nombre),
          recetas_base (id, nombre)
        )
      `)
      .eq('activo', true)

    if (!platosData) {
      setIsLoadingInsumos(false)
      return
    }

    // Mapear insumos y elaboraciones a sus recetas
    const insumoMap = new Map<string, { nombre: string; tipo: 'insumo' | 'elaboracion'; recetas: { id: string; nombre: string; seccion: string }[] }>()

    platosData.forEach((plato: any) => {
      const ingredientes = plato.plato_ingredientes || []
      ingredientes.forEach((ing: any) => {
        if (ing.insumo_id && ing.insumos) {
          const key = `insumo-${ing.insumo_id}`
          if (!insumoMap.has(key)) {
            insumoMap.set(key, { nombre: ing.insumos.nombre, tipo: 'insumo', recetas: [] })
          }
          const item = insumoMap.get(key)!
          if (!item.recetas.find(r => r.id === plato.id)) {
            item.recetas.push({ id: plato.id, nombre: plato.nombre, seccion: plato.seccion })
          }
        }
        if (ing.receta_base_id && ing.recetas_base) {
          const key = `elaboracion-${ing.receta_base_id}`
          if (!insumoMap.has(key)) {
            insumoMap.set(key, { nombre: ing.recetas_base.nombre, tipo: 'elaboracion', recetas: [] })
          }
          const item = insumoMap.get(key)!
          if (!item.recetas.find(r => r.id === plato.id)) {
            item.recetas.push({ id: plato.id, nombre: plato.nombre, seccion: plato.seccion })
          }
        }
      })
    })

    // Convertir a array y ordenar por cantidad de recetas
    const resultado: InsumoEnRecetas[] = Array.from(insumoMap.entries()).map(([key, value]) => ({
      id: key,
      nombre: value.nombre,
      tipo: value.tipo,
      cantidadRecetas: value.recetas.length,
      recetas: value.recetas.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    })).sort((a, b) => b.cantidadRecetas - a.cantidadRecetas)

    setInsumosEnRecetas(resultado)
    setIsLoadingInsumos(false)
  }

  async function fetchPlatos() {
    setIsLoading(true)

    const { data: platosData, error } = await supabase
      .from('platos')
      .select(`
        id, nombre, descripcion, seccion,
        plato_ingredientes (
          insumo_id,
          receta_base_id,
          cantidad,
          insumos (nombre),
          recetas_base (nombre)
        )
      `)
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching platos:', error)
      setIsLoading(false)
      return
    }

    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`
        id, rendimiento_porciones,
        receta_base_ingredientes (
          insumo_id,
          cantidad
        )
      `)
      .eq('activo', true)

    function getCostoFinalInsumo(insumoId: string): number {
      const insumo = insumosData?.find(i => i.id === insumoId)
      if (!insumo || !insumo.precio_actual) return 0
      return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
    }

    function getCostoPorcionReceta(recetaBaseId: string): number {
      const receta = recetasBaseData?.find((r: any) => r.id === recetaBaseId)
      if (!receta) return 0

      let costoTotal = 0
      for (const ing of (receta as any).receta_base_ingredientes || []) {
        costoTotal += ing.cantidad * getCostoFinalInsumo(ing.insumo_id)
      }

      return (receta as any).rendimiento_porciones > 0
        ? costoTotal / (receta as any).rendimiento_porciones
        : 0
    }

    const platosConCosto: PlatoConCosto[] = (platosData || []).map((plato: any) => {
      let costoTotal = 0

      for (const ing of plato.plato_ingredientes || []) {
        if (ing.insumo_id) {
          const costoInsumo = getCostoFinalInsumo(ing.insumo_id)
          costoTotal += ing.cantidad * costoInsumo
        } else if (ing.receta_base_id) {
          const costoPorcion = getCostoPorcionReceta(ing.receta_base_id)
          costoTotal += ing.cantidad * costoPorcion
        }
      }

      const nombres = (plato.plato_ingredientes || [])
        .map((ing: any) => ing.insumos?.nombre || ing.recetas_base?.nombre || '')
        .filter(Boolean)

      return {
        id: plato.id,
        nombre: plato.nombre,
        descripcion: plato.descripcion,
        seccion: plato.seccion || 'Principales',
        ingredientes_texto: nombres.join(' · '),
        costo_total: costoTotal,
      }
    })

    setPlatos(platosConCosto)
    setIsLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este plato?')) return

    const { error } = await supabase
      .from('platos')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar el plato')
    } else {
      fetchPlatos()
    }
  }

  const platosFiltrados = busqueda
    ? platos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : platos

  const platosPorSeccion = SECCIONES_ORDEN
    .map(seccion => ({
      seccion,
      platos: platosFiltrados.filter(p => p.seccion === seccion),
    }))
    .filter(grupo => grupo.platos.length > 0)

  function toggleSeccion(seccion: string) {
    setSeccionesExpandidas(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(seccion)) {
        nuevo.delete(seccion)
      } else {
        nuevo.add(seccion)
      }
      return nuevo
    })
  }

  // Card component for mobile
  const PlatoCard = ({ plato }: { plato: PlatoConCosto }) => {
    const IconComponent = getPlateIcon(plato.seccion, plato.nombre)
    return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-start gap-2 flex-1">
          <div className="p-1.5 bg-orange-100 rounded-lg flex-shrink-0">
            <IconComponent className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">{plato.nombre}</p>
            {plato.descripcion && (
              <p className="text-xs text-gray-400 italic">({plato.descripcion})</p>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-500">Costo</p>
          <p className="font-bold text-green-700">
            ${plato.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {plato.ingredientes_texto && (
        <p className="text-xs text-gray-400 truncate mb-3">
          {plato.ingredientes_texto}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t">
        <Link href={`/platos/${plato.id}`}>
          <Button variant="ghost" size="sm">
            <Pencil className="w-4 h-4 mr-1" />
            Editar
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => handleDelete(plato.id)}>
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </div>
    </div>
  )}

  // Filtrar insumos por búsqueda
  const insumosFiltrados = busquedaInsumos
    ? insumosEnRecetas.filter(i => i.nombre.toLowerCase().includes(busquedaInsumos.toLowerCase()))
    : insumosEnRecetas

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Recetas</h1>
          <p className="text-sm text-gray-600">Recetas de platos agrupadas por sección</p>
        </div>
        {tab === 'recetas' && (
          <Link href="/platos/nuevo" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Plato
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('recetas')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'recetas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Recetas
        </button>
        <button
          onClick={() => setTab('insumos')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'insumos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Insumos de Recetas
        </button>
      </div>

      {tab === 'recetas' && (
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar receta..."
              className="pl-9 pr-3 py-2.5 sm:py-2 w-full sm:w-64 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      )}

      {tab === 'recetas' && (
        isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Cargando...</p>
          </div>
        ) : platos.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No hay platos registrados</p>
          </div>
        ) : (
          <>
          {/* Vista mobile - Cards agrupadas */}
          <div className="md:hidden space-y-4">
            {platosPorSeccion.map((grupo) => (
              <div key={grupo.seccion}>
                <button
                  onClick={() => toggleSeccion(grupo.seccion)}
                  className="w-full flex items-center gap-2 bg-gray-100 px-4 py-3 rounded-lg mb-2"
                >
                  {seccionesExpandidas.has(grupo.seccion) ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {grupo.seccion}
                  </span>
                  <span className="text-xs text-gray-400">({grupo.platos.length})</span>
                </button>

                {seccionesExpandidas.has(grupo.seccion) && (
                  <div className="space-y-3">
                    {grupo.platos.map((plato) => (
                      <PlatoCard key={plato.id} plato={plato} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Vista desktop - Tabla */}
          <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-green-50">Costo Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {platosPorSeccion.map((grupo) => (
                  <>
                    <tr
                      key={`seccion-${grupo.seccion}`}
                      className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => toggleSeccion(grupo.seccion)}
                    >
                      <td colSpan={3} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {seccionesExpandidas.has(grupo.seccion) ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            {grupo.seccion}
                          </span>
                          <span className="text-[10px] text-gray-400">({grupo.platos.length})</span>
                        </div>
                      </td>
                    </tr>
                    {seccionesExpandidas.has(grupo.seccion) && grupo.platos.map((p) => {
                      const IconComponent = getPlateIcon(p.seccion, p.nombre)
                      return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-orange-100 rounded-lg">
                              <IconComponent className="w-4 h-4 text-orange-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {p.nombre}
                                {p.descripcion && (
                                  <span className="ml-2 text-xs text-gray-400 italic font-normal">({p.descripcion})</span>
                                )}
                              </p>
                              {p.ingredientes_texto && (
                                <p className="text-[10px] text-gray-400 truncate max-w-md">
                                  {p.ingredientes_texto}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-bold text-green-700 bg-green-50 tabular-nums">
                          <span className="text-green-500 font-normal">$</span><span className="ml-1">{p.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Link href={`/platos/${p.id}`}>
                              <Button variant="ghost" size="sm">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
        )
      )}

      {/* Vista Insumos de Recetas */}
      {tab === 'insumos' && (
        <>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busquedaInsumos}
                onChange={(e) => setBusquedaInsumos(e.target.value)}
                placeholder="Buscar insumo o elaboración..."
                className="pl-9 pr-3 py-2.5 sm:py-2 w-full sm:w-64 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {isLoadingInsumos ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">Cargando...</p>
            </div>
          ) : insumosEnRecetas.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No hay insumos en recetas</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-3 bg-gray-50 border-b">
                <p className="text-xs text-gray-500">
                  {insumosFiltrados.length} {insumosFiltrados.length === 1 ? 'ingrediente' : 'ingredientes'} encontrados
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {insumosFiltrados.map((item) => (
                  <div key={item.id}>
                    <button
                      onClick={() => setInsumoExpandido(insumoExpandido === item.id ? null : item.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className={`p-1.5 rounded-lg ${item.tipo === 'insumo' ? 'bg-green-100' : 'bg-purple-100'}`}>
                        {item.tipo === 'insumo' ? (
                          <Package className="w-4 h-4 text-green-600" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-purple-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                        <p className="text-xs text-gray-500">
                          {item.tipo === 'insumo' ? 'Insumo' : 'Elaboración'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-blue-600">
                          {item.cantidadRecetas} {item.cantidadRecetas === 1 ? 'receta' : 'recetas'}
                        </span>
                        {insumoExpandido === item.id ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {insumoExpandido === item.id && (
                      <div className="bg-gray-50 px-4 py-2 border-t">
                        <p className="text-xs font-medium text-gray-500 mb-2">Recetas que lo usan:</p>
                        <div className="space-y-1">
                          {item.recetas.map((receta) => (
                            <Link
                              key={receta.id}
                              href={`/platos/${receta.id}`}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
                            >
                              <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />
                              <span className="text-sm text-gray-700">{receta.nombre}</span>
                              <span className="text-xs text-gray-400">({receta.seccion})</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
