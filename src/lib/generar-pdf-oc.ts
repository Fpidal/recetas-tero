import jsPDF from 'jspdf'
import { supabase } from './supabase'

interface OrdenPDF {
  id: string
  numero: string | null
  fecha: string
  estado: string
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

// Datos fijos de Tero
const TERO_DATA = {
  nombre: 'Tero (Oret Srl)',
  cuit: 'CUIT 30-71732567-9',
  direccion: 'Av Agustin Garcia 9501',
  localidad: 'Benavidez',
  cp: 'CP 1621',
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
    estado: (data as any).estado || 'borrador',
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
  const margin = 8
  const contentWidth = pageWidth - margin * 2
  const TERRACOTA = [163, 82, 52] as const
  const TERRACOTA_LIGHT = [214, 165, 145] as const
  const GRIS_CLARO = [245, 245, 245] as const

  // Logo desde bucket "fotos platos"
  let logoDataUrl: string | null = null
  try {
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

  // Formatear fecha: "Benavidez 04 de febrero de 2026"
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const fechaObj = new Date(orden.fecha)
  const dia = fechaObj.getDate().toString().padStart(2, '0')
  const mes = meses[fechaObj.getMonth()]
  const anio = fechaObj.getFullYear()
  const fechaFormateada = `Benavidez ${dia} de ${mes} de ${anio}`

  // Fondo
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  // Borde exterior
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.5)
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4, 'S')

  let y = margin + 4

