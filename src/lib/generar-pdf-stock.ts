import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'

export type CategoriaStock =
  | 'Carnes'
  | 'Pescados_Mariscos'
  | 'Almacen'
  | 'Verduras_Frutas'
  | 'Lacteos_Fiambres'

interface InsumoStock {
  id: string
  nombre: string
  unidad_medida: string
  stock_actual: number | null
  stock_minimo: number | null
  proveedor_nombre: string | null
  subcategoria?: string
}

const CATEGORIA_CONFIG: Record<CategoriaStock, {
  titulo: string
  filename: string
  subsecciones?: { nombre: string; filtro: (nombre: string) => boolean }[]
}> = {
  Carnes: {
    titulo: 'CARNES',
    filename: 'stock-carnes',
    subsecciones: [
      { nombre: 'Pollo', filtro: (n) => n.toLowerCase().includes('pollo') },
      { nombre: 'Otras Carnes', filtro: (n) => !n.toLowerCase().includes('pollo') },
    ],
  },
  Pescados_Mariscos: {
    titulo: 'PESCADOS Y MARISCOS',
    filename: 'stock-pescados-mariscos',
    subsecciones: [
      { nombre: 'Mariscos', filtro: (n) => {
        const lower = n.toLowerCase()
        return lower.includes('marisco') || lower.includes('calamar') ||
               lower.includes('pulpo') || lower.includes('langostino') ||
               lower.includes('camarón') || lower.includes('camaron') ||
               lower.includes('mejillón') || lower.includes('mejillon') ||
               lower.includes('vieira') || lower.includes('almeja')
      }},
      { nombre: 'Pescados', filtro: () => true }, // El resto
    ],
  },
  Almacen: {
    titulo: 'ALMACÉN',
    filename: 'stock-almacen',
  },
  Verduras_Frutas: {
    titulo: 'VERDURAS Y FRUTAS',
    filename: 'stock-verduras-frutas',
  },
  Lacteos_Fiambres: {
    titulo: 'LÁCTEOS Y FIAMBRES',
    filename: 'stock-lacteos-fiambres',
  },
}

export async function fetchInsumosCategoria(categoria: CategoriaStock): Promise<InsumoStock[]> {
  // Obtener insumos activos de la categoría
  const { data: insumos, error } = await supabase
    .from('insumos')
    .select('id, nombre, unidad_medida')
    .eq('activo', true)
    .eq('categoria', categoria)
    .order('nombre')

  if (error || !insumos) {
    console.error('Error fetching insumos:', error)
    return []
  }

  // Obtener precios actuales con proveedor
  const { data: precios } = await supabase
    .from('precios_insumo')
    .select(`
      insumo_id,
      proveedores (nombre)
    `)
    .eq('es_precio_actual', true)
    .in('insumo_id', insumos.map(i => i.id))

  // Crear mapa de proveedor por insumo
  const proveedorMap = new Map<string, string>()
  for (const precio of (precios || [])) {
    if (precio.proveedores && (precio.proveedores as any).nombre) {
      proveedorMap.set(precio.insumo_id, (precio.proveedores as any).nombre)
    }
  }

  // Obtener stock de factura_items (solo facturas activas)
  const { data: stockData } = await supabase
    .from('factura_items')
    .select(`
      insumo_id,
      cantidad,
      facturas_proveedor!inner (activo)
    `)
    .in('insumo_id', insumos.map(i => i.id))
    .eq('facturas_proveedor.activo', true)

  // Calcular stock total por insumo
  const stockMap = new Map<string, number>()
  for (const item of (stockData || [])) {
    const current = stockMap.get(item.insumo_id) || 0
    stockMap.set(item.insumo_id, current + (item.cantidad || 0))
  }

  return insumos.map(insumo => ({
    id: insumo.id,
    nombre: insumo.nombre,
    unidad_medida: insumo.unidad_medida,
    stock_actual: stockMap.get(insumo.id) || null,
    stock_minimo: null, // No existe en la BD actualmente
    proveedor_nombre: proveedorMap.get(insumo.id) || null,
  }))
}

