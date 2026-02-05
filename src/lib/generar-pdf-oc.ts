import jsPDF from 'jspdf'
import { supabase } from './supabase'

interface OrdenPDF {
  id: string
  numero: string | null
  fecha: string
  notas: string | null
  proveedor_nombre: string
  proveedor_contacto: string | null
  proveedor_telefono: string | null
  proveedor_email: string | null
  proveedor_direccion: string | null
  items: {
    insumo_nombre: string
    unidad_medida: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    iva_porcentaje: number
    iva_monto: number
  }[]
}

export async function generarPDFOrden(ordenId: string) {
  // Fetch datos completos
  const { data, error } = await supabase
    .from('ordenes_compra')
    .select(`
      id, numero, fecha, notas, estado,
      proveedores (nombre, contacto, telefono, email, direccion),
      orden_compra_items (
        cantidad, precio_unitario, subtotal,
        insumos (nombre, unidad_medida, iva_porcentaje)
      )
    `)
    .eq('id', ordenId)
    .single()

  if (error || !data) {
    alert('Error al cargar la orden para PDF')
    return
  }

  const prov = data.proveedores as any
  const orden: OrdenPDF = {
    id: data.id,
    numero: (data as any).numero || null,
    fecha: data.fecha,
    notas: data.notas,
    proveedor_nombre: prov?.nombre || 'Desconocido',
    proveedor_contacto: prov?.contacto || null,
    proveedor_telefono: prov?.telefono || null,
    proveedor_email: prov?.email || null,
    proveedor_direccion: prov?.direccion || null,
    items: (data.orden_compra_items as any[]).map((item: any) => {
      const subtotal = parseFloat(item.subtotal)
      const ivaPorcentaje = item.insumos?.iva_porcentaje || 21
      const ivaMonto = subtotal * (ivaPorcentaje / 100)
      return {
        insumo_nombre: item.insumos?.nombre || 'Desconocido',
        unidad_medida: item.insumos?.unidad_medida || '',
        cantidad: parseFloat(item.cantidad),
        precio_unitario: parseFloat(item.precio_unitario),
        subtotal,
        iva_porcentaje: ivaPorcentaje,
        iva_monto: ivaMonto,
      }
    }),
  }

  // Calcular totales
  const subtotalNeto = orden.items.reduce((sum, item) => sum + item.subtotal, 0)
  const totalIva21 = orden.items.filter(i => i.iva_porcentaje === 21).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva105 = orden.items.filter(i => i.iva_porcentaje === 10.5).reduce((sum, item) => sum + item.iva_monto, 0)
  const totalIva = orden.items.reduce((sum, item) => sum + item.iva_monto, 0)
  const totalConIva = subtotalNeto + totalIva

  // A5 vertical
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const pageWidth = 148
  const pageHeight = 210
  const margin = 10
  const contentWidth = pageWidth - margin * 2
  const TERRACOTA = [163, 82, 52] as const
  const TERRACOTA_LIGHT = [214, 165, 145] as const

  // Logo desde bucket "fotos platos"
  let logoDataUrl: string | null = null
  try {
    // Listar archivos del bucket para obtener el nombre del logo
    const { data: files } = await supabase.storage.from('fotos platos').list('', { limit: 1 })
    if (files && files.length > 0) {
      const logoFile = files[0].name
      const { data: urlData } = supabase.storage.from('fotos platos').getPublicUrl(logoFile)
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
    }
  } catch {}

  function fmtMoney(n: number): string {
    return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Fondo + borde
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.4)
  doc.roundedRect(5, 5, pageWidth - 10, pageHeight - 10, 3, 3, 'S')

  let y = 15

  // === HEADER ===
  doc.setFillColor(...TERRACOTA)
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F')

  doc.setFont('times', 'bolditalic')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text('Tero Restó', margin + 6, y + 7)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('ORDEN DE COMPRA', margin + 6, y + 13.5)

  // Fecha y N° a la derecha
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  const fechaStr = new Date(orden.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(fechaStr, pageWidth - margin - 6, y + 7, { align: 'right' })
  if (orden.numero) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(orden.numero, pageWidth - margin - 6, y + 13.5, { align: 'right' })
  }

  if (logoDataUrl) {
    try {
      // Logo más grande y visible en la esquina derecha del header
      doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - 20, y + 2, 14, 14)
    } catch {}
  }

  y += 24

  // === PROVEEDOR ===
  doc.setFillColor(248, 244, 241)
  doc.roundedRect(margin, y, contentWidth, orden.proveedor_direccion ? 22 : 17, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(...TERRACOTA)
  doc.text('PROVEEDOR', margin + 4, y + 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(40, 40, 40)
  doc.text(orden.proveedor_nombre, margin + 4, y + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(80, 80, 80)

  const contactoParts: string[] = []
  if (orden.proveedor_contacto) contactoParts.push(`Contacto: ${orden.proveedor_contacto}`)
  if (orden.proveedor_telefono) contactoParts.push(`Tel: ${orden.proveedor_telefono}`)
  if (orden.proveedor_email) contactoParts.push(orden.proveedor_email)

  if (contactoParts.length > 0) {
    doc.text(contactoParts.join('  |  '), margin + 4, y + 14.5)
  }

  if (orden.proveedor_direccion) {
    doc.text(orden.proveedor_direccion, margin + 4, y + 19)
    y += 26
  } else {
    y += 21
  }

  // === TABLA ===
  y += 4
  const rowH = 7.5
  const colX = {
    num: margin + 3,
    insumo: margin + contentWidth * 0.05 + 3,
    cantRight: margin + contentWidth * 0.55 - 2,
    unidad: margin + contentWidth * 0.55 + 2,
    precioRight: margin + contentWidth * 0.825 - 2,
    subtotalRight: pageWidth - margin - 3,
  }

  // Header tabla
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(255, 255, 255)

  const hTextY = y + 5
  doc.text('#', colX.num, hTextY)
  doc.text('INSUMO', colX.insumo, hTextY)
  doc.text('CANT.', colX.cantRight, hTextY, { align: 'right' })
  doc.text('UN.', colX.unidad, hTextY)
  doc.text('PRECIO', colX.precioRight, hTextY, { align: 'right' })
  doc.text('SUBTOTAL', colX.subtotalRight, hTextY, { align: 'right' })

  y += rowH

  // Filas
  orden.items.forEach((item, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 248, 248)
      doc.rect(margin, y, contentWidth, rowH, 'F')
    }
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.15)
    doc.line(margin, y, pageWidth - margin, y)

    const textY = y + 5
    doc.setFontSize(7)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(`${idx + 1}`, colX.num, textY)

    doc.setTextColor(30, 30, 30)
    doc.text(item.insumo_nombre, colX.insumo, textY)

    doc.setTextColor(50, 50, 50)
    const cantStr = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(2).replace('.', ',')
    doc.text(cantStr, colX.cantRight, textY, { align: 'right' })

    doc.setTextColor(120, 120, 120)
    doc.setFontSize(6.5)
    doc.text(item.unidad_medida, colX.unidad, textY)
    doc.setFontSize(7)

    doc.setTextColor(50, 50, 50)
    doc.text(fmtMoney(item.precio_unitario), colX.precioRight, textY, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(fmtMoney(item.subtotal), colX.subtotalRight, textY, { align: 'right' })

    y += rowH
  })

  // Línea cierre
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // === TOTALES ===
  const totalesX = colX.subtotalRight
  const labelX = colX.precioRight

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotal Neto:', labelX, y, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text(fmtMoney(subtotalNeto), totalesX, y, { align: 'right' })
  y += 5

  if (totalIva21 > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('IVA 21%:', labelX, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(fmtMoney(totalIva21), totalesX, y, { align: 'right' })
    y += 5
  }

  if (totalIva105 > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('IVA 10.5%:', labelX, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(fmtMoney(totalIva105), totalesX, y, { align: 'right' })
    y += 5
  }

  // Total badge
  y += 2
  const totalText = fmtMoney(totalConIva)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  const totalBadgeW = doc.getTextWidth(totalText) + doc.getTextWidth('TOTAL:  ') + 14
  const totalBadgeX = pageWidth - margin - totalBadgeW

  doc.setFillColor(...TERRACOTA)
  doc.roundedRect(totalBadgeX, y - 4, totalBadgeW, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL:', totalBadgeX + 6, y + 2)
  doc.setFontSize(9)
  doc.text(totalText, pageWidth - margin - 5, y + 2, { align: 'right' })
  y += 14

  // Notas
  if (orden.notas) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...TERRACOTA)
    doc.text('NOTAS / CONDICIONES', margin + 2, y)
    y += 3.5

    doc.setFillColor(248, 244, 241)
    const notasLines = doc.splitTextToSize(orden.notas, contentWidth - 8)
    const notasHeight = notasLines.length * 3.5 + 4
    doc.roundedRect(margin, y - 1.5, contentWidth, notasHeight, 2, 2, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(60, 60, 60)
    doc.text(notasLines, margin + 4, y + 2)
    y += notasHeight + 3
  }

  // Observaciones
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(5.5)
  doc.setTextColor(150, 150, 150)
  doc.text('Observaciones: mercadería sujeta a control de calidad al recibir.', margin + 2, y)

  // Footer
  const footerY = pageHeight - 15
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.2)
  doc.line(margin + 15, footerY, pageWidth - margin - 15, footerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(150, 130, 120)
  doc.text('Tero Restó  |  Orden de Compra', pageWidth / 2, footerY + 4, { align: 'center' })
  doc.text(`Generada: ${new Date().toLocaleDateString('es-AR')}`, pageWidth / 2, footerY + 7.5, { align: 'center' })

  // Guardar
  const numPart = orden.numero ? `${orden.numero}_` : ''
  const fileName = `OC_${numPart}${orden.proveedor_nombre.replace(/\s+/g, '_')}_${orden.fecha}.pdf`
  doc.save(fileName)

  // Si es borrador, marcar como enviada
  if ((data as any).estado === 'borrador') {
    await supabase
      .from('ordenes_compra')
      .update({ estado: 'enviada' })
      .eq('id', ordenId)
  }

  return (data as any).estado === 'borrador' // retorna true si cambió estado
}
