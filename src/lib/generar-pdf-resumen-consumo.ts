import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import {
  CATEGORIAS_LABEL,
  CATEGORIAS_ORDEN,
  SERVICIO_LABEL,
  type ItemDesglosado,
  type Servicio,
} from '@/types/analisis'

/**
 * PDF del resumen de consumo de la semana.
 *
 * NO es un informe de costos: es la planilla con la que se arman los pedidos.
 * Eso define todo el diseño:
 *
 *   · Agrupado por categoría, en el orden en que se recorre la cocina y se
 *     llama a los proveedores: primero carnes, después pescados, verduras…
 *   · La CANTIDAD manda. El costo va al costado, más chico, porque para pedir
 *     lo que importa es cuántos kilos se fueron, no cuántos pesos.
 *   · Sin ids ni códigos: el que pide reconoce el insumo por el nombre.
 *   · Una columna vacía "PEDIR" para anotar a mano mientras se recorre.
 */

const TERRACOTA = [163, 82, 52] as const
const GRIS_CLARO = [245, 245, 245] as const

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
/** Siempre dos decimales: con cantidad variable de decimales la columna queda
 *  despareja y cuesta comparar de un vistazo. */
const cant = (n: number) =>
  Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Lo que hay que COMPRAR para obtener ese neto, según la merma del insumo. */
const aComprar = (neto: number, merma: number) => {
  const aprovechamiento = 1 - Math.min(Math.max(merma, 0), 99) / 100
  return aprovechamiento > 0 ? neto / aprovechamiento : neto
}

function fmtFecha(fecha: string): string {
  const [yyyy, mm, dd] = fecha.split('-')
  return `${dd}/${mm}/${yyyy}`
}

export interface DatosResumenPDF {
  desde: string // YYYY-MM-DD
  hasta: string
  servicio: Servicio | 'todos'
  desglose: ItemDesglosado[]
  diasConCarga: number
  costoTotal: number
}

