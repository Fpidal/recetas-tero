'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ChefHat, Search } from 'lucide-react'
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

export default function RecetasBasePage() {
  const [recetas, setRecetas] = useState<RecetaConCosto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

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
        receta_base_ingredientes (
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Elaboraciones</h1>
          <p className="text-gray-600">Salsas, guarniciones y preparados</p>
        </div>
        <Link href="/recetas-base/nueva">
          <Button>
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
            className="pl-9 pr-3 py-2 w-64 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
      )}
    </div>
  )
}
