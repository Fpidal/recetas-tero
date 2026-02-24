import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatearMoneda } from './formato-numeros'

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

const CATEGORIA_NOMBRES: Record<string, string> = {
  'Carnes': 'Carnes',
  'Almacen': 'Almacén',
  'Verduras_Frutas': 'Verduras y Frutas',
  'Pescados_Mariscos': 'Pescados y Mariscos',
  'Lacteos_Fiambres': 'Lácteos y Fiambres',
  'Bebidas': 'Bebidas',
  'Salsas_Recetas': 'Salsas y Recetas',
}

export function generarPDFComparacion(data: ComparacionData): void {
  const { nombre, categoria, insumos, proveedores, precios } = data

  if (insumos.length === 0 || proveedores.length === 0) {
    throw new Error('La comparación debe tener al menos un insumo y un proveedor')
  }

  // A4 landscape para más columnas
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageWidth = 297
  const margin = 10

  // Colores
  const GRIS_OSCURO = '#1a1a1a'
  const GRIS_MEDIO = '#666666'
  const VERDE_MEJOR = [200, 230, 201] // Verde suave para mejor precio
  const AMARILLO_MEJOR = [255, 249, 196] // Amarillo para destacar

  let y = margin

  // === ENCABEZADO ===
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(GRIS_OSCURO)
  doc.text('TERO', margin, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(GRIS_MEDIO)
  doc.text('COMPARADOR DE PRECIOS', margin + 22, y + 5)

  // Nombre de la comparación a la derecha
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(GRIS_OSCURO)
  doc.text(nombre.toUpperCase(), pageWidth - margin, y + 5, { align: 'right' })
  y += 10

  // Categoría y fecha
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(GRIS_MEDIO)
  doc.text(`Categoría: ${CATEGORIA_NOMBRES[categoria] || categoria}`, margin, y + 3)

  const now = new Date()
  const fechaGenerado = now.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  doc.text(`Fecha: ${fechaGenerado}`, pageWidth - margin, y + 3, { align: 'right' })
  y += 8

  // === PREPARAR DATOS DE TABLA ===
  // Crear mapa de precios para acceso rápido
  const precioMap = new Map<string, number | null>()
  for (const p of precios) {
    precioMap.set(`${p.insumo_id}-${p.proveedor_id}`, p.precio)
  }

  // Headers: Insumo | Unidad | Prov1 | Prov2 | ... | Mejor Precio | Mejor Proveedor
  const headers = [
    'INSUMO',
    'UN',
    ...proveedores.map(p => p.nombre.toUpperCase()),
    'MEJOR PRECIO',
    'PROVEEDOR',
  ]

  // Calcular anchos de columnas
  const numProveedores = proveedores.length
  const anchoInsumo = 55
  const anchoUnidad = 15
  const anchoMejorPrecio = 28
  const anchoMejorProveedor = 35
  const anchoDisponible = pageWidth - margin * 2 - anchoInsumo - anchoUnidad - anchoMejorPrecio - anchoMejorProveedor
  const anchoProveedor = Math.min(30, anchoDisponible / numProveedores)

  // Body: filas de insumos
  const tableData: any[][] = []

  for (const insumo of insumos) {
    const row: any[] = [insumo.nombre, insumo.unidad_medida]

    // Precios por proveedor
    const preciosInsumo: { precio: number | null; proveedorNombre: string }[] = []

    for (const prov of proveedores) {
      const precio = precioMap.get(`${insumo.id}-${prov.id}`) ?? null
      preciosInsumo.push({ precio, proveedorNombre: prov.nombre })
      row.push(precio !== null ? formatearMoneda(precio) : '-')
    }

    // Calcular mejor precio
    const preciosValidos = preciosInsumo.filter(p => p.precio !== null && p.precio > 0)
    let mejorPrecio: number | null = null
    let mejorProveedor = '-'

    if (preciosValidos.length > 0) {
      const minPrecio = Math.min(...preciosValidos.map(p => p.precio!))
      mejorPrecio = minPrecio
      mejorProveedor = preciosValidos.find(p => p.precio === minPrecio)?.proveedorNombre || '-'
    }

    row.push(mejorPrecio !== null ? formatearMoneda(mejorPrecio) : '-')
    row.push(mejorProveedor)

    tableData.push(row)
  }

  // === GENERAR TABLA ===
  const columnStyles: Record<number, any> = {
    0: { cellWidth: anchoInsumo, halign: 'left' }, // Insumo
    1: { cellWidth: anchoUnidad, halign: 'center' }, // Unidad
  }

  // Columnas de proveedores
  for (let i = 0; i < numProveedores; i++) {
    columnStyles[2 + i] = { cellWidth: anchoProveedor, halign: 'right' }
  }

  // Columnas de mejor precio y proveedor
  const colMejorPrecio = 2 + numProveedores
  const colMejorProveedor = colMejorPrecio + 1
  columnStyles[colMejorPrecio] = {
    cellWidth: anchoMejorPrecio,
    halign: 'right',
    fillColor: VERDE_MEJOR,
    fontStyle: 'bold',
  }
  columnStyles[colMejorProveedor] = {
    cellWidth: anchoMejorProveedor,
    halign: 'left',
    fillColor: VERDE_MEJOR,
    fontSize: 7,
  }

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableData,
    margin: { left: margin, right: margin, bottom: 15 },
    theme: 'grid',
    tableLineColor: [180, 180, 180],
    tableLineWidth: 0.1,
    headStyles: {
      fillColor: [50, 50, 50],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      cellPadding: 2,
      lineColor: [100, 100, 100],
      lineWidth: 0.15,
    },
    bodyStyles: {
      fontSize: 8,
      minCellHeight: 6,
      valign: 'middle',
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 252],
    },
    columnStyles,
    // Resaltar mejor precio en cada fila
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index >= 2 && data.column.index < 2 + numProveedores) {
        // Es una columna de proveedor
        const rowIndex = data.row.index
        const insumo = insumos[rowIndex]
        if (!insumo) return

        // Encontrar el mejor precio de esta fila
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
            // Este es el mejor precio - resaltar en amarillo
            data.cell.styles.fillColor = AMARILLO_MEJOR as [number, number, number]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    },
    didDrawPage: () => {
      // Footer en cada página
      const pageHeight = doc.internal.pageSize.getHeight()
      const footerY = pageHeight - 8

      doc.setFontSize(7)
      doc.setTextColor(100, 100, 100)
      doc.setFont('helvetica', 'normal')

      const fechaHora = `${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
      doc.text(fechaHora, pageWidth / 2, footerY, { align: 'center' })

      doc.text(`${insumos.length} insumos · ${proveedores.length} proveedores`, margin, footerY)

      const pageCount = (doc as any).internal.getNumberOfPages()
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber
      doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - margin, footerY, { align: 'right' })
    },
  })

  // Generar nombre de archivo
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  const nombreLimpio = nombre.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  const fileName = `comparacion-${nombreLimpio}-${dd}-${mm}-${yyyy}.pdf`

  doc.save(fileName)
}
