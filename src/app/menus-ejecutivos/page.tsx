'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, UtensilsCrossed, Save, X, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { MenuEjecutivo } from '@/types/database'
import Link from 'next/link'

export default function MenusEjecutivosPage() {
  const [menus, setMenus] = useState<MenuEjecutivo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrecio, setEditPrecio] = useState('')
  const [editMargen, setEditMargen] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchMenus()
  }, [])

  async function fetchMenus() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('menus_ejecutivos')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching menus:', error)
    } else {
      setMenus(data || [])
    }
    setIsLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este menú?')) return

    const { error } = await supabase
      .from('menus_ejecutivos')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar el menú')
    } else {
      fetchMenus()
    }
  }

  function calcularPrecioSugerido(costo: number, margen: number): number {
    return costo / (1 - margen / 100)
  }

  function calcularFoodCost(costo: number, precio: number): number {
    return precio > 0 ? (costo / precio) * 100 : 0
  }

  function getEstadoMargen(foodCost: number, margenObjetivo: number): 'ok' | 'warning' | 'danger' {
    const fcObjetivo = 100 - margenObjetivo
    if (foodCost <= fcObjetivo) return 'ok'
    if (foodCost <= fcObjetivo + 5) return 'warning'
    return 'danger'
  }

  function handleStartEdit(menu: MenuEjecutivo) {
    setEditingId(menu.id)
    setEditPrecio(menu.precio_carta?.toString() || '0')
    setEditMargen(menu.margen_objetivo?.toString() || '30')
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditPrecio('')
    setEditMargen('')
  }

  async function handleSaveEdit(menu: MenuEjecutivo) {
    setIsSaving(true)

    const precio = parseFloat(editPrecio) || 0
    const margen = parseFloat(editMargen) || 30
    const precioSugerido = calcularPrecioSugerido(menu.costo_total, margen)
    const foodCost = calcularFoodCost(menu.costo_total, precio)

    const { error } = await supabase
      .from('menus_ejecutivos')
      .update({
        precio_carta: precio,
        margen_objetivo: margen,
        precio_sugerido: precioSugerido,
        food_cost_real: foodCost,
      })
      .eq('id', menu.id)

    if (error) {
      console.error('Error actualizando menú:', error)
      alert('Error al actualizar')
    } else {
      handleCancelEdit()
      fetchMenus()
    }

    setIsSaving(false)
  }

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  function getEstadoIcon(estado: string) {
    switch (estado) {
      case 'ok':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'danger':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  function getEstadoClass(estado: string) {
    switch (estado) {
      case 'ok':
        return 'bg-green-100 text-green-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'danger':
        return 'bg-red-100 text-red-800'
      default:
        return ''
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menús Ejecutivos</h1>
          <p className="text-gray-600">Menús del día con composición directa</p>
        </div>
        <Link href="/menus-ejecutivos/nuevo">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Menú
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-6">Cargando...</div>
      ) : menus.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg border">
          <p className="text-gray-500">No hay menús ejecutivos registrados</p>
        </div>
      ) : (
        <>
          {/* Vista Móvil - Cards */}
          <div className="lg:hidden space-y-3">
            {menus.map((menu) => {
              const precioSugerido = calcularPrecioSugerido(menu.costo_total, menu.margen_objetivo || 30)
              const foodCost = calcularFoodCost(menu.costo_total, menu.precio_carta || 0)
              const estado = getEstadoMargen(foodCost, menu.margen_objetivo || 30)
              const contribucion = (menu.precio_carta || 0) - menu.costo_total

              return (
                <div
                  key={menu.id}
                  className={`bg-white rounded-lg border p-4 ${estado === 'danger' ? 'border-red-300 bg-red-50' : ''}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-teal-100 rounded-lg">
                        <UtensilsCrossed className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <Link href={`/menus-ejecutivos/${menu.id}`}>
                          <p className="font-medium text-gray-900 hover:text-primary-600">{menu.nombre}</p>
                        </Link>
                        {menu.descripcion && (
                          <p className="text-sm text-gray-500 truncate max-w-[200px]">{menu.descripcion}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {editingId === menu.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500">P.Carta</label>
                          <input
                            type="number"
                            value={editPrecio}
                            onChange={(e) => setEditPrecio(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500">M.Obj %</label>
                          <input
                            type="number"
                            value={editMargen}
                            onChange={(e) => setEditMargen(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={handleCancelEdit}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(menu)} disabled={isSaving}>
                          <Save className="w-3.5 h-3.5 mr-1" />
                          Guardar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Grid de datos */}
                      <div className="grid grid-cols-4 gap-2 text-center mb-3">
                        <div>
                          <p className="text-[10px] text-gray-500">Costo</p>
                          <p className="text-xs font-medium tabular-nums">{fmt(menu.costo_total)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">P.Sug.</p>
                          <p className="text-xs text-gray-600 tabular-nums">{fmt(menu.precio_sugerido || precioSugerido)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">P.Carta</p>
                          <p className="text-xs font-bold tabular-nums">{fmt(menu.precio_carta || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Contrib.</p>
                          <p className={`text-xs font-bold tabular-nums ${contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fmt(contribucion)}
                          </p>
                        </div>
                      </div>

                      {/* Footer con estado y acciones */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2">
                          {getEstadoIcon(estado)}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEstadoClass(estado)}`}>
                            FC: {foodCost.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-gray-500">Obj: {menu.margen_objetivo || 30}%</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleStartEdit(menu)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(menu.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Vista Desktop - Tabla */}
          <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Menú</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">P.Sug.</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">P.Carta</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">M.Obj</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">FC</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-green-50">Contrib.</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {menus.map((menu) => {
                  const precioSugerido = calcularPrecioSugerido(menu.costo_total, menu.margen_objetivo || 30)
                  const foodCost = calcularFoodCost(menu.costo_total, menu.precio_carta || 0)
                  const estado = getEstadoMargen(foodCost, menu.margen_objetivo || 30)
                  const contribucion = (menu.precio_carta || 0) - menu.costo_total

                  return (
                    <tr key={menu.id} className={estado === 'danger' ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-teal-100 rounded-lg">
                            <UtensilsCrossed className="w-5 h-5 text-teal-600" />
                          </div>
                          <div>
                            <Link href={`/menus-ejecutivos/${menu.id}`}>
                              <p className="font-medium text-gray-900 hover:text-primary-600">{menu.nombre}</p>
                            </Link>
                            {menu.descripcion && (
                              <p className="text-sm text-gray-500 truncate max-w-xs">{menu.descripcion}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-medium text-green-600">{fmt(menu.costo_total)}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm text-gray-500">
                          {fmt(editingId === menu.id
                            ? calcularPrecioSugerido(menu.costo_total, parseFloat(editMargen) || 30)
                            : (menu.precio_sugerido || precioSugerido)
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {editingId === menu.id ? (
                          <input
                            type="number"
                            value={editPrecio}
                            onChange={(e) => setEditPrecio(e.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                          />
                        ) : (
                          <span className="text-sm font-bold">{fmt(menu.precio_carta || 0)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {editingId === menu.id ? (
                          <input
                            type="number"
                            value={editMargen}
                            onChange={(e) => setEditMargen(e.target.value)}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-center"
                          />
                        ) : (
                          <span className="text-sm text-gray-600">{menu.margen_objetivo || 30}%</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {getEstadoIcon(estado)}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEstadoClass(estado)}`}>
                            {foodCost.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right bg-green-50">
                        <span className={`text-sm font-bold ${contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmt(contribucion)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          {editingId === menu.id ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                <X className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(menu)} disabled={isSaving}>
                                <Save className="w-4 h-4 text-green-600" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleStartEdit(menu)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(menu.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
