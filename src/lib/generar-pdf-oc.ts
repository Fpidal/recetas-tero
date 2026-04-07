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
    insumo_id: string | null
    vino_id: string | null
    insumo_nombre: string
    unidad_medida: string
    unidad_display: string // Unidad visual para el proveedor
    cantidad: number
    cantidad_recibida?: number // Cantidad según factura
    precio_unitario: number
    subtotal: number
    iva_porcentaje: number
    iva_monto: number
  }[]
  tieneFactura?: boolean
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
        insumo_id, vino_id, cantidad, precio_unitario, subtotal, unidad_display,
        insumos (nombre, unidad_medida, iva_porcentaje),
        vinos (bodega, nombre, cepa)
      )
    `)
    .eq('id', ordenId)
    .single()

  if (error || !data) {
    alert('Error al cargar la orden para PDF')
    return
  }

  // Buscar factura asociada para obtener cantidades recibidas
  const { data: facturaData } = await supabase
    .from('facturas_proveedor')
    .select('id, factura_items (insumo_id, vino_id, cantidad)')
    .eq('orden_compra_id', ordenId)
    .eq('activo', true)
    .maybeSingle()

  const facturaItems = facturaData?.factura_items as { insumo_id: string | null; vino_id: string | null; cantidad: number }[] | null

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
    tieneFactura: !!facturaData,
    items: (data.orden_compra_items as any[]).map((item: any) => {
      const subtotal = parseFloat(item.subtotal)
      const esVino = !!item.vino_id
      const ivaPorcentaje = esVino ? 21 : (item.insumos?.iva_porcentaje ?? 21)
      const ivaMonto = subtotal * (ivaPorcentaje / 100)
      const unidadMedida = esVino ? 'caja' : (item.insumos?.unidad_medida || '')
      const nombreItem = esVino
        ? `${item.vinos?.nombre || 'Vino desconocido'} (${item.vinos?.cepa || ''})`
        : (item.insumos?.nombre || 'Desconocido')

      // Buscar cantidad recibida en la factura
      const facturaItem = facturaItems?.find(fi =>
        esVino ? fi.vino_id === item.vino_id : fi.insumo_id === item.insumo_id
      )
      const cantidadRecibida = facturaItem ? parseFloat(String(facturaItem.cantidad)) : undefined

      return {
        insumo_id: item.insumo_id,
        vino_id: item.vino_id,
        insumo_nombre: nombreItem,
        unidad_medida: unidadMedida,
        unidad_display: item.unidad_display || unidadMedida,
        cantidad: parseFloat(item.cantidad),
        cantidad_recibida: cantidadRecibida,
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

  // === TABLA CON PAGINACIÓN ===
  const rowH = 7
  const esParcialORecibida = orden.tieneFactura && (orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida')

  // Constantes de paginación
  const ESPACIO_FOOTER = 55 // Totales + observaciones + condiciones + footer
  const ESPACIO_HEADER_TABLA = 7
  const MARGEN_INFERIOR = margin + 5

  // Columnas diferentes según si tiene factura o no (definido antes de la función)
  const colX = esParcialORecibida ? {
    num: margin + 2,
    insumo: margin + 8,
    pedidoRight: margin + contentWidth * 0.45,
    recibidoRight: margin + contentWidth * 0.55,
    faltanteRight: margin + contentWidth * 0.65,
    unidad: margin + contentWidth * 0.67,
    precioRight: margin + contentWidth * 0.82,
    subtotalRight: pageWidth - margin - 3,
  } : {
    num: margin + 2,
    insumo: margin + 8,
    ivaRight: margin + contentWidth * 0.52,
    cantRight: margin + contentWidth * 0.60,
    unidad: margin + contentWidth * 0.62,
    precioRight: margin + contentWidth * 0.78,
    subtotalRight: pageWidth - margin - 3,
  }

  // Función para dibujar header de tabla
  function dibujarHeaderTabla(yPos: number): number {
    doc.setFillColor(...TERRACOTA)
    doc.rect(margin, yPos, contentWidth, rowH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(255, 255, 255)

    const hTextY = yPos + 4.5
    doc.text('#', colX.num, hTextY)
    doc.text('INSUMO', colX.insumo, hTextY)

    if (esParcialORecibida) {
      doc.text('PEDIDO', (colX as any).pedidoRight, hTextY, { align: 'right' })
      doc.text('RECIB.', (colX as any).recibidoRight, hTextY, { align: 'right' })
      doc.text('FALT.', (colX as any).faltanteRight, hTextY, { align: 'right' })
    } else {
      doc.text('IVA', (colX as any).ivaRight, hTextY, { align: 'right' })
      doc.text('CANT', (colX as any).cantRight, hTextY, { align: 'right' })
    }
    doc.text('UN', colX.unidad, hTextY)
    doc.text('PRECIO', colX.precioRight, hTextY, { align: 'right' })
    doc.text('SUBTOTAL', colX.subtotalRight, hTextY, { align: 'right' })

    return yPos + rowH
  }

  // Header tabla (primera página)
  y = dibujarHeaderTabla(y)

  // Variables para paginación
  let paginaActual = 1
  let totalPaginas = 1 // Se calculará después

  // Calcular total de páginas necesarias
  const calcularEspacioDisponible = (esPrimeraPagina: boolean, esUltimaPagina: boolean): number => {
    if (esPrimeraPagina && esUltimaPagina) {
      return pageHeight - y - ESPACIO_FOOTER
    } else if (esPrimeraPagina) {
      return pageHeight - y - MARGEN_INFERIOR
    } else if (esUltimaPagina) {
      return pageHeight - margin - ESPACIO_HEADER_TABLA - ESPACIO_FOOTER
    } else {
      return pageHeight - margin - ESPACIO_HEADER_TABLA - MARGEN_INFERIOR
    }
  }

  // Estimar páginas (aproximado: 12 items primera página, 19 siguientes)
  const itemsPrimeraPagina = Math.floor((pageHeight - y - ESPACIO_FOOTER) / rowH)
  const itemsPorPaginaSiguiente = Math.floor((pageHeight - margin - ESPACIO_HEADER_TABLA - MARGEN_INFERIOR) / rowH)

  if (orden.items.length <= itemsPrimeraPagina) {
    totalPaginas = 1
  } else {
    const itemsRestantes = orden.items.length - itemsPrimeraPagina
    totalPaginas = 1 + Math.ceil(itemsRestantes / itemsPorPaginaSiguiente)
  }

  // Filas con paginación
  orden.items.forEach((item, idx) => {
    // Verificar si necesitamos nueva página
    const esUltimoItem = idx === orden.items.length - 1
    const espacioNecesario = esUltimoItem ? rowH + ESPACIO_FOOTER : rowH

    if (y + espacioNecesario > pageHeight - MARGEN_INFERIOR) {
      // Nueva página
      doc.addPage()
      paginaActual++
      y = margin + 4
      y = dibujarHeaderTabla(y)
    }
    const cantidadRecibida = item.cantidad_recibida ?? 0
    const faltante = item.cantidad - cantidadRecibida
    const hayFaltante = esParcialORecibida && faltante > 0

    // Fondo: naranja si hay faltante, gris alterno normal
    if (hayFaltante) {
      doc.setFillColor(255, 240, 230) // naranja claro
      doc.rect(margin, y, contentWidth, rowH, 'F')
    } else if (idx % 2 === 0) {
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
    const maxNombreLen = esParcialORecibida ? 22 : 28
    const nombreTruncado = item.insumo_nombre.length > maxNombreLen
      ? item.insumo_nombre.substring(0, maxNombreLen) + '...'
      : item.insumo_nombre
    doc.text(nombreTruncado, colX.insumo, textY)

    if (esParcialORecibida) {
      // Columnas: PEDIDO, RECIBIDO, FALTANTE
      doc.setTextColor(50, 50, 50)
      const pedidoStr = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(2).replace('.', ',')
      doc.text(pedidoStr, (colX as any).pedidoRight, textY, { align: 'right' })

      doc.setTextColor(34, 139, 34) // verde
      const recibidoStr = cantidadRecibida % 1 === 0 ? cantidadRecibida.toFixed(0) : cantidadRecibida.toFixed(2).replace('.', ',')
      doc.text(recibidoStr, (colX as any).recibidoRight, textY, { align: 'right' })

      if (faltante > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(200, 50, 50) // rojo
        const faltanteStr = faltante % 1 === 0 ? faltante.toFixed(0) : faltante.toFixed(2).replace('.', ',')
        doc.text(faltanteStr, (colX as any).faltanteRight, textY, { align: 'right' })
        doc.setFont('helvetica', 'normal')
      } else {
        doc.setTextColor(150, 150, 150)
        doc.text('-', (colX as any).faltanteRight, textY, { align: 'right' })
      }
    } else {
      // IVA y CANT normales
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(5.5)
      const ivaStr = item.iva_porcentaje === 10.5 ? '10,5%' : item.iva_porcentaje === 0 ? '0%' : '21%'
      doc.text(ivaStr, (colX as any).ivaRight, textY, { align: 'right' })
      doc.setFontSize(6.5)

      doc.setTextColor(50, 50, 50)
      const cantStr = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(2).replace('.', ',')
      doc.text(cantStr, (colX as any).cantRight, textY, { align: 'right' })
    }

    doc.setTextColor(120, 120, 120)
    doc.setFontSize(6)
    doc.text(item.unidad_display, colX.unidad, textY)
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

  // Observaciones (indicaciones especiales del usuario)
  if (orden.notas) {
    // Caja destacada para observaciones
    doc.setFillColor(255, 250, 230) // amarillo suave
    doc.setDrawColor(...TERRACOTA_LIGHT)
    doc.setLineWidth(0.3)
    const notasLines = doc.splitTextToSize(orden.notas, contentWidth - 6)
    const boxH = notasLines.length * 3.5 + 8
    doc.roundedRect(margin, y, contentWidth, boxH, 1.5, 1.5, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...TERRACOTA)
    doc.text('OBSERVACIONES:', margin + 3, y + 5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(40, 40, 40)
    doc.text(notasLines, margin + 3, y + 10)
    y += boxH + 4
  }

  // Condiciones de entrega (texto fijo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(...TERRACOTA)
  doc.text('Condiciones:', margin + 2, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(100, 100, 100)
  const condiciones = [
    '• Mercadería sujeta a control de calidad al recibir.',
    '• Confirmar si el pedido será entregado en su totalidad.',
    '• Confirmar fecha de entrega.',
  ]
  condiciones.forEach((cond, i) => {
    doc.text(cond, margin + 2, y + 4 + (i * 3))
  })

  // Footer con número de página
  const footerY = pageHeight - margin - 8
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.2)
  doc.line(margin + 20, footerY, pageWidth - margin - 20, footerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(150, 130, 120)

  const textoPagina = totalPaginas > 1 ? `  |  Página ${paginaActual} de ${totalPaginas}` : ''
  doc.text(`Tero Restó  |  Orden de Compra${textoPagina}`, pageWidth / 2, footerY + 4, { align: 'center' })

  // Guardar - Proveedor primero, luego número de OC
  const proveedorNombre = orden.proveedor_nombre.replace(/\s+/g, '_')
  const numPart = orden.numero ? `_${orden.numero}` : ''
  const fileName = `OC_${proveedorNombre}${numPart}_${orden.fecha}.pdf`
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
