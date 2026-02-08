'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, LayoutGrid, Users, Calculator, Eye, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { MenuEspecial } from '@/types/database'
import Link from 'next/link'

interface MenuConOpciones extends MenuEspecial {
  menu_especial_opciones: {
    id: string
    tipo_opcion: string
    platos: { costo_total: number } | null
    insumos: { id: string } | null
    insumo_id: string | null
  }[]
  costo_calculado?: number
  comensales?: number
  margen_objetivo?: number
  precio_venta?: number
  cantidad_entradas?: number
  cantidad_principales?: number
  cantidad_postres?: number
  cantidad_bebidas?: number
}

// Normalizar tipo_opcion de valores viejos a nuevos
function normalizarTipoOpcion(tipo: string): string {
  const mapeo: Record<string, string> = {
    'entrada': 'Entradas',
    'Entrada': 'Entradas',
    'principal': 'Principales',
    'Principal': 'Principales',
    'Pastas y Arroces': 'Principales',
    'Ensaladas': 'Principales',
    'postre': 'Postres',
    'Postre': 'Postres',
    'bebida': 'Bebidas',
    'Bebida': 'Bebidas',
    'guarnicion': 'Principales',
    'Guarnición': 'Principales',
  }
  return mapeo[tipo] || tipo
}

