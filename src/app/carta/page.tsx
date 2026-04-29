'use client'

import { useState, useEffect, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, AlertTriangle, CheckCircle, AlertCircle, Pencil, Trash2, X, Save, ChevronDown, ChevronRight, Salad, Beef, Fish, Cake, Wheat, Soup, UtensilsCrossed, Search, FileDown, Eye, ExternalLink, LayoutGrid, Users, Calculator, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { MenuEjecutivo, MenuEspecial } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select, Modal } from '@/components/ui'
import { parsearNumero } from '@/lib/formato-numeros'
import { generarPDFCarta } from '@/lib/generar-pdf-carta'

const SECCIONES_ORDEN = ['Entradas', 'Principales', 'Parrilla', 'Pastas y Arroces', 'Ensaladas', 'Postres']

interface PlatoConCosto {
  id: string
  nombre: string
  seccion: string
  ingredientes_texto: string
  updated_at: string
  costo_total: number
}

interface CartaItem {
  id: string
  plato_id: string
  plato_nombre: string
  plato_seccion: string
  plato_ingredientes: string
  plato_dias_actualizacion: number
  plato_costo: number
  precio_sugerido: number
  precio_carta: number
  margen_objetivo: number
  food_cost_real: number
  estado_margen: 'ok' | 'warning' | 'danger'
}

interface IngredientePreview {
  nombre: string
  cantidad: number
  unidad: string
  categoria: string
  costo_unitario: number
  costo_linea: number
  tipo: 'insumo' | 'receta_base'
}

interface PlatoPreview {
  id: string
  nombre: string
  seccion: string
  descripcion: string
  rendimiento: number
  ingredientes: IngredientePreview[]
  costo_total: number
  costo_porcion: number
}

// Tipos para Menús
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

type TabType = 'en_carta' | 'fuera_carta' | 'ejecutivos' | 'especiales'

