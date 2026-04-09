'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, UtensilsCrossed, Save, X, CheckCircle, AlertCircle, AlertTriangle, LayoutGrid, Users, Calculator, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { parsearNumero } from '@/lib/formato-numeros'
import { MenuEjecutivo, MenuEspecial } from '@/types/database'
import Link from 'next/link'

// ============ TIPOS ============
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
}

type TabType = 'ejecutivos' | 'especiales'

// Normalizar tipo_opcion de valores viejos a nuevos
function normalizarTipoOpcion(tipo: string): string {
  const mapeo: Record<string, string> = {
    'entrada': 'Entradas',
    'Entrada': 'Entradas',
    'principal': 'Principales',
    'Principal': 'Principales',
    'Parrilla': 'Principales',
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

export default function MenusPage() {
  const [activeTab, setActiveTab] = useState<TabType>('ejecutivos')

  // ============ ESTADOS EJECUTIVOS ============
  const [menusEjecutivos, setMenusEjecutivos] = useState<MenuEjecutivo[]>([])
  const [isLoadingEjec, setIsLoadingEjec] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrecio, setEditPrecio] = useState('')
  const [editMargen, setEditMargen] = useState('')
  const [isSavingEjec, setIsSavingEjec] = useState(false)

  // ============ ESTADOS ESPECIALES ============
  const [menusEspeciales, setMenusEspeciales] = useState<MenuConOpciones[]>([])
  const [isLoadingEsp, setIsLoadingEsp] = useState(true)
  const [calculadora, setCalculadora] = useState<{ menuId: string; personas: string } | null>(null)
  const [editValuesEsp, setEditValuesEsp] = useState<Record<string, { margen: string; precio: string }>>({})
  const [isSavingEsp, setIsSavingEsp] = useState<string | null>(null)

  useEffect(() => {
    fetchMenusEjecutivos()
    fetchMenusEspeciales()
  }, [])

  // ============ FUNCIONES EJECUTIVOS ============
  async function fetchMenusEjecutivos() {
    setIsLoadingEjec(true)
    const { data, error } = await supabase
      .from('menus_ejecutivos')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching menus:', error)
    } else {
      setMenusEjecutivos(data || [])
    }
    setIsLoadingEjec(false)
  }

  async function handleDeleteEjec(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este menú?')) return
    const { error } = await supabase
      .from('menus_ejecutivos')
      .update({ activo: false })
      .eq('id', id)
    if (error) {
      alert('Error al eliminar el menú')
    } else {
      fetchMenusEjecutivos()
    }
  }

  function calcularPrecioSugerido(costo: number, fcObjetivo: number): number {
    return fcObjetivo > 0 ? costo / (fcObjetivo / 100) : 0
  }

  function calcularFoodCost(costo: number, precio: number): number {
    return precio > 0 ? (costo / precio) * 100 : 0
  }

  function getEstadoMargen(foodCost: number, fcObjetivo: number): 'ok' | 'warning' | 'danger' {
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
    setIsSavingEjec(true)
    const precio = parsearNumero(editPrecio)
    const margen = parsearNumero(editMargen) || 30
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
      fetchMenusEjecutivos()
    }
    setIsSavingEjec(false)
  }

  function getEstadoIcon(estado: string) {
    switch (estado) {
      case 'ok': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'danger': return <AlertTriangle className="w-4 h-4 text-red-500" />
      default: return null
    }
  }

  function getEstadoClass(estado: string) {
    switch (estado) {
      case 'ok': return 'bg-green-100 text-green-800'
      case 'warning': return 'bg-yellow-100 text-yellow-800'
      case 'danger': return 'bg-red-100 text-red-800'
      default: return ''
    }
  }

  // ============ FUNCIONES ESPECIALES ============
  async function fetchMenusEspeciales() {
    setIsLoadingEsp(true)

    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`id, rendimiento_porciones, receta_base_ingredientes (insumo_id, cantidad)`)
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

    const { data: platosData } = await supabase
      .from('platos')
      .select(`id, rendimiento_porciones, plato_ingredientes (insumo_id, receta_base_id, cantidad)`)
      .eq('activo', true)

    const platoCostosMap = new Map<string, number>()
    for (const plato of (platosData || []) as any[]) {
      let costoReceta = 0
      for (const ing of plato.plato_ingredientes || []) {
        if (ing.insumo_id) {
          costoReceta += ing.cantidad * getCostoFinalInsumo(ing.insumo_id)
        } else if (ing.receta_base_id) {
          costoReceta += ing.cantidad * getCostoPorcionReceta(ing.receta_base_id)
        }
      }
      const rendimiento = plato.rendimiento_porciones > 0 ? plato.rendimiento_porciones : 1
      platoCostosMap.set(plato.id, costoReceta / rendimiento)
    }

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
      .select(`*, menu_especial_opciones (id, tipo_opcion, plato_id, insumo_id)`)
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching menus:', error)
    } else {
      const menusConCosto = (data || []).map((menu: any) => {
        const cantidades: Record<string, number> = {
          Entradas: menu.cantidad_entradas || 1,
          Principales: menu.cantidad_principales || 2,
          Postres: menu.cantidad_postres || 1,
          Bebidas: menu.cantidad_bebidas || 1,
        }
        const comensales = menu.comensales || 2

        const opcionesPorTipo: Record<string, { costo: number }[]> = {
          Entradas: [], Principales: [], Postres: [], Bebidas: [],
        }

        for (const opcion of menu.menu_especial_opciones || []) {
          const tipoNorm = normalizarTipoOpcion(opcion.tipo_opcion)
          let costo = 0
          if (opcion.plato_id) {
            costo = platoCostosMap.get(opcion.plato_id) || 0
          } else if (opcion.insumo_id) {
            costo = bebidasPreciosMap.get(opcion.insumo_id) || 0
          }
          if (!opcionesPorTipo[tipoNorm]) opcionesPorTipo[tipoNorm] = []
          opcionesPorTipo[tipoNorm].push({ costo })
        }

        let costoMenu = 0
        for (const seccion of ['Entradas', 'Principales', 'Postres', 'Bebidas']) {
          const opts = opcionesPorTipo[seccion]
          const cant = cantidades[seccion] || 0
          if (opts.length > 0 && cant > 0) {
            const costoPromSeccion = opts.reduce((sum, o) => sum + o.costo, 0) / opts.length
            costoMenu += costoPromSeccion * cant
          }
        }

        const costoPorPersona = comensales > 0 ? costoMenu / comensales : 0
        return { ...menu, costo_calculado: costoPorPersona }
      })
      setMenusEspeciales(menusConCosto as MenuConOpciones[])
    }
    setIsLoadingEsp(false)
  }

  async function handleDeleteEsp(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este menú?')) return
    const { error } = await supabase
      .from('menus_especiales')
      .update({ activo: false })
      .eq('id', id)
    if (error) {
      alert('Error al eliminar el menú')
    } else {
      fetchMenusEspeciales()
    }
  }

  function getEditValueEsp(menuId: string, field: 'margen' | 'precio', defaultValue: number) {
    if (editValuesEsp[menuId]?.[field] !== undefined) {
      return editValuesEsp[menuId][field]
    }
    return defaultValue.toString()
  }

  function setEditValueEsp(menuId: string, field: 'margen' | 'precio', value: string) {
    setEditValuesEsp(prev => ({
      ...prev,
      [menuId]: { ...prev[menuId], [field]: value }
    }))
  }

  async function handleSaveEsp(menuId: string, margenValue?: number, precioValue?: number) {
    setIsSavingEsp(menuId)
    const values = editValuesEsp[menuId]
    const margen = margenValue ?? (values ? parsearNumero(values.margen) : null)
    const precio = precioValue ?? (values ? parsearNumero(values.precio) : null)

    const updateData: any = {}
    if (margen !== null) updateData.margen_objetivo = margen
    if (precio !== null) updateData.precio_venta = precio

    if (Object.keys(updateData).length === 0) {
      setIsSavingEsp(null)
      return
    }

    const { error } = await supabase
      .from('menus_especiales')
      .update(updateData)
      .eq('id', menuId)

    if (error) {
      console.error('Error actualizando menú:', error)
    } else {
      setEditValuesEsp(prev => {
        const newValues = { ...prev }
        delete newValues[menuId]
        return newValues
      })
      fetchMenusEspeciales()
    }
    setIsSavingEsp(null)
  }

  function handleBlurSaveEsp(menuId: string, field: 'margen' | 'precio', value: string, originalValue: number) {
    const numValue = parsearNumero(value)
    if (numValue !== originalValue) {
      if (field === 'margen') {
        handleSaveEsp(menuId, numValue, undefined)
      } else {
        handleSaveEsp(menuId, undefined, numValue)
      }
    }
  }

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  const tabs = [
    { id: 'ejecutivos' as TabType, label: 'Ejecutivos', icon: UtensilsCrossed },
    { id: 'especiales' as TabType, label: 'Especiales', icon: LayoutGrid },
  ]

  return (
    <div className="overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Menús</h1>
          <p className="text-sm text-gray-600">
            {activeTab === 'ejecutivos' ? 'Menús del día con composición directa' : 'Menús con opciones para eventos'}
          </p>
        </div>
        <Link href={activeTab === 'ejecutivos' ? '/menus-ejecutivos/nuevo' : '/menus-especiales/nuevo'}>
          <Button className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Menú
          </Button>
        </Link>
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
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-teal-500 text-teal-600'
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

      {/* ============ TAB EJECUTIVOS ============ */}
      {activeTab === 'ejecutivos' && (
        isLoadingEjec ? (
          <div className="text-center py-6">Cargando...</div>
        ) : menusEjecutivos.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border">
            <p className="text-gray-500">No hay menús ejecutivos registrados</p>
          </div>
        ) : (
          <>
            {/* Vista Móvil - Cards */}
            <div className="lg:hidden space-y-3">
              {menusEjecutivos.map((menu) => {
                const precioSugerido = calcularPrecioSugerido(menu.costo_total, menu.margen_objetivo || 30)
                const foodCost = calcularFoodCost(menu.costo_total, menu.precio_carta || 0)
                const estado = getEstadoMargen(foodCost, menu.margen_objetivo || 30)
                const contribucion = (menu.precio_carta || 0) - menu.costo_total

                return (
                  <div key={menu.id} className={`bg-white rounded-lg border p-4 ${estado === 'danger' ? 'border-red-300 bg-red-50' : ''}`}>
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
                            <input type="text" inputMode="decimal" value={editPrecio} onChange={(e) => setEditPrecio(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500">M.Obj %</label>
                            <input type="text" inputMode="decimal" value={editMargen} onChange={(e) => setEditMargen(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={handleCancelEdit}>Cancelar</Button>
                          <Button size="sm" onClick={() => handleSaveEdit(menu)} disabled={isSavingEjec}>
                            <Save className="w-3.5 h-3.5 mr-1" />Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-4 gap-2 text-center mb-3">
                          <div>
                            <p className="text-[10px] text-gray-500">Costo</p>
                            <p className="text-xs font-medium tabular-nums">{fmt(menu.costo_total)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500">P.Sug.</p>
                            <p className="text-xs text-gray-600 tabular-nums">{fmt(precioSugerido)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500">P.Carta</p>
                            <p className="text-xs font-bold tabular-nums">{fmt(menu.precio_carta || 0)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500">Contrib.</p>
                            <p className={`text-xs font-bold tabular-nums ${contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(contribucion)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-2">
                            {getEstadoIcon(estado)}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEstadoClass(estado)}`}>FC: {foodCost.toFixed(1)}%</span>
                            <span className="text-[10px] text-gray-500">Obj: {menu.margen_objetivo || 30}%</span>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleStartEdit(menu)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEjec(menu.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
                  {menusEjecutivos.map((menu) => {
                    const precioSugerido = calcularPrecioSugerido(menu.costo_total, menu.margen_objetivo || 30)
                    const foodCost = calcularFoodCost(menu.costo_total, menu.precio_carta || 0)
                    const estado = getEstadoMargen(foodCost, menu.margen_objetivo || 30)
                    const contribucion = (menu.precio_carta || 0) - menu.costo_total

                    return (
                      <tr key={menu.id} className={estado === 'danger' ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-100 rounded-lg"><UtensilsCrossed className="w-5 h-5 text-teal-600" /></div>
                            <div>
                              <Link href={`/menus-ejecutivos/${menu.id}`}><p className="font-medium text-gray-900 hover:text-primary-600">{menu.nombre}</p></Link>
                              {menu.descripcion && <p className="text-sm text-gray-500 truncate max-w-xs">{menu.descripcion}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right"><span className="text-sm font-medium text-green-600">{fmt(menu.costo_total)}</span></td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm text-gray-500">{fmt(editingId === menu.id ? calcularPrecioSugerido(menu.costo_total, parsearNumero(editMargen) || 30) : precioSugerido)}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {editingId === menu.id ? (
                            <input type="text" inputMode="decimal" value={editPrecio} onChange={(e) => setEditPrecio(e.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                          ) : (
                            <span className="text-sm font-bold">{fmt(menu.precio_carta || 0)}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {editingId === menu.id ? (
                            <input type="text" inputMode="decimal" value={editMargen} onChange={(e) => setEditMargen(e.target.value)} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-center" />
                          ) : (
                            <span className="text-sm text-gray-600">{menu.margen_objetivo || 30}%</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getEstadoIcon(estado)}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getEstadoClass(estado)}`}>{foodCost.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right bg-green-50">
                          <span className={`text-sm font-bold ${contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(contribucion)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            {editingId === menu.id ? (
                              <>
                                <Button variant="ghost" size="sm" onClick={handleCancelEdit}><X className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(menu)} disabled={isSavingEjec}><Save className="w-4 h-4 text-green-600" /></Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleStartEdit(menu)}><Pencil className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteEjec(menu.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
        )
      )}

      {/* ============ TAB ESPECIALES ============ */}
      {activeTab === 'especiales' && (
        isLoadingEsp ? (
          <div className="flex items-center justify-center h-64"><p className="text-gray-500">Cargando...</p></div>
        ) : menusEspeciales.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <LayoutGrid className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No hay menús especiales registrados</p>
            <Link href="/menus-especiales/nuevo">
              <Button className="mt-4"><Plus className="w-4 h-4 mr-2" />Crear primer menú</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {menusEspeciales.map((menu) => {
              const costoPorPersona = menu.costo_calculado ?? menu.costo_promedio ?? 0
              const comensales = (menu as any).comensales || 2
              const costoMenu = costoPorPersona * comensales
              const fcObjetivo = (menu as any).margen_objetivo || 25
              const precioVenta = (menu as any).precio_venta || 0
              const personas = calculadora?.menuId === menu.id ? parseInt(calculadora.personas) || 0 : 0
              const costoTotalEvento = costoPorPersona * personas

              return (
                <div key={menu.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-pink-100 rounded-lg"><LayoutGrid className="w-6 h-6 text-pink-600" /></div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{menu.nombre}</h3>
                        {menu.descripcion && <p className="text-sm text-gray-500">{menu.descripcion}</p>}
                        <p className="text-xs text-gray-400 mt-1">{menu.menu_especial_opciones?.length || 0} opciones • {comensales} comensales</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/menus-especiales/${menu.id}`}><Button variant="ghost" size="sm" title="Ver / Editar"><Eye className="w-4 h-4" /></Button></Link>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteEsp(menu.id)} title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </div>
                  </div>

                  {/* Análisis de Precios */}
                  {(() => {
                    const currentMargen = parsearNumero(getEditValueEsp(menu.id, 'margen', fcObjetivo)) || 25
                    const currentPrecio = parsearNumero(getEditValueEsp(menu.id, 'precio', precioVenta))
                    const currentPrecioSugerido = currentMargen > 0 ? costoPorPersona / (currentMargen / 100) : 0
                    const currentFcReal = currentPrecio > 0 ? (costoPorPersona / currentPrecio * 100) : 0
                    const currentContrib = currentPrecio - costoPorPersona
                    const isOk = currentFcReal <= currentMargen
                    const hasChanges = editValuesEsp[menu.id] !== undefined

                    return (
                      <div className="border-t bg-gray-50 px-4 py-3 overflow-x-auto">
                        <table className="w-full min-w-[500px]">
                          <thead>
                            <tr className="text-[10px] text-gray-500 uppercase">
                              <th className="text-left font-medium">Costo Menú</th>
                              <th className="text-right font-medium">Costo x Pers.</th>
                              <th className="text-center font-medium">FC Obj.</th>
                              <th className="text-right font-medium">P.Sug.</th>
                              <th className="text-right font-medium">P.Venta</th>
                              <th className="text-center font-medium">FC Real</th>
                              <th className="text-right font-medium bg-green-50">Contrib.</th>
                              <th className="w-12"></th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="py-2 text-left">
                                <span className="text-xs text-gray-600"><span className="text-gray-400">$</span>{costoMenu.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                                <span className="text-[10px] text-gray-400 ml-1">({comensales}p)</span>
                              </td>
                              <td className="py-2 text-right">
                                <span className="text-sm font-bold text-green-600"><span className="text-green-400 font-normal">$</span>{costoPorPersona.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                              </td>
                              <td className="py-2 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  <input type="text" inputMode="decimal" value={getEditValueEsp(menu.id, 'margen', fcObjetivo)} onChange={(e) => setEditValueEsp(menu.id, 'margen', e.target.value)} onBlur={(e) => handleBlurSaveEsp(menu.id, 'margen', e.target.value, fcObjetivo)} className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-xs" />
                                  <span className="text-[10px] text-gray-400">%</span>
                                </div>
                              </td>
                              <td className="py-2 text-right">
                                <span className="text-xs text-blue-600 font-medium"><span className="text-blue-400">$</span>{currentPrecioSugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                              </td>
                              <td className="py-2 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <span className="text-[10px] text-gray-400">$</span>
                                  <input type="text" value={Number(getEditValueEsp(menu.id, 'precio', precioVenta) || 0).toLocaleString('es-AR')} onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); setEditValueEsp(menu.id, 'precio', raw) }} onBlur={(e) => { const raw = e.target.value.replace(/\D/g, ''); handleBlurSaveEsp(menu.id, 'precio', raw, precioVenta) }} className="w-20 px-1.5 py-0.5 border border-gray-300 rounded text-right text-xs" placeholder="0" />
                                </div>
                              </td>
                              <td className="py-2 text-center">
                                {currentPrecio > 0 ? (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{currentFcReal.toFixed(1)}%</span>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="py-2 text-right bg-green-50">
                                {currentPrecio > 0 ? (
                                  <span className="text-xs font-bold text-green-700"><span className="text-green-500 font-normal">$</span>{currentContrib.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="py-2 text-right">
                                {hasChanges && (
                                  <Button variant="ghost" size="sm" onClick={() => handleSaveEsp(menu.id)} disabled={isSavingEsp === menu.id} title="Guardar cambios">
                                    <Save className="w-3.5 h-3.5 text-green-600" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}

                  {/* Calculadora */}
                  <div className="border-t bg-gradient-to-r from-pink-50 to-purple-50 p-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-pink-500" />
                        <Users className="w-4 h-4 text-gray-500" />
                        <Input type="number" value={calculadora?.menuId === menu.id ? calculadora.personas : ''} onChange={(e) => setCalculadora({ menuId: menu.id, personas: e.target.value })} placeholder="Cant." className="w-20" />
                        <span className="text-sm text-gray-600">personas</span>
                      </div>
                      {personas > 0 && (
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400">→</span>
                          <span className="text-sm text-gray-600">Costo: <span className="font-bold text-green-600">${costoTotalEvento.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></span>
                          {precioVenta > 0 && (
                            <>
                              <span className="text-gray-400">|</span>
                              <span className="text-sm text-gray-600">Ingreso: <span className="font-bold text-purple-600">${(precioVenta * personas).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></span>
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
        )
      )}
    </div>
  )
}