export default function MenusEspecialesPage() {
  const [menus, setMenus] = useState<MenuConOpciones[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [calculadora, setCalculadora] = useState<{ menuId: string; personas: string } | null>(null)

  // Estado para edición inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMargen, setEditMargen] = useState('')
  const [editPrecio, setEditPrecio] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchMenus()
  }, [])

  async function fetchMenus() {
    setIsLoading(true)

    // Cargar precios de bebidas
    const { data: bebidasData } = await supabase
      .from('insumos')
      .select('id')
      .eq('activo', true)
      .eq('categoria', 'Bebidas')

    const bebidasPreciosMap = new Map<string, number>()
    if (bebidasData) {
      await Promise.all(
        bebidasData.map(async (b) => {
          const { data: precioData } = await supabase
            .from('precios_insumo')
            .select('precio')
            .eq('insumo_id', b.id)
            .order('fecha', { ascending: false })
            .limit(1)
            .single()
          bebidasPreciosMap.set(b.id, precioData?.precio || 0)
        })
      )
    }

    const { data, error } = await supabase
      .from('menus_especiales')
      .select(`*,
        menu_especial_opciones (id, tipo_opcion, plato_id, insumo_id, platos (costo_total))
      `)
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching menus:', error)
    } else {
      // Usar costo_promedio guardado (que ahora es costo por persona)
      const menusConCosto = (data || []).map((menu: any) => {
        return {
          ...menu,
          costo_calculado: menu.costo_promedio || 0 // costo_promedio ahora es costo por persona
        }
      })
      setMenus(menusConCosto as MenuConOpciones[])
    }
    setIsLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este menú?')) return

    const { error } = await supabase
      .from('menus_especiales')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar el menú')
    } else {
      fetchMenus()
    }
  }

  function toggleCalculadora(menuId: string) {
    if (calculadora?.menuId === menuId) {
      setCalculadora(null)
    } else {
      setCalculadora({ menuId, personas: '' })
    }
  }

  function handleStartEdit(menu: any) {
    setEditingId(menu.id)
    setEditMargen(((menu as any).margen_objetivo || 25).toString())
    setEditPrecio(((menu as any).precio_venta || 0).toString())
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditMargen('')
    setEditPrecio('')
  }

  async function handleSaveEdit(menuId: string, costoPorPersona: number) {
    setIsSaving(true)
    const margen = parseFloat(editMargen) || 25
    const precio = parseFloat(editPrecio) || 0

    const { error } = await supabase
      .from('menus_especiales')
      .update({
        margen_objetivo: margen,
        precio_venta: precio,
      })
      .eq('id', menuId)

    if (error) {
      console.error('Error actualizando menú:', error)
      alert('Error al actualizar')
    } else {
      handleCancelEdit()
      fetchMenus()
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menús Especiales</h1>
          <p className="text-gray-600">Menús con opciones de platos para eventos</p>
        </div>
        <Link href="/menus-especiales/nuevo">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Menú
          </Button>
        </Link>
      </div>

      {menus.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <LayoutGrid className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay menús especiales registrados</p>
          <Link href="/menus-especiales/nuevo">
            <Button className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Crear primer menú
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {menus.map((menu) => {
            const costoPorPersona = menu.costo_calculado ?? menu.costo_promedio ?? 0
            const comensales = (menu as any).comensales || 2
            const costoMenu = costoPorPersona * comensales
            const fcObjetivo = (menu as any).margen_objetivo || 25 // Food Cost objetivo
            const precioVenta = (menu as any).precio_venta || 0
            // Fórmula igual que carta: Precio = Costo / (FC% / 100)
            const precioSugerido = fcObjetivo > 0 ? costoPorPersona / (fcObjetivo / 100) : 0
            const fcReal = precioVenta > 0 ? (costoPorPersona / precioVenta * 100) : 0
            const contribucion = precioVenta - costoPorPersona

            const personas = calculadora?.menuId === menu.id ? parseInt(calculadora.personas) || 0 : 0
            const costoTotalEvento = costoPorPersona * personas

            return (
              <div key={menu.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-pink-100 rounded-lg">
                      <LayoutGrid className="w-6 h-6 text-pink-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{menu.nombre}</h3>
                      {menu.descripcion && (
                        <p className="text-sm text-gray-500">{menu.descripcion}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {menu.menu_especial_opciones?.length || 0} opciones • {comensales} comensales
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                      <Link href={`/menus-especiales/${menu.id}`}>
                        <Button variant="ghost" size="sm" title="Ver / Editar">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(menu.id)} title="Eliminar">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                </div>

                {/* Análisis de Precios - igual que Carta */}
                <div className="border-t bg-gray-50 px-4 py-3">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] text-gray-500 uppercase">
                        <th className="text-left font-medium">Costo Menú</th>
                        <th className="text-right font-medium">Costo x Pers.</th>
                        <th className="text-right font-medium">P.Sug.</th>
                        <th className="text-right font-medium">P.Venta</th>
                        <th className="text-center font-medium">FC Obj.</th>
                        <th className="text-center font-medium">FC Real</th>
                        <th className="text-right font-medium bg-green-50">Contrib.</th>
                        <th className="w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {/* Costo Menú */}
                        <td className="py-2 text-left">
                          <span className="text-xs text-gray-600">
                            <span className="text-gray-400">$</span>{costoMenu.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-1">({comensales}p)</span>
                        </td>
                        {/* Costo x Persona */}
                        <td className="py-2 text-right">
                          <span className="text-sm font-bold text-green-600">
                            <span className="text-green-400 font-normal">$</span>{costoPorPersona.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </span>
                        </td>
                        {/* Precio Sugerido */}
                        <td className="py-2 text-right">
                          {(() => {
                            const fc = editingId === menu.id ? parseFloat(editMargen) || 25 : fcObjetivo
                            const ps = fc > 0 ? costoPorPersona / (fc / 100) : 0
                            return (
                              <span className="text-xs text-gray-500">
                                <span className="text-gray-400">$</span>{ps.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                              </span>
                            )
                          })()}
                        </td>
                        {/* Precio Venta - Editable */}
                        <td className="py-2 text-right">
                          {editingId === menu.id ? (
                            <input
                              type="number"
                              value={editPrecio}
                              onChange={(e) => setEditPrecio(e.target.value)}
                              className="w-20 px-1.5 py-0.5 border border-gray-300 rounded text-right text-xs"
                              placeholder="0"
                            />
                          ) : (
                            <span className="text-sm font-medium">
                              {precioVenta > 0 ? (
                                <><span className="text-gray-400 font-normal">$</span>{precioVenta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </span>
                          )}
                        </td>
                        {/* FC Objetivo - Editable */}
                        <td className="py-2 text-center">
                          {editingId === menu.id ? (
                            <input
                              type="number"
                              value={editMargen}
                              onChange={(e) => setEditMargen(e.target.value)}
                              className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-xs"
                            />
                          ) : (
                            <span className="text-xs text-gray-600">{fcObjetivo}%</span>
                          )}
                        </td>
                        {/* FC Real */}
                        <td className="py-2 text-center">
                          {(() => {
                            const pv = editingId === menu.id ? parseFloat(editPrecio) || 0 : precioVenta
                            const fc = editingId === menu.id ? parseFloat(editMargen) || 25 : fcObjetivo
                            const fcr = pv > 0 ? (costoPorPersona / pv * 100) : 0
                            const isOk = fcr <= fc
                            return pv > 0 ? (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {fcr.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )
                          })()}
                        </td>
                        {/* Contribución */}
                        <td className="py-2 text-right bg-green-50">
                          {(() => {
                            const pv = editingId === menu.id ? parseFloat(editPrecio) || 0 : precioVenta
                            const contrib = pv - costoPorPersona
                            return pv > 0 ? (
                              <span className="text-xs font-bold text-green-700">
                                <span className="text-green-500 font-normal">$</span>{contrib.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )
                          })()}
                        </td>
                        {/* Acciones */}
                        <td className="py-2 text-right">
                          {editingId === menu.id ? (
                            <div className="flex justify-end gap-0.5">
                              <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(menu.id, costoPorPersona)} disabled={isSaving}>
                                <Save className="w-3.5 h-3.5 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                <X className="w-3.5 h-3.5 text-gray-500" />
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleStartEdit(menu)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Calculadora expandible */}
                <div className="border-t bg-gradient-to-r from-pink-50 to-purple-50 p-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-pink-500" />
                      <Users className="w-4 h-4 text-gray-500" />
                      <Input
                        type="number"
                        value={calculadora?.menuId === menu.id ? calculadora.personas : ''}
                        onChange={(e) => setCalculadora({ menuId: menu.id, personas: e.target.value })}
                        placeholder="Cant."
                        className="w-20"
                      />
                      <span className="text-sm text-gray-600">personas</span>
                    </div>
                    {personas > 0 && (
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400">→</span>
                        <span className="text-sm text-gray-600">
                          Costo: <span className="font-bold text-green-600">${costoTotalEvento.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                        </span>
                        {precioVenta > 0 && (
                          <>
                            <span className="text-gray-400">|</span>
                            <span className="text-sm text-gray-600">
                              Ingreso: <span className="font-bold text-purple-600">${(precioVenta * personas).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