async function cargarLogo(): Promise<string | null> {
  try {
    const { data: files } = await supabase.storage.from('fotos platos').list('', { limit: 1 })
    if (!files?.length) return null
    const { data: urlData } = supabase.storage.from('fotos platos').getPublicUrl(files[0].name)
    if (!urlData?.publicUrl) return null
    const res = await fetch(urlData.publicUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Agrupa por categoría respetando el orden fijo; las no listadas van al final */
function agrupar(items: ItemDesglosado[]): [string, ItemDesglosado[]][] {
  const mapa = new Map<string, ItemDesglosado[]>()
  for (const it of items) {
    const cat = it.categoria || 'Almacen'
    if (!mapa.has(cat)) mapa.set(cat, [])
    mapa.get(cat)!.push(it)
  }
  const conocidas = CATEGORIAS_ORDEN.filter((c) => mapa.has(c))
  const extras = Array.from(mapa.keys()).filter((c) => !CATEGORIAS_ORDEN.includes(c))
  return [...conocidas, ...extras].map((c) => [
    c,
    mapa.get(c)!.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-AR')),
  ])
}

export async function generarPDFResumenConsumo(datos: DatosResumenPDF): Promise<void> {
  const { desde, hasta, servicio, desglose, diasConCarga, costoTotal } = datos

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const rightX = pageWidth - margin - 4

  const logo = await cargarLogo()
  let y = margin

  // === HEADER ===
  const h = 22
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, h, 'F')

  let textX = margin + 4
  if (logo) {
    try { doc.addImage(logo, 'PNG', margin + 3, y + 3, 16, 16); textX = margin + 23 } catch {}
  }

  doc.setFont('times', 'bolditalic'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
  doc.text('Tero', textX, y + 10)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('Consumo de la semana', textX, y + 16.5)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(`${fmtFecha(desde)} — ${fmtFecha(hasta)}`, rightX, y + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(
    servicio === 'todos' ? 'Todos los servicios' : SERVICIO_LABEL[servicio],
    rightX, y + 16, { align: 'right' }
  )

  y += h + 4

  // === RESUMEN ===
  const boxH = 13
  doc.setFillColor(...GRIS_CLARO)
  doc.setDrawColor(214, 165, 145); doc.setLineWidth(0.3)
  doc.rect(margin, y, contentWidth, boxH, 'FD')

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...TERRACOTA)
  doc.text('INSUMOS', margin + 4, y + 5)
  doc.text('SERVICIOS CARGADOS', margin + 40, y + 5)
  doc.text('COSTO TOTAL (IVA INC.)', rightX, y + 5, { align: 'right' })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40)
  doc.text(String(desglose.length), margin + 4, y + 10.5)
  doc.text(String(diasConCarga), margin + 40, y + 10.5)
  doc.setFontSize(11); doc.setTextColor(...TERRACOTA)
  doc.text(fmt(costoTotal), rightX, y + 10.5, { align: 'right' })

  y += boxH + 3

  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(130, 130, 130)
  doc.text(
    'Consumo neto = lo que entra al plato, ya limpio.  A comprar = el neto ajustado por la merma del insumo: es el numero con el que se pide.',
    margin, y
  )
  y += 5

  // === UNA TABLA POR CATEGORÍA ===
  const grupos = agrupar(desglose)

  for (const [categoria, items] of grupos) {
    const subtotal = items.reduce((a, i) => a + i.costo_total, 0)

    // Que el título no quede solo al pie de una página
    if (y > pageHeight - 40) { doc.addPage(); y = margin }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TERRACOTA)
    doc.text((CATEGORIAS_LABEL[categoria] || categoria).toUpperCase(), margin, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120)
    doc.text(`${items.length} insumos · ${fmt(subtotal)}`, rightX, y, { align: 'right' })
    y += 2.5

    autoTable(doc, {
      startY: y,
      head: [['Insumo', 'Consumo neto', 'A comprar', 'Costo', 'PEDIR']],
      body: items.map((i) => {
        const compra = aComprar(i.cantidad_total, i.merma_porcentaje)
        const hayMerma = i.merma_porcentaje > 0
        return [
          i.nombre,
          `${cant(i.cantidad_total)} ${i.unidad}`,
          // Sin merma las dos columnas dirían lo mismo; se deja un guion para
          // que salte a la vista dónde la diferencia importa.
          hayMerma ? `${cant(compra)} ${i.unidad}` : '—',
          i.costo_total > 0 ? fmt(i.costo_total) : '—',
          '', // se completa a mano
        ]
      }),
      theme: 'grid',
      tableLineColor: [205, 205, 205],
      tableLineWidth: 0.1,
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [30, 30, 30],
        fontStyle: 'bold',
        fontSize: 6.5,
        cellPadding: 1.4,
      },
      bodyStyles: { fontSize: 8, cellPadding: 1.6, minCellHeight: 6 },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { halign: 'right', cellWidth: 28, textColor: [110, 110, 110] },
        // Lo que hay que comprar es el número con el que se pide: va destacado
        2: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
        3: { halign: 'right', cellWidth: 26, textColor: [140, 140, 140] },
        // Columna en blanco para anotar el pedido mientras se recorre la cocina
        4: { cellWidth: 42, fillColor: [252, 250, 249] },
      },
      margin: { left: margin, right: margin },
    })

    y = (doc as any).lastAutoTable.finalY + 5
  }

  // === PIE, en todas las páginas ===
  const ahora = new Date()
  const dd = String(ahora.getDate()).padStart(2, '0')
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const paginas = (doc as any).internal.getNumberOfPages?.() ?? 1

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor(214, 165, 145); doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(130, 130, 130)
    doc.text('Tero Restó · Consumo de la semana, para armar los pedidos', margin, pageHeight - 8)
    doc.text(
      `Generado el ${dd}/${mm}/${ahora.getFullYear()}${paginas > 1 ? `  ·  ${p} de ${paginas}` : ''}`,
      rightX, pageHeight - 8, { align: 'right' }
    )
  }

  doc.save(`consumo-semana_${desde}_a_${hasta}.pdf`)
}
