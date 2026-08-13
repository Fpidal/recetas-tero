import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import {
  UMBRAL_PRECIO, DIAS_SIN_FACTURA, claveNota,
  type AuditoriaSemanal, type BloqueAuditoria, type MapaNotas,
} from './auditoria-semanal'

/**
 * PDF del resumen semanal de compras.
 *
 * Es el papel que se lleva a la reunión con el encargado de compras, así que
 * está pensado para leerse de arriba hacia abajo y para poder señalar una línea
 * y preguntar. Por eso cada bloque va ordenado por plata y las subas traen la
 * cantidad de veces que ese insumo aumentó en dos meses.
 *
 * Los bloques vacíos no se imprimen: una hoja con cinco secciones que dicen
 * "sin novedades" no se lee.
 */

const TERRACOTA = [163, 82, 52] as const
const GRIS_CLARO = [245, 245, 245] as const

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const cant = (n: number) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })
const fecha = (f: string) => { const [a, m, d] = f.split('-'); return `${d}/${m}` }

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

export async function generarPDFResumenSemanal(
  data: AuditoriaSemanal,
  notas: MapaNotas = new Map()
): Promise<void> {
  // La nota es la razón que alguien escribió: sin ella el PDF vuelve a abrir
  // discusiones que ya se cerraron. La columna solo aparece si hay alguna.
  const nota = (bloque: BloqueAuditoria, ref: string) => notas.get(claveNota(bloque, ref)) ?? ''
  const hayNotas = (bloque: BloqueAuditoria, refs: string[]) => refs.some((r) => nota(bloque, r))

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
  doc.text('Resumen semanal de compras', textX, y + 16.5)

  doc.setFontSize(13)
  doc.text(`${fecha(data.desde)} — ${fecha(data.hasta)}`, rightX, y + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
  doc.text(`${fmt(data.comprasSemana)} en ${data.cantidadFacturas} comprobantes`, rightX, y + 16, { align: 'right' })

  y += h + 5

  if (data.sinNovedades) {
    doc.setFillColor(...GRIS_CLARO)
    doc.rect(margin, y, contentWidth, 18, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(60, 60, 60)
    doc.text('Semana sin novedades', margin + 5, y + 8)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110)
    doc.text('Todo llegó completo y a precio, y no hay órdenes esperando factura.', margin + 5, y + 13.5)
    y += 24
  }

  const estilo = {
    theme: 'grid' as const,
    tableLineColor: [210, 210, 210] as [number, number, number],
    tableLineWidth: 0.1,
    headStyles: {
      fillColor: [240, 240, 240] as [number, number, number],
      textColor: [30, 30, 30] as [number, number, number],
      fontStyle: 'bold' as const, fontSize: 6, cellPadding: 1.2,
    },
    bodyStyles: { fontSize: 6.8, cellPadding: 1.2, minCellHeight: 4 },
    margin: { left: margin, right: margin },
  }

  /** Título de sección con el total al costado */
  function seccion(texto: string, total?: string) {
    if (y > pageHeight - 40) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...TERRACOTA)
    doc.text(texto.toUpperCase(), margin, y)
    if (total) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text(total, rightX, y, { align: 'right' })
    }
    y += 2.5
  }

  /** Aclaración en itálica debajo del título de sección */
  function pie(texto: string) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(5.5); doc.setTextColor(130, 130, 130)
    doc.text(texto, margin, y)
    y += 4
  }

  function tabla(head: string[][], body: any[][], alineDerecha: number[]) {
    const columnStyles: any = {}
    alineDerecha.forEach((i) => { columnStyles[i] = { halign: 'right' } })
    autoTable(doc, { ...estilo, startY: y, head, body, columnStyles })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // === NO LLEGÓ COMPLETO ===
  // Sin importe a propósito: lo que no llegó tampoco se pagó. Es faltante de
  // mercadería, no plata perdida. Se ordena por monto, pero no se muestra.
  if (data.faltantes.length) {
    const conNota = hayNotas('faltante', data.faltantes.map((f) => f.ref))
    seccion('No llegó completo')
    tabla(
      [['Insumo', 'Proveedor', 'Factura', 'Pedido', 'Llegó', ...(conNota ? ['Nota'] : [])]],
      data.faltantes.map((f) => [
        f.nombre, f.proveedor, f.factura,
        `${cant(f.pedido)} ${f.unidad}`,
        f.recibido === 0 ? 'no llegó' : `${cant(f.recibido)} ${f.unidad}`,
        ...(conNota ? [nota('faltante', f.ref)] : []),
      ]),
      [3, 4]
    )
  }

  // === CAMBIOS DE PRECIO ===
  if (data.cambiosPrecio.length) {
    seccion('Cambios de precio')
    pie(
      `Contra lo que se venía pagando. Cambios de más de ${UMBRAL_PRECIO}%, para arriba o para abajo. ` +
      'La columna "Antes se compraba a" solo se llena cuando el proveedor cambió.'
    )
    tabla(
      [['Insumo', 'Proveedor', 'Antes se compraba a', 'Antes', 'Ahora', 'Var.', 'Subas 2m',
        ...(hayNotas('cambio_precio', data.cambiosPrecio.map((c) => c.ref)) ? ['Nota'] : [])]],
      data.cambiosPrecio.map((c) => [
        c.nombre,
        c.proveedor,
        c.proveedorAnterior ?? '—',
        fmt(c.precioAnterior),
        fmt(c.precioNuevo),
        `${c.variacion > 0 ? '+' : ''}${c.variacion.toFixed(1)}%`,
        c.subasEnDosMeses > 1 ? `${c.subasEnDosMeses}ª` : '1ª',
        ...(hayNotas('cambio_precio', data.cambiosPrecio.map((x) => x.ref)) ? [nota('cambio_precio', c.ref)] : []),
      ]),
      [3, 4, 5, 6]
    )
  }

  // === PRECIO DISTINTO AL PEDIDO ===
  if (data.preciosDistintos.length) {
    const total = data.preciosDistintos.reduce((s, p) => s + p.impacto, 0)
    seccion('Precio distinto al pedido', `${total > 0 ? '+' : ''}${fmt(total)}`)
    pie('Lo facturado contra lo que decía la orden de compra.')
    tabla(
      [['Insumo', 'Proveedor', 'Factura', 'Pedido', 'Facturado', 'Var.', 'Impacto',
        ...(hayNotas('precio_distinto', data.preciosDistintos.map((p) => p.ref)) ? ['Nota'] : [])]],
      data.preciosDistintos.map((p) => [
        p.nombre, p.proveedor, p.factura,
        fmt(p.precioPedido), fmt(p.precioFacturado),
        `${p.variacion > 0 ? '+' : ''}${p.variacion.toFixed(1)}%`,
        `${p.impacto > 0 ? '+' : ''}${fmt(p.impacto)}`,
        ...(hayNotas('precio_distinto', data.preciosDistintos.map((x) => x.ref)) ? [nota('precio_distinto', p.ref)] : []),
      ]),
      [3, 4, 5, 6]
    )
  }

  // === LLEGÓ SIN PEDIR ===
  if (data.agregados.length) {
    const total = data.agregados.reduce((s, a) => s + a.monto, 0)
    seccion('Llegó sin pedir', fmt(total))
    tabla(
      [['Insumo', 'Proveedor', 'Factura', 'Cantidad', 'Monto',
        ...(hayNotas('agregado', data.agregados.map((a) => a.ref)) ? ['Nota'] : [])]],
      data.agregados.map((a) => [
        a.nombre, a.proveedor, a.factura, `${cant(a.cantidad)} ${a.unidad}`, fmt(a.monto),
        ...(hayNotas('agregado', data.agregados.map((x) => x.ref)) ? [nota('agregado', a.ref)] : []),
      ]),
      [3, 4]
    )
  }

  // === ÓRDENES SIN FACTURA ===
  if (data.ordenesSinFactura.length) {
    const total = data.ordenesSinFactura.reduce((s, o) => s + o.total, 0)
    seccion('Órdenes sin factura', `${fmt(total)} sin facturar`)
    pie(`Enviadas o parciales con más de ${DIAS_SIN_FACTURA} días. No incluye borradores ni canceladas.`)
    tabla(
      [['Orden', 'Proveedor', 'Fecha', 'Esperando', 'Total',
        ...(hayNotas('orden_sin_factura', data.ordenesSinFactura.map((o) => o.ref)) ? ['Nota'] : [])]],
      data.ordenesSinFactura.map((o) => [
        o.numero, o.proveedor, fecha(o.fecha), `${o.diasEsperando} días`, fmt(o.total),
        ...(hayNotas('orden_sin_factura', data.ordenesSinFactura.map((x) => x.ref)) ? [nota('orden_sin_factura', o.ref)] : []),
      ]),
      [3, 4]
    )
  }

  // === PIE, en todas las páginas ===
  const ahora = new Date()
  const dd = String(ahora.getDate()).padStart(2, '0')
  const mm = String(ahora.getMonth() + 1).padStart(2, '0')
  const total = (doc as any).internal.getNumberOfPages?.() ?? 1
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(214, 165, 145); doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(130, 130, 130)
    doc.text('Tero Restó · Resumen semanal de compras', margin, pageHeight - 8)
    doc.text(
      `Generado el ${dd}/${mm}/${ahora.getFullYear()}${total > 1 ? `  ·  ${p} de ${total}` : ''}`,
      rightX, pageHeight - 8, { align: 'right' }
    )
  }

  doc.save(`resumen-semanal_${data.desde}_a_${data.hasta}.pdf`)
}
