'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, Package, ChefHat, RefreshCw, FileDown, ClipboardList } from 'lucide-react'
import jsPDF from 'jspdf'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'

const CATEGORY_COLORS: Record<string, string> = {
  'Carnes': '#d98a8a',
  'Pescados_Mariscos': '#64b5f6',
  'Verduras_Frutas': '#ffd54f',
  'Lacteos_Fiambres': '#ffb74d',
  'Bebidas': '#4fc3f7',
  'Salsas_Recetas': '#81c784',
  'Almacen': '#bdbdbd',
}

interface Insumo {
  id: string
  nombre: string
  unidad_medida: string
  categoria: string
  precio_actual: number | null
  merma_porcentaje: number
  iva_porcentaje: number
  costo_final: number | null
}

interface RecetaBase {
  id: string
  nombre: string
  costo_por_porcion: number
}

interface Ingrediente {
  id: string
  tipo: 'insumo' | 'receta_base'
  item_id: string
  nombre: string
  unidad: string
  categoria: string
  cantidad: number
  costo_unitario: number // Costo final por unidad
  costo_linea: number
  isNew?: boolean
}

export default function EditarPlatoPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [seccion, setSeccion] = useState('Principales')
  const [descripcion, setDescripcion] = useState('')
  const [pasoAPaso, setPasoAPaso] = useState('')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [ingredientesOriginales, setIngredientesOriginales] = useState<string>('') // JSON para comparar
  const [ingredientesEliminados, setIngredientesEliminados] = useState<string[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [recetasBase, setRecetasBase] = useState<RecetaBase[]>([])
  const [tipoIngrediente, setTipoIngrediente] = useState<'insumo' | 'receta_base'>('insumo')
  const [selectedItem, setSelectedItem] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [rendimiento, setRendimiento] = useState(1)
  const [versionReceta, setVersionReceta] = useState('1.0')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    // Cargar insumos
    const { data: insumosRaw } = await supabase
      .from('v_insumos_con_precio')
      .select('id, nombre, unidad_medida, categoria, precio_actual, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)
      .order('nombre')

    // Calcular costo final para cada insumo
    const insumosData = (insumosRaw || []).map(insumo => ({
      ...insumo,
      costo_final: insumo.precio_actual !== null
        ? insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
        : null
    }))

    if (insumosData) setInsumos(insumosData)

    // Cargar recetas base con ingredientes para recalcular costo real
    const { data: recetasData } = await supabase
      .from('recetas_base')
      .select(`
        id, nombre, costo_por_porcion, rendimiento_porciones,
        receta_base_ingredientes (
          insumo_id,
          cantidad
        )
      `)
      .eq('activo', true)
      .order('nombre')

    // Recalcular costo_por_porcion desde precios actuales de insumos
    const recetasConCostoReal = (recetasData || []).map((r: any) => {
      let costoTotal = 0
      for (const ing of r.receta_base_ingredientes || []) {
        const insumo = insumosData?.find(i => i.id === ing.insumo_id)
        if (insumo?.costo_final) {
          costoTotal += ing.cantidad * insumo.costo_final
        }
      }
      const rendimiento = r.rendimiento_porciones > 0 ? r.rendimiento_porciones : 1
      return {
        id: r.id,
        nombre: r.nombre,
        costo_por_porcion: costoTotal > 0 ? costoTotal / rendimiento : r.costo_por_porcion,
      }
    })

    if (recetasConCostoReal) setRecetasBase(recetasConCostoReal)

    // Cargar plato
    const { data: plato, error: platoError } = await supabase
      .from('platos')
      .select('*')
      .eq('id', id)
      .single()

    if (platoError || !plato) {
      alert('Plato no encontrado')
      router.push('/platos')
      return
    }

    setNombre(plato.nombre)
    setSeccion(plato.seccion || 'Principales')
    setDescripcion(plato.descripcion || '')
    setPasoAPaso(plato.paso_a_paso || '')
    setRendimiento(plato.rendimiento_porciones || 1)
    setVersionReceta(plato.version_receta || '1.0')

    // Cargar ingredientes
    const { data: ingredientesData } = await supabase
      .from('plato_ingredientes')
      .select(`
        id,
        insumo_id,
        receta_base_id,
        cantidad,
        costo_linea,
        insumos (nombre, unidad_medida, categoria, merma_porcentaje),
        recetas_base (nombre, costo_por_porcion)
      `)
      .eq('plato_id', id)

    if (ingredientesData) {
      const mapped: Ingrediente[] = ingredientesData.map((ing: any) => {
        if (ing.insumo_id) {
          const insumoInfo = insumosData?.find(i => i.id === ing.insumo_id)
          const costoUnitario = insumoInfo?.costo_final || 0
          const cantidadNum = parseFloat(ing.cantidad)
          console.log(`[FORM] Insumo: ${ing.insumos?.nombre} | precio: ${insumoInfo?.precio_actual} | iva: ${insumoInfo?.iva_porcentaje}% | merma: ${insumoInfo?.merma_porcentaje}% | costo_final: ${costoUnitario} | cant: ${cantidadNum} | linea: ${cantidadNum * costoUnitario}`)
          return {
            id: ing.id,
            tipo: 'insumo' as const,
            item_id: ing.insumo_id,
            nombre: ing.insumos?.nombre || 'Desconocido',
            unidad: ing.insumos?.unidad_medida || '',
            categoria: insumoInfo?.categoria || ing.insumos?.categoria || 'Almacen',
            cantidad: cantidadNum,
            costo_unitario: costoUnitario,
            costo_linea: cantidadNum * costoUnitario,
          }
        } else {
          const recetaInfo = recetasConCostoReal?.find(r => r.id === ing.receta_base_id)
          const costoUnitario = recetaInfo?.costo_por_porcion || 0
          const cantidadNum = parseFloat(ing.cantidad)
          console.log(`[FORM] RecetaBase: ${ing.recetas_base?.nombre} | costo_porcion: ${costoUnitario} | cant: ${cantidadNum} | linea: ${cantidadNum * costoUnitario}`)
          return {
            id: ing.id,
            tipo: 'receta_base' as const,
            item_id: ing.receta_base_id,
            nombre: ing.recetas_base?.nombre || 'Desconocido',
            unidad: 'porción',
            categoria: 'Salsas_Recetas',
            cantidad: cantidadNum,
            costo_unitario: costoUnitario,
            costo_linea: cantidadNum * costoUnitario,
          }
        }
      })
      const total = mapped.reduce((s, i) => s + i.costo_linea, 0)
      console.log(`[FORM] === TOTAL: ${total} ===`)
      setIngredientes(mapped)
      // Guardar snapshot para detectar cambios
      setIngredientesOriginales(JSON.stringify(mapped.map(i => ({ id: i.item_id, tipo: i.tipo, cantidad: i.cantidad }))))
    }

    setIsLoading(false)
  }

  function calcularCostoLinea(costoUnitario: number, cantidad: number): number {
    return cantidad * costoUnitario
  }

  function handleAgregarIngrediente() {
    if (!selectedItem || !cantidad || parseFloat(cantidad) <= 0) {
      alert('Seleccioná un ingrediente y una cantidad válida')
      return
    }

    const yaExiste = ingredientes.some(
      ing => ing.item_id === selectedItem && ing.tipo === tipoIngrediente
    )
    if (yaExiste) {
      alert('Este ingrediente ya está en el plato')
      return
    }

    let nuevoIngrediente: Ingrediente

    if (tipoIngrediente === 'insumo') {
      const insumo = insumos.find(i => i.id === selectedItem)
      if (!insumo) return

      const costoUnitario = insumo.costo_final || 0
      const cantidadNum = parseFloat(cantidad)
      const costoLinea = calcularCostoLinea(costoUnitario, cantidadNum)

      nuevoIngrediente = {
        id: crypto.randomUUID(),
        tipo: 'insumo',
        item_id: insumo.id,
        nombre: insumo.nombre,
        unidad: insumo.unidad_medida,
        categoria: insumo.categoria,
        cantidad: cantidadNum,
        costo_unitario: costoUnitario,
        costo_linea: costoLinea,
        isNew: true,
      }
    } else {
      const receta = recetasBase.find(r => r.id === selectedItem)
      if (!receta) return

      const cantidadNum = parseFloat(cantidad)
      const costoUnitario = receta.costo_por_porcion
      const costoLinea = calcularCostoLinea(costoUnitario, cantidadNum)

      nuevoIngrediente = {
        id: crypto.randomUUID(),
        tipo: 'receta_base',
        item_id: receta.id,
        nombre: receta.nombre,
        unidad: 'porción',
        categoria: 'Salsas_Recetas',
        cantidad: cantidadNum,
        costo_unitario: costoUnitario,
        costo_linea: costoLinea,
        isNew: true,
      }
    }

    setIngredientes([...ingredientes, nuevoIngrediente])
    setSelectedItem('')
    setCantidad('')
  }

  function handleEliminarIngrediente(ing: Ingrediente) {
    if (!ing.isNew) {
      setIngredientesEliminados([...ingredientesEliminados, ing.id])
    }
    setIngredientes(ingredientes.filter(i => i.id !== ing.id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parseFloat(nuevaCantidad) || 0
    setIngredientes(ingredientes.map(ing => {
      if (ing.id === id) {
        return { ...ing, cantidad: cantidadNum, costo_linea: calcularCostoLinea(ing.costo_unitario, cantidadNum) }
      }
      return ing
    }))
  }

  async function handleRecalcularCostos() {
    const updated = ingredientes.map(ing => {
      if (ing.tipo === 'insumo') {
        const insumo = insumos.find(i => i.id === ing.item_id)
        const costoUnitario = insumo?.costo_final || 0
        return {
          ...ing,
          costo_unitario: costoUnitario,
          costo_linea: calcularCostoLinea(costoUnitario, ing.cantidad)
        }
      } else {
        const receta = recetasBase.find(r => r.id === ing.item_id)
        const costoUnitario = receta?.costo_por_porcion || 0
        return {
          ...ing,
          costo_unitario: costoUnitario,
          costo_linea: calcularCostoLinea(costoUnitario, ing.cantidad)
        }
      }
    })
    setIngredientes(updated)
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)

  async function handleGuardar() {
    if (!nombre.trim()) {
      alert('El nombre es requerido')
      return
    }

    if (ingredientes.length === 0) {
      alert('Agregá al menos un ingrediente')
      return
    }

    setIsSaving(true)

    // Detectar si hubo cambios en ingredientes (cantidad, agregados, eliminados)
    const ingredientesActuales = JSON.stringify(ingredientes.map(i => ({ id: i.item_id, tipo: i.tipo, cantidad: i.cantidad })))
    const huboCambios = ingredientesActuales !== ingredientesOriginales || ingredientesEliminados.length > 0

    // Auto-incrementar versión solo si hubo cambios en la receta
    const currentVersion = parseFloat(versionReceta) || 1.0
    const newVersion = huboCambios ? (currentVersion + 0.1).toFixed(1) : versionReceta

    // Actualizar plato
    const { error: platoError } = await supabase
      .from('platos')
      .update({
        nombre: nombre.trim(),
        seccion,
        descripcion: descripcion.trim() || null,
        paso_a_paso: pasoAPaso.trim() || null,
        rendimiento_porciones: rendimiento,
        version_receta: newVersion,
        costo_total: costoTotal,
      })
      .eq('id', id)

    if (platoError) {
      console.error('Error actualizando plato:', platoError)
      alert('Error al actualizar el plato')
      setIsSaving(false)
      return
    }

    // Eliminar ingredientes marcados
    if (ingredientesEliminados.length > 0) {
      await supabase
        .from('plato_ingredientes')
        .delete()
        .in('id', ingredientesEliminados)
    }

    // Actualizar ingredientes existentes
    for (const ing of ingredientes.filter(i => !i.isNew)) {
      await supabase
        .from('plato_ingredientes')
        .update({
          cantidad: ing.cantidad,
          costo_linea: ing.costo_linea,
        })
        .eq('id', ing.id)
    }

    // Insertar nuevos ingredientes
    const nuevos = ingredientes.filter(i => i.isNew)
    if (nuevos.length > 0) {
      await supabase
        .from('plato_ingredientes')
        .insert(nuevos.map(ing => ({
          plato_id: id,
          insumo_id: ing.tipo === 'insumo' ? ing.item_id : null,
          receta_base_id: ing.tipo === 'receta_base' ? ing.item_id : null,
          cantidad: ing.cantidad,
          costo_linea: ing.costo_linea,
        })))
    }

    // Actualizar carta si existe
    try { await supabase.rpc('recalcular_costo_plato', { p_plato_id: id }) } catch {}

    setIsSaving(false)
    router.push('/platos')
  }

  const opcionesItems = tipoIngrediente === 'insumo'
    ? insumos.map(i => ({
        value: i.id,
        label: `${i.nombre} (${i.unidad_medida}) - $${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
      }))
    : recetasBase.map(r => ({
        value: r.id,
        label: `${r.nombre} - $${r.costo_por_porcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}/porción`
      }))

  async function handleGenerarPDF() {
    // A6 vertical: 105 x 148 mm
    const doc = new jsPDF({ unit: 'mm', format: [105, 148] })
    const pageWidth = 105
    const pageHeight = 148
    const margin = 8
    const contentWidth = pageWidth - margin * 2
    const GREEN = [45, 59, 45] as const // #2D3B2D

    // Fondo papel y borde redondeado
    function drawPageFrame() {
      doc.setFillColor(245, 245, 240) // #F5F5F0
      doc.rect(0, 0, pageWidth, pageHeight, 'F')
      doc.setDrawColor(210, 210, 200)
      doc.setLineWidth(0.3)
      doc.roundedRect(3, 3, pageWidth - 6, pageHeight - 6, 3, 3, 'S')
    }

    function addNewPage() {
      doc.addPage([105, 148])
      drawPageFrame()
      return 10
    }

    // Formatear cantidad legible
    function formatCantidad(ing: Ingrediente): string {
      if (ing.cantidad <= 0) return 'c/n'
      const unidad = ing.unidad
      if (unidad === 'kg' && ing.cantidad < 1) {
        return `${Math.round(ing.cantidad * 1000)} g`
      }
      if (unidad === 'lt' && ing.cantidad < 1) {
        return `${Math.round(ing.cantidad * 1000)} ml`
      }
      const cantStr = ing.cantidad % 1 === 0
        ? ing.cantidad.toFixed(0)
        : ing.cantidad.toFixed(1).replace(/\.0$/, '').replace('.', ',')
      return `${cantStr} ${unidad}`
    }

    // Logo desde Supabase (pre-fetch)
    let logoDataUrl: string | null = null
    try {
      const { data: urlData } = supabase.storage.from('logo-tero').getPublicUrl('logo.png')
      if (urlData?.publicUrl) {
        const response = await fetch(urlData.publicUrl)
        if (response.ok) {
          const blob = await response.blob()
          logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        }
      }
    } catch {}

    // === PÁGINA 1 ===
    drawPageFrame()
    let y = 10

    // === HEADER: "Tero Restó" centrado, serif cursiva ===
    doc.setFont('times', 'bolditalic')
    doc.setFontSize(13)
    doc.setTextColor(...GREEN)
    doc.text('Tero Restó', pageWidth / 2, y, { align: 'center' })
    y += 4

    // Línea separadora fina
    doc.setDrawColor(180, 180, 170)
    doc.setLineWidth(0.2)
    doc.line(margin + 10, y, pageWidth - margin - 10, y)
    y += 6

    // === NOMBRE DEL PLATO: serif grande, centrado ===
    doc.setFont('times', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(30, 30, 30)
    const nombreLines = doc.splitTextToSize(nombre, contentWidth - 4)
    doc.text(nombreLines, pageWidth / 2, y, { align: 'center' })
    y += nombreLines.length * 5.5 + 3

    // === BADGE SECCIÓN ===
    const badgeText = seccion.toUpperCase()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    const badgeWidth = doc.getTextWidth(badgeText) + 8
    const badgeX = (pageWidth - badgeWidth) / 2
    doc.setFillColor(...GREEN)
    doc.roundedRect(badgeX, y - 2.5, badgeWidth, 5, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text(badgeText, pageWidth / 2, y + 0.8, { align: 'center' })
    y += 7

    // === INGREDIENTES ===
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...GREEN)
    doc.text('INGREDIENTES', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(120, 120, 120)
    doc.text('Cantidad', pageWidth - margin, y, { align: 'right' })
    y += 1.5

    doc.setDrawColor(180, 180, 170)
    doc.setLineWidth(0.15)
    doc.line(margin, y, pageWidth - margin, y)
    y += 3.5

    doc.setFontSize(7)

    for (const ing of ingredientes) {
      if (y > pageHeight - 25) { y = addNewPage() }
      // Nombre a la izquierda
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(40, 40, 40)
      doc.text(ing.nombre, margin + 1, y)
      // Cantidad a la derecha
      doc.setTextColor(80, 80, 80)
      doc.text(formatCantidad(ing), pageWidth - margin - 1, y, { align: 'right' })
      y += 3.5
    }

    y += 4

    // === PREPARACIÓN ===
    if (y > pageHeight - 20) { y = addNewPage() }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...GREEN)
    doc.text('PREPARACIÓN', margin, y)
    y += 1.5

    doc.setDrawColor(180, 180, 170)
    doc.setLineWidth(0.15)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4

    if (pasoAPaso.trim()) {
      const rawSteps = pasoAPaso.split(/\n/).filter(l => l.trim())
      let stepNum = 1

      for (const step of rawSteps) {
        if (y > pageHeight - 15) { y = addNewPage() }

        const cleanStep = step.replace(/^\d+[\.\)\-]\s*/, '').trim()
        if (!cleanStep) continue

        // Número en verde
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...GREEN)
        doc.text(`${stepNum}.`, margin + 1, y)

        // Texto del paso
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(40, 40, 40)
        const stepLines = doc.splitTextToSize(cleanStep, contentWidth - 7)
        doc.text(stepLines, margin + 6, y)
        y += stepLines.length * 2.8 + 1.5

        stepNum++
      }
    } else {
      doc.setDrawColor(210, 210, 200)
      for (let i = 0; i < 5; i++) {
        doc.line(margin + 1, y + i * 5, pageWidth - margin - 1, y + i * 5)
      }
    }

    // === FOOTER (todas las páginas) ===
    const totalPages = (doc as any).internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)

      // Línea separadora footer
      doc.setDrawColor(180, 180, 170)
      doc.setLineWidth(0.15)
      doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16)

      // Rinde y versión
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(120, 120, 120)
      const rindeText = `Rinde: ${rendimiento} plato${rendimiento !== 1 ? 's' : ''}  |  Versión receta: ${versionReceta}`
      doc.text(rindeText, margin, pageHeight - 12)

      // Última revisión
      const fecha = new Date().toLocaleDateString('es-AR')
      doc.text(`Última revisión: ${fecha}`, margin, pageHeight - 8.5)

      // Logo Tero
      if (logoDataUrl) {
        const logoSize = 8
        doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - logoSize, pageHeight - 16, logoSize, logoSize)
      } else {
        doc.setFont('times', 'bolditalic')
        doc.setFontSize(6)
        doc.setTextColor(...GREEN)
        doc.text('Tero Restó', pageWidth - margin, pageHeight - 10, { align: 'right' })
      }
    }

    doc.save(`Receta - ${nombre}.pdf`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl h-[calc(100vh-80px)] flex flex-col">
      {/* Header fijo */}
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Editar Plato</h1>
        </div>
        {/* Costo total en header */}
        {ingredientes.length > 0 && (
          <div className="bg-green-50 rounded-lg px-3 py-1 text-center">
            <p className="text-[10px] text-gray-500">Costo Total</p>
            <p className="text-lg font-bold text-green-600 tabular-nums">
              ${costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
        {/* Parte fija superior */}
        <div className="p-3 border-b bg-white">
          {/* Datos básicos - todo en una fila */}
          <div className="flex gap-2 mb-3">
            <div className="w-52">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ej: Bife de Chorizo"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-gray-700 mb-1">Sección</label>
              <select
                value={seccion}
                onChange={(e) => setSeccion(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="Entradas">Entradas</option>
                <option value="Principales">Principales</option>
                <option value="Pastas y Arroces">Pastas y Arroces</option>
                <option value="Ensaladas">Ensaladas</option>
                <option value="Postres">Postres</option>
              </select>
            </div>
            <div className="w-16">
              <label className="block text-xs font-medium text-gray-700 mb-1">Rinde</label>
              <input
                type="number"
                min="1"
                value={rendimiento.toString()}
                onChange={(e) => setRendimiento(parseInt(e.target.value) || 1)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Descripción opcional del plato..."
              />
            </div>
          </div>

          {/* Fila de agregar ingrediente + botones de acción */}
          <div className="flex gap-2 items-end">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { setTipoIngrediente('insumo'); setSelectedItem('') }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  tipoIngrediente === 'insumo'
                    ? 'bg-green-100 text-green-800 border border-green-500'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Package className="w-3 h-3" />
                Insumo
              </button>
              <button
                type="button"
                onClick={() => { setTipoIngrediente('receta_base'); setSelectedItem('') }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  tipoIngrediente === 'receta_base'
                    ? 'bg-purple-100 text-purple-800 border border-purple-500'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <ChefHat className="w-3 h-3" />
                Elaboración
              </button>
            </div>
            <div className="flex-1">
              <Select
                label={tipoIngrediente === 'insumo' ? 'Insumo' : 'Elaboración'}
                options={[
                  { value: '', label: 'Seleccionar...' },
                  ...opcionesItems
                ]}
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
              />
            </div>
            <div className="w-20">
              <Input
                label="Cant."
                type="number"
                step="0.001"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button onClick={handleAgregarIngrediente} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
            <div className="border-l pl-2 flex gap-1">
              <Button variant="secondary" size="sm" onClick={handleRecalcularCostos} title="Recalcular costos">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button variant="secondary" size="sm" onClick={handleGenerarPDF} disabled={ingredientes.length === 0}>
                <FileDown className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={handleGuardar} disabled={isSaving}>
                <Save className="w-4 h-4 mr-1" />
                {isSaving ? '...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>

        {/* Parte con scroll - lista de ingredientes */}
        <div className="flex-1 overflow-y-auto p-3">

          {/* Lista de ingredientes */}
          {ingredientes.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Tipo</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Ingrediente</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Cantidad</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">C.Unit.</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 bg-green-50">C.Total</th>
                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 bg-blue-50">%</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ingredientes.map((ing) => (
                    <tr key={ing.id} className={ing.isNew ? 'bg-green-50' : ''}>
                      <td className="px-2 py-1.5">
                        {ing.tipo === 'insumo' ? (
                          <Package className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <ChefHat className="w-3.5 h-3.5 text-purple-600" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-900">{ing.nombre}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={ing.cantidad}
                          onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                          className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                        />
                        <span className="ml-1 text-xs text-gray-500">{ing.unidad}</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right text-gray-600 tabular-nums">
                        ${ing.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right font-bold text-green-700 bg-green-50 tabular-nums">
                        ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-right font-semibold text-blue-700 bg-blue-50">
                        {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(0)}%` : '0%'}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminarIngrediente(ing)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4 border rounded-lg bg-gray-50">
              <p className="text-sm text-gray-500">No hay ingredientes agregados</p>
            </div>
          )}

          {/* Layout 50/50: Composición de costos + Preparación */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {/* Card izquierda - Composición del costo */}
            <div className="border rounded-lg bg-gray-50 p-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Composición del costo</h4>
              {ingredientes.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-xs">
                  Sin ingredientes
                </div>
              ) : ingredientes.length === 1 ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: CATEGORY_COLORS[ingredientes[0].categoria] || '#bdbdbd' }}>
                    100%
                  </div>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    <span className="font-medium">{ingredientes[0].nombre}</span>
                    <span className="text-gray-400"> · único ingrediente</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={110}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          const filtered = ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2)
                          return filtered.map((ing) => ({
                            name: ing.nombre,
                            value: ing.costo_linea,
                            categoria: ing.categoria,
                            porcentaje: ((ing.costo_linea / costoTotal) * 100).toFixed(0),
                          }))
                        })()}
                        cx="50%"
                        cy="50%"
                        outerRadius={42}
                        innerRadius={18}
                        dataKey="value"
                        label={({ name, porcentaje }: any) => `${name.substring(0, 8)} ${porcentaje}%`}
                        fontSize={9}
                      >
                        {ingredientes
                          .filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2)
                          .map((ing, idx) => (
                            <Cell key={idx} fill={CATEGORY_COLORS[ing.categoria] || '#bdbdbd'} />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {(() => {
                    const dominante = ingredientes.reduce((max, ing) => ing.costo_linea > max.costo_linea ? ing : max, ingredientes[0])
                    const pct = costoTotal > 0 ? ((dominante.costo_linea / costoTotal) * 100).toFixed(0) : 0
                    return (
                      <p className="text-[11px] text-gray-500 text-center mt-1">
                        Principal: <span className="font-medium text-gray-700">{dominante.nombre}</span> ({pct}%)
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Card derecha - Preparación */}
            <div className="border rounded-lg bg-white p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                <h4 className="text-xs font-semibold text-gray-700">Preparación</h4>
              </div>
              <textarea
                value={pasoAPaso}
                onChange={(e) => setPasoAPaso(e.target.value)}
                placeholder="Ej: Sellar las vieiras, napar con salsa, gratinar 3 min…"
                className="w-full h-32 text-xs border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Versión - texto gris al final */}
          <div className="mt-3 text-[10px] text-gray-400 text-right">
            Versión {versionReceta}
          </div>
        </div>
      </div>
    </div>
  )
}
