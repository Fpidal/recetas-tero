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
  // Piezas para dibujar como en pantalla (V.66): tarjetas, barras y medidores.
  // jsPDF no trae gráficos: todo se arma con rectángulos y líneas.
  // =====================================================
  const VERDE: [number, number, number] = [47, 122, 79]
  const AMARILLO: [number, number, number] = [183, 121, 31]
  const ROJO: [number, number, number] = [178, 58, 58]
  const FOREST: [number, number, number] = [27, 58, 45]
  const GRIS_IPC: [number, number, number] = [138, 143, 152]
  const BORDE: [number, number, number] = [226, 222, 216]
  const GAP = 4

  function tarjeta(x: number, yy: number, w: number, h: number) {
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...BORDE)
    doc.setLineWidth(0.25)
    doc.roundedRect(x, yy, w, h, 1.8, 1.8, 'FD')
  }
  function etiqueta(texto: string, x: number, yy: number) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.4)
    doc.setTextColor(125, 120, 115)
    doc.text(texto.toUpperCase(), x, yy, { charSpace: 0.25 })
  }
  function texto(t: string, x: number, yy: number, o: { tam?: number; color?: [number, number, number]; negrita?: boolean; alinear?: 'left' | 'right' | 'center'; ancho?: number } = {}) {
    doc.setFont('helvetica', o.negrita ? 'bold' : 'normal')
    doc.setFontSize(o.tam ?? 6.5)
    doc.setTextColor(...(o.color ?? [60, 60, 60]))
    const contenido = o.ancho ? (doc.splitTextToSize(t, o.ancho) as string[]) : t
    doc.text(contenido, x, yy, { align: o.alinear ?? 'left' })
    return Array.isArray(contenido) ? contenido.length : 1
  }
  /** Color de una variación: `invertido` = subir es malo (compras, costos) */
  function colorDeVariacion(v: number | null, invertido = false): [number, number, number] {
    if (v === null || !isFinite(v) || Math.abs(v) < 0.05) return [140, 140, 140]
    return v > 0 === invertido ? ROJO : VERDE
  }
  /** Tarjeta chica de cifra: etiqueta, número grande y una línea abajo */
  function tarjetaCifra(x: number, w: number, h: number, et: string, valor: string, abajo: string, colorValor?: [number, number, number]) {
    tarjeta(x, y, w, h)
    etiqueta(et, x + 3.5, y + 5)
    texto(valor, x + 3.5, y + 11.5, { tam: 12, negrita: true, color: colorValor ?? [30, 30, 30] })
    texto(abajo, x + 3.5, y + h - 3, { tam: 5.8, color: [125, 125, 125], ancho: w - 7 })
  }
  function triangulo(x: number, yy: number, arriba: boolean, color: [number, number, number]) {
    doc.setFillColor(...color)
    if (arriba) doc.triangle(x, yy, x + 2, yy, x + 1, yy - 1.8, 'F')
    else doc.triangle(x, yy - 1.8, x + 2, yy - 1.8, x + 1, yy, 'F')
  }
  const tercio = (contentWidth - GAP * 2) / 3
  const mitad = (contentWidth - GAP) / 2

  // =====================================================
  // 2 · LOS 10 PROVEEDORES DEL MES
  // =====================================================
  if (data.proveedores && data.proveedores.length > 0) {
    const top = data.proveedores
    const sumaTop = top.reduce((t, p) => t + p.monto, 0)
    const maximo = top[0]?.monto || 1
    const cuenta = data.proveedoresConCompras
    const mesPrevioCorto = nombreMes(data.mesPrevio).split(' ')[0]
    titulo('LOS 10 PROVEEDORES DEL MES', 110)
    y += 1

    const vCompras = variacion(totalCompras, data.compras.previo)
    tarjetaCifra(margin, tercio, 19, 'Compras del mes', fmt(totalCompras), `${mesPrevioCorto}: ${fmt(data.compras.previo)}  (${fmtVar(vCompras)})`)
    tarjetaCifra(margin + tercio + GAP, tercio, 19, 'Los 10 primeros', totalCompras > 0 ? `${dec((sumaTop / totalCompras) * 100)}%` : '—', `${fmt(sumaTop)} de las compras del mes`)
    tarjetaCifra(margin + (tercio + GAP) * 2, tercio, 19, 'Proveedores con factura', cuenta ? String(cuenta.mes) : '—', cuenta ? `${mesPrevioCorto}: ${cuenta.previo}` : '')
    y += 19 + GAP

    const anchoTabla = contentWidth - tercio - GAP
    const yTabla = y
    autoTable(doc, {
      ...estiloTabla,
      margin: { ...margenTablas, right: pageWidth - margin - anchoTabla },
      tableWidth: anchoTabla,
      startY: y,
      head: [['#', 'Proveedor', 'Mes', '% mes', 'Anterior', 'Var.', 'Puesto']],
      body: top.map((p) => [
        String(p.puesto ?? ''),
        p.nombre,
        fmt(p.monto),
        pctMes(p.monto, totalCompras),
        p.montoPrevio > 0 ? fmt(p.montoPrevio) : '—',
        p.montoPrevio > 0 ? fmtVar(variacion(p.monto, p.montoPrevio)) : '—',
        '',
      ]),
      bodyStyles: { ...estiloTabla.bodyStyles, minCellHeight: 6.4, valign: 'top', cellPadding: { top: 1.3, bottom: 1.6, left: 1.2, right: 1.2 } },
      columnStyles: {
        0: { halign: 'right', cellWidth: 6, textColor: [150, 150, 150] },
        2: { halign: 'right', fontStyle: 'bold' }, 3: { halign: 'right' }, 4: { halign: 'right', textColor: [130, 130, 130] }, 5: { halign: 'right' },
        6: { cellWidth: 13 },
      },
      didParseCell: (c) => {
        if (c.section === 'body' && c.column.index === 5) {
          const col = colorVar(String(c.cell.raw))
          if (col) c.cell.styles.textColor = col
        }
      },
      didDrawCell: (c) => {
        if (c.section !== 'body') return
        const p = top[c.row.index]
        if (c.column.index === 1) {
          // Barra del proveedor, proporcional al primero
          doc.setFillColor(...FOREST)
          doc.rect(c.cell.x + 1.2, c.cell.y + c.cell.height - 1.9, (c.cell.width - 2.4) * (p.monto / maximo), 0.9, 'F')
        }
        if (c.column.index === 6) {
          const cx = c.cell.x + c.cell.width / 2
          const cy = c.cell.y + 3.9
          if (p.puestoPrevio === null) {
            doc.setFillColor(...rgb(PALETA.terracottaBg))
            doc.roundedRect(cx - 5, cy - 2.6, 10, 3.4, 1.6, 1.6, 'F')
            texto('nuevo', cx, cy, { tam: 5.5, negrita: true, color: TERRACOTA, alinear: 'center' })
          } else if (p.puesto === null || p.puesto === p.puestoPrevio) {
            texto('=', cx, cy, { tam: 6.5, color: [170, 170, 170], alinear: 'center' })
          } else {
            const sube = p.puesto < p.puestoPrevio
            const color = sube ? VERDE : ROJO
            triangulo(cx - 2.6, cy, sube, color)
            texto(String(Math.abs(p.puestoPrevio - p.puesto)), cx + 0.4, cy, { tam: 6.3, color })
          }
        }
      },
    })
    const finTabla = (doc as any).lastAutoTable.finalY

    // Al costado: los que salieron del top 10
    const xS = margin + anchoTabla + GAP
    const salieron = data.proveedoresSalieron || []
    tarjeta(xS, yTabla, tercio, finTabla - yTabla)
    etiqueta('Salieron del top 10', xS + 3.5, yTabla + 5)
    let yS = yTabla + 10
    if (salieron.length === 0) {
      texto('Los mismos diez que el mes anterior.', xS + 3.5, yS, { tam: 6, color: [125, 125, 125], ancho: tercio - 7 })
    }
    for (const p of salieron) {
      if (yS > finTabla - 8) break
      texto(p.nombre, xS + 3.5, yS, { tam: 6.5, negrita: true, color: [40, 40, 40], ancho: tercio - 7 })
      texto(`${p.puestoPrevio}° el mes anterior`, xS + tercio - 3.5, yS, { tam: 5.3, color: [150, 150, 150], alinear: 'right' })
      const v = p.monto > 0 ? variacion(p.monto, p.montoPrevio) : null
      texto(`${fmt(p.montoPrevio)}  a  ${fmt(p.monto)}`, xS + 3.5, yS + 3.6, { tam: 5.8, color: [100, 100, 100] })
      texto(p.monto > 0 ? `hoy ${p.puesto}° · ${fmtVar(v)}` : 'sin compras', xS + tercio - 3.5, yS + 3.6, { tam: 5.8, color: p.monto > 0 ? colorDeVariacion(v, true) : [150, 150, 150], alinear: 'right' })
      doc.setDrawColor(238, 234, 228)
      doc.setLineWidth(0.15)
      doc.line(xS + 3.5, yS + 6, xS + tercio - 3.5, yS + 6)
      yS += 9.5
    }
    y = finTabla + 7
  }

  // =====================================================
  // 3 · RESTAURANTE Y EVENTOS
  // =====================================================
  if (data.faltaVentas) {
    titulo('RESTAURANTE Y EVENTOS', 20)
    texto(`Sin ventas cargadas en ${nombreMes(data.mes)}.`, margin, y + 3, { tam: 7, color: [150, 90, 40] })
    y += 10
  } else {
    type Par = { venta: number; cubiertos: number }
    const de = (lista: typeof data.ventasPorServicio | undefined, s: string): Par =>
      lista?.find((v) => v.servicio === s) || { venta: 0, cubiertos: 0 }
    const suma = (a: Par, b: Par): Par => ({ venta: a.venta + b.venta, cubiertos: a.cubiertos + b.cubiertos })
    const prev = data.ventasPorServicioPrevio
    const med = de(data.ventasPorServicio, 'mediodia')
    const noc = de(data.ventasPorServicio, 'noche')
    const eve = de(data.ventasPorServicio, 'eventos')
    const rest = suma(med, noc)
    const evePrev = prev ? de(prev, 'eventos') : null
    const total = data.ventas.mes
    const lineas: { nombre: string; actual: Par; previo: Par | null; sub?: boolean }[] = [
      { nombre: 'Restaurante', actual: rest, previo: prev ? suma(de(prev, 'mediodia'), de(prev, 'noche')) : null },
      { nombre: 'Mediodía', actual: med, previo: prev ? de(prev, 'mediodia') : null, sub: true },
      { nombre: 'Noche', actual: noc, previo: prev ? de(prev, 'noche') : null, sub: true },
      { nombre: 'Eventos', actual: eve, previo: evePrev },
    ]
    const altoTarjeta = 31 + lineas.length * 7.4
    const hayAviso = eve.venta > 0
    titulo('RESTAURANTE Y EVENTOS', altoTarjeta + (hayAviso ? 16 : 6))
    y += 1

    // Izquierda: la venta y su reparto
    tarjeta(margin, y, mitad, altoTarjeta)
    etiqueta(`Venta del mes${data.hastaDia ? ` al día ${data.hastaDia}` : ''}`, margin + 3.5, y + 5)
    texto(fmt(total), margin + 3.5, y + 12, { tam: 12, negrita: true, color: [30, 30, 30] })
    const anchoBarra = mitad - 7
    const pRest = total > 0 ? rest.venta / total : 0
    const yBarra = y + 15.5
    doc.setFillColor(240, 238, 234)
    doc.roundedRect(margin + 3.5, yBarra, anchoBarra, 5, 1, 1, 'F')
    if (pRest > 0) {
      doc.setFillColor(...FOREST)
      doc.rect(margin + 3.5, yBarra, anchoBarra * pRest, 5, 'F')
      if (pRest > 0.12) texto(`${dec(pRest * 100)}%`, margin + 5, yBarra + 3.5, { tam: 5.8, negrita: true, color: [255, 255, 255] })
    }
    if (eve.venta > 0) {
      doc.setFillColor(...TERRACOTA)
      doc.rect(margin + 3.5 + anchoBarra * pRest, yBarra, anchoBarra * (1 - pRest), 5, 'F')
      if (1 - pRest > 0.12) texto(`${dec((1 - pRest) * 100)}%`, margin + 5 + anchoBarra * pRest, yBarra + 3.5, { tam: 5.8, negrita: true, color: [255, 255, 255] })
    }
    // Leyenda
    doc.setFillColor(...FOREST); doc.rect(margin + 3.5, yBarra + 7, 2, 2, 'F')
    texto('Restaurante (mediodía y noche)', margin + 6.5, yBarra + 8.7, { tam: 5.6, color: [120, 120, 120] })
    doc.setFillColor(...TERRACOTA); doc.rect(margin + 42, yBarra + 7, 2, 2, 'F')
    texto('Eventos', margin + 45, yBarra + 8.7, { tam: 5.6, color: [120, 120, 120] })

    let yL = yBarra + 15
    const mesPrevioCorto = nombreMes(data.mesPrevio).split(' ')[0]
    for (const l of lineas) {
      const xN = margin + 3.5 + (l.sub ? 3 : 0)
      texto(l.nombre, xN, yL, { tam: 6.5, negrita: !l.sub, color: l.sub ? [120, 120, 120] : [40, 40, 40] })
      const ticket = l.actual.cubiertos > 0 ? fmt(l.actual.venta / l.actual.cubiertos) : '—'
      texto(`${fmt(l.actual.venta)} · ${l.actual.cubiertos.toLocaleString('es-AR')} cub. · ticket ${ticket}`, margin + mitad - 3.5, yL, { tam: 6, color: [50, 50, 50], alinear: 'right' })
      if (l.previo && l.previo.venta > 0) {
        const v = variacion(l.actual.venta, l.previo.venta)
        texto(`${mesPrevioCorto}: ${fmt(l.previo.venta)}  ${fmtVar(v)}`, margin + mitad - 3.5, yL + 2.9, { tam: 5.2, color: colorDeVariacion(v), alinear: 'right' })
      }
      yL += 7.4
    }

    // Derecha: compras sobre venta
    const xR = margin + mitad + GAP
    tarjeta(xR, y, mitad, altoTarjeta)
    etiqueta('Compras sobre venta', xR + 3.5, y + 5)
    const ratios: { t: string; v: number | null; d: string }[] = [
      {
        t: 'Sobre la venta total',
        v: total > 0 ? (totalCompras / total) * 100 : null,
        d: `${fmt(totalCompras)} de compras ÷ ${fmt(total)}.${eve.venta > 0 ? ' Lo baja la venta de eventos.' : ''}`,
      },
    ]
    if (eve.venta > 0) {
      ratios.push({
        t: 'Sobre la venta del restaurante',
        v: rest.venta > 0 ? (totalCompras / rest.venta) * 100 : null,
        d: `Las mismas compras ÷ ${fmt(rest.venta)}. Lo sube lo comprado para eventos.`,
      })
    }
    if (data.ventas.previo > 0) {
      ratios.push({
        t: `${nombreMes(data.mesPrevio)}${evePrev && evePrev.venta === 0 ? ', sin eventos' : ''}`,
        v: (data.compras.previo / data.ventas.previo) * 100,
        d: `${fmt(data.compras.previo)} ÷ ${fmt(data.ventas.previo)}${data.hastaDia ? ', al mismo día' : ''}.`,
      })
    }
    let yR = y + 12
    ratios.forEach((r, i) => {
      if (i > 0) {
        doc.setDrawColor(238, 234, 228); doc.setLineWidth(0.15)
        doc.line(xR + 3.5, yR - 5, xR + mitad - 3.5, yR - 5)
      }
      texto(r.t, xR + 3.5, yR, { tam: 6.8, color: [60, 60, 60] })
      texto(r.v === null ? '—' : `${dec(r.v)}%`, xR + mitad - 3.5, yR + 0.5, { tam: 11, negrita: true, color: [30, 30, 30], alinear: 'right' })
      texto(r.d, xR + 3.5, yR + 3.6, { tam: 5.4, color: [140, 140, 140], ancho: mitad - 28 })
      yR += 13
    })
    y += altoTarjeta + 3

    if (hayAviso) {
      const msg = 'Ninguno de los dos porcentajes es el real: las facturas no dicen si la compra fue para el salón o para un evento. La incidencia real (abajo) no tiene este problema, porque se calcula con el consumo de cada servicio.'
      doc.setFontSize(6)
      const lineasAviso = doc.splitTextToSize(msg, contentWidth - 8) as string[]
      const h = lineasAviso.length * 2.7 + 4
      doc.setFillColor(253, 245, 227); doc.setDrawColor(235, 221, 191); doc.setLineWidth(0.25)
      doc.roundedRect(margin, y, contentWidth, h, 1.5, 1.5, 'FD')
      texto(msg, margin + 4, y + 4, { tam: 6, color: [94, 69, 18], ancho: contentWidth - 8 })
      y += h + 3
    }
    y += 4
  }

  // =====================================================
  // 4 · INCIDENCIA REAL POR SERVICIO
  // =====================================================
  if (data.incidenciaPorServicio && data.incidenciaPorServicio.length > 0) {
    const servicios = data.incidenciaPorServicio
    const altoT = 50
    titulo(`INCIDENCIA REAL POR SERVICIO  ·  OBJETIVO ${objetivos.incidencia}% (± ${objetivos.tolerancia} PTS)`, altoT + 6)
    y += 1
    const ESTADO = {
      ok: { t: 'Dentro del objetivo', c: VERDE, bg: [234, 244, 238] as [number, number, number] },
      warning: { t: 'En tolerancia', c: AMARILLO, bg: [253, 245, 227] as [number, number, number] },
      danger: { t: 'Fuera del objetivo', c: ROJO, bg: [251, 236, 236] as [number, number, number] },
    } as const
    const tope = objetivos.incidencia + 10

    servicios.forEach((s, i) => {
      const x = margin + i * (tercio + GAP)
      tarjeta(x, y, tercio, altoT)
      const tiene = s.resumen.diasConCarga > 0 && s.resumen.ventaConCosto > 0
      const valor = s.resumen.incidencia
      const est = tiene ? ESTADO[estadoContraObjetivo(valor, objetivos.incidencia, objetivos.tolerancia) as keyof typeof ESTADO] : null
      etiqueta(SERVICIO_LABEL[s.servicio] || s.servicio, x + 3.5, y + 5)
      texto(tiene ? `${dec(valor)}%` : '—', x + 3.5, y + 12.5, { tam: 13, negrita: true, color: tiene ? [30, 30, 30] : [190, 190, 190] })
      // Pastilla de estado
      const pill = est ? est.t : 'Sin consumo cargado'
      doc.setFontSize(5.3)
      const anchoPill = doc.getTextWidth(pill) + 4
      doc.setFillColor(...(est ? est.bg : ([240, 238, 234] as [number, number, number])))
      doc.roundedRect(x + tercio - 3.5 - anchoPill, y + 2.6, anchoPill, 3.6, 1.8, 1.8, 'F')
      texto(pill, x + tercio - 3.5 - anchoPill / 2, y + 5.2, { tam: 5.3, negrita: true, color: est ? est.c : [120, 120, 120], alinear: 'center' })

      // Medidor
      const gx = x + 3.5
      const gw = tercio - 7
      const gy = y + 16.5
      const aX = (v: number) => gx + gw * Math.min(1, Math.max(0, v / tope))
      doc.setFillColor(240, 238, 234)
      doc.roundedRect(gx, gy, gw, 2.2, 1.1, 1.1, 'F')
      doc.setFillColor(242, 225, 190)
      doc.rect(aX(objetivos.incidencia), gy, aX(objetivos.incidencia + objetivos.tolerancia) - aX(objetivos.incidencia), 2.2, 'F')
      if (tiene && est) {
        doc.setFillColor(...est.c)
        doc.roundedRect(gx, gy, Math.max(1.2, aX(valor) - gx), 2.2, 1.1, 1.1, 'F')
      }
      doc.setFillColor(26, 26, 26)
      doc.rect(aX(objetivos.incidencia) - 0.25, gy - 1, 0.5, 4.2, 'F')
      texto('0%', gx, gy + 5.3, { tam: 5, color: [160, 160, 160] })
      texto(`objetivo ${objetivos.incidencia}%`, aX(objetivos.incidencia), gy + 5.3, { tam: 5, color: [160, 160, 160], alinear: 'center' })
      texto(`${tope}%`, gx + gw, gy + 5.3, { tam: 5, color: [160, 160, 160], alinear: 'right' })

      // Curva de los meses
      const serie = [...s.historia, { mes: data.mes, incidencia: tiene ? valor : null }]
      const puntos = serie.map((p, k) => ({ k, v: p.incidencia, mes: p.mes })).filter((p) => p.v !== null) as { k: number; v: number; mes: string }[]
      const sy = gy + 9
      const sh = 10
      if (puntos.length >= 2) {
        const vals = [...puntos.map((p) => p.v), objetivos.incidencia]
        const min = Math.min(...vals) - 2
        const max = Math.max(...vals) + 1
        const px = (k: number) => gx + 1.5 + (gw - 3) * (k / (serie.length - 1))
        const py = (v: number) => sy + sh - ((v - min) / (max - min)) * sh
        doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.15)
        ;(doc as any).setLineDashPattern([0.8, 0.8], 0)
        doc.line(gx, py(objetivos.incidencia), gx + gw, py(objetivos.incidencia))
        ;(doc as any).setLineDashPattern([], 0)
        const color = est ? est.c : ([155, 148, 140] as [number, number, number])
        doc.setDrawColor(...color); doc.setLineWidth(0.5)
        for (let k = 1; k < puntos.length; k++) {
          doc.line(px(puntos[k - 1].k), py(puntos[k - 1].v), px(puntos[k].k), py(puntos[k].v))
        }
        doc.setFillColor(...color)
        puntos.forEach((p, k) => doc.circle(px(p.k), py(p.v), k === puntos.length - 1 ? 0.75 : 0.45, 'F'))
        const ini = puntos[0]
        const fin = puntos[puntos.length - 1]
        texto(`${mesCorto(ini.mes)} ${dec(ini.v)}`, gx, sy + sh + 3, { tam: 5, color: [160, 160, 160] })
        texto(`${mesCorto(fin.mes)} ${dec(fin.v)}`, gx + gw, sy + sh + 3, { tam: 5, color: [160, 160, 160], alinear: 'right' })
      }

      // Muestreo y lectura
      let pie: string
      if (tiene) {
        pie = `${s.resumen.diasConCarga} de ${s.resumen.diasConVenta} servicios con consumo`
        const ini = puntos[0]
        if (ini && ini.mes !== data.mes && Math.abs(valor - ini.v) >= 1) {
          pie += ` · ${valor > ini.v ? 'subió' : 'bajó'} ${dec(Math.abs(valor - ini.v))} puntos desde ${nombreMes(ini.mes).split(' ')[0].toLowerCase()}`
        }
      } else if (s.resumen.diasConVenta > 0) {
        pie = `0 de ${s.resumen.diasConVenta} con consumo. Sin cargar lo que se usó no hay forma de saber si deja margen.`
      } else {
        pie = 'Sin ventas en el mes.'
      }
      texto(pie, x + 3.5, y + altoT - 6, { tam: 5.6, color: [100, 100, 100], ancho: tercio - 7 })
    })
    y += altoT + 7
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
    const desde = nombreMes(c.desde).split(' ')[0].toLowerCase()
    const hasta = nombreMes(data.mes).split(' ')[0].toLowerCase()
    const altoGrafico = 62

    titulo(`TU INFLACIÓN  ·  ${nombreMes(c.desde).toUpperCase()} A ${nombreMes(data.mes).toUpperCase()}`, 19 + GAP + altoGrafico + 6)
    y += 1
    tarjetaCifra(margin, tercio, 19, `Tu canasta, ${desde} a ${hasta}`, fmtVar(acCanasta), `Ponderada por gasto, ${c.insumos} insumos`, colorDeVariacion(acCanasta, true))
    tarjetaCifra(margin + tercio + GAP, tercio, 19, `Ticket restaurante, ${desde} a ${hasta}`, fmtVar(acTicket), 'Mediodía y noche, sin eventos', colorDeVariacion(acTicket))
    const x3 = margin + (tercio + GAP) * 2
    if (hayIpc) {
      tarjetaCifra(x3, tercio, 19, `IPC INDEC, ${desde} a ${hasta}`, fmtVar(acIpc), 'Inflación general', colorDeVariacion(acIpc, true))
    } else {
      tarjeta(x3, y, tercio, 19)
      etiqueta('Lectura', x3 + 3.5, y + 5)
      const lectura =
        acCanasta === null || acTicket === null
          ? 'Faltan meses con datos para comparar.'
          : acTicket >= acCanasta
            ? `Tu ticket subió ${dec(acTicket - acCanasta)} puntos más que lo que comprás: el margen se sostiene.`
            : `Lo que comprás subió ${dec(acCanasta - acTicket)} puntos más que tu ticket: el margen se achica.`
      texto(lectura, x3 + 3.5, y + 9.5, { tam: 6.4, color: [50, 50, 50], ancho: tercio - 7 })
    }
    y += 19 + GAP

    // Gráfico mes a mes, dibujado a mano
    const yG = y
    tarjeta(margin, yG, mitad, altoGrafico)
    etiqueta('Mes a mes', margin + 3.5, yG + 5)
    const series: { clave: 'canasta' | 'ticket' | 'ipc'; color: [number, number, number]; nombre: string }[] = [
      { clave: 'canasta', color: TERRACOTA, nombre: 'Tu canasta' },
      { clave: 'ticket', color: FOREST, nombre: 'Ticket restaurante' },
      ...(hayIpc ? [{ clave: 'ipc' as const, color: GRIS_IPC, nombre: 'IPC' }] : []),
    ]
    const valores = c.meses.flatMap((m) => series.map((s) => m[s.clave])).filter((v): v is number => v !== null)
    const vMax = Math.max(1, ...valores)
    const vMin = Math.min(0, ...valores)
    const paso = vMax - vMin > 10 ? 5 : 2
    const techo = Math.ceil(vMax / paso) * paso
    const piso = Math.floor(vMin / paso) * paso
    const ax = margin + 13
    const aw = mitad - 17
    const ay = yG + 9
    const ah = altoGrafico - 22
    const gy = (v: number) => ay + ah - ((v - piso) / (techo - piso)) * ah
    for (let v = piso; v <= techo + 0.001; v += paso) {
      doc.setDrawColor(v === 0 ? 155 : 236, v === 0 ? 148 : 233, v === 0 ? 140 : 228)
      doc.setLineWidth(v === 0 ? 0.3 : 0.15)
      doc.line(ax, gy(v), ax + aw, gy(v))
      texto(`${v}%`, ax - 1.5, gy(v) + 1, { tam: 5, color: [150, 150, 150], alinear: 'right' })
    }
    const grupo = aw / c.meses.length
    const barra = Math.min(6, (grupo * 0.7) / series.length)
    c.meses.forEach((m, i) => {
      const inicio = ax + grupo * i + (grupo - barra * series.length) / 2
      series.forEach((s, k) => {
        const v = m[s.clave]
        if (v === null) return
        doc.setFillColor(...s.color)
        const y0 = gy(0)
        const y1 = gy(v)
        doc.rect(inicio + barra * k, Math.min(y0, y1), barra - 0.4, Math.max(0.3, Math.abs(y1 - y0)), 'F')
      })
      texto(mesCorto(m.mes), ax + grupo * i + grupo / 2, ay + ah + 4, { tam: 5.6, color: [120, 120, 120], alinear: 'center' })
    })
    let xLey = margin + 3.5
    series.forEach((s) => {
      doc.setFillColor(...s.color)
      doc.rect(xLey, yG + altoGrafico - 6.3, 2, 2, 'F')
      texto(s.nombre, xLey + 3, yG + altoGrafico - 4.6, { tam: 5.6, color: [120, 120, 120] })
      doc.setFontSize(5.6)
      xLey += doc.getTextWidth(s.nombre) + 8
    })
    if (data.hastaDia) {
      texto(`${nombreMes(data.mes).split(' ')[0]}, al día ${data.hastaDia}.`, margin + mitad - 3.5, yG + altoGrafico - 4.6, { tam: 5.2, color: [160, 160, 160], alinear: 'right' })
    }

    // Por rubro, al lado
    const gastoTotal = c.rubros.reduce((t, r) => t + r.gasto, 0)
    autoTable(doc, {
      ...estiloTabla,
      margin: { ...margenTablas, left: margin + mitad + GAP },
      tableWidth: mitad,
      startY: yG,
      head: [[`Rubro, ${desde} a ${hasta}`, 'Gasto', 'Variación']],
      body: [...c.rubros]
        .sort((a, b) => (b.variacion ?? -Infinity) - (a.variacion ?? -Infinity))
        .map((r) => [CATEGORIAS_LABEL[r.rubro] || r.rubro, fmt(r.gasto), fmtVar(r.variacion)]),
      foot: [['TOTAL', fmt(gastoTotal), fmtVar(acCanasta)]],
      columnStyles: { 1: { halign: 'right', textColor: [120, 120, 120] }, 2: { halign: 'right' } },
      didParseCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 2) {
          const col = colorVar(String(cell.cell.raw))
          if (col) cell.cell.styles.textColor = col
        }
      },
    })
    y = Math.max(yG + altoGrafico, (doc as any).lastAutoTable.finalY) + 3
    nota('Canasta: precio por kilo o litro de cada insumo, mediana del mes, ponderado por lo que se gastó en él. Una variación de más de 80% en un mes se deja afuera como sospechosa. Ticket del restaurante: mediodía y noche, sin eventos.')
    y += 2
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