  // === HEADER ===
  const headerHeight = 24
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, headerHeight, 'F')

  // Logo a la izquierda (si existe)
  let textX = margin + 4  // Por defecto pegado al margen
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin + 3, y + 2, 20, 20)
      textX = margin + 26  // Si hay logo, mover texto a la derecha
    } catch {}
  }

  // Texto: Tero arriba, "Orden de compra" abajo
  doc.setFont('times', 'bolditalic')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('Tero', textX, y + 10)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Orden de compra', textX, y + 18)

  // Datos derecha (Orden de compra N°, Fecha)
  const rightX = pageWidth - margin - 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(`Orden de compra N° ${orden.numero || 'S/N'}`, rightX, y + 10, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(fechaFormateada, rightX, y + 17, { align: 'right' })

  y += headerHeight + 3

  // === PROVEEDOR + ENTREGAR EN (dos columnas) ===
  const boxHeight = 28
  const halfWidth = (contentWidth - 3) / 2

  // Caja PROVEEDOR (izquierda)
  doc.setFillColor(...GRIS_CLARO)
  doc.rect(margin, y, halfWidth, boxHeight, 'F')
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, halfWidth, boxHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(...TERRACOTA)
  doc.text('PROVEEDOR:', margin + 3, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(40, 40, 40)
  doc.text(orden.proveedor_nombre, margin + 3, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(80, 80, 80)
  if (orden.proveedor_contacto) {
    doc.text(orden.proveedor_contacto, margin + 3, y + 16)
  }
  if (orden.proveedor_telefono) {
    doc.text(`Tel: ${orden.proveedor_telefono}`, margin + 3, y + 20)
  }

  // Caja ENTREGAR EN (derecha)
  const rightBoxX = margin + halfWidth + 3
  doc.setFillColor(...GRIS_CLARO)
  doc.rect(rightBoxX, y, halfWidth, boxHeight, 'F')
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.rect(rightBoxX, y, halfWidth, boxHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(...TERRACOTA)
  doc.text('ENTREGAR EN:', rightBoxX + 3, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(40, 40, 40)
  doc.text(TERO_DATA.nombre, rightBoxX + 3, y + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(80, 80, 80)
  doc.text(TERO_DATA.cuit, rightBoxX + 3, y + 14)
  doc.text(TERO_DATA.direccion, rightBoxX + 3, y + 18)
  doc.text(`${TERO_DATA.localidad} - ${TERO_DATA.cp}`, rightBoxX + 3, y + 22)

  y += boxHeight + 4

  // === TABLA ===
  const rowH = 7
  const colX = {
    num: margin + 2,
    insumo: margin + 10,
    ivaRight: margin + contentWidth * 0.42,
    cantRight: margin + contentWidth * 0.52,
    unidad: margin + contentWidth * 0.54,
    precioRight: margin + contentWidth * 0.76,
    subtotalRight: pageWidth - margin - 3,
  }

  // Header tabla
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(255, 255, 255)

  const hTextY = y + 4.5
  doc.text('#', colX.num, hTextY)
  doc.text('INSUMO', colX.insumo, hTextY)
  doc.text('IVA', colX.ivaRight, hTextY, { align: 'right' })
  doc.text('CANT', colX.cantRight, hTextY, { align: 'right' })
  doc.text('UN', colX.unidad, hTextY)
  doc.text('PRECIO', colX.precioRight, hTextY, { align: 'right' })
  doc.text('SUBTOTAL', colX.subtotalRight, hTextY, { align: 'right' })

  y += rowH

  // Filas
  orden.items.forEach((item, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(margin, y, contentWidth, rowH, 'F')
    }
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.1)
    doc.line(margin, y, pageWidth - margin, y)

    const textY = y + 4.5
    doc.setFontSize(6.5)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(`${idx + 1}`, colX.num, textY)

    doc.setTextColor(30, 30, 30)
    const nombreTruncado = item.insumo_nombre.length > 20
      ? item.insumo_nombre.substring(0, 20) + '...'
      : item.insumo_nombre
    doc.text(nombreTruncado, colX.insumo, textY)

    // IVA
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(5.5)
    const ivaStr = item.iva_porcentaje === 10.5 ? '10,5%' : item.iva_porcentaje === 0 ? '0%' : '21%'
    doc.text(ivaStr, colX.ivaRight, textY, { align: 'right' })
    doc.setFontSize(6.5)

    doc.setTextColor(50, 50, 50)
    const cantStr = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(2).replace('.', ',')
    doc.text(cantStr, colX.cantRight, textY, { align: 'right' })

    doc.setTextColor(120, 120, 120)
    doc.setFontSize(6)
    doc.text(item.unidad_medida, colX.unidad, textY)
    doc.setFontSize(6.5)

    doc.setTextColor(50, 50, 50)
    doc.text(fmtMoney(item.precio_unitario), colX.precioRight, textY, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(fmtMoney(item.subtotal), colX.subtotalRight, textY, { align: 'right' })

    y += rowH
  })

  // Línea cierre tabla
  doc.setDrawColor(...TERRACOTA)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // === TOTALES ===
  const totalesX = colX.subtotalRight
  const labelX = colX.precioRight

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotal Neto', labelX, y, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text(fmtMoney(subtotalNeto), totalesX, y, { align: 'right' })
  y += 4.5

  if (totalIva21 > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('IVA (21%)', labelX, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(fmtMoney(totalIva21), totalesX, y, { align: 'right' })
    y += 4.5
  }

  if (totalIva105 > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('IVA (10.5%)', labelX, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(fmtMoney(totalIva105), totalesX, y, { align: 'right' })
    y += 4.5
  }

  // Línea separadora
  y += 1
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.2)
  doc.line(labelX - 25, y, totalesX, y)
  y += 4

  // Total final
  doc.setFillColor(...TERRACOTA)
  const totalBoxW = 55
  const totalBoxX = pageWidth - margin - totalBoxW
  doc.roundedRect(totalBoxX, y - 3, totalBoxW, 10, 1.5, 1.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL GENERAL', totalBoxX + 4, y + 3)
  doc.setFontSize(9)
  doc.text(fmtMoney(totalConIva), pageWidth - margin - 3, y + 3, { align: 'right' })
  y += 12

  // Notas
  if (orden.notas) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...TERRACOTA)
    doc.text('NOTAS:', margin + 2, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(60, 60, 60)
    const notasLines = doc.splitTextToSize(orden.notas, contentWidth - 20)
    doc.text(notasLines, margin + 18, y)
    y += notasLines.length * 3 + 4
  }

  // Observaciones
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(...TERRACOTA)
  doc.text('Observaciones:', margin + 2, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(80, 80, 80)
  const observaciones = [
    '• Mercadería sujeta a control de calidad al recibir.',
    '• Confirmar si el pedido será entregado en su totalidad.',
    '• Confirmar fecha de entrega.',
  ]
  observaciones.forEach((obs, i) => {
    doc.text(obs, margin + 2, y + 4 + (i * 3))
  })

  // Footer
  const footerY = pageHeight - margin - 8
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.2)
  doc.line(margin + 20, footerY, pageWidth - margin - 20, footerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(150, 130, 120)
  doc.text('Tero Restó  |  Orden de Compra', pageWidth / 2, footerY + 4, { align: 'center' })

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

  return (data as any).estado === 'borrador'
}
