import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { variacion, nombreMes, diaMes, type CierreMes } from './cierre-mes-queries'
import { CATEGORIAS_LABEL, SERVICIO_LABEL } from '@/types/analisis'
import { PALETA, rgb } from './colores'
import { datosMarcaPDF, encajarLogo, obtenerEmpresa, objetivosDe, OBJETIVOS_POR_DEFECTO, estadoContraObjetivo } from './empresa'

/**
 * PDF del Cierre de Mes — la foto del mes en A4.
 *
 * Hasta V.65 era una carilla. En V.66 la primera hoja pasa a ser el análisis
 * (proveedores, restaurante y eventos, incidencia por servicio y la inflación
 * propia) y el detalle de compras (rubros, semanas, top de insumos) va después.
 *
 * Comparte la base visual con generar-pdf-consumo.ts (terracota, logo de
 * Configuración → Empresa, autoTable): el generador de la orden de compra es A5 y está escrito
 * como una sola función de 754 líneas específica de una OC, así que no había
 * nada reutilizable ahí sin refactorizarlo.
 */

const TERRACOTA = rgb(PALETA.terracotta)
const GRIS_CLARO = rgb(PALETA.creamDark)

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

/** Un decimal con coma, como se escriben los números acá */
function dec(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

/** Variación lista para imprimir. "—" cuando no hay con qué comparar. */
function fmtVar(v: number | null, unidad = '%'): string {
  if (v === null || !isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${dec(v)}${unidad}`
}

export async function generarPDFCierreMes(data: CierreMes): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const rightX = pageWidth - margin - 4

  const marca = await datosMarcaPDF()
  const logoDataUrl = marca.logo
  const inc = data.incidencia
  const incPrev = data.incidenciaPrevia
  const totalCompras = data.compras.mes
  // Los objetivos de Configuración; si no se pueden leer, los de siempre
  const objetivos = await obtenerEmpresa().then(objetivosDe).catch(() => OBJETIVOS_POR_DEFECTO)
  const LIMITE_INFERIOR = pageHeight - 18 // deja lugar al pie

  let y = margin

  // =====================================================
  // HEADER — el mes bien visible
  // =====================================================
  const headerHeight = 22
  doc.setFillColor(...TERRACOTA)
  doc.rect(margin, y, contentWidth, headerHeight, 'F')

  let textX = margin + 4
  // Logo en blanco, con su proporción y centrado en la franja (V.63)
  if (logoDataUrl) {
    const { ancho, alto } = encajarLogo(logoDataUrl.proporcion, 28, 14)
    try {
      doc.addImage(logoDataUrl.imagen, 'PNG', margin + 4, y + (headerHeight - alto) / 2, ancho, alto)
      textX = margin + 4 + ancho + 6
    } catch {}
  }

  doc.setFont('times', 'bolditalic')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  if (!logoDataUrl) doc.text(marca.nombre, textX, y + 10)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Cierre de mes', textX, logoDataUrl ? y + headerHeight / 2 + 1.5 : y + 16.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(nombreMes(data.mes).toUpperCase(), rightX, y + 11, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(`comparado con ${nombreMes(data.mesPrevio)}${data.hastaDia ? `, los dos hasta el día ${data.hastaDia}` : ''}`, rightX, y + 17, { align: 'right' })

  y += headerHeight + 5

  // =====================================================
  // 1 · INDICADORES
  // =====================================================
  const indicadores: { label: string; valor: string; variacion: string }[] = [
    { label: 'COMPRAS', valor: fmt(data.compras.mes), variacion: fmtVar(variacion(data.compras.mes, data.compras.previo)) },
    { label: 'VENTAS', valor: fmt(data.ventas.mes), variacion: fmtVar(variacion(data.ventas.mes, data.ventas.previo)) },
    {
      label: 'INCIDENCIA REAL',
      valor: inc.diasConCarga > 0 ? `${dec(inc.incidencia)}%` : '—',
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

  /** Si lo que sigue no entra en la hoja, pasa a la siguiente */
  function asegurar(alto: number) {
    if (y + alto > LIMITE_INFERIOR) {
      doc.addPage()
      y = margin + 4
    }
  }

  function nota(texto: string) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(5.8)
    doc.setTextColor(130, 130, 130)
    const lineas = doc.splitTextToSize(texto, contentWidth) as string[]
    doc.text(lineas, margin, y)
    y += lineas.length * 2.6 + 2.5
  }

  function titulo(texto: string, altoMinimo = 25) {
    asegurar(altoMinimo)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...TERRACOTA)
    doc.text(texto, margin, y)
    y += 2.5
  }

  const colorVar = (texto: string, subir = 'malo'): [number, number, number] | null => {
    if (!texto.startsWith('+') && !texto.startsWith('-')) return null
    const sube = texto.startsWith('+')
    return (sube === (subir === 'malo')) ? [178, 58, 58] : [47, 122, 79]
  }
  const pctMes = (n: number, total: number) => (total > 0 ? `${dec(((n / total) * 100))}%` : '—')
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const mesCorto = (f: string) => MESES_CORTOS[Number(f.slice(5, 7)) - 1]
  const margenTablas = { left: margin, right: margin, top: margin + 4, bottom: 18 }

  // =====================================================
  // 2 · LOS 10 PROVEEDORES DEL MES
  // =====================================================
  if (data.proveedores && data.proveedores.length > 0) {
    const top = data.proveedores
    const sumaTop = top.reduce((t, p) => t + p.monto, 0)
    titulo('LOS 10 PROVEEDORES DEL MES', 70)
    autoTable(doc, {
      ...estiloTabla,
      margin: margenTablas,
      startY: y,
      head: [['#', 'Proveedor', 'Mes', '% compras', 'Mes anterior', 'Var.', 'Puesto']],
      body: top.map((p) => {
        let puesto = '='
        if (p.puestoPrevio === null) puesto = 'nuevo'
        else if (p.puesto !== null && p.puestoPrevio > p.puesto) puesto = `sube ${p.puestoPrevio - p.puesto}`
        else if (p.puesto !== null && p.puestoPrevio < p.puesto) puesto = `baja ${p.puesto - p.puestoPrevio}`
        return [
          String(p.puesto ?? ''),
          p.nombre,
          fmt(p.monto),
          pctMes(p.monto, totalCompras),
          p.montoPrevio > 0 ? fmt(p.montoPrevio) : '—',
          p.montoPrevio > 0 ? fmtVar(variacion(p.monto, p.montoPrevio)) : '—',
          puesto,
        ]
      }),
      foot: [['', 'LOS 10 PRIMEROS', fmt(sumaTop), pctMes(sumaTop, totalCompras), '', '', '']],
      columnStyles: {
        0: { halign: 'right', cellWidth: 7, textColor: [150, 150, 150] },
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'center', cellWidth: 16 },
      },
      didParseCell: (c) => {
        if (c.section !== 'body') return
        const t = String(c.cell.raw)
        if (c.column.index === 6) {
          if (t.startsWith('sube')) c.cell.styles.textColor = [47, 122, 79]
          else if (t.startsWith('baja')) c.cell.styles.textColor = [178, 58, 58]
          else if (t === 'nuevo') { c.cell.styles.textColor = [...TERRACOTA]; c.cell.styles.fontStyle = 'bold' }
          else c.cell.styles.textColor = [150, 150, 150]
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 3

    const salieron = data.proveedoresSalieron || []
    if (salieron.length > 0) {
      nota(
        'Salieron del top 10: ' +
          salieron
            .map((p) => `${p.nombre} (${p.puestoPrevio}° el mes anterior, ${p.monto > 0 ? `hoy ${p.puesto}°, ${fmtVar(variacion(p.monto, p.montoPrevio))}` : 'sin compras'})`)
            .join(' · ') + '.'
      )
    }
    y += 1.5
  }

  // =====================================================
  // 3 · RESTAURANTE Y EVENTOS
  // =====================================================
  // Reemplaza a "Ventas por servicio": las mismas filas, más el subtotal del
  // restaurante y la comparación con el mes anterior. Los eventos venden mucho
  // en pocos días y con otro ticket; mezclados, mueven todos los promedios.
  titulo('RESTAURANTE Y EVENTOS', 40)
  if (data.faltaVentas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 90, 40)
    doc.text(`Sin ventas cargadas en ${nombreMes(data.mes)}.`, margin, y + 3)
    y += 8
  } else {
    const de = (lista: typeof data.ventasPorServicio | undefined, s: string) =>
      lista?.find((v) => v.servicio === s) || { venta: 0, cubiertos: 0 }
    const prev = data.ventasPorServicioPrevio
    const fila = (nombre: string, actual: { venta: number; cubiertos: number }, previo: { venta: number; cubiertos: number } | null) => [
      nombre,
      fmt(actual.venta),
      pctMes(actual.venta, data.ventas.mes),
      actual.cubiertos.toLocaleString('es-AR'),
      actual.cubiertos > 0 ? fmt(actual.venta / actual.cubiertos) : '—',
      previo && previo.venta > 0 ? fmt(previo.venta) : '—',
      previo && previo.venta > 0 ? fmtVar(variacion(actual.venta, previo.venta)) : '—',
    ]
    const suma = (a: { venta: number; cubiertos: number }, b: { venta: number; cubiertos: number }) => ({
      venta: a.venta + b.venta,
      cubiertos: a.cubiertos + b.cubiertos,
    })
    const med = de(data.ventasPorServicio, 'mediodia')
    const noc = de(data.ventasPorServicio, 'noche')
    const eve = de(data.ventasPorServicio, 'eventos')
    const rest = suma(med, noc)
    const restPrev = prev ? suma(de(prev, 'mediodia'), de(prev, 'noche')) : null
    autoTable(doc, {
      ...estiloTabla,
      margin: margenTablas,
      startY: y,
      head: [['', 'Venta', '% venta', 'Cubiertos', 'Ticket', 'Mes anterior', 'Var.']],
      body: [
        fila('   Mediodía', med, prev ? de(prev, 'mediodia') : null),
        fila('   Noche', noc, prev ? de(prev, 'noche') : null),
        fila('Restaurante', rest, restPrev),
        fila('Eventos', eve, prev ? de(prev, 'eventos') : null),
      ],
      foot: [fila('TOTAL', { venta: data.ventas.mes, cubiertos: data.ventas.cubiertos }, { venta: data.ventas.previo, cubiertos: data.ventas.cubiertosPrevio })],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      didParseCell: (c) => {
        if (c.section === 'body' && c.row.index >= 2) c.cell.styles.fontStyle = 'bold'
        if (c.section === 'body' && c.row.index < 2) c.cell.styles.textColor = [110, 110, 110]
      },
    })
    y = (doc as any).lastAutoTable.finalY + 3

    // Compras sobre venta: con eventos en el mes, ninguno de los dos números es
    // el real, porque las facturas no dicen para qué fue cada compra
    const sobreTotal = data.ventas.mes > 0 ? (totalCompras / data.ventas.mes) * 100 : null
    const sobreRest = rest.venta > 0 ? (totalCompras / rest.venta) * 100 : null
    if (sobreTotal !== null) {
      nota(
        eve.venta > 0 && sobreRest !== null
          ? `Compras sobre venta: ${dec(sobreTotal)}% de la venta total y ${dec(sobreRest)}% de la del restaurante. Ninguno es el real: las facturas no dicen si la compra fue para el salón o para un evento.`
          : `Compras sobre venta: ${dec(sobreTotal)}%. Sin eventos en el mes, es todo del restaurante.`
      )
    }
    y += 1.5
  }

  // =====================================================
  // 4 · INCIDENCIA REAL POR SERVICIO
  // =====================================================
  if (data.incidenciaPorServicio && data.incidenciaPorServicio.length > 0) {
    const servicios = data.incidenciaPorServicio
    const meses = servicios[0].historia.map((h) => h.mes)
    titulo(`INCIDENCIA REAL POR SERVICIO  ·  OBJETIVO ${objetivos.incidencia}% (± ${objetivos.tolerancia} PTS)`, 30)
    const ESTADO_TXT = { ok: 'Dentro', warning: 'En tolerancia', danger: 'Fuera' } as const
    autoTable(doc, {
      ...estiloTabla,
      margin: margenTablas,
      startY: y,
      head: [['Servicio', ...meses.map(mesCorto), mesCorto(data.mes).toUpperCase(), 'Estado', 'Servicios con consumo']],
      body: servicios.map((s) => {
        const tiene = s.resumen.diasConCarga > 0 && s.resumen.ventaConCosto > 0
        const estado = tiene ? estadoContraObjetivo(s.resumen.incidencia, objetivos.incidencia, objetivos.tolerancia) : null
        return [
          SERVICIO_LABEL[s.servicio] || s.servicio,
          ...s.historia.map((h) => (h.incidencia === null ? '—' : `${dec(h.incidencia)}%`)),
          tiene ? `${dec(s.resumen.incidencia)}%` : '—',
          estado ? ESTADO_TXT[estado as keyof typeof ESTADO_TXT] ?? '' : 'Sin consumo',
          `${s.resumen.diasConCarga} de ${s.resumen.diasConVenta}`,
        ]
      }),
      columnStyles: Object.fromEntries(
        Array.from({ length: meses.length + 1 }, (_, i) => [i + 1, { halign: 'right' }])
      ),
      didParseCell: (c) => {
        if (c.section !== 'body') return
        const colMes = meses.length + 1
        if (c.column.index < colMes && c.column.index > 0) c.cell.styles.textColor = [130, 130, 130]
        if (c.column.index === colMes) c.cell.styles.fontStyle = 'bold'
        if (c.column.index === colMes + 1) {
          const t = String(c.cell.raw)
          c.cell.styles.fontStyle = 'bold'
          c.cell.styles.textColor =
            t === 'Dentro' ? [47, 122, 79] : t === 'En tolerancia' ? [154, 107, 18] : t === 'Fuera' ? [178, 58, 58] : [150, 150, 150]
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 3
    nota('Costo de lo que salió de cocina sobre la venta de ese servicio. Sólo cuenta los servicios con consumo cargado; el muestreo va al lado.')
    y += 1.5
  }

  // =====================================================
  // 5 · TU INFLACIÓN
  // =====================================================
  if (data.canasta && data.canasta.meses.length > 0) {
    const c = data.canasta
    const acumular = (vals: (number | null)[]): number | null =>
      vals.some((v) => v === null) ? null : (vals.reduce<number>((t, v) => t * (1 + (v ?? 0) / 100), 1) - 1) * 100
    const hayIpc = c.meses.some((m) => m.ipc !== null)
    const acCanasta = acumular(c.meses.map((m) => m.canasta))
    const acTicket = acumular(c.meses.map((m) => m.ticket))
    const acIpc = hayIpc ? acumular(c.meses.map((m) => m.ipc)) : null

    titulo(`TU INFLACIÓN  ·  ${nombreMes(c.desde).toUpperCase()} A ${nombreMes(data.mes).toUpperCase()}`, 55)
    const anchoIzq = contentWidth * 0.52
    const yInicio = y
    autoTable(doc, {
      ...estiloTabla,
      margin: { ...margenTablas, right: pageWidth - margin - anchoIzq },
      tableWidth: anchoIzq,
      startY: yInicio,
      head: [['Mes', 'Tu canasta', 'Ticket restaurante', ...(hayIpc ? ['IPC INDEC'] : [])]],
      body: c.meses.map((m) => [
        nombreMes(m.mes),
        fmtVar(m.canasta),
        fmtVar(m.ticket),
        ...(hayIpc ? [m.ipc === null ? 'sin publicar' : fmtVar(m.ipc)] : []),
      ]),
      foot: [['ACUMULADO', fmtVar(acCanasta), fmtVar(acTicket), ...(hayIpc ? [fmtVar(acIpc)] : [])]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
    const finIzq = (doc as any).lastAutoTable.finalY

    const gastoTotal = c.rubros.reduce((t, r) => t + r.gasto, 0)
    autoTable(doc, {
      ...estiloTabla,
      margin: { ...margenTablas, left: margin + anchoIzq + 4 },
      startY: yInicio,
      head: [['Rubro', 'Gasto', 'Variación']],
      body: [...c.rubros]
        .sort((a, b) => (b.variacion ?? -Infinity) - (a.variacion ?? -Infinity))
        .map((r) => [CATEGORIAS_LABEL[r.rubro] || r.rubro, fmt(r.gasto), fmtVar(r.variacion)]),
      foot: [['TOTAL', fmt(gastoTotal), fmtVar(acCanasta)]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 2) {
          const col = colorVar(String(cell.cell.raw))
          if (col) cell.cell.styles.textColor = col
        }
      },
    })
    y = Math.max(finIzq, (doc as any).lastAutoTable.finalY) + 3

    const lectura: string[] = []
    if (acCanasta !== null && acTicket !== null) {
      lectura.push(
        acTicket >= acCanasta
          ? `Tu ticket subió ${dec((acTicket - acCanasta))} puntos más que lo que comprás: el margen se sostiene.`
          : `Lo que comprás subió ${dec((acCanasta - acTicket))} puntos más que tu ticket: el margen se achica.`
      )
    }
    if (acCanasta !== null && acIpc !== null) {
      lectura.push(
        acCanasta <= acIpc
          ? `Tus compras subieron ${dec((acIpc - acCanasta))} puntos menos que la inflación.`
          : `Tus compras subieron ${dec((acCanasta - acIpc))} puntos más que la inflación.`
      )
    }
    nota(
      `${lectura.join(' ')} Canasta: precio por kilo o litro de ${c.insumos} insumos, mediana del mes, ponderado por lo que se gastó en cada uno. Una variación de más de 80% en un mes se deja afuera como sospechosa. Ticket del restaurante: mediodía y noche, sin eventos.`
    )
    y += 1.5
  }

  // =====================================================
  // 6 · COMPRAS POR RUBRO
  // =====================================================
  if (data.rubros.length > 0) {
    titulo('COMPRAS POR RUBRO')
    autoTable(doc, {
      ...estiloTabla,
      margin: { left: margin, right: margin, top: margin + 4, bottom: 18 },
      startY: y,
      head: [['Rubro', 'Mes', 'Mes anterior', 'Var.', '% total']],
      body: data.rubros.map((r) => [
        CATEGORIAS_LABEL[r.rubro] || r.rubro,
        fmt(r.monto),
        fmt(r.monto_previo),
        fmtVar(variacion(r.monto, r.monto_previo)),
        totalCompras > 0 ? `${dec(((r.monto / totalCompras) * 100))}%` : '—',
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
  // 7 · COMPRAS SEMANALES
  // =====================================================
  if (data.semanas.length > 0) {
    titulo('COMPRAS SEMANALES')
    autoTable(doc, {
      ...estiloTabla,
      margin: { left: margin, right: margin, top: margin + 4, bottom: 18 },
      startY: y,
      head: [['Semana', 'Monto', 'Var. s/anterior', '% del mes']],
      body: data.semanas.map((s, i) => {
        const previa = i > 0 ? data.semanas[i - 1].monto : null
        return [
          `${diaMes(s.desde)} — ${diaMes(s.hasta)}${s.cortada ? `  (${s.dias_en_mes} días en el mes)` : ''}`,
          fmt(s.monto),
          previa !== null ? fmtVar(variacion(s.monto, previa)) : '—',
          totalCompras > 0 ? `${dec(((s.monto / totalCompras) * 100))}%` : '—',
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
  // 8 · TOP 10 INSUMOS
  // =====================================================
  if (data.topInsumos.length > 0) {
    titulo('TOP 10 INSUMOS POR GASTO')
    autoTable(doc, {
      ...estiloTabla,
      margin: { left: margin, right: margin, top: margin + 4, bottom: 18 },
      startY: y,
      head: [['Insumo', 'Rubro', 'Monto', '% compras', 'Var. precio']],
      body: data.topInsumos.map((t) => [
        t.nombre,
        CATEGORIAS_LABEL[t.rubro] || t.rubro,
        fmt(t.monto),
        totalCompras > 0 ? `${dec(((t.monto / totalCompras) * 100))}%` : '—',
        fmtVar(t.variacion_precio),
      ]),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
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

  const totalHojas = doc.internal.pages.length - 1 // jsPDF guarda una hoja vacía en el índice 0
  for (let h = 1; h <= totalHojas; h++) {
    doc.setPage(h)
    doc.setDrawColor(214, 165, 145)
    doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(130, 130, 130)
    const hoja = totalHojas > 1 ? `  ·  Hoja ${h} de ${totalHojas}` : ''
    doc.text(`${marca.nombre} · Cierre de ${nombreMes(data.mes)}${hoja}`, margin, pageHeight - 8)
    doc.text(
      `Generado el ${dd}/${mm}/${ahora.getFullYear()} a las ${hh}:${mi}`,
      rightX,
      pageHeight - 8,
      { align: 'right' }
    )
  }

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
