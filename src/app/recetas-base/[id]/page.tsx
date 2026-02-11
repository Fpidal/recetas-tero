'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, RefreshCw, ClipboardList, FileDown, ImagePlus, X } from 'lucide-react'
import jsPDF from 'jspdf'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'

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

interface Ingrediente {
  id: string
  insumo_id: string
  insumo_nombre: string
  unidad_medida: string
  categoria: string
  cantidad: number
  costo_unitario: number
  costo_linea: number
  isNew?: boolean
}

export default function EditarRecetaBasePage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [preparacion, setPreparacion] = useState('')
  const [rendimiento, setRendimiento] = useState('1')
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [ingredientesOriginales, setIngredientesOriginales] = useState<string>('')
  const [ingredientesEliminados, setIngredientesEliminados] = useState<string[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [selectedInsumo, setSelectedInsumo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [versionReceta, setVersionReceta] = useState('1.0')
  const [imagenUrl, setImagenUrl] = useState<string | null>(null)
  const [observaciones, setObservaciones] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isReadOnly, setIsReadOnly] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    const { data: insumosRaw } = await supabase
      .from('v_insumos_con_precio')
      .select('id, nombre, unidad_medida, categoria, precio_actual, merma_porcentaje, iva_porcentaje')
      .eq('activo', true)
      .order('nombre')

    const insumosData = (insumosRaw || []).map(insumo => ({
      ...insumo,
      costo_final: insumo.precio_actual !== null
        ? insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
        : null
    }))

    if (insumosData) setInsumos(insumosData)

    const { data: receta, error: recetaError } = await supabase
      .from('recetas_base')
      .select('*')
      .eq('id', id)
      .single()

    if (recetaError || !receta) {
      alert('Elaboración no encontrada')
      router.push('/recetas-base')
      return
    }

    setNombre(receta.nombre)
    setDescripcion(receta.descripcion || '')
    setPreparacion(receta.preparacion || '')
    setRendimiento(receta.rendimiento_porciones.toString())
    setVersionReceta(receta.version_receta || '1.0')
    setImagenUrl(receta.imagen_url || null)
    setObservaciones(receta.observaciones || '')
    setIsReadOnly(receta.activo === false)

    const { data: ingredientesData } = await supabase
      .from('receta_base_ingredientes')
      .select(`
        id, insumo_id, cantidad, costo_linea,
        insumos (nombre, unidad_medida, categoria)
      `)
      .eq('receta_base_id', id)

    if (ingredientesData) {
      const mapped: Ingrediente[] = ingredientesData.map((ing: any) => {
        const insumoInfo = insumosData?.find(i => i.id === ing.insumo_id)
        const costoUnitario = insumoInfo?.costo_final || 0
        const cantidadNum = parseFloat(ing.cantidad)
        return {
          id: ing.id,
          insumo_id: ing.insumo_id,
          insumo_nombre: ing.insumos?.nombre || 'Desconocido',
          unidad_medida: ing.insumos?.unidad_medida || '',
          categoria: insumoInfo?.categoria || 'Almacen',
          cantidad: cantidadNum,
          costo_unitario: costoUnitario,
          costo_linea: cantidadNum * costoUnitario,
        }
      })
      setIngredientes(mapped)
      setIngredientesOriginales(JSON.stringify(mapped.map(i => ({ id: i.insumo_id, cantidad: i.cantidad }))))
    }

    setIsLoading(false)
  }

  function handleAgregarIngrediente() {
    if (!selectedInsumo || !cantidad || parseFloat(cantidad) <= 0) return

    const insumo = insumos.find(i => i.id === selectedInsumo)
    if (!insumo || ingredientes.some(ing => ing.insumo_id === selectedInsumo)) return

    const costoUnitario = insumo.costo_final || 0
    const cantidadNum = parseFloat(cantidad)

    setIngredientes([...ingredientes, {
      id: crypto.randomUUID(),
      insumo_id: insumo.id,
      insumo_nombre: insumo.nombre,
      unidad_medida: insumo.unidad_medida,
      categoria: insumo.categoria,
      cantidad: cantidadNum,
      costo_unitario: costoUnitario,
      costo_linea: cantidadNum * costoUnitario,
      isNew: true,
    }])
    setSelectedInsumo('')
    setCantidad('')
  }

  function handleEliminarIngrediente(ing: Ingrediente) {
    if (!ing.isNew) setIngredientesEliminados([...ingredientesEliminados, ing.id])
    setIngredientes(ingredientes.filter(i => i.id !== ing.id))
  }

  function handleCantidadChange(id: string, nuevaCantidad: string) {
    const cantidadNum = parseFloat(nuevaCantidad) || 0
    setIngredientes(ingredientes.map(ing =>
      ing.id === id ? { ...ing, cantidad: cantidadNum, costo_linea: ing.costo_unitario * cantidadNum } : ing
    ))
  }

  function handleRecalcularCostos() {
    setIngredientes(ingredientes.map(ing => {
      const insumo = insumos.find(i => i.id === ing.insumo_id)
      const costoUnitario = insumo?.costo_final || 0
      return { ...ing, costo_unitario: costoUnitario, costo_linea: costoUnitario * ing.cantidad }
    }))
  }

  async function handleSubirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo y tamaño
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten imágenes')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no puede superar 2MB')
      return
    }

    setIsUploadingImage(true)

    // Eliminar imagen anterior si existe
    if (imagenUrl) {
      const oldPath = imagenUrl.split('/').pop()
      if (oldPath) {
        await supabase.storage.from('fotos platos').remove([`${id}/${oldPath}`])
      }
    }

    // Subir nueva imagen
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}.${ext}`
    const filePath = `${id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('fotos platos')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Error subiendo imagen:', uploadError)
      alert('Error al subir la imagen')
      setIsUploadingImage(false)
      return
    }

    // Obtener URL pública
    const { data: urlData } = supabase.storage.from('fotos platos').getPublicUrl(filePath)
    const newUrl = urlData?.publicUrl || null

    // Guardar en la receta
    console.log('Guardando imagen_url:', newUrl, 'para id:', id)
    const { error: saveError } = await supabase.from('recetas_base').update({ imagen_url: newUrl }).eq('id', id)
    if (saveError) {
      console.error('Error guardando imagen_url:', saveError)
      alert('Error al guardar la URL de la imagen')
    } else {
      console.log('imagen_url guardada correctamente')
    }
    setImagenUrl(newUrl)
    setIsUploadingImage(false)
  }

  async function handleEliminarImagen() {
    if (!imagenUrl) return
    if (!confirm('¿Eliminar la imagen?')) return

    const pathParts = imagenUrl.split('/fotos%20platos/')
    if (pathParts[1]) {
      await supabase.storage.from('fotos platos').remove([decodeURIComponent(pathParts[1])])
    }
    await supabase.from('recetas_base').update({ imagen_url: null }).eq('id', id)
    setImagenUrl(null)
  }

  async function handleGenerarPDF() {
    // A6 vertical: 105 x 148 mm
    const doc = new jsPDF({ unit: 'mm', format: [105, 148] })
    const pageWidth = 105
    const pageHeight = 148
    const margin = 8
    const contentWidth = pageWidth - margin * 2
    const GREEN = [45, 59, 45] as const // #2D3B2D

    // Borde redondeado (fondo blanco por defecto)
    function drawPageFrame() {
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
      const cant = ing.cantidad
      if (cant <= 0) return 'c/n'
      const unidad = ing.unidad_medida
      if (unidad === 'kg' && cant < 1) {
        return `${Math.round(cant * 1000)} g`
      }
      if (unidad === 'lt' && cant < 1) {
        return `${Math.round(cant * 1000)} ml`
      }
      const cantStr = cant % 1 === 0
        ? cant.toFixed(0)
        : cant.toFixed(1).replace(/\.0$/, '').replace('.', ',')
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

    // Imagen de la receta (pre-fetch)
    let recetaImageDataUrl: string | null = null
    if (imagenUrl) {
      try {
        const response = await fetch(imagenUrl)
        if (response.ok) {
          const blob = await response.blob()
          recetaImageDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        }
      } catch {}
    }

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

    // === NOMBRE Y IMAGEN ===
    const imgSize = 22
    const hasImage = !!recetaImageDataUrl

    if (hasImage) {
      // Con imagen: título a la izquierda, imagen a la derecha
      const textWidth = contentWidth - imgSize - 4
      doc.setFont('times', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(30, 30, 30)
      const nombreLines = doc.splitTextToSize(nombre, textWidth)
      doc.text(nombreLines, margin, y + 4)

      // Imagen a la derecha
      doc.addImage(recetaImageDataUrl, 'JPEG', pageWidth - margin - imgSize, y - 2, imgSize, imgSize)
      y += Math.max(nombreLines.length * 5, imgSize) + 3
    } else {
      // Sin imagen: título centrado
      doc.setFont('times', 'bold')
      doc.setFontSize(15)
      doc.setTextColor(30, 30, 30)
      const nombreLines = doc.splitTextToSize(nombre, contentWidth - 4)
      doc.text(nombreLines, pageWidth / 2, y, { align: 'center' })
      y += nombreLines.length * 5.5 + 3
    }

    // === BADGE "ELABORACIÓN" ===
    const badgeText = 'ELABORACIÓN'
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    const badgeWidth = doc.getTextWidth(badgeText) + 8
    const badgeX = (pageWidth - badgeWidth) / 2
    doc.setFillColor(147, 51, 234) // purple-600
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
      doc.text(ing.insumo_nombre, margin + 1, y)
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

    if (preparacion.trim()) {
      const rawSteps = preparacion.split(/\n/).filter(l => l.trim())
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
      const rindeText = `Rinde: ${rendimiento} porción${parseInt(rendimiento) !== 1 ? 'es' : ''}  |  Versión: ${versionReceta}`
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

    doc.save(`Elaboración - ${nombre}.pdf`)
  }

  const costoTotal = ingredientes.reduce((sum, ing) => sum + ing.costo_linea, 0)
  const costoPorPorcion = parseFloat(rendimiento) > 0 ? costoTotal / parseFloat(rendimiento) : 0

  async function handleGuardar() {
    if (!nombre.trim() || ingredientes.length === 0) {
      alert(!nombre.trim() ? 'El nombre es requerido' : 'Agregá al menos un ingrediente')
      return
    }

    setIsSaving(true)

    const ingredientesActuales = JSON.stringify(ingredientes.map(i => ({ id: i.insumo_id, cantidad: i.cantidad })))
    const huboCambios = ingredientesActuales !== ingredientesOriginales || ingredientesEliminados.length > 0
    const currentVersion = parseFloat(versionReceta) || 1.0
    const newVersion = huboCambios ? (currentVersion + 0.1).toFixed(1) : versionReceta

    const { error } = await supabase
      .from('recetas_base')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        preparacion: preparacion.trim() || null,
        observaciones: observaciones.trim() || null,
        rendimiento_porciones: parseInt(rendimiento) || 1,
        costo_total: costoTotal,
        costo_por_porcion: costoPorPorcion,
        version_receta: newVersion,
      })
      .eq('id', id)

    if (error) {
      alert('Error al actualizar')
      setIsSaving(false)
      return
    }

    if (ingredientesEliminados.length > 0) {
      await supabase.from('receta_base_ingredientes').delete().in('id', ingredientesEliminados)
    }

    for (const ing of ingredientes.filter(i => !i.isNew)) {
      await supabase.from('receta_base_ingredientes').update({ cantidad: ing.cantidad, costo_linea: ing.costo_linea }).eq('id', ing.id)
    }

    const nuevos = ingredientes.filter(i => i.isNew)
    if (nuevos.length > 0) {
      await supabase.from('receta_base_ingredientes').insert(nuevos.map(ing => ({
        receta_base_id: id, insumo_id: ing.insumo_id, cantidad: ing.cantidad, costo_linea: ing.costo_linea,
      })))
    }

    router.push('/recetas-base')
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-500">Cargando...</p></div>
  }

  return (
    <div className="max-w-4xl lg:h-[calc(100vh-80px)] flex flex-col">
      {/* Header fijo */}
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            {isReadOnly ? 'Ver Elaboración' : 'Editar Elaboración'}
          </h1>
          {isReadOnly && (
            <span className="text-xs text-red-500">En papelera</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-1 overflow-hidden">
        {/* Parte fija superior */}
        <div className="p-3 border-b bg-white">
          {/* Datos básicos - responsive */}
          <div className="grid grid-cols-2 sm:flex gap-2 mb-3">
            <div className="col-span-2 sm:w-52">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-2 sm:py-1.5 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Ej: Salsa Criolla"
              />
            </div>
            <div className="sm:w-16">
              <label className="block text-xs font-medium text-gray-700 mb-1">Rinde</label>
              <input
                type="number"
                min="1"
                value={rendimiento}
                onChange={(e) => setRendimiento(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-2 sm:py-1.5 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="sm:flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 sm:px-2 sm:py-1.5 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Opcional..."
              />
            </div>
            {ingredientes.length > 0 && (
              <div className="col-span-2 sm:col-span-1 flex items-end gap-4 sm:ml-auto">
                <div className="text-right">
                  <span className="text-[10px] text-gray-500 block">Costo Total</span>
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    ${costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-500 block">x Porción ({rendimiento})</span>
                  <span className="text-sm font-bold text-green-600 tabular-nums">
                    ${costoPorPorcion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Mobile: Stack vertical */}
          <div className="sm:hidden space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Insumo</label>
              <select
                value={selectedInsumo}
                onChange={(e) => setSelectedInsumo(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Seleccionar...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.unidad_medida}) - ${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="0"
                />
              </div>
              <Button onClick={handleAgregarIngrediente} className="flex-shrink-0">
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="secondary" size="sm" onClick={handleRecalcularCostos} title="Recalcular">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={handleGenerarPDF} disabled={ingredientes.length === 0} title="Descargar PDF">
                <FileDown className="w-4 h-4" />
              </Button>
              <div className="flex-1" />
              <Button variant="secondary" size="sm" onClick={() => router.back()}>
                {isReadOnly ? 'Volver' : 'Cancelar'}
              </Button>
              {!isReadOnly && (
                <Button size="sm" onClick={handleGuardar} disabled={isSaving}>
                  <Save className="w-4 h-4 mr-1" />
                  {isSaving ? '...' : 'Guardar'}
                </Button>
              )}
            </div>
          </div>

          {/* Desktop: Row */}
          <div className="hidden sm:flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Insumo</label>
              <select
                value={selectedInsumo}
                onChange={(e) => setSelectedInsumo(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="">Seleccionar...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.unidad_medida}) - ${(i.costo_final || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cant.</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="0"
              />
            </div>
            <Button onClick={handleAgregarIngrediente} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
            <div className="border-l pl-2 flex gap-1">
              <Button variant="secondary" size="sm" onClick={handleRecalcularCostos} title="Recalcular">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => router.back()}>
                {isReadOnly ? 'Volver' : 'Cancelar'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleGenerarPDF} disabled={ingredientes.length === 0} title="Descargar PDF">
                <FileDown className="w-3.5 h-3.5" />
              </Button>
              {!isReadOnly && (
                <Button size="sm" onClick={handleGuardar} disabled={isSaving}>
                  <Save className="w-4 h-4 mr-1" />
                  {isSaving ? '...' : 'Guardar'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Parte con scroll */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Tabla ingredientes */}
          {ingredientes.length > 0 ? (
            <>
              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-2">
                {ingredientes.map((ing) => (
                  <div key={ing.id} className={`rounded-lg p-3 border ${ing.isNew ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">{ing.insumo_nombre}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-0.5">Cantidad</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={ing.cantidad}
                            onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <span className="text-xs text-gray-500">{ing.unidad_medida}</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 mb-0.5">Costo</p>
                        <p className="text-sm font-bold text-green-700">
                          ${ing.costo_linea.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 mb-0.5">Incidencia</p>
                        <p className="text-sm font-semibold text-blue-700">
                          {costoTotal > 0 ? `${((ing.costo_linea / costoTotal) * 100).toFixed(0)}%` : '0%'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden sm:block border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Insumo</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cantidad</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">C.Unit.</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">C.Total</th>
                      <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-blue-50">%</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ingredientes.map((ing) => (
                      <tr key={ing.id} className={ing.isNew ? 'bg-green-50' : ''}>
                        <td className="px-2 py-1.5 text-xs text-gray-900">{ing.insumo_nombre}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={ing.cantidad}
                            onChange={(e) => handleCantidadChange(ing.id, e.target.value)}
                            className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                          />
                          <span className="ml-1 text-xs text-gray-500">{ing.unidad_medida}</span>
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
                          <Button variant="ghost" size="sm" onClick={() => handleEliminarIngrediente(ing)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-4 border rounded-lg bg-gray-50">
              <p className="text-xs text-gray-500">No hay ingredientes agregados</p>
            </div>
          )}

          {/* Fila 1: Composición + Preparación */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Composición del costo */}
            <div className="border rounded-lg bg-gray-50 p-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Composición del costo</h4>
              {ingredientes.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-xs">Sin ingredientes</div>
              ) : ingredientes.length === 1 ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: CATEGORY_COLORS[ingredientes[0].categoria] || '#bdbdbd' }}>
                    100%
                  </div>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    <span className="font-medium">{ingredientes[0].insumo_nombre}</span>
                    <span className="text-gray-400"> · único</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={110}>
                    <PieChart>
                      <Pie
                        data={ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2).map(ing => ({
                          name: ing.insumo_nombre,
                          value: ing.costo_linea,
                          categoria: ing.categoria,
                          porcentaje: ((ing.costo_linea / costoTotal) * 100).toFixed(0),
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={42}
                        innerRadius={18}
                        dataKey="value"
                        label={({ name, porcentaje }: any) => `${name.substring(0, 8)} ${porcentaje}%`}
                        fontSize={9}
                      >
                        {ingredientes.filter(ing => (ing.costo_linea / costoTotal) * 100 >= 2).map((ing, idx) => (
                          <Cell key={idx} fill={CATEGORY_COLORS[ing.categoria] || '#bdbdbd'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  {(() => {
                    const dominante = ingredientes.reduce((max, ing) => ing.costo_linea > max.costo_linea ? ing : max, ingredientes[0])
                    const pct = costoTotal > 0 ? ((dominante.costo_linea / costoTotal) * 100).toFixed(0) : 0
                    return (
                      <p className="text-[11px] text-gray-500 text-center mt-1">
                        Principal: <span className="font-medium text-gray-700">{dominante.insumo_nombre}</span> ({pct}%)
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Preparación */}
            <div className="border rounded-lg bg-white p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                <h4 className="text-xs font-semibold text-gray-700">Preparación</h4>
              </div>
              <textarea
                value={preparacion}
                onChange={(e) => setPreparacion(e.target.value)}
                placeholder="Ej: Picar cebolla, mezclar con tomate..."
                className="w-full h-32 text-base sm:text-xs border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Fila 2: Observaciones + Foto */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Observaciones y Tips */}
            <div className="border rounded-lg bg-white p-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Observaciones y Tips</h4>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Consejos, variantes, notas importantes..."
                className="w-full h-32 text-base sm:text-xs border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-gray-300"
              />
            </div>

            {/* Foto de la receta */}
            <div className="border rounded-lg bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-700">Foto</h4>
                {imagenUrl && !isReadOnly && (
                  <button
                    onClick={handleEliminarImagen}
                    className="text-red-500 hover:text-red-600 text-xs"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              {imagenUrl ? (
                <img src={imagenUrl} alt={nombre} className="w-full h-32 object-contain rounded-lg" />
              ) : (
                <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSubirImagen}
                    className="hidden"
                    disabled={isReadOnly || isUploadingImage}
                  />
                  {isUploadingImage ? (
                    <span className="text-sm text-gray-400">Subiendo...</span>
                  ) : (
                    <>
                      <ImagePlus className="w-8 h-8 text-gray-400 mb-1" />
                      <span className="text-xs text-gray-400">Clic para subir imagen</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>

          {/* Versión */}
          <div className="mt-2 text-[10px] text-gray-400 text-right">
            Versión {versionReceta}
          </div>
        </div>
      </div>
    </div>
  )
}
