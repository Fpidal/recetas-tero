import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import { variacion, nombreMes, diaMes, type CierreMes } from './cierre-mes-queries'
import { CATEGORIAS_LABEL, SERVICIO_LABEL } from '@/types/analisis'

/**
 * PDF del Cierre de Mes — la foto del mes en una carilla A4.
 *
 * Comparte la base visual con generar-pdf-consumo.ts (terracota, logo del
 * storage, autoTable): el generador de la orden de compra es A5 y está escrito
 * como una sola función de 754 líneas específica de una OC, así que no había
 * nada reutilizable ahí sin refactorizarlo.
 */

const TERRACOTA = [163, 82, 52] as const
const GRIS_CLARO = [245, 245, 245] as const

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

/** Variación lista para imprimir. "—" cuando no hay con qué comparar. */
function fmtVar(v: number | null, unidad = '%'): string {
  if (v === null || !isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}${unidad}`
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

export async function generarPDFCierreMes(data: CierreMes): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const rightX = pageWidth - margin - 4

  const logoDataUrl = await cargarLogo()
  const inc = data.incidencia
  const incPrev = data.incidenciaPrevia
  const totalCompras = data.compras.mes

  let y = margin

  // =====================================================
  // HEADER — el mes bien visible
  // =====================================================
  const headerHeight = 22
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, headerHeight, 'F')

  let textX = margin + 4
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin + 3, y + 3, 16, 16)
      textX = margin + 23
    } catch {}
  }

  doc.setFont('times', 'bolditalic')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('Tero', textX, y + 10)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Cierre de mes', textX, y + 16.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(nombreMes(data.mes).toUpperCase(), rightX, y + 11, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(`comparado con ${nombreMes(data.mesPrevio)}`, rightX, y + 17, { align: 'right' })

  y += headerHeight + 5

  // =====================================================
  // 1 · INDICADORES
  // =====================================================
  const indicadores: { label: string; valor: string; variacion: string }[] = [
    { label: 'COMPRAS', valor: fmt(data.compras.mes), variacion: fmtVar(variacion(data.compras.mes, data.compras.previo)) },
    { label: 'VENTAS', valor: fmt(data.ventas.mes), variacion: fmtVar(variacion(data.ventas.mes, data.ventas.previo)) },
    {
      label: 'INCIDENCIA REAL',
      valor: inc.diasConCarga > 0 ? `${inc.incidencia.toFixed(1)}%` : '—',
      variacion: inc.diasConCarga > 0 && incPrev.diasConCarga > 0
        ? fmtVar(inc.incidencia - incPrev.incidencia, ' pts')
        : '—',
    },
    { label: 'CUBIERTOS', valor: data.ventas.cubiertos.toLocaleString('es-AR'), variacion: fmtVar(variacion(data.ventas.cubiertos, data.ventas.cubiertosPrevio)) },
    { label: 'TICKET PROM.', valor: inc.ticketPromedio > 0 ? fmt(inc.ticketPromedio) : '—', variacion: fmtVar(variacion(inc.ticketPromedio, incPrev.ticketPromedio)) },
  ]

  const cajaW = contentWidth / indicadores.length
  const cajaH = 17
  doc.setDrawColor(214, 165, 145)
  doc.setLineWidth(0.3)

  indicadores.forEach((ind, i) => {
    const x = margin + i * cajaW
    doc.setFillColor(...GRIS_CLARO)
    doc.rect(x, y, cajaW, cajaH, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(...TERRACOTA)
    doc.text(ind.label, x + 2, y + 4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(40, 40, 40)
    doc.text(ind.valor, x + 2, y + 10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(110, 110, 110)
    doc.text(ind.variacion, x + 2, y + 14.5)
  })

  y += cajaH + 1.5

  // El muestreo va pegado a la incidencia: un porcentaje sin la muestra al lado miente
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(130, 130, 130)
  doc.text(
    inc.diasConCarga > 0
      ? `Incidencia real calculada sobre ${inc.diasConCarga} de ${inc.diasConVenta} servicios con venta (la carga de consumo es parcial).`
      : 'Sin consumo cargado en el mes: no se puede calcular la incidencia real.',
    margin,
    y + 2
  )
  y += 6

  const estiloTabla = {
    theme: 'grid' as const,
    tableLineColor: [210, 210, 210] as [number, number, number],
    tableLineWidth: 0.1,
    headStyles: {
      fillColor: [240, 240, 240] as [number, number, number],
      textColor: [30, 30, 30] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 6,
      cellPadding: 1.2,
    },
    bodyStyles: { fontSize: 6.8, cellPadding: 1.2, minCellHeight: 4 },
    footStyles: {
      fillColor: [...TERRACOTA] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 6.8,
      cellPadding: 1.2,
    },
    margin: { left: margin, right: margin },
  }

  function titulo(texto: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...TERRACOTA)
    doc.text(texto, margin, y)
    y += 2.5
  }

  // =====================================================
  // 2 · COMPRAS POR RUBRO
  // =====================================================
  if (data.rubros.length > 0) {
    titulo('COMPRAS POR RUBRO')
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: [['Rubro', 'Mes', 'Mes anterior', 'Var.', '% total']],
      body: data.rubros.map((r) => [
        CATEGORIAS_LABEL[r.rubro] || r.rubro,
        fmt(r.monto),
        fmt(r.monto_previo),
        fmtVar(variacion(r.monto, r.monto_previo)),
        totalCompras > 0 ? `${((r.monto / totalCompras) * 100).toFixed(1)}%` : '—',
      ]),
      foot: [['TOTAL COMPRAS', fmt(totalCompras), fmt(data.compras.previo), fmtVar(variacion(data.compras.mes, data.compras.previo)), '100,0%']],
      columnStyles: {
        1: { halign: 'right' }, 2: { halign: 'right' },
        3: { halign: 'right' }, 4: { halign: 'right' },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // =====================================================
  // 3 · COMPRAS SEMANALES
  // =====================================================
  if (data.semanas.length > 0) {
    titulo('COMPRAS SEMANALES')
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: [['Semana', 'Monto', 'Var. s/anterior', '% del mes']],
      body: data.semanas.map((s, i) => {
        const previa = i > 0 ? data.semanas[i - 1].monto : null
        return [
          `${diaMes(s.desde)} — ${diaMes(s.hasta)}${s.cortada ? `  (${s.dias_en_mes} días en el mes)` : ''}`,
          fmt(s.monto),
          previa !== null ? fmtVar(variacion(s.monto, previa)) : '—',
          totalCompras > 0 ? `${((s.monto / totalCompras) * 100).toFixed(1)}%` : '—',
        ]
      }),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 1.5

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(5.5)
    doc.setTextColor(130, 130, 130)
    doc.text(
      'Semanas de lunes a domingo, contando solo los días dentro del mes. Por eso la suma de las semanas da igual al total mensual.',
      margin,
      y
    )
    y += 4.5
  }

  // =====================================================
  // 4 · TOP 10 INSUMOS
  // =====================================================
  if (data.topInsumos.length > 0) {
    titulo('TOP 10 INSUMOS POR GASTO')
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: [['Insumo', 'Rubro', 'Monto', '% compras', 'Var. precio']],
      body: data.topInsumos.map((t) => [
        t.nombre,
        CATEGORIAS_LABEL[t.rubro] || t.rubro,
        fmt(t.monto),
        totalCompras > 0 ? `${((t.monto / totalCompras) * 100).toFixed(1)}%` : '—',
        fmtVar(t.variacion_precio),
      ]),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // =====================================================
  // 5 · VENTAS POR SERVICIO
  // =====================================================
  titulo('VENTAS POR SERVICIO')
  if (data.faltaVentas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 90, 40)
    doc.text(`Sin ventas cargadas en ${nombreMes(data.mes)}.`, margin, y + 3)
    y += 8
  } else {
    const filas = data.ventasPorServicio.filter((v) => v.venta > 0 || v.cubiertos > 0)
    autoTable(doc, {
      ...estiloTabla,
      startY: y,
      head: [['Servicio', 'Venta', 'Cubiertos', 'Ticket promedio']],
      body: filas.map((v) => [
        SERVICIO_LABEL[v.servicio] || v.servicio,
        fmt(v.venta),
        v.cubiertos.toLocaleString('es-AR'),
        v.cubiertos > 0 ? fmt(v.venta / v.cubiertos) : '—',
      ]),
      foot: [[
        'TOTAL',
        fmt(data.ventas.mes),
        data.ventas.cubiertos.toLocaleString('es-AR'),
        inc.ticketPromedio > 0 ? fmt(inc.ticketPromedio) : '—',
      ]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // =====================================================
  // PIE — fecha de generación
  // =====================================================
  const ahora = new Date()
  const dd = String(ahora.getDate()).padStart(2, '0')
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const hh = String(ahora.getHours()).padStart(2, '0')
  const mi = String(ahora.getMinutes()).padStart(2, '0')

  doc.setDrawColor(214, 165, 145)
  doc.setLineWidth(0.3)
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(130, 130, 130)
  doc.text('Tero Restó · Cierre de mes', margin, pageHeight - 8)
  doc.text(
    `Generado el ${dd}/${mm}/${ahora.getFullYear()} a las ${hh}:${mi}`,
    rightX,
    pageHeight - 8,
    { align: 'right' }
  )

  // =====================================================
  // ABRIR EN PESTAÑA NUEVA
  // =====================================================
  // El resto de los PDF del sistema usan doc.save() y descargan directo.
  // Este se abre para poder mirarlo antes de guardarlo, que es como se usa un
  // informe. El nombre igual queda seteado para cuando se descargue desde ahí.
  const mesArchivo = data.mes.slice(0, 7) // YYYY-MM
  const blob = doc.output('blob')
  const url = URL.createObjectURL(
    new File([blob], `cierre-mes_${mesArchivo}.pdf`, { type: 'application/pdf' })
  )
  const ventana = window.open(url, '_blank')
  if (!ventana) {
    // El navegador bloqueó el popup: descargar es mejor que no dar nada
    doc.save(`cierre-mes_${mesArchivo}.pdf`)
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
