import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import { supabase } from './supabase'
import { PlayfairDisplayBold } from './fonts/playfair-display'

interface VinoEnCarta {
  id: string
  bodega: string
  nombre: string
  cepa: string
  zona: string | null
  categoria: string
  recomendado: boolean
}

// Colores del diseño
const COLORS = {
  fondo: [240, 233, 220] as const,           // #F0E9DC - pergamino
  bordeExt: [123, 48, 33] as const,          // #7B3021 - terracota
  bordeInt: [196, 168, 152] as const,        // #C4A898 - beige
  titulo: [123, 48, 33] as const,            // #7B3021 - terracota
  subtitulo: [160, 80, 48] as const,         // #A05030 - terracota claro
  verde: [74, 88, 48] as const,              // #4A5830 - verde oliva
  texto: [35, 21, 8] as const,               // #231508 - negro cálido
  region: [138, 112, 96] as const,           // #8A7060 - marrón suave
  pie: [90, 58, 32] as const,                // #5A3A20 - marrón
  linea: [196, 168, 152] as const,           // #C4A898 - beige
}

// Tamaños de fuente (en pt)
const FONT_SIZES = {
  tituloPrincipal: 30,
  subtitulo: 12,
  tagline: 11,
  seccion: 11,
  nombreVino: 10,
  region: 8.5,
  textoQR: 8,
  pie: 7.5,
}

