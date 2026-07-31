import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import { SERVICIO_LABEL, type ConsumoItem, type Servicio, type TipoConsumoItem } from '@/types/analisis'

const TERRACOTA = [163, 82, 52] as const
const GRIS_CLARO = [245, 245, 245] as const

const TIPO_LABEL: Record<TipoConsumoItem, string> = {
  insumo: 'INS',
  elaboracion: 'ELA',
  receta: 'REC',
}

const SECCIONES: { tipo: TipoConsumoItem; titulo: string }[] = [
  { tipo: 'insumo', titulo: 'INSUMOS' },
  { tipo: 'elaboracion', titulo: 'ELABORACIONES' },
  { tipo: 'receta', titulo: 'RECETAS' },
]

interface DatosConsumoPDF {
  fecha: string // YYYY-MM-DD
  servicio: Servicio
  items: ConsumoItem[]
  confirmado: boolean
  notas?: string | null
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

function fmtCantidad(n: number): string {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })
}

/** "29/07/2026" a partir de "2026-07-29" (sin pasar por Date, evita corrimiento de zona horaria) */
function fmtFecha(fecha: string): string {
  const [yyyy, mm, dd] = fecha.split('-')
  return `${dd}/${mm}/${yyyy}`
}

async function cargarLogo(): Promise<string | null> {
  try {
    const { data: files } = await supabase.storage.from('fotos platos').list('', { limit: 1 })
    if (!files || files.length === 0) return null
    const { data: urlData } = supabase.storage.from('fotos platos').getPublicUrl(files[0].name)
    if (!urlData?.publicUrl) return null
    const response = await fetch(urlData.publicUrl)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generarPDFConsumo(datos: DatosConsumoPDF): Promise<void> {
  const { fecha, servicio, items, confirmado } = datos

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const margin = 12
  const contentWidth = pageWidth - margin * 2

  const totalCosto = items.reduce((acc, it) => acc + Number(it.subtotal), 0)
  const logoDataUrl = await cargarLogo()

  let y = margin

  // === HEADER ===
  const headerHeight = 20
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, headerHeight, 'F')

  let textX = margin + 4
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin + 3, y + 2, 16, 16)
      textX = margin + 23
    } catch {}
  }

  doc.setFont('times', 'bolditalic')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('Tero', textX, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Consumo del servicio', textX, y + 15.5)

  const rightX = pageWidth - margin - 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`${fmtFecha(fecha)}  ·  ${SERVICIO_LABEL[servicio]}`, rightX, y + 9, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(confirmado ? 'Consumo confirmado' : 'Borrador (sin confirmar)', rightX, y + 15.5, { align: 'right' })

  y += headerHeight + 4

  // === RESUMEN ===
  const conteo = {
    insumo: items.filter((i) => i.tipo === 'insumo').length,
    elaboracion: items.filter((i) => i.tipo === 'elaboracion').length,
    receta: items.filter((i) => i.tipo === 'receta').length,
  }

  const boxHeight = 14
  doc.setFillColor(...GRIS_CLARO)
  doc.setDrawColor(214, 165, 145)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, contentWidth, boxHeight, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...TERRACOTA)
  doc.text('ITEMS CARGADOS', margin + 4, y + 5)
  doc.text('DESGLOSE', margin + 45, y + 5)
  doc.text('COSTO TOTAL (IVA INC.)', rightX, y + 5, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(40, 40, 40)
  doc.text(`${items.length}`, margin + 4, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  doc.text(
    `${conteo.insumo} insumos · ${conteo.elaboracion} elaboraciones · ${conteo.receta} recetas`,
    margin + 45,
    y + 11
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...TERRACOTA)
  doc.text(fmtMoney(totalCosto), rightX, y + 11, { align: 'right' })

  y += boxHeight + 4

  // === TABLA (agrupada por tipo, ordenada por subtotal desc dentro de cada grupo) ===
  const tableData: any[][] = []

  for (const seccion of SECCIONES) {
    const itemsSeccion = items
      .filter((it) => it.tipo === seccion.tipo)
      .sort((a, b) => Number(b.subtotal) - Number(a.subtotal))

    if (itemsSeccion.length === 0) continue

    const subtotalSeccion = itemsSeccion.reduce((acc, it) => acc + Number(it.subtotal), 0)

    tableData.push([
      {
        content: `${seccion.titulo}  (${itemsSeccion.length})`,
        colSpan: 5,
        styles: {
          fillColor: [225, 225, 225],
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'left',
          textColor: [40, 40, 40],
        },
      },
      {
        content: fmtMoney(subtotalSeccion),
        styles: {
          fillColor: [225, 225, 225],
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'right',
          textColor: [40, 40, 40],
        },
      },
    ])

    for (const it of itemsSeccion) {
      const incidencia = totalCosto > 0 ? (Number(it.subtotal) / totalCosto) * 100 : 0
      tableData.push([
        it.nombre || '(sin nombre)',
        TIPO_LABEL[it.tipo],
        `${fmtCantidad(it.cantidad)} ${it.unidad}`,
        `${fmtMoney(it.costo_unitario)}/${it.unidad}`,
        `${incidencia.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
        fmtMoney(it.subtotal),
      ])
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['ITEM', 'TIPO', 'CANT.', 'COSTO UNIT.', '% S/TOTAL', 'SUBTOTAL']],
    body: tableData,
    foot: [['TOTAL CONSUMO (IVA INC.)', '', '', '', '100,0%', fmtMoney(totalCosto)]],
    margin: { left: margin, right: margin, bottom: 16 },
    theme: 'grid',
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.1,
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontStyle: 'bold',
      fontSize: 6.5,
      halign: 'center',
      cellPadding: 1.5,
      lineColor: [170, 170, 170],
      lineWidth: 0.15,
    },
    bodyStyles: {
      fontSize: 7.5,
      minCellHeight: 5,
      valign: 'middle',
      cellPadding: { top: 1, bottom: 1, left: 2, right: 2 },
      lineColor: [225, 225, 225],
      lineWidth: 0.1,
    },
    footStyles: {
      fillColor: [...TERRACOTA],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.36, halign: 'left' },
      1: { cellWidth: contentWidth * 0.07, halign: 'center', fontSize: 6.5, textColor: [120, 120, 120] },
      2: { cellWidth: contentWidth * 0.14, halign: 'right' },
      3: { cellWidth: contentWidth * 0.17, halign: 'right', textColor: [100, 100, 100] },
      4: { cellWidth: contentWidth * 0.1, halign: 'right', textColor: [100, 100, 100] },
      5: { cellWidth: contentWidth * 0.16, halign: 'right', fontStyle: 'bold' },
    },
    rowPageBreak: 'avoid',
    didDrawPage: (data) => {
      const pageHeight = doc.internal.pageSize.getHeight()
      const footerY = pageHeight - 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(130, 130, 130)
      doc.text(
        `Tero · Consumo ${fmtFecha(fecha)} ${SERVICIO_LABEL[servicio]} · Costos con IVA incluido`,
        margin,
        footerY
      )
      doc.text(
        `Pág. ${data.pageNumber}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      )
    },
  })

  const [yyyy, mm, dd] = fecha.split('-')
  doc.save(`consumo-${servicio}-${dd}-${mm}-${yyyy}.pdf`)
}
