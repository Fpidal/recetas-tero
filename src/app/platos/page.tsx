'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, UtensilsCrossed, Search } from 'lucide-react'
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

export default function PlatosPage() {
  const [platos, setPlatos] = useState<PlatoConCosto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    fetchPlatos()
  }, [])

  async function fetchPlatos() {
    setIsLoading(true)

    // Obtener platos con ingredientes
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

    // Obtener precios actuales de insumos
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    // Obtener recetas base con costo recalculado
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

    // Función para calcular costo final de un insumo
    function getCostoFinalInsumo(insumoId: string): number {
      const insumo = insumosData?.find(i => i.id === insumoId)
      if (!insumo || !insumo.precio_actual) return 0
      return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
    }

    // Función para calcular costo por porción de una receta base
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

    // Calcular costos reales de cada plato
    const platosConCosto: PlatoConCosto[] = (platosData || []).map((plato: any) => {
      let costoTotal = 0

      for (const ing of plato.plato_ingredientes || []) {
        if (ing.insumo_id) {
          const costoInsumo = getCostoFinalInsumo(ing.insumo_id)
          const linea = ing.cantidad * costoInsumo
          const insumo = insumosData?.find(i => i.id === ing.insumo_id)
          console.log(`[LISTA] ${plato.nombre} | Insumo: ${ing.insumos?.nombre} | precio: ${insumo?.precio_actual} | iva: ${insumo?.iva_porcentaje}% | merma: ${insumo?.merma_porcentaje}% | costo_final: ${costoInsumo} | cant: ${ing.cantidad} | linea: ${linea}`)
          costoTotal += linea
        } else if (ing.receta_base_id) {
          const costoPorcion = getCostoPorcionReceta(ing.receta_base_id)
          const linea = ing.cantidad * costoPorcion
          console.log(`[LISTA] ${plato.nombre} | RecetaBase: ${ing.recetas_base?.nombre} | costo_porcion: ${costoPorcion} | cant: ${ing.cantidad} | linea: ${linea}`)
          costoTotal += linea
        }
      }

      console.log(`[LISTA] === ${plato.nombre} TOTAL: ${costoTotal} ===`)

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

  // Filtrar por búsqueda y agrupar por sección
  const platosFiltrados = busqueda
    ? platos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : platos

  const platosPorSeccion = SECCIONES_ORDEN
    .map(seccion => ({
      seccion,
      platos: platosFiltrados.filter(p => p.seccion === seccion),
    }))
    .filter(grupo => grupo.platos.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recetas</h1>
          <p className="text-gray-600">Recetas de platos agrupadas por sección</p>
        </div>
        <Link href="/platos/nuevo">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Plato
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
            placeholder="Buscar receta..."
            className="pl-9 pr-3 py-2 w-64 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando...</p>
        </div>
      ) : platos.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No hay platos registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
                  <tr key={`seccion-${grupo.seccion}`} className="bg-gray-100">
                    <td colSpan={3} className="px-4 py-2">
                      <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        {grupo.seccion}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">({grupo.platos.length})</span>
                    </td>
                  </tr>
                  {grupo.platos.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-100 rounded-lg">
                            <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{p.nombre}</p>
                            {p.ingredientes_texto && (
                              <p className="text-xs text-gray-400 truncate max-w-md">
                                {p.ingredientes_texto}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-700 bg-green-50 tabular-nums">
                        <span className="text-green-500 font-normal">$</span><span className="ml-1">{p.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/platos/${p.id}`}>
                            <Button variant="ghost" size="sm">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
