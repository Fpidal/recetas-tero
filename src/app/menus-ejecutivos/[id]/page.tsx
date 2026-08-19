'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Package, BookOpen, ChefHat } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PALETA, aclarar } from '@/lib/colores'
import { supabase } from '@/lib/supabase'
import { costoFinalInsumo } from '@/lib/costos'
import { Button, Input, Select } from '@/components/ui'
import { parsearNumero, formatearInputNumero } from '@/lib/formato-numeros'

interface Insumo {
  id: string
  nombre: string
  unidad_medida: string
  categoria: string
  precio_actual: number | null
  iva_porcentaje: number
  merma_porcentaje: number
}

interface RecetaBase {
  id: string
  nombre: string
  costo_total: number
  costo_por_porcion: number
  rendimiento_porciones: number
}

interface RecetaIngrediente {
  insumo_id: string
  cantidad: number
}

interface Plato {
  id: string
  nombre: string
  costo_total: number
  seccion: string
}

interface ItemMenu {
  id: string
  tipo: 'insumo' | 'receta_base' | 'plato'
  referencia_id: string
  nombre: string
  cantidad: number
  unidad: string
  costo_unitario: number
  costo_linea: number
  es_bebida: boolean
  /** Sección del plato (Entradas, Principales, Parrilla…). Solo para tipo 'plato'. */
  seccion?: string
  isNew?: boolean
}

export default function EditarMenuEjecutivoPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cubiertos, setCubiertos] = useState('1')
  const [items, setItems] = useState<ItemMenu[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isReadOnly, setIsReadOnly] = useState(false)

  // Datos para selectores
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetasBase, setRecetasBase] = useState<RecetaBase[]>([])
  const [platos, setPlatos] = useState<Plato[]>([])

  // Estado para agregar nuevo item
  const [nuevoTipo, setNuevoTipo] = useState<'insumo' | 'receta_base' | 'plato'>('insumo')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [nuevoReferenciaId, setNuevoReferenciaId] = useState('')
  const [nuevoCantidad, setNuevoCantidad] = useState('')
  const [nuevoEsBebida, setNuevoEsBebida] = useState(false)

  // Estado para edición inline de cantidades
  const [cantidadEdicion, setCantidadEdicion] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchData()
  }, [id])

  // Función para calcular el costo real de una elaboración (igual que en recetas-base)
  async function calcularCostoRealRecetaBase(recetaId: string, rendimiento: number): Promise<number> {
    // Obtener ingredientes de la receta
    const { data: ingredientes } = await supabase
      .from('receta_base_ingredientes')
      .select('insumo_id, cantidad')
      .eq('receta_base_id', recetaId)

    if (!ingredientes || ingredientes.length === 0) return 0

    // Obtener precios actuales de los insumos
    const insumoIds = ingredientes.map(i => i.insumo_id)
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')
      .in('id', insumoIds)

    if (!insumosData) return 0

    // Calcular costo total aplicando IVA y merma
    let costoTotal = 0
    for (const ing of ingredientes) {
      const insumo = insumosData.find(i => i.id === ing.insumo_id)
      if (insumo && insumo.precio_actual !== null) {
        const costoFinal = costoFinalInsumo(insumo.precio_actual, insumo.iva_porcentaje, insumo.merma_porcentaje)
        costoTotal += ing.cantidad * costoFinal
      }
    }

    return rendimiento > 0 ? costoTotal / rendimiento : costoTotal
  }

  async function fetchData() {
    setIsLoading(true)

    // Cargar opciones - usar v_insumos_con_precio para tener precios actuales
    const [insumosRes, recetasRes, platosRes, recetaIngredientesRes, platoIngredientesRes] = await Promise.all([
      supabase.from('v_insumos_con_precio').select('id, nombre, unidad_medida, categoria, precio_actual, iva_porcentaje, merma_porcentaje').eq('activo', true).order('nombre'),
      supabase.from('recetas_base').select('id, nombre, costo_total, costo_por_porcion, rendimiento_porciones').eq('activo', true).order('nombre'),
      supabase.from('platos').select('id, nombre, costo_total, seccion').eq('activo', true).order('nombre'),
      supabase.from('receta_base_ingredientes').select('receta_base_id, insumo_id, cantidad'),
      supabase.from('plato_ingredientes').select('plato_id, insumo_id, receta_base_id, cantidad'),
    ])

    const insumosData = insumosRes.data || []
    if (insumosData) setInsumos(insumosData)

    // Calcular costos actualizados de recetas base
    const recetasActualizadas = (recetasRes.data || []).map(receta => {
      const ingredientes = (recetaIngredientesRes.data || []).filter(i => i.receta_base_id === receta.id)
      let costoTotal = 0
      for (const ing of ingredientes) {
        const insumo = insumosData.find(i => i.id === ing.insumo_id)
        if (insumo && insumo.precio_actual !== null) {
          const costoFinal = costoFinalInsumo(insumo.precio_actual, insumo.iva_porcentaje, insumo.merma_porcentaje)
          costoTotal += ing.cantidad * costoFinal
        }
      }
      const costoPorPorcion = receta.rendimiento_porciones > 0 ? costoTotal / receta.rendimiento_porciones : costoTotal
      return { ...receta, costo_total: costoTotal, costo_por_porcion: costoPorPorcion }
    })
    setRecetasBase(recetasActualizadas)

    // Crear mapa de costos de recetas para usar en platos
    const recetaCostosMap = new Map(recetasActualizadas.map(r => [r.id, r.costo_por_porcion]))

    // Calcular costos actualizados de platos
    const platosActualizados = (platosRes.data || []).map(plato => {
      const ingredientes = (platoIngredientesRes.data || []).filter(i => i.plato_id === plato.id)
      let costoTotal = 0
      for (const ing of ingredientes) {
        if (ing.insumo_id) {
          const insumo = insumosData.find(i => i.id === ing.insumo_id)
          if (insumo && insumo.precio_actual !== null) {
            const costoFinal = costoFinalInsumo(insumo.precio_actual, insumo.iva_porcentaje, insumo.merma_porcentaje)
            costoTotal += ing.cantidad * costoFinal
          }
        } else if (ing.receta_base_id) {
          const costoReceta = recetaCostosMap.get(ing.receta_base_id) || 0
          costoTotal += ing.cantidad * costoReceta
        }
      }
      return { ...plato, costo_total: costoTotal }
    })
    setPlatos(platosActualizados)

    // Crear mapa de costos de platos para usar en items
    const platoCostosMap = new Map(platosActualizados.map(p => [p.id, p.costo_total]))

    // Cargar menú
    const { data: menu, error } = await supabase
      .from('menus_ejecutivos')
      .select(`
        id, nombre, descripcion, costo_total, activo, cubiertos,
        menu_ejecutivo_items (
          id, tipo, insumo_id, receta_base_id, plato_id, cantidad, es_bebida, costo_linea,
          insumos (nombre, unidad_medida),
          recetas_base (nombre, costo_total, costo_por_porcion, rendimiento_porciones),
          platos (nombre, costo_total, seccion)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !menu) {
      alert('Menú no encontrado')
      router.push('/menus-ejecutivos')
      return
    }

    setNombre(menu.nombre)
    setDescripcion(menu.descripcion || '')
    setCubiertos(String(menu.cubiertos ?? 1).replace('.', ','))
    setIsReadOnly(menu.activo === false)

    // Mapear items - calcular costos reales para elaboraciones
    const mappedItemsPromises = (menu.menu_ejecutivo_items as any[]).map(async (item: any) => {
      let tipo: 'insumo' | 'receta_base' | 'plato' = item.tipo || 'insumo'
      let referencia_id = ''
      let nombreItem = ''
      let unidad = ''
      let costoUnitario = 0

      if (item.insumo_id && item.insumos) {
        tipo = 'insumo'
        referencia_id = item.insumo_id
        nombreItem = item.insumos.nombre
        unidad = item.insumos.unidad_medida
        // Buscar precio actual del insumo
        const insumoActual = insumosRes.data?.find(i => i.id === item.insumo_id)
        if (insumoActual && insumoActual.precio_actual !== null) {
          costoUnitario = costoFinalInsumo(insumoActual.precio_actual, insumoActual.iva_porcentaje, insumoActual.merma_porcentaje)
        } else {
          costoUnitario = item.costo_linea / item.cantidad
        }
      } else if (item.receta_base_id && item.recetas_base) {
        tipo = 'receta_base'
        referencia_id = item.receta_base_id
        nombreItem = item.recetas_base.nombre
        unidad = 'porción'
        // Calcular costo real de la elaboración (igual que en recetas-base)
        costoUnitario = await calcularCostoRealRecetaBase(
          item.receta_base_id,
          item.recetas_base.rendimiento_porciones || 1
        )
      } else if (item.plato_id && item.platos) {
        tipo = 'plato'
        referencia_id = item.plato_id
        nombreItem = item.platos.nombre
        unidad = 'porción'
        // Usar costo actualizado del plato
        costoUnitario = platoCostosMap.get(item.plato_id) || item.platos.costo_total
      }

      const cantidad = Number(item.cantidad) || 0  // NO usar parsearNumero para datos de DB
      return {
        id: item.id,
        tipo,
        referencia_id,
        nombre: nombreItem,
        cantidad,
        unidad,
        costo_unitario: costoUnitario,
        costo_linea: cantidad * costoUnitario,
        es_bebida: item.es_bebida,
        seccion: item.platos?.seccion,
      }
    })

    const mappedItems = await Promise.all(mappedItemsPromises)
    setItems(mappedItems)
    setIsLoading(false)
  }

  // Obtener costo final del insumo aplicando IVA y merma
  function getCostoFinalInsumo(insumo: Insumo): number {
    if (insumo.precio_actual === null) return 0
    return costoFinalInsumo(insumo.precio_actual, insumo.iva_porcentaje, insumo.merma_porcentaje)
  }

  // Insumos filtrados por categoría
  const insumosFiltrados = filtroCategoria
    ? insumos.filter(i => i.categoria === filtroCategoria)
    : insumos

  const referenciaOptions = useMemo(() => {
    if (nuevoTipo === 'insumo') {
      const lista = filtroCategoria ? insumosFiltrados : insumos
      return [
        { value: '', label: 'Seleccionar insumo...' },
        ...lista.map(i => ({ value: i.id, label: `${i.nombre} (${i.unidad_medida})` }))
      ]
    } else if (nuevoTipo === 'receta_base') {
      return [
        { value: '', label: 'Seleccionar elaboración...' },
        ...recetasBase.map(r => ({ value: r.id, label: `${r.nombre} ($${(r.costo_por_porcion || 0).toFixed(0)}/porción)` }))
      ]
    } else {
      return [
        { value: '', label: 'Seleccionar plato...' },
        ...platos.map(p => ({ value: p.id, label: `${p.nombre} ($${p.costo_total.toFixed(0)})` }))
      ]
    }
  }, [nuevoTipo, insumos, insumosFiltrados, filtroCategoria, recetasBase, platos])

  async function handleAgregarItem() {
    if (!nuevoReferenciaId || !nuevoCantidad) return

    const cantidad = parsearNumero(nuevoCantidad)
    if (cantidad <= 0) return

    let nombreItem = ''
    let unidad = ''
    let costoUnitario = 0

    if (nuevoTipo === 'insumo') {
      const insumo = insumos.find(i => i.id === nuevoReferenciaId)
      if (!insumo) return
      nombreItem = insumo.nombre
      unidad = insumo.unidad_medida
      // Usar costo con IVA y merma aplicados
      costoUnitario = getCostoFinalInsumo(insumo)
    } else if (nuevoTipo === 'receta_base') {
      const receta = recetasBase.find(r => r.id === nuevoReferenciaId)
      if (!receta) return
      nombreItem = receta.nombre
      unidad = 'porción'
      // Calcular costo real de la elaboración (igual que en recetas-base)
      costoUnitario = await calcularCostoRealRecetaBase(receta.id, receta.rendimiento_porciones || 1)
    } else {
      const plato = platos.find(p => p.id === nuevoReferenciaId)
      if (!plato) return
      nombreItem = plato.nombre
      unidad = 'porción'
      costoUnitario = plato.costo_total
    }

    const nuevoItem: ItemMenu = {
      id: crypto.randomUUID(),
      tipo: nuevoTipo,
      referencia_id: nuevoReferenciaId,
      nombre: nombreItem,
      cantidad,
      unidad,
      costo_unitario: costoUnitario,
      costo_linea: cantidad * costoUnitario,
      es_bebida: nuevoEsBebida,
      isNew: true,
    }

    setItems([...items, nuevoItem])
    setNuevoReferenciaId('')
    setNuevoCantidad('')
    setNuevoEsBebida(false)
  }

  function handleEliminarItem(itemId: string) {
    setItems(items.filter(i => i.id !== itemId))
  }

  // Funciones para edición inline de cantidad
  function handleCantidadChange(itemId: string, value: string) {
    setCantidadEdicion(prev => ({ ...prev, [itemId]: value }))
  }

  function handleCantidadBlur(itemId: string) {
    const valorStr = cantidadEdicion[itemId]
    if (valorStr === undefined) return

    const cantidad = parsearNumero(valorStr)
    if (cantidad > 0) {
      setItems(items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            cantidad,
            costo_linea: cantidad * item.costo_unitario
          }
        }
        return item
      }))
    }
    // Limpiar el estado de edición
    setCantidadEdicion(prev => {
      const nuevo = { ...prev }
      delete nuevo[itemId]
      return nuevo
    })
  }

  const costoTotal = items.reduce((sum, item) => sum + item.costo_linea, 0)

  /**
   * Qué papel juega cada componente dentro del menú.
   *
   * DOS COSAS QUE NO SON OBVIAS:
   *
   * 1. `es_bebida` es un checkbox manual que arranca desmarcado, así que está
   *    puesto en unos menús y en otros no — el mismo "Bebidas menu" figura
   *    marcado en el de paella y sin marcar en el del salmón. Se respeta cuando
   *    está, y si no se cae al nombre.
   *
   * 2. No todo componente es un plato. Una parrillada se arma con insumos
   *    sueltos (asado, chorizo, panceta, papas) que SON el plato fuerte del
   *    menú. Mandarlos a un cajón "Otro" dejaba el 94% de la torta en gris sin
   *    decir nada. Solo hay tres papeles posibles, y por descarte se es
   *    principal: los menús son entrada + principal + bebida, no llevan postre.
   */
  function papelDe(item: ItemMenu): 'Bebida' | 'Entrada' | 'Principal' {
    if (item.es_bebida || /bebida/i.test(item.nombre)) return 'Bebida'
    if (item.tipo === 'plato' && item.seccion === 'Entradas') return 'Entrada'
    return 'Principal'
  }

  const COLOR_PAPEL: Record<string, string> = {
    Principal: PALETA.terracotta,
    Entrada: PALETA.olive,
    Bebida: PALETA.info,
  }

  // Una porción por componente, ordenadas de mayor a menor: lo primero que se
  // ve es lo que manda el costo del menú.
  const porcionesTorta = (() => {
    const base = items
      .filter((i) => i.costo_linea > 0)
      .map((i) => ({
        name: i.nombre,
        value: i.costo_linea,
        papel: papelDe(i),
        porcentaje: costoTotal > 0 ? (i.costo_linea / costoTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)

    // Mismo papel = mismo tono, pero cada porción un poco más clara que la
    // anterior. Sin esto una parrillada de siete cortes sale como un círculo
    // liso: todos son principal y todos del mismo color exacto.
    const vistos: Record<string, number> = {}
    return base.map((p) => {
      const n = vistos[p.papel] ?? 0
      vistos[p.papel] = n + 1
      return { ...p, color: aclarar(COLOR_PAPEL[p.papel], Math.min(n * 0.14, 0.62)) }
    })
  })()

  const dominante = porcionesTorta[0]

  async function handleGuardar() {
    if (!nombre.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    if (items.length === 0) {
      alert('Agregá al menos un item al menú')
      return
    }

    setIsSaving(true)

    // Actualizar menú
    const { error: menuError } = await supabase
      .from('menus_ejecutivos')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        cubiertos: Math.max(parsearNumero(cubiertos) || 1, 0.5),
        costo_total: costoTotal,
      })
      .eq('id', id)

    if (menuError) {
      console.error('Error actualizando menú:', menuError)
      alert('Error al actualizar el menú')
      setIsSaving(false)
      return
    }

    // Eliminar items existentes y crear nuevos
    await supabase.from('menu_ejecutivo_items').delete().eq('menu_ejecutivo_id', id)

    const itemsToInsert = items.map(item => ({
      menu_ejecutivo_id: id,
      tipo: item.tipo,
      insumo_id: item.tipo === 'insumo' ? item.referencia_id : null,
      receta_base_id: item.tipo === 'receta_base' ? item.referencia_id : null,
      plato_id: item.tipo === 'plato' ? item.referencia_id : null,
      cantidad: item.cantidad,
      es_bebida: item.es_bebida,
      costo_linea: item.costo_linea,
    }))

    const { error: itemsError } = await supabase
      .from('menu_ejecutivo_items')
      .insert(itemsToInsert)

    if (itemsError) {
      console.error('Error creando items:', itemsError)
      alert('Error al actualizar los items del menú')
      setIsSaving(false)
      return
    }

    router.push('/menus-ejecutivos')
  }

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'insumo': return <Package className="w-4 h-4 text-green-600" />
      case 'receta_base': return <BookOpen className="w-4 h-4 text-purple-600" />
      case 'plato': return <ChefHat className="w-4 h-4 text-orange-600" />
      default: return null
    }
  }

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'insumo': return 'Insumo'
      case 'receta_base': return 'Elaboración'
      case 'plato': return 'Receta'
      default: return tipo
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.push('/carta?tab=ejecutivos')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1>
            {isReadOnly ? 'Ver Menú Ejecutivo' : 'Editar Menú Ejecutivo'}
          </h1>
          {isReadOnly ? (
            <span className="text-xs text-red-500">En papelera</span>
          ) : (
            <p className="text-gray-600">Modificá el menú con insumos, recetas base y platos</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Datos básicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre del Menú"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Menú del día - Lunes"
            required
          />
          <Input
            label="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Entrada + Principal + Postre"
          />
        </div>

        {/* Cubiertos: sin esto, un menú para dos aparece con el doble de
            contribución que uno individual y ensucia el ranking de su sección. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="¿Para cuántas personas?"
              value={cubiertos}
              onChange={(e) => setCubiertos(formatearInputNumero(e.target.value))}
              className="font-mono"
              placeholder="1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Dejá <span className="font-mono">1</span> si es individual. Poné{' '}
              <span className="font-mono">2</span> en una parrillada para dos: se usa para
              comparar el menú contra los platos de la carta persona por persona.
            </p>
          </div>
          {parsearNumero(cubiertos) > 1 && costoTotal > 0 && (
            <div className="self-start bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Por persona</div>
              <div className="font-mono text-lg font-semibold text-gray-900">
                ${Math.round(costoTotal / parsearNumero(cubiertos)).toLocaleString('es-AR')}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                de costo · el total es{' '}
                <span className="font-mono">${Math.round(costoTotal).toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Agregar items */}
        {!isReadOnly && (
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Agregar Componentes</h3>

          {/* Botones Tab de tipo */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => { setNuevoTipo('insumo'); setNuevoReferenciaId(''); setFiltroCategoria('') }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                nuevoTipo === 'insumo'
                  ? 'bg-green-100 text-green-800 border-2 border-green-500'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <Package className="w-4 h-4" />
              Insumo
            </button>
            <button
              type="button"
              onClick={() => { setNuevoTipo('receta_base'); setNuevoReferenciaId(''); setFiltroCategoria('') }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                nuevoTipo === 'receta_base'
                  ? 'bg-purple-100 text-purple-800 border-2 border-purple-500'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Elaboración
            </button>
            <button
              type="button"
              onClick={() => { setNuevoTipo('plato'); setNuevoReferenciaId(''); setFiltroCategoria('') }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                nuevoTipo === 'plato'
                  ? 'bg-orange-100 text-orange-800 border-2 border-orange-500'
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              Plato
            </button>
          </div>

          {/* Selectores según tipo */}
          <div className="flex items-end gap-3 flex-wrap">
            {nuevoTipo === 'insumo' && (
              <div className="w-32">
                <Select
                  label="Categoría"
                  options={[
                    { value: '', label: 'Todas' },
                    { value: 'Carnes', label: 'Carnes' },
                    { value: 'Almacen', label: 'Almacén' },
                    { value: 'Verduras_Frutas', label: 'Verduras' },
                    { value: 'Pescados_Mariscos', label: 'Pescados' },
                    { value: 'Lacteos_Fiambres', label: 'Lácteos' },
                    { value: 'Bebidas', label: 'Bebidas' },
                  ]}
                  value={filtroCategoria}
                  onChange={(e) => { setFiltroCategoria(e.target.value); setNuevoReferenciaId('') }}
                />
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <Select
                label={nuevoTipo === 'insumo' ? 'Insumo' : nuevoTipo === 'receta_base' ? 'Elaboración' : 'Plato'}
                options={referenciaOptions}
                value={nuevoReferenciaId}
                onChange={(e) => setNuevoReferenciaId(e.target.value)}
              />
            </div>
            <div className="w-24">
              <Input
                label="Cantidad"
                type="text"
                inputMode="decimal"
                value={nuevoCantidad}
                onChange={(e) => setNuevoCantidad(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="esBebida"
                checked={nuevoEsBebida}
                onChange={(e) => setNuevoEsBebida(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="esBebida" className="text-sm text-gray-600">Bebida</label>
            </div>
            <Button onClick={handleAgregarItem} disabled={!nuevoReferenciaId || !nuevoCantidad}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>
        </div>
        )}

        {/* Lista de items */}
        {items.length > 0 && (
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Componentes del Menú</h3>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Unit.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Línea</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getTipoIcon(item.tipo)}
                          <span className="text-xs text-gray-500">{getTipoLabel(item.tipo)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{item.nombre}</span>
                        {item.es_bebida && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Bebida</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={cantidadEdicion[item.id] !== undefined
                              ? cantidadEdicion[item.id]
                              : item.cantidad.toString().replace('.', ',')}
                            onChange={(e) => handleCantidadChange(item.id, e.target.value)}
                            onBlur={() => handleCantidadBlur(item.id)}
                            className="w-16 text-right rounded border border-gray-300 px-1.5 py-0.5 text-sm"
                            disabled={isReadOnly}
                          />
                          <span>{item.unidad}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        ${item.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        ${item.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEliminarItem(item.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700">
                      Costo Total:
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                      ${costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Composición del costo — para qué sirve: en un menú de tres partes,
                casi siempre una se lleva la mayoría. Saber cuál evita tocar la
                bebida o la entrada creyendo que mueven el costo cuando no. */}
            {porcionesTorta.length > 1 && costoTotal > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-1">Composición del costo</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Cuánto pesa cada componente sobre los{' '}
                  <span className="font-mono">
                    ${costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>{' '}
                  del menú
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={porcionesTorta}
                        cx="50%"
                        cy="50%"
                        outerRadius={62}
                        innerRadius={30}
                        dataKey="value"
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {porcionesTorta.map((p, idx) => (
                          <Cell key={idx} fill={p.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, _n: any, props: any) =>
                          `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })} · ${props.payload.porcentaje.toFixed(1)}%`
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Referencia al costado: con nombres de plato, las etiquetas
                      sobre la torta se pisan entre sí. */}
                  <ul className="space-y-1.5">
                    {porcionesTorta.map((p, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-gray-700 truncate flex-1">{p.name}</span>
                        <span className="text-gray-400">{p.papel}</span>
                        <span className="font-mono font-medium text-gray-900 w-12 text-right">
                          {p.porcentaje.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {dominante && dominante.porcentaje >= 50 && (
                  <p className="text-xs text-gray-600 mt-3 bg-gray-50 border border-gray-100 rounded px-3 py-2">
                    <span className="font-medium">{dominante.name}</span> es el{' '}
                    <span className="font-mono">{dominante.porcentaje.toFixed(0)}%</span> del costo.
                    El resto de los componentes, juntos, no alcanzan a compensar un cambio de precio acá.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 border-t pt-6">
          <Button variant="secondary" onClick={() => router.push('/carta?tab=ejecutivos')}>
            {isReadOnly ? 'Volver' : 'Cancelar'}
          </Button>
          {!isReadOnly && (
            <Button onClick={handleGuardar} disabled={isSaving || !nombre.trim() || items.length === 0}>
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
