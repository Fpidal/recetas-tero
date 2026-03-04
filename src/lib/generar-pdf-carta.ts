import jsPDF from 'jspdf'

interface CartaItem {
  plato_nombre: string
  plato_seccion: string
  precio_carta: number
}

const SECCIONES_ORDEN = ['Entradas', 'Principales', 'Pastas y Arroces', 'Ensaladas', 'Postres']

export function generarPDFCarta(items: CartaItem[], nombreRestaurante: string = 'TERO') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const gapColumnas = 10
  const columnWidth = (pageWidth - margin * 2 - gapColumnas) / 2

  // Colores
  const colorPrimario: [number, number, number] = [80, 60, 40]
  const colorSecundario: [number, number, number] = [100, 100, 100]
  const colorLinea: [number, number, number] = [180, 160, 140]

  // Header
  let y = margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...colorPrimario)
  doc.text(nombreRestaurante, pageWidth / 2, y + 8, { align: 'center' })

  // Línea decorativa
  doc.setDrawColor(...colorLinea)
  doc.setLineWidth(0.5)
  y += 15
  doc.line(margin + 20, y, pageWidth - margin - 20, y)

  y += 10
  const startY = y

  // Agrupar items por sección
  const itemsPorSeccion = SECCIONES_ORDEN
    .map(seccion => ({
      seccion,
      items: items
        .filter(i => i.plato_seccion === seccion)
        .sort((a, b) => a.plato_nombre.localeCompare(b.plato_nombre)),
    }))
    .filter(grupo => grupo.items.length > 0)

  // Formatear precio
  const formatPrecio = (precio: number) => `$${precio.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  // Calcular altura de cada sección
  const alturaSeccion = (grupo: { seccion: string; items: CartaItem[] }) => {
    return 8 + (grupo.items.length * 5) // título + items
  }

  // Distribuir secciones en columnas manteniendo cada sección completa
  let col0Y = startY
  let col1Y = startY
  const seccionesCol0: typeof itemsPorSeccion = []
  const seccionesCol1: typeof itemsPorSeccion = []

  itemsPorSeccion.forEach(grupo => {
    const altura = alturaSeccion(grupo)
    // Poner en la columna más corta
    if (col0Y <= col1Y) {
      seccionesCol0.push(grupo)
      col0Y += altura + 5
    } else {
      seccionesCol1.push(grupo)
      col1Y += altura + 5
    }
  })

  // Función para dibujar una sección
  const dibujarSeccion = (grupo: { seccion: string; items: CartaItem[] }, colX: number, startYSeccion: number): number => {
    let currentY = startYSeccion

    // Título de sección
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...colorPrimario)
    doc.text(grupo.seccion.toUpperCase(), colX, currentY)

    // Línea bajo título
    doc.setDrawColor(...colorLinea)
    doc.setLineWidth(0.3)
    doc.line(colX, currentY + 1.5, colX + columnWidth, currentY + 1.5)

    currentY += 6

    // Items
    grupo.items.forEach(item => {
      // Nombre del plato
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...colorSecundario)

      // Truncar nombre si es muy largo
      let nombre = item.plato_nombre
      const maxNombreWidth = columnWidth - 22
      while (doc.getTextWidth(nombre) > maxNombreWidth && nombre.length > 3) {
        nombre = nombre.slice(0, -1)
      }
      if (nombre !== item.plato_nombre) {
        nombre += '...'
      }

      doc.text(nombre, colX, currentY)

      // Precio alineado a la derecha
      const precioText = formatPrecio(item.precio_carta)
      doc.setFont('helvetica', 'bold')
      doc.text(precioText, colX + columnWidth, currentY, { align: 'right' })

      // Puntos entre nombre y precio
      doc.setFont('helvetica', 'normal')
      const nombreWidth = doc.getTextWidth(nombre)
      const precioWidth = doc.getTextWidth(precioText)
      doc.setFillColor(180, 180, 180)
      for (let x = colX + nombreWidth + 2; x < colX + columnWidth - precioWidth - 2; x += 1.5) {
        doc.circle(x, currentY - 0.8, 0.2, 'F')
      }

      currentY += 5
    })

    return currentY + 3 // espacio después de la sección
  }

  // Dibujar columna izquierda
  let yCol0 = startY
  seccionesCol0.forEach(grupo => {
    yCol0 = dibujarSeccion(grupo, margin, yCol0)
  })

  // Dibujar columna derecha
  let yCol1 = startY
  seccionesCol1.forEach(grupo => {
    yCol1 = dibujarSeccion(grupo, margin + columnWidth + gapColumnas, yCol1)
  })

  // Pie de página
  const footerY = Math.max(yCol0, yCol1) + 10
  doc.setDrawColor(...colorLinea)
  doc.setLineWidth(0.3)
  doc.line(margin + 20, footerY, pageWidth - margin - 20, footerY)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text('Precios sujetos a modificación', pageWidth / 2, footerY + 5, { align: 'center' })

  // Guardar
  doc.save(`carta-${nombreRestaurante.toLowerCase()}.pdf`)
}