export async function generarPDFCartaVinos() {
  // Fetch vinos en carta con datos del vino
  const { data, error } = await supabase
    .from('carta_vinos')
    .select(`
      id,
      recomendado,
      vinos (id, bodega, nombre, cepa, zona, categoria)
    `)
    .eq('activo', true)
    .order('recomendado', { ascending: false })

  if (error || !data) {
    alert('Error al cargar los vinos de la carta')
    console.error(error)
    return
  }

  // Mapear datos
  const vinos: VinoEnCarta[] = data.map((item: any) => ({
    id: item.id,
    bodega: item.vinos?.bodega || '',
    nombre: item.vinos?.nombre || '',
    cepa: item.vinos?.cepa || '',
    zona: item.vinos?.zona || null,
    categoria: item.vinos?.categoria || '',
    recomendado: item.recomendado || false,
  }))

  // Función para ordenar vinos por bodega, nombre, cepa, zona
  const sortVinos = (a: VinoEnCarta, b: VinoEnCarta) => {
    if (a.bodega !== b.bodega) return a.bodega.localeCompare(b.bodega)
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre)
    if (a.cepa !== b.cepa) return a.cepa.localeCompare(b.cepa)
    return (a.zona || '').localeCompare(b.zona || '')
  }

  // Agrupar vinos
  const recomendados = vinos.filter(v => v.recomendado).sort(sortVinos).slice(0, 8)
  const malbec = vinos.filter(v => v.cepa.toLowerCase().includes('malbec') && !v.recomendado).sort(sortVinos)
  const otrosTintos = vinos.filter(v =>
    (v.categoria.toLowerCase() === 'tintos' || v.categoria.toLowerCase() === 'tinto') &&
    !v.cepa.toLowerCase().includes('malbec') &&
    !v.recomendado
  ).sort(sortVinos)
  const blancos = vinos.filter(v =>
    (v.categoria.toLowerCase() === 'blancos' || v.categoria.toLowerCase() === 'blanco') &&
    !v.recomendado
  ).sort(sortVinos)
  const espumantes = vinos.filter(v =>
    (v.categoria.toLowerCase() === 'espumantes' || v.categoria.toLowerCase() === 'espumante') &&
    !v.recomendado
  ).sort(sortVinos)

  // Crear PDF A4
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // Registrar fuente Playfair Display
  doc.addFileToVFS('PlayfairDisplay-Bold.ttf', PlayfairDisplayBold)
  doc.addFont('PlayfairDisplay-Bold.ttf', 'PlayfairDisplay', 'bold')
  const pageWidth = 210
  const pageHeight = 297
  const marginX = 20
  const marginY = 15
  const colGap = 9
  const colWidth = (pageWidth - marginX * 2 - colGap) / 2
  const colLeftX = marginX
  const colRightX = marginX + colWidth + colGap
  const separatorX = marginX + colWidth + colGap / 2

  // Límites de página
  const contentTop = marginY + 20
  const contentBottom = pageHeight - marginY - 20

  // === FUNCIONES AUXILIARES ===

  function drawPageBackground() {
    doc.setFillColor(...COLORS.fondo)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')

    // Borde exterior
    doc.setDrawColor(...COLORS.bordeExt)
    doc.setLineWidth(0.46)
    doc.rect(8, 8, pageWidth - 16, pageHeight - 16)

    // Borde interior
    doc.setDrawColor(...COLORS.bordeInt)
    doc.setLineWidth(0.14)
    doc.rect(10.5, 10.5, pageWidth - 21, pageHeight - 21)
  }

  function drawDots(centerX: number, dotY: number, color: readonly [number, number, number] = COLORS.linea) {
    doc.setFillColor(...color)
    const dotSize = 0.4
    const spacing = 2.5
    for (let i = -3; i <= 3; i++) {
      doc.circle(centerX + i * spacing, dotY, dotSize, 'F')
    }
  }

  function drawGrapeCluster(centerX: number, centerY: number) {
    doc.setFillColor(...COLORS.verde)
    const size = 1.2
    const positions = [
      [0, 0], [size * 2, 0], [size * 4, 0],
      [size, -size * 1.7], [size * 3, -size * 1.7],
      [size * 2, -size * 3.4],
    ]
    positions.forEach(([px, py]) => {
      doc.circle(centerX - size * 2 + px, centerY + py, size, 'F')
    })
    doc.setDrawColor(...COLORS.verde)
    doc.setLineWidth(0.3)
    doc.line(centerX, centerY + size, centerX, centerY + size * 2.5)
    doc.ellipse(centerX, centerY + size * 3, 2, 1.2, 'F')
  }

  function drawHeaderWithLines(text: string, textY: number, color: readonly [number, number, number], xStart: number, width: number) {
    doc.setFont('PlayfairDisplay', 'bold')
    doc.setFontSize(FONT_SIZES.seccion)
    doc.setTextColor(...color)

    const textWidth = doc.getTextWidth(text)
    const centerX = xStart + width / 2

    doc.text(text, centerX, textY, { align: 'center' })

    doc.setDrawColor(...color)
    doc.setLineWidth(0.2)
    const lineMargin = 4
    doc.line(xStart, textY - 1.5, centerX - textWidth / 2 - lineMargin, textY - 1.5)
    doc.line(centerX + textWidth / 2 + lineMargin, textY - 1.5, xStart + width, textY - 1.5)
  }

  function drawColumnSeparator(fromY: number, toY: number) {
    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.2)
    doc.line(separatorX, fromY, separatorX, toY)
  }

  function drawFooter() {
    const pieY = pageHeight - marginY - 12
    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.2)
    doc.line(marginX + 10, pieY, pageWidth - marginX - 10, pieY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(FONT_SIZES.pie)
    doc.setTextColor(...COLORS.region)
    doc.text('Consultar precios actualizados escaneando el QR', pageWidth / 2, pieY + 5, { align: 'center' })
  }

  // === PÁGINA 1 ===
  drawPageBackground()

  let y = marginY + 15

  // Título principal
  doc.setFont('PlayfairDisplay', 'bold')
  doc.setFontSize(FONT_SIZES.tituloPrincipal)
  doc.setTextColor(...COLORS.titulo)
  doc.text('CARTA DE VINOS', pageWidth / 2, y, { align: 'center' })

  y += 10

  // Restaurante Tero con líneas
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(FONT_SIZES.subtitulo)
  doc.setTextColor(...COLORS.subtitulo)
  const subtituloText = 'Restaurante Tero'
  const subtituloWidth = doc.getTextWidth(subtituloText)

  doc.text(subtituloText, pageWidth / 2, y, { align: 'center' })

  doc.setDrawColor(...COLORS.subtitulo)
  doc.setLineWidth(0.3)
  doc.line(marginX + 15, y - 1.5, pageWidth / 2 - subtituloWidth / 2 - 8, y - 1.5)
  doc.line(pageWidth / 2 + subtituloWidth / 2 + 8, y - 1.5, pageWidth - marginX - 15, y - 1.5)

  y += 10

  // Racimo de uvas
  drawGrapeCluster(pageWidth / 2, y)

  y += 8

  // Línea divisora superior
  doc.setDrawColor(...COLORS.linea)
  doc.setLineWidth(0.2)
  doc.line(marginX + 10, y, pageWidth - marginX - 10, y)

  y += 6

  // Tagline
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(FONT_SIZES.tagline)
  doc.setTextColor(...COLORS.verde)
  doc.text('Selección de bodegas argentinas', pageWidth / 2, y, { align: 'center' })

  y += 5

  // Línea divisora inferior
  doc.line(marginX + 10, y, pageWidth - marginX - 10, y)

  y += 10

  // === RECOMENDADOS DEL MES ===
  if (recomendados.length > 0) {
    drawHeaderWithLines('RECOMENDADOS DEL MES', y, COLORS.titulo, marginX, pageWidth - marginX * 2)
    y += 5
    drawDots(pageWidth / 2, y)
    y += 8

    const midPoint = Math.ceil(recomendados.length / 2)
    const recCol1 = recomendados.slice(0, midPoint)
    const recCol2 = recomendados.slice(midPoint)

    const startY = y

    recCol1.forEach(vino => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FONT_SIZES.nombreVino)
      doc.setTextColor(...COLORS.texto)
      doc.text(`${vino.bodega} – ${vino.nombre}`, colLeftX, y)
      y += 3.5
      // Cepa y zona
      if (vino.cepa || vino.zona) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(FONT_SIZES.region)
        doc.setTextColor(...COLORS.region)
        const detalle = [vino.cepa, vino.zona].filter(Boolean).join(' · ')
        doc.text(detalle, colLeftX, y)
        y += 5
      } else {
        y += 3
      }
    })

    const endCol1Y = y
    y = startY

    recCol2.forEach(vino => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FONT_SIZES.nombreVino)
      doc.setTextColor(...COLORS.texto)
      doc.text(`${vino.bodega} – ${vino.nombre}`, colRightX, y)
      y += 3.5
      // Cepa y zona
      if (vino.cepa || vino.zona) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(FONT_SIZES.region)
        doc.setTextColor(...COLORS.region)
        const detalle = [vino.cepa, vino.zona].filter(Boolean).join(' · ')
        doc.text(detalle, colRightX, y)
        y += 5
      } else {
        y += 3
      }
    })

    y = Math.max(endCol1Y, y) + 5

    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.2)
    doc.line(marginX + 10, y, pageWidth - marginX - 10, y)
    y += 10
  }

  // === COLUMNAS PRINCIPALES ===
  const columnsStartY = y
  let yLeft = y
  let yRight = y

  // Función para dibujar vino
  function drawVino(vino: VinoEnCarta, xPos: number, currentY: number): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FONT_SIZES.nombreVino)
    doc.setTextColor(...COLORS.texto)

    // Línea 1: Bodega – Nombre
    let nombreDisplay = `${vino.bodega} – ${vino.nombre}`
    const maxWidth = colWidth - 2
    while (doc.getTextWidth(nombreDisplay) > maxWidth && nombreDisplay.length > 20) {
      nombreDisplay = nombreDisplay.slice(0, -4) + '...'
    }
    doc.text(nombreDisplay, xPos, currentY)
    currentY += 3.5

    // Línea 2: Cepa · Zona (en itálica, color región)
    if (vino.cepa || vino.zona) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(FONT_SIZES.region)
      doc.setTextColor(...COLORS.region)
      const detalle = [vino.cepa, vino.zona].filter(Boolean).join(' · ')
      doc.text(detalle, xPos, currentY)
      currentY += 5
    } else {
      currentY += 3
    }

    return currentY
  }

  // Función para dibujar sección de categoría
  function drawCategoryHeader(title: string, xPos: number, currentY: number, color: readonly [number, number, number]): number {
    drawHeaderWithLines(title, currentY, color, xPos, colWidth)
    currentY += 5
    drawDots(xPos + colWidth / 2, currentY)
    currentY += 8
    return currentY
  }

  // === PÁGINA 1: MALBEC (izq) y OTROS TINTOS (der) ===

  // MALBEC
  if (malbec.length > 0) {
    yLeft = drawCategoryHeader('MALBEC', colLeftX, yLeft, COLORS.titulo)
    for (const vino of malbec) {
      yLeft = drawVino(vino, colLeftX, yLeft)
    }
    yLeft += 5
  }

  // OTROS TINTOS
  if (otrosTintos.length > 0) {
    yRight = drawCategoryHeader('OTROS TINTOS', colRightX, yRight, COLORS.titulo)
    for (const vino of otrosTintos) {
      yRight = drawVino(vino, colRightX, yRight)
    }
    yRight += 5
  }

  // Separador vertical página 1
  const page1SeparatorEnd = Math.max(yLeft, yRight) + 5
  drawColumnSeparator(columnsStartY - 5, Math.min(page1SeparatorEnd, contentBottom))

  // Footer página 1
  drawFooter()

  // === PÁGINA 2: BLANCOS (izq) + ESPUMANTES (der) + QR ===
  if (blancos.length > 0 || espumantes.length > 0) {
    doc.addPage()
    drawPageBackground()

    yLeft = contentTop
    yRight = contentTop

    // BLANCOS
    if (blancos.length > 0) {
      yLeft = drawCategoryHeader('BLANCOS', colLeftX, yLeft, COLORS.verde)
      for (const vino of blancos) {
        yLeft = drawVino(vino, colLeftX, yLeft)
      }
      yLeft += 5
    }

    // ESPUMANTES
    if (espumantes.length > 0) {
      yRight = drawCategoryHeader('ESPUMANTES', colRightX, yRight, COLORS.verde)
      for (const vino of espumantes) {
        yRight = drawVino(vino, colRightX, yRight)
      }
      yRight += 5
    }

    // Separador vertical página 2
    const page2SeparatorEnd = Math.max(yLeft, yRight) + 5
    drawColumnSeparator(contentTop - 5, page2SeparatorEnd)

    // === QR CODE (centrado abajo) ===
    const qrUrl = 'https://recetas-tero.vercel.app/carta'
    const qrSize = 30
    const qrX = (pageWidth - qrSize) / 2
    const qrY = pageHeight - marginY - 75

    try {
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 300,
        margin: 0,
        color: {
          dark: '#231508',
          light: '#F0E9DC',
        },
      })

      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(FONT_SIZES.textoQR)
      doc.setTextColor(...COLORS.pie)
      const qrCenterX = pageWidth / 2
      doc.text('La carta de vinos se actualiza', qrCenterX, qrY + qrSize + 5, { align: 'center' })
      doc.text('según disponibilidad y añadas', qrCenterX, qrY + qrSize + 9, { align: 'center' })
      doc.text('de bodega.', qrCenterX, qrY + qrSize + 13, { align: 'center' })

    } catch (qrError) {
      console.error('Error generando QR:', qrError)
    }

    // Footer página 2
    drawFooter()
  }

  // Guardar PDF
  const fecha = new Date().toISOString().split('T')[0]
  doc.save(`Carta_Vinos_Tero_${fecha}.pdf`)
}