export async function contarInsumosCategoria(categoria: CategoriaStock): Promise<number> {
  const { count, error } = await supabase
    .from('insumos')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('categoria', categoria)

  if (error) {
    console.error('Error counting insumos:', error)
    return 0
  }

  return count || 0
}

export async function generarPDFStock(categoria: CategoriaStock): Promise<void> {
  const config = CATEGORIA_CONFIG[categoria]
  const insumos = await fetchInsumosCategoria(categoria)

  if (insumos.length === 0) {
    throw new Error('No hay insumos en esta categoría')
  }

  // A4 vertical
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const margin = 10

  // Colores
  const GRIS_OSCURO = '#1a1a1a'
  const GRIS_MEDIO = '#666666'

  let y = margin

  // === ENCABEZADO COMPACTO ===
  // "TERO" y "CONTROL DE STOCK" en la misma línea
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(GRIS_OSCURO)
  doc.text('TERO', margin, y + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(GRIS_MEDIO)
  doc.text('CONTROL DE STOCK', margin + 22, y + 4)

  // Categoría a la derecha
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(GRIS_OSCURO)
  doc.text(config.titulo, pageWidth - margin, y + 4, { align: 'right' })
  y += 8

  // Rectángulo con fecha y responsable (más compacto)
  const boxX = margin
  const boxWidth = pageWidth - margin * 2
  const boxHeight = 8
  doc.setFillColor(248, 248, 248)
  doc.setDrawColor(204, 204, 204)
  doc.setLineWidth(0.2)
  doc.rect(boxX, y, boxWidth, boxHeight, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(GRIS_OSCURO)
  doc.text('Fecha: ___/___/______', margin + 3, y + 5.5)
  doc.text('Responsable: _______________________', pageWidth - margin - 3, y + 5.5, { align: 'right' })
  y += boxHeight + 3

  // === TABLA ===
  // Preparar datos con subsecciones si aplica
  const tableData: any[][] = []

  if (config.subsecciones) {
    // Categorías con subsecciones (Carnes, Pescados y Mariscos)
    let remaining = [...insumos]

    for (let i = 0; i < config.subsecciones.length; i++) {
      const subseccion = config.subsecciones[i]

      let itemsSubseccion: InsumoStock[]
      if (i === config.subsecciones.length - 1) {
        // Última subsección: todo lo que queda
        itemsSubseccion = remaining
      } else {
        itemsSubseccion = remaining.filter(insumo => subseccion.filtro(insumo.nombre))
        remaining = remaining.filter(insumo => !subseccion.filtro(insumo.nombre))
      }

      if (itemsSubseccion.length > 0) {
        // Fila de sección
        tableData.push([{
          content: subseccion.nombre.toUpperCase(),
          colSpan: 6,
          styles: {
            fillColor: [220, 220, 220],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'left',
            cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
          },
        }])

        // Filas de insumos
        for (const insumo of itemsSubseccion) {
          tableData.push([
            insumo.nombre,
            insumo.unidad_medida,
            insumo.stock_actual !== null ? formatStock(insumo.stock_actual) : '',
            insumo.stock_minimo !== null ? formatStock(insumo.stock_minimo) : '',
            '', // Pedido siempre vacío
            insumo.proveedor_nombre || '',
          ])
        }
      }
    }
  } else {
    // Categorías sin subsecciones
    for (const insumo of insumos) {
      tableData.push([
        insumo.nombre,
        insumo.unidad_medida,
        insumo.stock_actual !== null ? formatStock(insumo.stock_actual) : '',
        insumo.stock_minimo !== null ? formatStock(insumo.stock_minimo) : '',
        '', // Pedido siempre vacío
        insumo.proveedor_nombre || '',
      ])
    }
  }

  // Generar tabla con autoTable
  autoTable(doc, {
    startY: y,
    head: [['ARTÍCULO', 'UN', 'STOCK', 'MÍN.', 'PEDIDO', 'PROVEEDOR']],
    body: tableData,
    margin: { left: margin, right: margin, bottom: 15 },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.1,
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      cellPadding: 1.5,
      lineColor: [150, 150, 150],
      lineWidth: 0.15,
    },
    bodyStyles: {
      fontSize: 8,
      minCellHeight: 5.5,
      valign: 'middle',
      cellPadding: { top: 1, bottom: 1, left: 1.5, right: 1.5 },
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 252],
    },
    columnStyles: {
      0: { cellWidth: boxWidth * 0.36, halign: 'left' }, // Artículo
      1: { cellWidth: boxWidth * 0.08, halign: 'center' }, // Unidad
      2: { cellWidth: boxWidth * 0.12, halign: 'center' }, // Stock Actual
      3: { cellWidth: boxWidth * 0.10, halign: 'center' }, // Stock Mín.
      4: { cellWidth: boxWidth * 0.14, halign: 'center' }, // Pedido
      5: { cellWidth: boxWidth * 0.20, halign: 'left', fontSize: 7, textColor: [80, 80, 80] }, // Proveedor
    },
    rowPageBreak: 'avoid',
    didDrawPage: (data) => {
      // Footer en cada página
      const pageHeight = doc.internal.pageSize.getHeight()
      const footerY = pageHeight - 8

      // Textos del footer compactos
      doc.setFontSize(7)
      doc.setTextColor(100, 100, 100)
      doc.setFont('helvetica', 'normal')
      doc.text('Bajo mínimo: ____', margin, footerY)

      const now = new Date()
      const fechaGenerado = `${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
      doc.text(fechaGenerado, pageWidth / 2, footerY, { align: 'center' })

      doc.text('Firma: ________________', pageWidth - margin, footerY, { align: 'right' })
    },
  })

  // Generar nombre de archivo con fecha
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const fileName = `${config.filename}-${dd}-${mm}-${yyyy}.pdf`

  doc.save(fileName)
}

function formatStock(value: number): string {
  if (value === 0) return '0'
  if (Number.isInteger(value)) return value.toString()
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
}

// === INSUMOS MENÚS ===
// ID del proveedor "COCINA" que tiene las OC con insumos de menús
const PROVEEDOR_COCINA_ID = '6205cb15-a690-4730-b359-4dd097243bbd'

interface InsumoMenu {
  id: string
  nombre: string
  unidad_medida: string
  categoria: string
}

const CATEGORIA_ORDEN_MENUS = [
  'Carnes',
  'Pescados_Mariscos',
  'Verduras_Frutas',
  'Lacteos_Fiambres',
  'Almacen',
]

const CATEGORIA_TITULOS: Record<string, string> = {
  'Carnes': 'CARNES',
  'Pescados_Mariscos': 'PESCADOS Y MARISCOS',
  'Verduras_Frutas': 'VERDURAS Y FRUTAS',
  'Lacteos_Fiambres': 'LÁCTEOS Y FIAMBRES',
  'Almacen': 'ALMACÉN',
}

export async function fetchInsumosMenus(): Promise<InsumoMenu[]> {
  // Buscar OC del proveedor COCINA (están en papelera)
  const { data: ordenes } = await supabase
    .from('ordenes_compra')
    .select('id')
    .eq('proveedor_id', PROVEEDOR_COCINA_ID)
    .eq('activo', false)

  if (!ordenes || ordenes.length === 0) {
    return []
  }

  const ordenIds = ordenes.map(o => o.id)

  // Obtener items de esas OC con info del insumo
  const { data: items } = await supabase
    .from('orden_compra_items')
    .select('insumo_id, insumos(id, nombre, unidad_medida, categoria)')
    .in('orden_compra_id', ordenIds)

  if (!items) return []

  // Extraer insumos únicos
  const insumosMap = new Map<string, InsumoMenu>()
  for (const item of items) {
    if (item.insumo_id && item.insumos) {
      const insumo = item.insumos as any
      if (!insumosMap.has(insumo.id)) {
        insumosMap.set(insumo.id, {
          id: insumo.id,
          nombre: insumo.nombre,
          unidad_medida: insumo.unidad_medida,
          categoria: insumo.categoria || 'Almacen',
        })
      }
    }
  }

  // Ordenar por categoría y nombre
  const insumos = Array.from(insumosMap.values())
  insumos.sort((a, b) => {
    const catA = CATEGORIA_ORDEN_MENUS.indexOf(a.categoria)
    const catB = CATEGORIA_ORDEN_MENUS.indexOf(b.categoria)
    if (catA !== catB) return catA - catB
    return a.nombre.localeCompare(b.nombre)
  })

  return insumos
}

export async function contarInsumosMenus(): Promise<number> {
  const insumos = await fetchInsumosMenus()
  return insumos.length
}

export async function generarPDFInsumosMenus(): Promise<void> {
  const insumos = await fetchInsumosMenus()

  if (insumos.length === 0) {
    throw new Error('No hay insumos de menús')
  }

  // Agregar "Pescado Blanco" si no existe en Pescados_Mariscos
  const tienePescadoBlanco = insumos.some(i => i.nombre.toLowerCase().includes('pescado blanco'))
  if (!tienePescadoBlanco) {
    insumos.push({
      id: 'manual-pescado-blanco',
      nombre: 'Pescado Blanco',
      unidad_medida: 'kg',
      categoria: 'Pescados_Mariscos',
    })
  }

  // Reordenar después de agregar
  insumos.sort((a, b) => {
    const catA = CATEGORIA_ORDEN_MENUS.indexOf(a.categoria)
    const catB = CATEGORIA_ORDEN_MENUS.indexOf(b.categoria)
    if (catA !== catB) return catA - catB
    return a.nombre.localeCompare(b.nombre)
  })

  // A4 vertical
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 10
  const columnGap = 8
  const columnWidth = (pageWidth - margin * 2 - columnGap) / 2

  // Colores
  const GRIS_OSCURO = '#1a1a1a'
  const GRIS_MEDIO = '#666666'

  let y = margin

  const now = new Date()

  // === ENCABEZADO PROFESIONAL ===
  // Línea superior decorativa
  doc.setDrawColor(45, 45, 45)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // Título principal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(GRIS_OSCURO)
  doc.text('CONTROL DE INSUMOS', margin, y + 6)

  // Subtítulo
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(GRIS_MEDIO)
  doc.text('Menús Ejecutivos', margin, y + 12)

  // Logo/Marca a la derecha
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(GRIS_OSCURO)
  doc.text('TERO', pageWidth - margin, y + 6, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(GRIS_MEDIO)
  doc.text('RESTÓ', pageWidth - margin, y + 11, { align: 'right' })

  y += 18

  // Línea separadora
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // Campos de fecha y responsable - estilo minimalista
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(GRIS_MEDIO)
  doc.text('Fecha:', margin, y + 3)
  doc.setTextColor(GRIS_OSCURO)
  doc.text('____/____/________', margin + 14, y + 3)

  doc.setTextColor(GRIS_MEDIO)
  doc.text('Responsable:', pageWidth - margin - 60, y + 3)
  doc.setDrawColor(180, 180, 180)
  doc.line(pageWidth - margin - 40, y + 3, pageWidth - margin, y + 3)

  y += 10

  // Agrupar insumos por categoría
  const insumosPorCategoria: Record<string, InsumoMenu[]> = {}
  for (const cat of CATEGORIA_ORDEN_MENUS) {
    insumosPorCategoria[cat] = insumos.filter(i => i.categoria === cat)
  }

  // Preparar items para las 2 columnas
  interface ItemLinea {
    tipo: 'categoria' | 'insumo' | 'vacio'
    texto: string
    unidad?: string
  }

  const items: ItemLinea[] = []
  for (const cat of CATEGORIA_ORDEN_MENUS) {
    const insumosCategoria = insumosPorCategoria[cat]
    if (insumosCategoria.length > 0) {
      items.push({ tipo: 'categoria', texto: CATEGORIA_TITULOS[cat] || cat })
      for (const ins of insumosCategoria) {
        items.push({ tipo: 'insumo', texto: ins.nombre, unidad: ins.unidad_medida })
      }
      // Agregar 2 filas vacías al final de cada categoría
      items.push({ tipo: 'vacio', texto: '' })
      items.push({ tipo: 'vacio', texto: '' })
    }
  }

  // Configuración de filas
  const rowHeight = 6
  const headerRowHeight = 7
  const startY = y
  const maxY = pageHeight - 12 // Espacio para footer

  // Calcular punto de división para balancear columnas
  // Dividir aproximadamente por la mitad de items
  const totalItems = items.length
  const mitad = Math.ceil(totalItems / 2)

  // Ajustar para no cortar una categoría a la mitad
  let puntoCorte = mitad
  // Buscar el inicio de una categoría cercano a la mitad
  for (let i = mitad; i < totalItems; i++) {
    if (items[i].tipo === 'categoria') {
      puntoCorte = i
      break
    }
  }

  const itemsColumna1 = items.slice(0, puntoCorte)
  const itemsColumna2 = items.slice(puntoCorte)

  // Función para dibujar una columna
  function dibujarColumna(itemsCol: ItemLinea[], columnIndex: number) {
    let currentY = startY
    const x = margin + columnIndex * (columnWidth + columnGap)

    for (const item of itemsCol) {
      if (currentY + rowHeight > maxY) break

      if (item.tipo === 'categoria') {
        // Encabezado de categoría - estilo profesional
        doc.setFillColor(45, 45, 45)
        doc.roundedRect(x, currentY, columnWidth, headerRowHeight, 1, 1, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        doc.text(item.texto, x + 4, currentY + 5)
        currentY += headerRowHeight + 1
      } else if (item.tipo === 'vacio') {
        // Fila vacía - solo línea inferior sutil
        doc.setDrawColor(220, 220, 220)
        doc.setLineWidth(0.2)
        doc.line(x, currentY + rowHeight, x + columnWidth, currentY + rowHeight)
        currentY += rowHeight
      } else {
        // Fila de insumo - diseño limpio sin bordes laterales
        // Solo línea inferior
        doc.setDrawColor(230, 230, 230)
        doc.setLineWidth(0.2)
        doc.line(x, currentY + rowHeight, x + columnWidth, currentY + rowHeight)

        // Nombre del insumo
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(GRIS_OSCURO)
        const maxNombreWidth = columnWidth * 0.65
        let nombreTruncado = item.texto
        while (doc.getTextWidth(nombreTruncado) > maxNombreWidth && nombreTruncado.length > 3) {
          nombreTruncado = nombreTruncado.slice(0, -1)
        }
        if (nombreTruncado !== item.texto) nombreTruncado += '...'
        doc.text(nombreTruncado, x + 2, currentY + 4.3)

        // Unidad - alineada a la derecha
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(item.unidad || '', x + columnWidth - 2, currentY + 4.3, { align: 'right' })

        currentY += rowHeight
      }
    }
  }

  // Dibujar ambas columnas
  dibujarColumna(itemsColumna1, 0)
  dibujarColumna(itemsColumna2, 1)

  // Footer profesional
  const footerY = pageHeight - 10

  // Línea separadora del footer
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.2)
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3)

  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.setFont('helvetica', 'normal')

  const fechaGenerado = `Generado: ${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
  doc.text(fechaGenerado, margin, footerY)

  doc.text('Firma: ______________________', pageWidth - margin, footerY, { align: 'right' })

  // Guardar
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  doc.save(`insumos-menus-${dd}-${mm}-${yyyy}.pdf`)
}