// Normalizar tipo_opcion de valores viejos a nuevos
function normalizarTipoOpcion(tipo: string): string {
  const mapeo: Record<string, string> = {
    'entrada': 'Entradas', 'Entrada': 'Entradas',
    'principal': 'Principales', 'Principal': 'Principales',
    'Parrilla': 'Principales', 'Pastas y Arroces': 'Principales', 'Ensaladas': 'Principales',
    'postre': 'Postres', 'Postre': 'Postres',
    'bebida': 'Bebidas', 'Bebida': 'Bebidas',
    'guarnicion': 'Principales', 'Guarnición': 'Principales',
  }
  return mapeo[tipo] || tipo
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

export default function CartaPage() {
  const [items, setItems] = useState<CartaItem[]>([])
  const [itemsFueraCarta, setItemsFueraCarta] = useState<CartaItem[]>([])
  const [platosDisponibles, setPlatosDisponibles] = useState<PlatoConCosto[]>([])
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [seccionesExpandidas, setSeccionesExpandidas] = useState<Set<string>>(new Set(SECCIONES_ORDEN))
  const [tabActiva, setTabActiva] = useState<TabType>(() => {
    // Leer tab inicial desde query param
    const tabParam = searchParams.get('tab')
    if (tabParam === 'ejecutivos' || tabParam === 'especiales' || tabParam === 'fuera_carta') {
      return tabParam
    }
    return 'en_carta'
  })
  const [busqueda, setBusqueda] = useState('')

  // ============ ESTADOS MENÚS EJECUTIVOS ============
  const [menusEjecutivos, setMenusEjecutivos] = useState<MenuEjecutivo[]>([])
  const [isLoadingEjec, setIsLoadingEjec] = useState(true)
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null)
  const [editMenuPrecio, setEditMenuPrecio] = useState('')
  const [editMenuMargen, setEditMenuMargen] = useState('')
  const [isSavingMenu, setIsSavingMenu] = useState(false)

  // ============ ESTADOS MENÚS ESPECIALES ============
  const [menusEspeciales, setMenusEspeciales] = useState<MenuConOpciones[]>([])
  const [isLoadingEsp, setIsLoadingEsp] = useState(true)
  const [calculadora, setCalculadora] = useState<{ menuId: string; personas: string } | null>(null)
  const [editValuesEsp, setEditValuesEsp] = useState<Record<string, { margen: string; precio: string }>>({})

  // Form para agregar
  const [selectedPlato, setSelectedPlato] = useState('')
  const [precioCartaNew, setPrecioCartaNew] = useState('')
  const [margenObjetivoNew, setMargenObjetivoNew] = useState('30')

  // Form para editar inline
  const [editPrecio, setEditPrecio] = useState('')
  const [editMargen, setEditMargen] = useState('')

  const [isSaving, setIsSaving] = useState(false)

  // Preview de receta
  const [previewPlato, setPreviewPlato] = useState<PlatoPreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

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

  useEffect(() => {
    fetchData()
    fetchMenusEjecutivos()
    fetchMenusEspeciales()
  }, [])

  // Función para calcular costo final de un insumo
  function getCostoFinalInsumo(insumoId: string, insumosData: any[]): number {
    const insumo = insumosData?.find(i => i.id === insumoId)
    if (!insumo || !insumo.precio_actual) return 0
    return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
  }

  // Función para calcular costo real de un plato (por porción)
  function calcularCostoPlato(
    platoIngredientes: any[],
    insumosData: any[],
    recetasBaseData: any[],
    rendimientoPorciones: number = 1
  ): number {
    let costoReceta = 0

    for (const ing of platoIngredientes) {
      if (ing.insumo_id) {
        costoReceta += ing.cantidad * getCostoFinalInsumo(ing.insumo_id, insumosData)
      } else if (ing.receta_base_id) {
        // Recalcular costo por porción de la receta base
        const receta = recetasBaseData?.find((r: any) => r.id === ing.receta_base_id)
        if (receta) {
          let costoRecetaBase = 0
          for (const rIng of receta.receta_base_ingredientes || []) {
            costoRecetaBase += rIng.cantidad * getCostoFinalInsumo(rIng.insumo_id, insumosData)
          }
          const costoPorPorcion = receta.rendimiento_porciones > 0
            ? costoRecetaBase / receta.rendimiento_porciones
            : 0
          costoReceta += ing.cantidad * costoPorPorcion
        }
      }
    }

    // Dividir por rendimiento para obtener costo por porción
    const rendimiento = rendimientoPorciones > 0 ? rendimientoPorciones : 1
    return costoReceta / rendimiento
  }

  async function fetchData() {
    setIsLoading(true)

    // Obtener precios actuales de insumos
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    // Obtener recetas base con ingredientes
    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`
        id, rendimiento_porciones,
        receta_base_ingredientes (insumo_id, cantidad)
      `)
      .eq('activo', true)

    // Obtener platos con ingredientes
    const { data: platosData } = await supabase
      .from('platos')
      .select(`
        id, nombre, seccion, updated_at, rendimiento_porciones,
        plato_ingredientes (insumo_id, receta_base_id, cantidad, insumos (nombre), recetas_base (nombre))
      `)
      .eq('activo', true)
      .order('nombre')

    // Calcular costos reales de cada plato (por porción)
    const platosConCosto: PlatoConCosto[] = (platosData || []).map((plato: any) => {
      const nombres = (plato.plato_ingredientes || [])
        .map((ing: any) => ing.insumos?.nombre || ing.recetas_base?.nombre || '')
        .filter(Boolean)

      return {
        id: plato.id,
        nombre: plato.nombre,
        seccion: plato.seccion || 'Principales',
        ingredientes_texto: nombres.join(' · '),
        updated_at: plato.updated_at,
        costo_total: calcularCostoPlato(
          plato.plato_ingredientes || [],
          insumosData || [],
          recetasBaseData || [],
          plato.rendimiento_porciones || 1
        ),
      }
    })

    // Cargar carta (activos e inactivos)
    const { data: cartaData, error: cartaError } = await supabase
      .from('carta')
      .select('id, plato_id, precio_sugerido, precio_carta, margen_objetivo, food_cost_real, activo')

    if (cartaError) {
      console.error('Error fetching carta:', cartaError)
      setIsLoading(false)
      return
    }

    // Función para mapear items
    function mapCartaItem(item: any): CartaItem {
      const plato = platosConCosto.find(p => p.id === item.plato_id)
      const costoReal = plato?.costo_total || 0
      const foodCost = item.precio_carta > 0 ? (costoReal / item.precio_carta) * 100 : 0
      const precioSugerido = item.margen_objetivo > 0 ? costoReal / (item.margen_objetivo / 100) : 0

      let estado: 'ok' | 'warning' | 'danger' = 'ok'
      if (foodCost > item.margen_objetivo * 1.1) {
        estado = 'danger'
      } else if (foodCost > item.margen_objetivo) {
        estado = 'warning'
      }

      return {
        id: item.id,
        plato_id: item.plato_id,
        plato_nombre: plato?.nombre || 'Desconocido',
        plato_seccion: plato?.seccion || 'Principales',
        plato_ingredientes: plato?.ingredientes_texto || '',
        plato_dias_actualizacion: plato?.updated_at
          ? Math.floor((Date.now() - new Date(plato.updated_at).getTime()) / (1000 * 60 * 60 * 24))
          : -1,
        plato_costo: costoReal,
        precio_sugerido: precioSugerido,
        precio_carta: item.precio_carta,
        margen_objetivo: item.margen_objetivo,
        food_cost_real: foodCost,
        estado_margen: estado,
      }
    }

    // Separar activos e inactivos
    const activos = (cartaData || []).filter((item: any) => item.activo !== false)
    const inactivos = (cartaData || []).filter((item: any) => item.activo === false)

    setItems(activos.map(mapCartaItem))
    setItemsFueraCarta(inactivos.map(mapCartaItem))

    // Platos disponibles (no en carta activa ni inactiva)
    const platosEnCarta = cartaData?.map((c: any) => c.plato_id) || []
    setPlatosDisponibles(platosConCosto.filter(p => !platosEnCarta.includes(p.id)))

    setIsLoading(false)
  }

  function calcularPrecioSugerido(costo: number, margen: number): number {
    return margen > 0 ? costo / (margen / 100) : 0
  }

  // Margen objetivo por defecto según sección
  function getMargenPorSeccion(seccion: string): number {
    switch (seccion) {
      case 'Entradas': return 15
      case 'Principales': return 25
      case 'Parrilla': return 25
      case 'Pastas y Arroces': return 20
      case 'Ensaladas': return 15
      case 'Postres': return 20
      default: return 25
    }
  }

  function calcularFoodCost(costo: number, precio: number): number {
    return precio > 0 ? (costo / precio) * 100 : 0
  }

  async function handleVerReceta(platoId: string) {
    setIsLoadingPreview(true)

    // Cargar insumos con precios
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, nombre, unidad_medida, categoria, precio_actual, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)

    // Calcular costo final para cada insumo
    const insumosConCosto = (insumosData || []).map(insumo => ({
      ...insumo,
      costo_final: insumo.precio_actual !== null
        ? insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
        : 0
    }))

    // Cargar recetas base con sus ingredientes para calcular costo real
    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`
        id, nombre, rendimiento_porciones,
        receta_base_ingredientes (insumo_id, cantidad)
      `)
      .eq('activo', true)

    // Calcular costo por porción de recetas base
    const recetasConCosto = (recetasBaseData || []).map((r: any) => {
      let costoTotal = 0
      for (const ing of r.receta_base_ingredientes || []) {
        const insumo = insumosConCosto.find(i => i.id === ing.insumo_id)
        if (insumo?.costo_final) {
          costoTotal += ing.cantidad * insumo.costo_final
        }
      }
      const rendimiento = r.rendimiento_porciones > 0 ? r.rendimiento_porciones : 1
      return {
        id: r.id,
        nombre: r.nombre,
        costo_por_porcion: costoTotal / rendimiento,
      }
    })

    // Cargar plato con ingredientes
    const { data: plato } = await supabase
      .from('platos')
      .select(`
        id, nombre, seccion, descripcion, rendimiento_porciones,
        plato_ingredientes (
          insumo_id,
          receta_base_id,
          cantidad,
          insumos (nombre, unidad_medida, categoria),
          recetas_base (nombre)
        )
      `)
      .eq('id', platoId)
      .single()

    if (!plato) {
      setIsLoadingPreview(false)
      return
    }

    // Mapear ingredientes
    const ingredientes: IngredientePreview[] = (plato.plato_ingredientes || []).map((ing: any) => {
      if (ing.insumo_id) {
        const insumo = insumosConCosto.find(i => i.id === ing.insumo_id)
        const costoUnitario = insumo?.costo_final || 0
        const cantidad = Number(ing.cantidad) || 0
        return {
          nombre: ing.insumos?.nombre || 'Desconocido',
          cantidad,
          unidad: ing.insumos?.unidad_medida || '',
          categoria: insumo?.categoria || ing.insumos?.categoria || 'Almacen',
          costo_unitario: costoUnitario,
          costo_linea: cantidad * costoUnitario,
          tipo: 'insumo' as const,
        }
      } else {
        const receta = recetasConCosto.find(r => r.id === ing.receta_base_id)
        const costoUnitario = receta?.costo_por_porcion || 0
        const cantidad = Number(ing.cantidad) || 0
        return {
          nombre: ing.recetas_base?.nombre || 'Desconocido',
          cantidad,
          unidad: 'porción',
          categoria: 'Elaboracion',
          costo_unitario: costoUnitario,
          costo_linea: cantidad * costoUnitario,
          tipo: 'receta_base' as const,
        }
      }
    })

    const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
    const rendimiento = plato.rendimiento_porciones || 1

    setPreviewPlato({
      id: plato.id,
      nombre: plato.nombre,
      seccion: plato.seccion || 'Principales',
      descripcion: plato.descripcion || '',
      rendimiento,
      ingredientes,
      costo_total: costoTotal,
      costo_porcion: costoTotal / rendimiento,
    })

    setIsLoadingPreview(false)
  }

  async function handleAgregar() {
    if (!selectedPlato || !precioCartaNew) {
      alert('Seleccioná un plato y un precio')
      return
    }

    const plato = platosDisponibles.find(p => p.id === selectedPlato)
    if (!plato) return

    setIsSaving(true)

    const margen = parsearNumero(margenObjetivoNew) || 30
    const precio = parsearNumero(precioCartaNew)
    const precioSugerido = calcularPrecioSugerido(plato.costo_total, margen)
    const foodCost = calcularFoodCost(plato.costo_total, precio)

    const { error } = await supabase
      .from('carta')
      .insert({
        plato_id: plato.id,
        precio_carta: precio,
        margen_objetivo: margen,
        precio_sugerido: precioSugerido,
        food_cost_real: foodCost,
        activo: true,
      })

    if (error) {
      console.error('Error agregando a carta:', error)
      alert('Error al agregar el plato a la carta')
    } else {
      setIsModalOpen(false)
      setSelectedPlato('')
      setPrecioCartaNew('')
      setMargenObjetivoNew('30')
      fetchData()
    }

    setIsSaving(false)
  }

  function handleStartEdit(item: CartaItem) {
    setEditingId(item.id)
    setEditPrecio(item.precio_carta.toString())
    setEditMargen(item.margen_objetivo.toString())
  }

  function handleCancelEdit() {
    setEditingId(null)
    setEditPrecio('')
    setEditMargen('')
  }

  async function handleSaveEdit(item: CartaItem) {
    setIsSaving(true)

    const precio = parsearNumero(editPrecio)
    const margen = parsearNumero(editMargen) || 30
    const precioSugerido = calcularPrecioSugerido(item.plato_costo, margen)
    const foodCost = calcularFoodCost(item.plato_costo, precio)

    const { error } = await supabase
      .from('carta')
      .update({
        precio_carta: precio,
        margen_objetivo: margen,
        precio_sugerido: precioSugerido,
        food_cost_real: foodCost,
      })
      .eq('id', item.id)

    if (error) {
      console.error('Error actualizando carta:', error)
      alert('Error al actualizar')
    } else {
      handleCancelEdit()
      fetchData()
    }

    setIsSaving(false)
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este plato de la carta?')) return

    const { error } = await supabase
      .from('carta')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar')
    } else {
      fetchData()
    }
  }

  async function handleToggleEnCarta(id: string, nuevoEstado: boolean) {
    const { error } = await supabase
      .from('carta')
      .update({ activo: nuevoEstado })
      .eq('id', id)

    if (error) {
      alert('Error al cambiar estado')
    } else {
      fetchData()
    }
  }

  function getEstadoIcon(estado: string) {
    switch (estado) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'danger':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
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

  // ============ FUNCIONES MENÚS EJECUTIVOS ============
  async function fetchMenusEjecutivos() {
    setIsLoadingEjec(true)
    const { data, error } = await supabase
      .from('menus_ejecutivos')
      .select('*')
      .eq('activo', true)
      .order('nombre')
    if (!error) setMenusEjecutivos(data || [])
    setIsLoadingEjec(false)
  }

  async function handleDeleteEjec(id: string) {
    if (!confirm('¿Eliminar este menú?')) return
    const { error } = await supabase.from('menus_ejecutivos').update({ activo: false }).eq('id', id)
    if (!error) fetchMenusEjecutivos()
  }

  function getEstadoMargen(foodCost: number, fcObjetivo: number): 'ok' | 'warning' | 'danger' {
    if (foodCost <= fcObjetivo) return 'ok'
    if (foodCost <= fcObjetivo + 5) return 'warning'
    return 'danger'
  }

  function handleStartEditMenu(menu: MenuEjecutivo) {
    setEditingMenuId(menu.id)
    setEditMenuPrecio(menu.precio_carta?.toString() || '0')
    setEditMenuMargen(menu.margen_objetivo?.toString() || '30')
  }

  function handleCancelEditMenu() {
    setEditingMenuId(null)
    setEditMenuPrecio('')
    setEditMenuMargen('')
  }

  async function handleSaveEditMenu(menu: MenuEjecutivo) {
    setIsSavingMenu(true)
    const precio = parsearNumero(editMenuPrecio)
    const margen = parsearNumero(editMenuMargen) || 30
    const precioSugerido = calcularPrecioSugerido(menu.costo_total, margen)
    const foodCost = calcularFoodCost(menu.costo_total, precio)
    const { error } = await supabase
      .from('menus_ejecutivos')
      .update({ precio_carta: precio, margen_objetivo: margen, precio_sugerido: precioSugerido, food_cost_real: foodCost })
      .eq('id', menu.id)
    if (!error) { handleCancelEditMenu(); fetchMenusEjecutivos() }
    setIsSavingMenu(false)
  }

  // ============ FUNCIONES MENÚS ESPECIALES ============
  async function fetchMenusEspeciales() {
    setIsLoadingEsp(true)
    const { data: insumosData } = await supabase.from('v_insumos_con_precio').select('id, precio_actual, iva_porcentaje, merma_porcentaje')
    const { data: recetasBaseData } = await supabase.from('recetas_base').select('id, rendimiento_porciones, receta_base_ingredientes (insumo_id, cantidad)').eq('activo', true)

    function getCostoFinalInsumoEsp(insumoId: string): number {
      const insumo = insumosData?.find(i => i.id === insumoId)
      if (!insumo || !insumo.precio_actual) return 0
      return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
    }
    function getCostoPorcionReceta(recetaBaseId: string): number {
      const receta = recetasBaseData?.find((r: any) => r.id === recetaBaseId)
      if (!receta) return 0
      let costoTotal = 0
      for (const ing of (receta as any).receta_base_ingredientes || []) {
        costoTotal += ing.cantidad * getCostoFinalInsumoEsp(ing.insumo_id)
      }
      return (receta as any).rendimiento_porciones > 0 ? costoTotal / (receta as any).rendimiento_porciones : 0
    }

    const { data: platosData } = await supabase.from('platos').select('id, rendimiento_porciones, plato_ingredientes (insumo_id, receta_base_id, cantidad)').eq('activo', true)
    const platoCostosMap = new Map<string, number>()
    for (const plato of (platosData || []) as any[]) {
      let costoReceta = 0
      for (const ing of plato.plato_ingredientes || []) {
        if (ing.insumo_id) costoReceta += ing.cantidad * getCostoFinalInsumoEsp(ing.insumo_id)
        else if (ing.receta_base_id) costoReceta += ing.cantidad * getCostoPorcionReceta(ing.receta_base_id)
      }
      platoCostosMap.set(plato.id, costoReceta / (plato.rendimiento_porciones > 0 ? plato.rendimiento_porciones : 1))
    }

    const { data: bebidasData } = await supabase.from('insumos').select('id').eq('activo', true).eq('categoria', 'Bebidas')
    const bebidasPreciosMap = new Map<string, number>()
    if (bebidasData) {
      await Promise.all(bebidasData.map(async (b) => {
        const { data: precioData } = await supabase.from('precios_insumo').select('precio').eq('insumo_id', b.id).order('fecha', { ascending: false }).limit(1).single()
        bebidasPreciosMap.set(b.id, precioData?.precio || 0)
      }))
    }

    const { data, error } = await supabase.from('menus_especiales').select('*, menu_especial_opciones (id, tipo_opcion, plato_id, insumo_id)').eq('activo', true).order('nombre')
    if (!error) {
      const menusConCosto = (data || []).map((menu: any) => {
        const cantidades: Record<string, number> = { Entradas: menu.cantidad_entradas || 1, Principales: menu.cantidad_principales || 2, Postres: menu.cantidad_postres || 1, Bebidas: menu.cantidad_bebidas || 1 }
        const comensales = menu.comensales || 2
        const opcionesPorTipo: Record<string, { costo: number }[]> = { Entradas: [], Principales: [], Postres: [], Bebidas: [] }
        for (const opcion of menu.menu_especial_opciones || []) {
          const tipoNorm = normalizarTipoOpcion(opcion.tipo_opcion)
          let costo = 0
          if (opcion.plato_id) costo = platoCostosMap.get(opcion.plato_id) || 0
          else if (opcion.insumo_id) costo = bebidasPreciosMap.get(opcion.insumo_id) || 0
          if (!opcionesPorTipo[tipoNorm]) opcionesPorTipo[tipoNorm] = []
          opcionesPorTipo[tipoNorm].push({ costo })
        }
        let costoMenu = 0
        for (const seccion of ['Entradas', 'Principales', 'Postres', 'Bebidas']) {
          const opts = opcionesPorTipo[seccion]
          const cant = cantidades[seccion] || 0
          if (opts.length > 0 && cant > 0) costoMenu += (opts.reduce((sum, o) => sum + o.costo, 0) / opts.length) * cant
        }
        return { ...menu, costo_calculado: comensales > 0 ? costoMenu / comensales : 0 }
      })
      setMenusEspeciales(menusConCosto as MenuConOpciones[])
    }
    setIsLoadingEsp(false)
  }

  async function handleDeleteEsp(id: string) {
    if (!confirm('¿Eliminar este menú?')) return
    const { error } = await supabase.from('menus_especiales').update({ activo: false }).eq('id', id)
    if (!error) fetchMenusEspeciales()
  }

  function getEditValueEsp(menuId: string, field: 'margen' | 'precio', defaultValue: number) {
    return editValuesEsp[menuId]?.[field] !== undefined ? editValuesEsp[menuId][field] : defaultValue.toString()
  }
  function setEditValueEsp(menuId: string, field: 'margen' | 'precio', value: string) {
    setEditValuesEsp(prev => ({ ...prev, [menuId]: { ...prev[menuId], [field]: value } }))
  }
  async function handleSaveEsp(menuId: string, margenValue?: number, precioValue?: number) {
    const values = editValuesEsp[menuId]
    const margen = margenValue ?? (values ? parsearNumero(values.margen) : null)
    const precio = precioValue ?? (values ? parsearNumero(values.precio) : null)
    const updateData: any = {}
    if (margen !== null) updateData.margen_objetivo = margen
    if (precio !== null) updateData.precio_venta = precio
    if (Object.keys(updateData).length === 0) return
    const { error } = await supabase.from('menus_especiales').update(updateData).eq('id', menuId)
    if (!error) { setEditValuesEsp(prev => { const n = { ...prev }; delete n[menuId]; return n }); fetchMenusEspeciales() }
  }
  function handleBlurSaveEsp(menuId: string, field: 'margen' | 'precio', value: string, originalValue: number) {
    const numValue = parsearNumero(value)
    if (numValue !== originalValue) handleSaveEsp(menuId, field === 'margen' ? numValue : undefined, field === 'precio' ? numValue : undefined)
  }

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  // Agrupar items por sección según tab activa y búsqueda
  const itemsActuales = (tabActiva === 'en_carta' ? items : itemsFueraCarta)
    .filter(i => !busqueda || i.plato_nombre.toLowerCase().includes(busqueda.toLowerCase()))
  const itemsPorSeccion = SECCIONES_ORDEN
    .map(seccion => ({
      seccion,
      items: itemsActuales.filter(i => i.plato_seccion === seccion).sort((a, b) => a.plato_nombre.localeCompare(b.plato_nombre)),
    }))
    .filter(grupo => grupo.items.length > 0)

  // Preview al agregar
  const platoPreview = platosDisponibles.find(p => p.id === selectedPlato)
  const previewPrecio = parsearNumero(precioCartaNew)
  const previewMargen = parsearNumero(margenObjetivoNew) || 30
  const previewSugerido = platoPreview ? calcularPrecioSugerido(platoPreview.costo_total, previewMargen) : 0
  const previewFoodCost = platoPreview && previewPrecio > 0
    ? calcularFoodCost(platoPreview.costo_total, previewPrecio)
    : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Carta</h1>
          <p className="text-xs text-gray-600">
            {tabActiva === 'ejecutivos' ? 'Menús del día con composición directa' :
             tabActiva === 'especiales' ? 'Menús con opciones para eventos' :
             'Precios y análisis de food cost'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(tabActiva === 'en_carta' || tabActiva === 'fuera_carta') && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => generarPDFCarta(items, 'TERO')}
                disabled={items.length === 0}
                title="Descargar PDF de la carta"
              >
                <FileDown className="w-3.5 h-3.5 mr-1" />
                PDF
              </Button>
              <Button onClick={() => setIsModalOpen(true)} disabled={platosDisponibles.length === 0} size="sm">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Agregar
              </Button>
            </>
          )}
          {tabActiva === 'ejecutivos' && (
            <Link href="/menus-ejecutivos/nuevo">
              <Button size="sm">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nuevo Menú
              </Button>
            </Link>
          )}
          {tabActiva === 'especiales' && (
            <Link href="/menus-especiales/nuevo">
              <Button size="sm">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nuevo Menú
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Resumen - solo para tab En Carta */}
      {tabActiva === 'en_carta' && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="text-[10px] font-medium text-green-800">OK</span>
            </div>
            <p className="text-lg font-mono font-bold text-green-600 mt-0.5">
              {items.filter(i => i.estado_margen === 'ok').length}
            </p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-[10px] font-medium text-yellow-800">Atención</span>
            </div>
            <p className="text-lg font-mono font-bold text-yellow-600 mt-0.5">
              {items.filter(i => i.estado_margen === 'warning').length}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[10px] font-medium text-red-800">Fuera</span>
            </div>
            <p className="text-lg font-mono font-bold text-red-600 mt-0.5">
              {items.filter(i => i.estado_margen === 'danger').length}
            </p>
          </div>
        </div>
      )}

      {/* Tabs y Buscador */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex gap-1 border-b sm:border-b-0">
          <button
            onClick={() => setTabActiva('en_carta')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tabActiva === 'en_carta'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            En Carta (<span className="font-mono">{items.length}</span>)
          </button>
          <button
            onClick={() => setTabActiva('fuera_carta')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tabActiva === 'fuera_carta'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Fuera de Carta (<span className="font-mono">{itemsFueraCarta.length}</span>)
          </button>
          <button
            onClick={() => setTabActiva('ejecutivos')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
              tabActiva === 'ejecutivos'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <UtensilsCrossed className="w-3 h-3" />
            Ejecutivos (<span className="font-mono">{menusEjecutivos.length}</span>)
          </button>
          <button
            onClick={() => setTabActiva('especiales')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
              tabActiva === 'especiales'
                ? 'border-pink-500 text-pink-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            Especiales (<span className="font-mono">{menusEspeciales.length}</span>)
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar plato..."
            className="pl-9 pr-3 py-2 w-full sm:w-48 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Contenido Carta */}
      {(tabActiva === 'en_carta' || tabActiva === 'fuera_carta') && (
        isLoading ? (
          <div className="text-center py-6 text-xs">Cargando...</div>
        ) : itemsActuales.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border">
            <p className="text-xs text-gray-500">
              {tabActiva === 'en_carta' ? 'No hay platos en la carta' : 'No hay platos fuera de carta'}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              {tabActiva === 'en_carta'
                ? 'Agregá platos para ver el análisis de food cost'
                : 'Los platos que saques de la carta aparecerán aquí'}
            </p>
          </div>
        ) : (
        <>
          {/* Vista Móvil - Tarjetas */}
          <div className="lg:hidden space-y-3">
            {itemsPorSeccion.map((grupo) => (
              <div key={`mobile-seccion-${grupo.seccion}`}>
                <button
                  className="w-full flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg mb-2"
                  onClick={() => toggleSeccion(grupo.seccion)}
                >
                  {seccionesExpandidas.has(grupo.seccion) ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    {grupo.seccion}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">({grupo.items.length})</span>
                </button>
                {seccionesExpandidas.has(grupo.seccion) && (
                  <div className="space-y-2">
                    {grupo.items.map((item) => {
                      const IconComponent = getPlateIcon(item.plato_seccion, item.plato_nombre)
                      return (
                        <div
                          key={item.id}
                          className={`bg-white rounded-lg border p-3 ${item.estado_margen === 'danger' ? 'border-red-300 bg-red-50' : ''}`}
                        >
                          {/* Header del plato */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-orange-100 rounded">
                                <IconComponent className="w-4 h-4 text-orange-600" />
                              </div>
                              <div>
                                <button
                                  onClick={() => handleVerReceta(item.plato_id)}
                                  className="text-sm font-medium text-gray-900 hover:text-primary-600 hover:underline text-left flex items-center gap-1"
                                >
                                  {item.plato_nombre}
                                  <Eye className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                                </button>
                                <p className="text-[10px] text-gray-400">
                                  {item.plato_dias_actualizacion === 0
                                    ? 'Actualizado hoy'
                                    : item.plato_dias_actualizacion === 1
                                    ? 'Hace 1 día'
                                    : item.plato_dias_actualizacion > 0
                                    ? <>Hace <span className="font-mono">{item.plato_dias_actualizacion}</span> días</>
                                    : ''}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleToggleEnCarta(item.id, tabActiva !== 'en_carta')}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                tabActiva === 'en_carta' ? 'bg-primary-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                  tabActiva === 'en_carta' ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Datos en grid */}
                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] text-gray-500">Precio Carta</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editPrecio}
                                    onChange={(e) => setEditPrecio(e.target.value)}
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500">Margen Obj %</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editMargen}
                                    onChange={(e) => setEditMargen(e.target.value)}
                                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button variant="secondary" size="sm" onClick={handleCancelEdit}>
                                  Cancelar
                                </Button>
                                <Button size="sm" onClick={() => handleSaveEdit(item)} disabled={isSaving}>
                                  <Save className="w-3.5 h-3.5 mr-1" />
                                  Guardar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-4 gap-2 text-center mb-2">
                                <div>
                                  <p className="text-[10px] text-gray-500">Costo</p>
                                  <p className="text-xs font-mono font-medium tabular-nums">${item.plato_costo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-500">Sugerido</p>
                                  <p className="text-xs font-mono text-gray-600 tabular-nums">${item.precio_sugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-500">Carta</p>
                                  <p className="text-xs font-mono font-semibold tabular-nums">${item.precio_carta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-500">Contrib.</p>
                                  <p className="text-xs font-mono font-semibold text-success tabular-nums">${(item.precio_carta - item.plato_costo).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t">
                                <div className="flex items-center gap-2">
                                  {getEstadoIcon(item.estado_margen)}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium ${getEstadoClass(item.estado_margen)}`}>
                                    FC: {item.food_cost_real.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] font-mono text-gray-500">Obj: {item.margen_objetivo}%</span>
                                </div>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => handleStartEdit(item)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleEliminar(item.id)}>
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
                )}
              </div>
            ))}
          </div>

          {/* Vista Desktop - Tabla */}
          <div className="hidden lg:block bg-white rounded-lg border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Plato</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">En Carta</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Sug.</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Carta</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">M.Obj</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">FC</th>
                  <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">Contrib.</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemsPorSeccion.map((grupo) => (
                  <Fragment key={`desktop-seccion-${grupo.seccion}`}>
                    <tr
                      className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => toggleSeccion(grupo.seccion)}
                    >
                      <td colSpan={9} className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {seccionesExpandidas.has(grupo.seccion) ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                          )}
                          <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                            {grupo.seccion}
                          </span>
                          <span className="text-[10px] font-mono text-gray-400">({grupo.items.length})</span>
                        </div>
                      </td>
                    </tr>
                    {seccionesExpandidas.has(grupo.seccion) && grupo.items.map((item) => {
                      const IconComponent = getPlateIcon(item.plato_seccion, item.plato_nombre)
                      return (
                  <tr key={item.id} className={item.estado_margen === 'danger' ? 'bg-red-50' : ''}>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="p-1 bg-orange-100 rounded flex-shrink-0">
                          <IconComponent className="w-3 h-3 text-orange-600" />
                        </div>
                        <div>
                          <button
                            onClick={() => handleVerReceta(item.plato_id)}
                            className="text-xs font-medium text-gray-900 hover:text-primary-600 hover:underline text-left flex items-center gap-1 group"
                          >
                            {item.plato_nombre}
                            <Eye className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                          </button>
                          <p className="text-[9px] text-gray-400">
                            {item.plato_dias_actualizacion === 0
                              ? 'Hoy'
                              : item.plato_dias_actualizacion === 1
                              ? 'Hace 1 día'
                              : item.plato_dias_actualizacion > 0
                              ? <>Hace <span className="font-mono">{item.plato_dias_actualizacion}</span>d</>
                              : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleEnCarta(item.id, tabActiva !== 'en_carta')
                        }}
                        className={`relative inline-flex h-4 w-[30px] items-center rounded-full transition-colors ${
                          tabActiva === 'en_carta' ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                            tabActiva === 'en_carta' ? 'translate-x-[15px]' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] font-mono text-gray-600 tabular-nums">
                      <span className="text-gray-400">$</span>{item.plato_costo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] font-mono text-gray-500 tabular-nums">
                      <span className="text-gray-400">$</span>{item.precio_sugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {editingId === item.id ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editPrecio}
                          onChange={(e) => setEditPrecio(e.target.value)}
                          className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] font-mono text-right"
                        />
                      ) : (
                        <span className="text-xs font-mono font-medium tabular-nums">
                          <span className="text-gray-400 font-normal">$</span>{item.precio_carta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {editingId === item.id ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editMargen}
                          onChange={(e) => setEditMargen(e.target.value)}
                          className="w-12 rounded border border-gray-300 px-1 py-0.5 text-[11px] font-mono text-center"
                        />
                      ) : (
                        <span className="text-[11px] font-mono text-gray-600">{item.margen_objetivo}%</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getEstadoIcon(item.estado_margen)}
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${getEstadoClass(item.estado_margen)}`}>
                          {item.food_cost_real.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[11px] font-mono font-bold text-green-700 bg-green-50 tabular-nums">
                      <span className="text-green-500 font-normal">$</span>{(item.precio_carta - item.plato_costo).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        {editingId === item.id ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(item)} disabled={isSaving}>
                              <Save className="w-3.5 h-3.5 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                              <X className="w-3.5 h-3.5 text-gray-500" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleStartEdit(item)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleEliminar(item.id)}>
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                    )})}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
        )
      )}

      {/* ============ TAB EJECUTIVOS ============ */}
      {tabActiva === 'ejecutivos' && (
        isLoadingEjec ? (
          <div className="text-center py-6">Cargando...</div>
        ) : menusEjecutivos.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border">
            <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No hay menús ejecutivos registrados</p>
          </div>
        ) : (
          <>
            {/* Vista Móvil - Cards */}
            <div className="lg:hidden space-y-2">
              {menusEjecutivos.map((menu) => {
                const precioSugerido = calcularPrecioSugerido(menu.costo_total, menu.margen_objetivo || 30)
                const foodCost = calcularFoodCost(menu.costo_total, menu.precio_carta || 0)
                const estado = getEstadoMargen(foodCost, menu.margen_objetivo || 30)
                const contribucion = (menu.precio_carta || 0) - menu.costo_total
                return (
                  <div key={menu.id} className={`bg-white rounded-lg border p-3 ${estado === 'danger' ? 'border-red-300 bg-red-50' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-100 rounded-lg"><UtensilsCrossed className="w-4 h-4 text-teal-600" /></div>
                        <div>
                          <Link href={`/menus-ejecutivos/${menu.id}`}><p className="text-sm font-medium text-gray-900 hover:text-primary-600">{menu.nombre}</p></Link>
                          {menu.descripcion && <p className="text-xs text-gray-500 truncate max-w-[200px]">{menu.descripcion}</p>}
                        </div>
                      </div>
                    </div>
                    {editingMenuId === menu.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="text-[10px] text-gray-500">P.Carta</label><input type="text" inputMode="decimal" value={editMenuPrecio} onChange={(e) => setEditMenuPrecio(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono" /></div>
                          <div><label className="text-[10px] text-gray-500">M.Obj %</label><input type="text" inputMode="decimal" value={editMenuMargen} onChange={(e) => setEditMenuMargen(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono" /></div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={handleCancelEditMenu}>Cancelar</Button>
                          <Button size="sm" onClick={() => handleSaveEditMenu(menu)} disabled={isSavingMenu}><Save className="w-3 h-3 mr-1" />Guardar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-4 gap-1 text-center mb-2">
                          <div><p className="text-[10px] text-gray-500">Costo</p><p className="text-[11px] font-mono font-medium tabular-nums">{fmt(menu.costo_total)}</p></div>
                          <div><p className="text-[10px] text-gray-500">P.Sug.</p><p className="text-[11px] font-mono text-gray-600 tabular-nums">{fmt(precioSugerido)}</p></div>
                          <div><p className="text-[10px] text-gray-500">P.Carta</p><p className="text-[11px] font-mono font-bold tabular-nums">{fmt(menu.precio_carta || 0)}</p></div>
                          <div><p className="text-[10px] text-gray-500">Contrib.</p><p className={`text-[11px] font-mono font-bold tabular-nums ${contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(contribucion)}</p></div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="flex items-center gap-1.5">
                            {getEstadoIcon(estado)}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${getEstadoClass(estado)}`}>FC: {foodCost.toFixed(1)}%</span>
                            <span className="text-[10px] font-mono text-gray-500">Obj: {menu.margen_objetivo || 30}%</span>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleStartEditMenu(menu)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEjec(menu.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
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
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Menú</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Sug.</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Carta</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">M.Obj</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">FC</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">Contrib.</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {menusEjecutivos.map((menu) => {
                    const precioSugerido = calcularPrecioSugerido(menu.costo_total, menu.margen_objetivo || 30)
                    const foodCost = calcularFoodCost(menu.costo_total, menu.precio_carta || 0)
                    const estado = getEstadoMargen(foodCost, menu.margen_objetivo || 30)
                    const contribucion = (menu.precio_carta || 0) - menu.costo_total
                    return (
                      <tr key={menu.id} className={`hover:bg-gray-50 ${estado === 'danger' ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-teal-100 rounded-lg"><UtensilsCrossed className="w-4 h-4 text-teal-600" /></div>
                            <div>
                              <Link href={`/menus-ejecutivos/${menu.id}`}><p className="text-sm font-medium text-gray-900 hover:text-primary-600">{menu.nombre}</p></Link>
                              {menu.descripcion && <p className="text-xs text-gray-500 truncate max-w-xs">{menu.descripcion}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right"><span className="text-xs font-mono font-medium text-green-600 tabular-nums">{fmt(menu.costo_total)}</span></td>
                        <td className="px-2 py-2 text-right"><span className="text-xs font-mono text-gray-500 tabular-nums">{fmt(editingMenuId === menu.id ? calcularPrecioSugerido(menu.costo_total, parsearNumero(editMenuMargen) || 30) : precioSugerido)}</span></td>
                        <td className="px-2 py-2 text-right">
                          {editingMenuId === menu.id ? <input type="text" inputMode="decimal" value={editMenuPrecio} onChange={(e) => setEditMenuPrecio(e.target.value)} className="w-20 rounded border border-gray-300 px-1.5 py-0.5 text-xs font-mono text-right" /> : <span className="text-xs font-mono font-bold tabular-nums">{fmt(menu.precio_carta || 0)}</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {editingMenuId === menu.id ? <input type="text" inputMode="decimal" value={editMenuMargen} onChange={(e) => setEditMenuMargen(e.target.value)} className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs font-mono text-center" /> : <span className="text-xs font-mono text-gray-600">{menu.margen_objetivo || 30}%</span>}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getEstadoIcon(estado)}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${getEstadoClass(estado)}`}>{foodCost.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right bg-green-50"><span className={`text-xs font-mono font-bold tabular-nums ${contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(contribucion)}</span></td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1">
                            {editingMenuId === menu.id ? (
                              <><Button variant="ghost" size="sm" onClick={handleCancelEditMenu}><X className="w-3.5 h-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => handleSaveEditMenu(menu)} disabled={isSavingMenu}><Save className="w-3.5 h-3.5 text-green-600" /></Button></>
                            ) : (
                              <><Button variant="ghost" size="sm" onClick={() => handleStartEditMenu(menu)}><Pencil className="w-3.5 h-3.5" /></Button><Button variant="ghost" size="sm" onClick={() => handleDeleteEjec(menu.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></>
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
      {tabActiva === 'especiales' && (
        isLoadingEsp ? (
          <div className="text-center py-6">Cargando...</div>
        ) : menusEspeciales.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border">
            <LayoutGrid className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No hay menús especiales registrados</p>
            <Link href="/menus-especiales/nuevo"><Button className="mt-3"><Plus className="w-3.5 h-3.5 mr-1.5" />Crear primer menú</Button></Link>
          </div>
        ) : (
          <div className="grid gap-3">
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
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-pink-100 rounded-lg"><LayoutGrid className="w-4 h-4 text-pink-600" /></div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{menu.nombre}</h3>
                        {menu.descripcion && <p className="text-xs text-gray-500">{menu.descripcion}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5"><span className="font-mono">{menu.menu_especial_opciones?.length || 0}</span> opciones • <span className="font-mono">{comensales}</span> comensales</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Link href={`/menus-especiales/${menu.id}`}><Button variant="ghost" size="sm" title="Ver / Editar"><Eye className="w-3.5 h-3.5" /></Button></Link>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteEsp(menu.id)} title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
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
                      <div className="border-t bg-gray-50 px-3 py-2 overflow-x-auto">
                        <table className="w-full min-w-[480px]">
                          <thead><tr className="text-[9px] text-gray-500 uppercase">
                            <th className="text-left font-medium">Costo Menú</th>
                            <th className="text-right font-medium">Costo x Pers.</th>
                            <th className="text-center font-medium">FC Obj.</th>
                            <th className="text-right font-medium">P.Sug.</th>
                            <th className="text-right font-medium">P.Venta</th>
                            <th className="text-center font-medium">FC Real</th>
                            <th className="text-right font-medium bg-green-50">Contrib.</th>
                            <th className="w-10"></th>
                          </tr></thead>
                          <tbody><tr>
                            <td className="py-1.5 text-left"><span className="text-[11px] font-mono text-gray-600"><span className="text-gray-400">$</span>{costoMenu.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span><span className="text-[9px] font-mono text-gray-400 ml-1">({comensales}p)</span></td>
                            <td className="py-1.5 text-right"><span className="text-xs font-mono font-bold text-green-600"><span className="text-green-400 font-normal">$</span>{costoPorPersona.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></td>
                            <td className="py-1.5 text-center"><div className="flex items-center justify-center gap-0.5"><input type="text" inputMode="decimal" value={getEditValueEsp(menu.id, 'margen', fcObjetivo)} onChange={(e) => setEditValueEsp(menu.id, 'margen', e.target.value)} onBlur={(e) => handleBlurSaveEsp(menu.id, 'margen', e.target.value, fcObjetivo)} className="w-10 px-1 py-0.5 border border-gray-300 rounded text-center text-[11px] font-mono" /><span className="text-[9px] font-mono text-gray-400">%</span></div></td>
                            <td className="py-1.5 text-right"><span className="text-[11px] font-mono text-blue-600 font-medium"><span className="text-blue-400">$</span>{currentPrecioSugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></td>
                            <td className="py-1.5 text-right"><div className="flex items-center justify-end gap-0.5"><span className="text-[9px] font-mono text-gray-400">$</span><input type="text" value={Number(getEditValueEsp(menu.id, 'precio', precioVenta) || 0).toLocaleString('es-AR')} onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); setEditValueEsp(menu.id, 'precio', raw) }} onBlur={(e) => { const raw = e.target.value.replace(/\D/g, ''); handleBlurSaveEsp(menu.id, 'precio', raw, precioVenta) }} className="w-16 px-1 py-0.5 border border-gray-300 rounded text-right text-[11px] font-mono" placeholder="0" /></div></td>
                            <td className="py-1.5 text-center">{currentPrecio > 0 ? <span className={`inline-flex items-center px-1 py-0.5 rounded-full text-[9px] font-mono font-medium ${isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{currentFcReal.toFixed(1)}%</span> : <span className="text-gray-400 text-[11px]">—</span>}</td>
                            <td className="py-1.5 text-right bg-green-50">{currentPrecio > 0 ? <span className="text-[11px] font-mono font-bold text-green-700"><span className="text-green-500 font-normal">$</span>{currentContrib.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span> : <span className="text-gray-400 text-[11px]">—</span>}</td>
                            <td className="py-1.5 text-right">{hasChanges && <Button variant="ghost" size="sm" onClick={() => handleSaveEsp(menu.id)} title="Guardar cambios"><Save className="w-3 h-3 text-green-600" /></Button>}</td>
                          </tr></tbody>
                        </table>
                      </div>
                    )
                  })()}
                  {/* Calculadora */}
                  <div className="border-t bg-gradient-to-r from-pink-50 to-purple-50 px-3 py-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Calculator className="w-3.5 h-3.5 text-pink-500" />
                        <Users className="w-3.5 h-3.5 text-gray-500" />
                        <Input type="number" value={calculadora?.menuId === menu.id ? calculadora.personas : ''} onChange={(e) => setCalculadora({ menuId: menu.id, personas: e.target.value })} placeholder="Cant." className="w-16 text-xs font-mono" />
                        <span className="text-xs text-gray-600">personas</span>
                      </div>
                      {personas > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs">→</span>
                          <span className="text-xs text-gray-600">Costo: <span className="font-mono font-bold text-green-600">${costoTotalEvento.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></span>
                          {precioVenta > 0 && (<><span className="text-gray-400">|</span><span className="text-xs text-gray-600">Ingreso: <span className="font-mono font-bold text-purple-600">${(precioVenta * personas).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></span></>)}
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

      {/* Modal Agregar */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar Plato a la Carta"
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Plato"
            options={[
              { value: '', label: 'Seleccionar plato...' },
              ...platosDisponibles.map(p => ({
                value: p.id,
                label: `${p.nombre} (costo: ${fmt(p.costo_total)})`
              }))
            ]}
            value={selectedPlato}
            onChange={(e) => {
              const platoId = e.target.value
              setSelectedPlato(platoId)
              // Autocompletar margen según sección del plato
              const plato = platosDisponibles.find(p => p.id === platoId)
              if (plato) {
                setMargenObjetivoNew(getMargenPorSeccion(plato.seccion).toString())
              }
            }}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Precio en Carta ($)"
              type="text"
              inputMode="decimal"
              value={precioCartaNew}
              onChange={(e) => setPrecioCartaNew(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Margen Objetivo (%)"
              type="text"
              inputMode="decimal"
              value={margenObjetivoNew}
              onChange={(e) => setMargenObjetivoNew(e.target.value)}
              placeholder="30"
            />
          </div>

          {/* Preview */}
          {platoPreview && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Costo del plato:</span>
                <span className="font-mono font-medium tabular-nums"><span className="text-gray-400 font-normal">$</span> {platoPreview.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Precio sugerido (para <span className="font-mono">{previewMargen}</span>% FC):</span>
                <span className="font-mono font-medium text-blue-600 tabular-nums"><span className="text-blue-400 font-normal">$</span> {previewSugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              </div>
              {previewPrecio > 0 && (
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-600">Food Cost resultante:</span>
                  <span className={`font-mono font-bold ${
                    previewFoodCost <= previewMargen ? 'text-green-600' :
                    previewFoodCost <= previewMargen * 1.1 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {previewFoodCost.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAgregar} disabled={isSaving || !selectedPlato || !precioCartaNew}>
              {isSaving ? 'Guardando...' : 'Agregar a Carta'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Preview Receta */}
      <Modal
        isOpen={previewPlato !== null}
        onClose={() => setPreviewPlato(null)}
        title={previewPlato?.nombre || 'Receta'}
        size="lg"
      >
        {isLoadingPreview ? (
          <div className="text-center py-8 text-gray-500">Cargando receta...</div>
        ) : previewPlato ? (
          <div className="space-y-4">
            {/* Header con sección y rendimiento */}
            <div className="flex items-center justify-between text-sm">
              <span className="px-2 py-1 bg-gray-100 rounded text-gray-600">{previewPlato.seccion}</span>
              <span className="text-gray-500">Rinde: <strong className="font-mono">{previewPlato.rendimiento}</strong> {previewPlato.rendimiento === 1 ? 'porción' : 'porciones'}</span>
            </div>

            {previewPlato.descripcion && (
              <p className="text-sm text-gray-600 italic">{previewPlato.descripcion}</p>
            )}

            {/* Tabla de ingredientes */}
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Ingrediente</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo Unit.</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {previewPlato.ingredientes.map((ing, idx) => (
                    <tr key={idx} className={ing.tipo === 'receta_base' ? 'bg-green-50' : ''}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {ing.tipo === 'receta_base' && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-green-200 text-green-800 rounded">ELAB</span>
                          )}
                          <span className="text-sm text-gray-900">{ing.nombre}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-600 tabular-nums">
                        {ing.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {ing.unidad}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-500 tabular-nums">
                        ${ing.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono font-medium text-gray-900 tabular-nums">
                        ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-sm font-medium text-gray-700">
                      Costo Total Receta:
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-mono font-bold text-gray-900 tabular-nums">
                      ${previewPlato.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                  {previewPlato.rendimiento > 1 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-sm font-medium text-gray-700">
                        Costo por Porción:
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono font-bold text-primary-600 tabular-nums">
                        ${previewPlato.costo_porcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Acciones */}
            <div className="flex justify-between items-center pt-4 border-t">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(`/platos/${previewPlato.id}`, '_blank')}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                Abrir en Recetas
              </Button>
              <Button variant="secondary" onClick={() => setPreviewPlato(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
