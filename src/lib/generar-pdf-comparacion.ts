import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Formatear moneda sin decimales para mejor legibilidad en PDF
function formatearPrecio(valor: number | null): string {
  if (valor === null || valor === undefined) return '-'
  return '$' + Math.round(valor).toLocaleString('es-AR')
}

interface InsumoRow {
  id: string
  nombre: string
  unidad_medida: string
}

interface ProveedorCol {
  id: string
  nombre: string
}

interface PrecioCell {
  insumo_id: string
  proveedor_id: string
  precio: number | null
}

interface ComparacionData {
  nombre: string
  categoria: string
  insumos: InsumoRow[]
  proveedores: ProveedorCol[]
  precios: PrecioCell[]
}

export function generarPDFComparacion(data: ComparacionData): void {
  const { nombre, categoria, insumos, proveedores, precios } = data

  if (insumos.length === 0 || proveedores.length === 0) {
    throw new Error('La comparación debe tener al menos un insumo y un proveedor')
  }

  // A4 vertical para más filas
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 10

  // Colores corporativos
  const ROJO_TERO = [180, 40, 40] as [number, number, number]
  const GRIS_OSCURO = [45, 45, 45] as [number, number, number]
  const GRIS_MEDIO = [120, 120, 120] as [number, number, number]
  const VERDE_EXITO = [46, 125, 50] as [number, number, number]
  const VERDE_CLARO = [232, 245, 233] as [number, number, number]
  const AMARILLO_DESTAQUE = [255, 243, 224] as [number, number, number]
  const AZUL_INFO = [33, 150, 243] as [number, number, number]

  const now = new Date()

  // === CREAR MAPA DE PRECIOS ===
  const precioMap = new Map<string, number | null>()
  for (const p of precios) {
    precioMap.set(`${p.insumo_id}-${p.proveedor_id}`, p.precio)
  }

  // === CALCULAR ESTADÍSTICAS ===
  const estadisticasProveedores: { nombre: string; mejoresPrecios: number; totalCotizado: number }[] = []
  let totalAhorroPotencial = 0

  for (const prov of proveedores) {
    estadisticasProveedores.push({ nombre: prov.nombre, mejoresPrecios: 0, totalCotizado: 0 })
  }

  for (const insumo of insumos) {
    const preciosInsumo: { provIdx: number; precio: number }[] = []

    proveedores.forEach((prov, idx) => {
      const precio = precioMap.get(`${insumo.id}-${prov.id}`)
      if (precio !== null && precio !== undefined && precio > 0) {
        preciosInsumo.push({ provIdx: idx, precio })
        estadisticasProveedores[idx].totalCotizado++
      }
    })

    if (preciosInsumo.length > 1) {
      const sorted = [...preciosInsumo].sort((a, b) => a.precio - b.precio)
      const mejorIdx = sorted[0].provIdx
      estadisticasProveedores[mejorIdx].mejoresPrecios++

      // Calcular ahorro potencial (diferencia entre peor y mejor)
      const peorPrecio = sorted[sorted.length - 1].precio
      const mejorPrecio = sorted[0].precio
      totalAhorroPotencial += (peorPrecio - mejorPrecio)
    } else if (preciosInsumo.length === 1) {
      estadisticasProveedores[preciosInsumo[0].provIdx].mejoresPrecios++
    }
  }

  // Ordenar proveedores por mejores precios
  const ranking = [...estadisticasProveedores].sort((a, b) => b.mejoresPrecios - a.mejoresPrecios)

  // === ENCABEZADO CON BANDA DE COLOR ===
  // Banda roja superior
  doc.setFillColor(...ROJO_TERO)
  doc.rect(0, 0, pageWidth, 18, 'F')

  // Logo/Nombre
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text('TERO', margin, 12)

  // Título del documento
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Análisis Comparativo de Precios', margin + 25, 12)

  // Fecha a la derecha
  doc.setFontSize(9)
  const fechaFormateada = now.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
  doc.text(fechaFormateada, pageWidth - margin, 12, { align: 'right' })

  let y = 26

  // === TÍTULO DE LA COMPARACIÓN ===
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...GRIS_OSCURO)
  doc.text(nombre.toUpperCase(), margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS_MEDIO)
  doc.text(`Categoría: ${categoria}`, margin, y + 6)

  y += 14

  // === RESUMEN EJECUTIVO ===
  const boxWidth = (pageWidth - margin * 2 - 4) / 3
  const boxHeight = 20

  // Box 1: Alcance
  doc.setFillColor(245, 245, 245)
  doc.roundedRect(margin, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRIS_MEDIO)
  doc.text('ALCANCE', margin + 3, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS_OSCURO)
  doc.text(`${insumos.length} insumos`, margin + 3, y + 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`${proveedores.length} proveedores`, margin + 3, y + 17)

  // Box 2: Mejor proveedor
  const mejorProv = ranking[0]
  doc.setFillColor(...VERDE_CLARO)
  doc.roundedRect(margin + boxWidth + 2, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...VERDE_EXITO)
  doc.text('PROVEEDOR RECOMENDADO', margin + boxWidth + 5, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS_OSCURO)
  const nombreProvTruncado = mejorProv.nombre.length > 16 ? mejorProv.nombre.substring(0, 16) + '...' : mejorProv.nombre
  doc.text(nombreProvTruncado, margin + boxWidth + 5, y + 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...VERDE_EXITO)
  doc.text(`${mejorProv.mejoresPrecios} mejores (${Math.round(mejorProv.mejoresPrecios / insumos.length * 100)}%)`, margin + boxWidth + 5, y + 17)

  // Box 3: Ahorro potencial
  doc.setFillColor(...AMARILLO_DESTAQUE)
  doc.roundedRect(margin + (boxWidth + 2) * 2, y, boxWidth, boxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(180, 130, 50)
  doc.text('AHORRO POTENCIAL', margin + (boxWidth + 2) * 2 + 3, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS_OSCURO)
  doc.text(formatearPrecio(totalAhorroPotencial), margin + (boxWidth + 2) * 2 + 3, y + 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRIS_MEDIO)
  doc.text('eligiendo el mejor precio', margin + (boxWidth + 2) * 2 + 3, y + 17)

  y += boxHeight + 8

  // === RANKING DE PROVEEDORES (mini tabla) ===
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...GRIS_OSCURO)
  doc.text('Ranking de Proveedores', margin, y + 4)

  const rankingData = ranking.map((r, idx) => [
    `${idx + 1}°`,
    r.nombre,
    r.mejoresPrecios.toString(),
    `${Math.round(r.mejoresPrecios / insumos.length * 100)}%`
  ])

  autoTable(doc, {
    startY: y + 6,
    head: [['#', 'Proveedor', 'Mejores', '%']],
    body: rankingData,
    margin: { left: margin, right: pageWidth - margin - 90 },
    tableWidth: 90,
    theme: 'plain',
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: GRIS_OSCURO,
      fontStyle: 'bold',
      fontSize: 6,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 45 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 17, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = VERDE_EXITO
      }
    }
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // === TABLA PRINCIPAL DE COMPARACIÓN ===
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRIS_OSCURO)
  doc.text('Detalle de Precios por Insumo', margin, y)
  y += 4

  // Headers
  const numProveedores = proveedores.length
  const headers = [
    'INSUMO',
    'UN.',
    ...proveedores.map(p => p.nombre.length > 10 ? p.nombre.substring(0, 10) + '.' : p.nombre),
    'MEJOR',
    'GANADOR',
  ]

  // Calcular anchos (ajustados para vertical)
  const anchoInsumo = 42
  const anchoUnidad = 10
  const anchoMejor = 18
  const anchoGanador = 30
  const anchoDisponible = pageWidth - margin * 2 - anchoInsumo - anchoUnidad - anchoMejor - anchoGanador
  const anchoProveedor = Math.min(22, anchoDisponible / numProveedores)

  // Body
  const tableData: any[][] = []

  for (const insumo of insumos) {
    const row: any[] = [
      insumo.nombre.length > 25 ? insumo.nombre.substring(0, 25) + '...' : insumo.nombre,
      insumo.unidad_medida
    ]

    const preciosInsumo: { precio: number | null; proveedorNombre: string }[] = []

    for (const prov of proveedores) {
      const precio = precioMap.get(`${insumo.id}-${prov.id}`) ?? null
      preciosInsumo.push({ precio, proveedorNombre: prov.nombre })
      row.push(formatearPrecio(precio))
    }

    const preciosValidos = preciosInsumo.filter(p => p.precio !== null && p.precio > 0)
    let mejorPrecio: number | null = null
    let mejorProveedor = '-'

    if (preciosValidos.length > 0) {
      const minPrecio = Math.min(...preciosValidos.map(p => p.precio!))
      mejorPrecio = minPrecio
      mejorProveedor = preciosValidos.find(p => p.precio === minPrecio)?.proveedorNombre || '-'
    }

    row.push(formatearPrecio(mejorPrecio))
    row.push(mejorProveedor.length > 14 ? mejorProveedor.substring(0, 14) + '.' : mejorProveedor)

    tableData.push(row)
  }

  // Column styles
  const columnStyles: Record<number, any> = {
    0: { cellWidth: anchoInsumo, halign: 'left', fontStyle: 'bold' },
    1: { cellWidth: anchoUnidad, halign: 'center', textColor: GRIS_MEDIO },
  }

  for (let i = 0; i < numProveedores; i++) {
    columnStyles[2 + i] = { cellWidth: anchoProveedor, halign: 'right' }
  }

  const colMejor = 2 + numProveedores
  const colGanador = colMejor + 1
  columnStyles[colMejor] = {
    cellWidth: anchoMejor,
    halign: 'right',
    fillColor: VERDE_CLARO,
    fontStyle: 'bold',
    textColor: VERDE_EXITO,
  }
  columnStyles[colGanador] = {
    cellWidth: anchoGanador,
    halign: 'left',
    fillColor: VERDE_CLARO,
    fontSize: 7,
    textColor: VERDE_EXITO,
  }

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableData,
    margin: { left: margin, right: margin, bottom: 18 },
    theme: 'striped',
    headStyles: {
      fillColor: GRIS_OSCURO,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      minCellHeight: 7,
      valign: 'middle',
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles,
    didParseCell: (data) => {
      // Resaltar mejor precio en columnas de proveedores
      if (data.section === 'body' && data.column.index >= 2 && data.column.index < 2 + numProveedores) {
        const rowIndex = data.row.index
        const insumo = insumos[rowIndex]
        if (!insumo) return

        const preciosRow: number[] = []
        for (const prov of proveedores) {
          const precio = precioMap.get(`${insumo.id}-${prov.id}`)
          if (precio !== null && precio !== undefined && precio > 0) {
            preciosRow.push(precio)
          }
        }

        if (preciosRow.length > 0) {
          const minPrecio = Math.min(...preciosRow)
          const colProvIndex = data.column.index - 2
          const prov = proveedores[colProvIndex]
          const precioActual = precioMap.get(`${insumo.id}-${prov.id}`)

          if (precioActual !== null && precioActual !== undefined && precioActual === minPrecio) {
            data.cell.styles.fillColor = AMARILLO_DESTAQUE
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.textColor = [180, 100, 0]
          }
        }
      }
    },
    didDrawPage: (data) => {
      // Footer profesional
      const footerY = pageHeight - 10

      // Línea separadora
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

      doc.setFontSize(7)
      doc.setTextColor(...GRIS_MEDIO)
      doc.setFont('helvetica', 'normal')

      // Izquierda: generado por
      doc.text('Generado por Sistema TERO', margin, footerY)

      // Centro: fecha y hora
      const fechaHora = `${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
      doc.text(fechaHora, pageWidth / 2, footerY, { align: 'center' })

      // Derecha: página
      const pageCount = (doc as any).internal.getNumberOfPages()
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber
      doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - margin, footerY, { align: 'right' })
    },
  })

  // === GUARDAR ===
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const nombreLimpio = nombre.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  const fileName = `comparacion-${nombreLimpio}-${dd}-${mm}-${yyyy}.pdf`

  doc.save(fileName)
}
