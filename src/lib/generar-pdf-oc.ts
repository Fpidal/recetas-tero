import jsPDF from 'jspdf'
import { supabase } from './supabase'
import { PALETA, rgb } from './colores'
import { ivaLineaOrden } from '@/lib/iva'
import { parseFechaLocal } from '@/lib/fechas'
import { obtenerEmpresa, condicionesOC, nombreConRazonSocial, logoParaFranja, encajarLogo } from '@/lib/empresa'

interface OrdenPDF {
  id: string
  numero: string | null
  fecha: string
  estado: string
  notas: string | null
  proveedor_nombre: string
  proveedor_contacto: string | null
  proveedor_telefono: string | null
  proveedor_email: string | null
  proveedor_direccion: string | null
  items: {
    insumo_id: string | null
    vino_id: string | null
    insumo_nombre: string
    unidad_medida: string
    unidad_display: string // Unidad visual para el proveedor
    cantidad: number // Cantidad pedida (OC)
    unidades?: number | null // Bultos pedidos: informativo, no entra en el subtotal
    cantidad_recibida?: number // Cantidad según factura
    precio_unitario: number // Precio del pedido (OC)
    precio_factura?: number // Precio según factura
    subtotal: number // Subtotal del pedido
    subtotal_factura?: number // Subtotal según factura
    iva_porcentaje: number
    iva_monto: number
    nota: string | null // Aclaración para el proveedor: "feteada", "marca X"
  }[]
  tieneFactura?: boolean
}

// Los datos de la empresa (nombre, razón social, domicilio, horario,
// condiciones y logo) salen de Configuración → Empresa. Hasta V.63 estaban
// escritos acá. Ver src/lib/empresa.ts.

export async function generarPDFOrden(ordenId: string) {
  // Sin razón social ni domicilio la orden no se manda: mejor un aviso que un
  // PDF con el "Entregar en" vacío.
  let empresa
  try {
    empresa = await obtenerEmpresa()
  } catch (e) {
    alert(e instanceof Error ? e.message : 'No se pudieron leer los datos de la empresa')
    return
  }

  // Fetch datos completos
  const { data, error } = await supabase
    .from('ordenes_compra')
    .select(`
      id, numero, fecha, notas, estado,
      proveedores (nombre, contacto, telefono, email, direccion),
      orden_compra_items (
        insumo_id, vino_id, cantidad, unidades, precio_unitario, subtotal, unidad_display, iva_porcentaje, nota,
        insumos (nombre, unidad_medida, iva_porcentaje),
        vinos (bodega, nombre, cepa)
      )
    `)
    .eq('id', ordenId)
    .single()

  if (error || !data) {
    alert('Error al cargar la orden para PDF')
    return
  }

  // Buscar factura asociada para obtener cantidades y precios recibidos
  const { data: facturaData } = await supabase
    .from('facturas_proveedor')
    .select('id, factura_items (insumo_id, vino_id, cantidad, precio_unitario, subtotal)')
    .eq('orden_compra_id', ordenId)
    .eq('activo', true)
    .maybeSingle()

  const facturaItems = facturaData?.factura_items as { insumo_id: string | null; vino_id: string | null; cantidad: number; precio_unitario: number; subtotal: number }[] | null

  const prov = data.proveedores as any
  const orden: OrdenPDF = {
    id: data.id,
    numero: (data as any).numero || null,
    fecha: data.fecha,
    estado: (data as any).estado || 'borrador',
    notas: data.notas,
    proveedor_nombre: prov?.nombre || 'Desconocido',
    proveedor_contacto: prov?.contacto || null,
    proveedor_telefono: prov?.telefono || null,
    proveedor_email: prov?.email || null,
    proveedor_direccion: prov?.direccion || null,
    tieneFactura: !!facturaData,
    items: (data.orden_compra_items as any[]).map((item: any) => {
      const subtotal = parseFloat(item.subtotal)
      const esVino = !!item.vino_id
      const ivaPorcentaje = ivaLineaOrden(item)
      const ivaMonto = subtotal * (ivaPorcentaje / 100)
      const unidadMedida = esVino ? 'caja' : (item.insumos?.unidad_medida || '')
      const nombreItem = esVino
        ? `${item.vinos?.nombre || 'Vino desconocido'} (${item.vinos?.cepa || ''})`
        : (item.insumos?.nombre || 'Desconocido')

      // Buscar datos de factura
      const facturaItem = facturaItems?.find(fi =>
        esVino ? fi.vino_id === item.vino_id : fi.insumo_id === item.insumo_id
      )
      const cantidadRecibida = facturaItem ? parseFloat(String(facturaItem.cantidad)) : undefined
      const precioFactura = facturaItem ? parseFloat(String(facturaItem.precio_unitario)) : undefined
      const subtotalFactura = facturaItem ? parseFloat(String(facturaItem.subtotal)) : undefined

      return {
        insumo_id: item.insumo_id,
        vino_id: item.vino_id,
        insumo_nombre: nombreItem,
        unidad_medida: unidadMedida,
        unidad_display: item.unidad_display || unidadMedida,
        cantidad: parseFloat(item.cantidad),
        unidades: item.unidades != null ? parseFloat(item.unidades) : null,
        cantidad_recibida: cantidadRecibida,
        precio_unitario: parseFloat(item.precio_unitario),
        precio_factura: precioFactura,
        subtotal,
        subtotal_factura: subtotalFactura,
        iva_porcentaje: ivaPorcentaje,
        iva_monto: ivaMonto,
        nota: item.nota || null,
      }
    }),
  }

  // Calcular totales - usar valores de factura si OC está recibida
  const esRecibidaCalc = orden.tieneFactura && (orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida')

  // Subtotales de factura y de OC original
  const subtotalFacturaTotal = orden.items.reduce((sum, item) => {
    const fi = item.cantidad_recibida !== undefined ? (item.cantidad_recibida * (item.precio_factura ?? item.precio_unitario)) : 0
    return sum + fi
  }, 0)
  const subtotalOCOriginal = orden.items.reduce((sum, item) => sum + item.subtotal, 0)

  // Si está recibida, usar subtotales de factura; sino, del pedido
  const subtotalNeto = esRecibidaCalc ? subtotalFacturaTotal : subtotalOCOriginal

  // IVA calculado sobre los subtotales correspondientes
  const calcularIva = (items: typeof orden.items, ivaPct: number) => {
    return items
      .filter(i => i.iva_porcentaje === ivaPct)
      .reduce((sum, item) => {
        const base = esRecibidaCalc
          ? (item.cantidad_recibida !== undefined ? (item.cantidad_recibida * (item.precio_factura ?? item.precio_unitario)) : 0)
          : item.subtotal
        return sum + (base * (ivaPct / 100))
      }, 0)
  }

  const totalIva21 = calcularIva(orden.items, 21)
  const totalIva105 = calcularIva(orden.items, 10.5)
  const totalIva = totalIva21 + totalIva105
  const totalConIva = subtotalNeto + totalIva

  // Calcular diferencia vs OC original (para mostrar al final)
  const calcularIvaOC = (items: typeof orden.items, ivaPct: number) => {
    return items
      .filter(i => i.iva_porcentaje === ivaPct)
      .reduce((sum, item) => sum + (item.subtotal * (ivaPct / 100)), 0)
  }
  const totalOCConIva = subtotalOCOriginal + calcularIvaOC(orden.items, 21) + calcularIvaOC(orden.items, 10.5)
  const diferenciaVsOC = totalConIva - totalOCConIva
  const diferenciaVsOCPct = totalOCConIva > 0 ? ((diferenciaVsOC / totalOCConIva) * 100).toFixed(1) : '0'

  // A5 vertical
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const pageWidth = 148
  const pageHeight = 210
  const margin = 8
  const contentWidth = pageWidth - margin * 2
  const TERRACOTA = rgb(PALETA.terracotta)
  const TERRACOTA_LIGHT = rgb(PALETA.terracottaLight)
  const GRIS_CLARO = rgb(PALETA.creamDark)
  // Fondo del encabezado de la tabla: un tono más que las cajas, sin terracota
  const GRIS_TABLA: [number, number, number] = [238, 234, 228]

  // V.63: Lato en vez de Helvetica, más cercana a la tipografía de la app.
  // Es la de toda la OC; Times queda sólo para el nombre cuando no hay logo.
  // Import dinámico: son 185 KB que sólo hacen falta al generar el PDF, no al
  // abrir la pantalla de órdenes
  const { registrarLato } = await import('@/lib/fonts/lato')
  registrarLato(doc)
  const FUENTE = 'Lato'

  // El logo de Configuración → Empresa, en blanco y con su proporción. Antes
  // era el primer archivo del bucket "fotos platos", dibujado en un cuadrado
  // de 20 × 20 mm: salía aplastado y en negro sobre el terracota.
  const logo = empresa.logo && empresa.logo_en_oc ? await logoParaFranja(empresa.logo) : null

  function fmtMoney(n: number): string {
    return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  // Formatear fecha: "Benavídez 04 de febrero de 2026"
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const fechaObj = parseFechaLocal(orden.fecha)
  const dia = fechaObj.getDate().toString().padStart(2, '0')
  const mes = meses[fechaObj.getMonth()]
  const anio = fechaObj.getFullYear()
  const fechaFormateada = [empresa.localidad, `${dia} de ${mes} de ${anio}`].filter(Boolean).join(' ')

  // Fondo
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  // Sin borde exterior: el diseño de V.63 se apoya en la franja y las cajas
  let y = margin + 2

  // === HEADER ===
  // Logo | Orden de compra | N° y fecha, separados por dos filetes blancos
  const headerHeight = 26
  const headerMid = y + headerHeight / 2
  doc.setFillColor(...TERRACOTA)
  doc.roundedRect(margin, y, contentWidth, headerHeight, 2, 2, 'F')

  // Izquierda: el logo, o el nombre si no hay logo (o se eligió no usarlo)
  const izqX = margin + 5
  let izqFin = izqX
  if (logo) {
    const { ancho, alto } = encajarLogo(logo.proporcion, 34, 17)
    try {
      doc.addImage(logo.imagen, 'PNG', izqX, headerMid - alto / 2, ancho, alto)
      izqFin = izqX + ancho
    } catch {}
  }
  if (izqFin === izqX) {
    doc.setFont('times', 'bolditalic')
    doc.setFontSize(15)
    doc.setTextColor(255, 255, 255)
    const nombre = doc.splitTextToSize(empresa.nombre_fantasia, 34)[0] as string
    doc.text(nombre, izqX, headerMid + 1.8)
    izqFin = izqX + doc.getTextWidth(nombre)
  }

  // Derecha: número y fecha, alineados al borde
  const rightX = pageWidth - margin - 5
  doc.setFont(FUENTE, 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(255, 255, 255)
  const textoNumero = `N° ${orden.numero || 'S/N'}`
  const anchoNumero = doc.getTextWidth(textoNumero)
  doc.text(textoNumero, rightX, headerMid - 1, { align: 'right' })
  doc.setFont(FUENTE, 'normal')
  doc.setFontSize(7)
  const anchoFecha = doc.getTextWidth(fechaFormateada)
  doc.text(fechaFormateada, rightX, headerMid + 3.5, { align: 'right' })
  const derInicio = rightX - Math.max(anchoNumero, anchoFecha)

  // Filetes y título al medio
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.25)
  const filete1 = izqFin + 5
  const filete2 = derInicio - 5
  doc.line(filete1, y + 6, filete1, y + headerHeight - 6)
  doc.line(filete2, y + 6, filete2, y + headerHeight - 6)
  doc.setFont(FUENTE, 'bold')
  doc.setFontSize(13)
  doc.text('Orden de compra', (filete1 + filete2) / 2, headerMid + 1.6, { align: 'center' })

  y += headerHeight + 4

  // === BADGE "RECIBIDA" si corresponde ===
  const esRecibida = orden.tieneFactura && (orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida')
  if (esRecibida) {
    doc.setFillColor(34, 139, 34) // verde
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'F')
    doc.setFont(FUENTE, 'bold')
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text('RECIBIDA', pageWidth / 2, y + 5.5, { align: 'center' })
    y += 11
  }

  // === PROVEEDOR + ENTREGAR EN (dos columnas) ===
  const boxHeight = 28
  const halfWidth = (contentWidth - 3) / 2

  // Caja: fondo crema, sin borde, con un filete terracota a la izquierda
  function caja(x: number, etiqueta: string): number {
    doc.setFillColor(...GRIS_CLARO)
    doc.roundedRect(x, y, halfWidth, boxHeight, 1.5, 1.5, 'F')
    doc.setFillColor(...TERRACOTA)
    doc.rect(x + 3.5, y + 4, 0.6, boxHeight - 8, 'F')
    doc.setFont(FUENTE, 'bold')
    doc.setFontSize(5.5)
    doc.setTextColor(...TERRACOTA)
    doc.text(etiqueta, x + 7, y + 6, { charSpace: 0.35 })
    return x + 7
  }

  // Caja PROVEEDOR (izquierda)
  const provX = caja(margin, 'PROVEEDOR:')
  doc.setFont(FUENTE, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(40, 40, 40)
  doc.text(orden.proveedor_nombre, provX, y + 12, { maxWidth: halfWidth - 10 })

  doc.setFont(FUENTE, 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 100, 100)
  if (orden.proveedor_contacto) {
    doc.text(orden.proveedor_contacto, provX, y + 16.5)
  }
  if (orden.proveedor_telefono) {
    doc.text(`Tel: ${orden.proveedor_telefono}`, provX, y + 20.5)
  }

  // Caja ENTREGAR EN (derecha)
  const rightBoxX = margin + halfWidth + 3
  const entregaX = caja(rightBoxX, 'ENTREGAR EN:')
  doc.setFont(FUENTE, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(40, 40, 40)
  doc.text(nombreConRazonSocial(empresa), entregaX, y + 11.5, { maxWidth: halfWidth - 10 })

  doc.setFont(FUENTE, 'normal')
  doc.setFontSize(6.2)
  doc.setTextColor(100, 100, 100)
  // Cada dato en su renglón, sin dejar huecos si alguno no está cargado
  const lineasEntrega = [
    empresa.cuit ? `CUIT ${empresa.cuit}` : null,
    empresa.direccion,
    [empresa.localidad, empresa.codigo_postal ? `CP ${empresa.codigo_postal}` : null].filter(Boolean).join(' - ') || null,
    [empresa.telefono, empresa.email_compras].filter(Boolean).join(' · ') || null,
  ].filter((l): l is string => !!l)
  lineasEntrega.forEach((linea, i) => {
    doc.text(linea, entregaX, y + 15.5 + i * 3.3, { maxWidth: halfWidth - 10 })
  })

  y += boxHeight + 5

  // === TABLA CON PAGINACIÓN ===
  const esParcialORecibida = orden.tieneFactura && (orden.estado === 'recibida' || orden.estado === 'parcialmente_recibida')
  const esRecibidaCompleta = orden.tieneFactura && orden.estado === 'recibida'

  /**
   * ¿Alguna línea se pide por bultos? Si no, la columna no se dibuja y el PDF
   * sale exactamente como salía. La mayoría de las órdenes van todas por kg
   * —la de Morres del 23/08, por ejemplo— y ahí una columna de unos no le dice
   * nada al proveedor y le come ancho a la fila del insumo.
   */
  const hayUnidades = orden.items.some((i) => i.unidades != null)
  const rowH = esRecibidaCompleta ? 9 : 7 // Más alto para OC Recibida (tiene 2 líneas de precio)

  // Constantes de paginación
  // Totales + observaciones + condiciones + footer. Los 60 alcanzan para el
  // horario y tres condiciones; cada condición más suma un renglón.
  const condiciones = condicionesOC(empresa)
  const ESPACIO_FOOTER = 66 + Math.max(0, condiciones.length - 3) * 3.6
  // Una línea con nota lleva un renglón más debajo del insumo
  const ALTO_NOTA = 3
  const altoFila = (item: { nota: string | null }) => rowH + (item.nota ? ALTO_NOTA : 0)
  const ESPACIO_HEADER_TABLA = 7
  const MARGEN_INFERIOR = margin + 5

  // Columnas diferentes según estado
  // OC Recibida: muestra INSUMO (con badge) | CANTIDAD | PRECIO (con comparación) | IVA | SUBTOTAL
  // OC Parcial: muestra PEDIDO | RECIB. | FALT.
  // OC Normal: muestra datos del pedido
  const colX = esRecibidaCompleta ? {
    // Para OC recibida: estilo igual que la vista
    num: margin + 2,
    insumo: margin + 8,
    cantRight: margin + contentWidth * 0.48,
    unidad: margin + contentWidth * 0.50,
    precioRight: margin + contentWidth * 0.70,
    ivaRight: margin + contentWidth * 0.82,
    subtotalRight: pageWidth - margin - 3,
  } : esParcialORecibida ? {
    num: margin + 2,
    insumo: margin + 8,
    pedidoRight: margin + contentWidth * 0.45,
    recibidoRight: margin + contentWidth * 0.55,
    faltanteRight: margin + contentWidth * 0.65,
    unidad: margin + contentWidth * 0.67,
    precioRight: margin + contentWidth * 0.82,
    subtotalRight: pageWidth - margin - 3,
  } : hayUnidades ? {
    // El layout del pedido CON bultos: entra UNID, pegada a CANT, así se lee
    // "1 · 7 kg". Las otras dos variantes (recibida y parcial) son de control
    // interno y ya muestran la comparación contra la factura: no se tocan.
    num: margin + 2,
    insumo: margin + 8,
    ivaRight: margin + contentWidth * 0.46,
    unidadesRight: margin + contentWidth * 0.56,
    cantRight: margin + contentWidth * 0.66,
    unidad: margin + contentWidth * 0.68,
    precioRight: margin + contentWidth * 0.82,
    subtotalRight: pageWidth - margin - 3,
  } : {
    num: margin + 2,
    insumo: margin + 8,
    ivaRight: margin + contentWidth * 0.52,
    cantRight: margin + contentWidth * 0.60,
    unidad: margin + contentWidth * 0.62,
    precioRight: margin + contentWidth * 0.78,
    subtotalRight: pageWidth - margin - 3,
  }

  // Función para dibujar header de tabla
  function dibujarHeaderTabla(yPos: number): number {
    doc.setFillColor(...GRIS_TABLA)
    doc.roundedRect(margin, yPos, contentWidth, rowH, 1.2, 1.2, 'F')
    doc.setFont(FUENTE, 'bold')
    doc.setFontSize(5.8)
    doc.setTextColor(70, 70, 70)

    const hTextY = yPos + 4.5
    doc.text('#', colX.num, hTextY)
    doc.text('INSUMO', colX.insumo, hTextY)

    if (esRecibidaCompleta) {
      // OC Recibida: estilo igual que la vista
      doc.text('CANTIDAD', (colX as any).cantRight, hTextY, { align: 'right' })
      doc.text('UN', colX.unidad, hTextY)
      doc.text('PRECIO', colX.precioRight, hTextY, { align: 'right' })
      doc.text('IVA', (colX as any).ivaRight, hTextY, { align: 'right' })
      doc.text('SUBTOTAL', colX.subtotalRight, hTextY, { align: 'right' })
    } else if (esParcialORecibida) {
      doc.text('PEDIDO', (colX as any).pedidoRight, hTextY, { align: 'right' })
      doc.text('RECIB.', (colX as any).recibidoRight, hTextY, { align: 'right' })
      doc.text('FALT.', (colX as any).faltanteRight, hTextY, { align: 'right' })
      doc.text('UN', colX.unidad, hTextY)
      doc.text('PRECIO', colX.precioRight, hTextY, { align: 'right' })
      doc.text('SUBTOTAL', colX.subtotalRight, hTextY, { align: 'right' })
    } else {
      doc.text('IVA', (colX as any).ivaRight, hTextY, { align: 'right' })
      if (hayUnidades) doc.text('UNID', (colX as any).unidadesRight, hTextY, { align: 'right' })
      doc.text('CANT', (colX as any).cantRight, hTextY, { align: 'right' })
      doc.text('UN', colX.unidad, hTextY)
      doc.text('PRECIO', colX.precioRight, hTextY, { align: 'right' })
      doc.text('SUBTOTAL', colX.subtotalRight, hTextY, { align: 'right' })
    }

    return yPos + rowH
  }

  // Header tabla (primera página)
  y = dibujarHeaderTabla(y)

  // Variables para paginación
  let paginaActual = 1
  let totalPaginas = 1 // Se calculará después

  // Calcular total de páginas necesarias
  const calcularEspacioDisponible = (esPrimeraPagina: boolean, esUltimaPagina: boolean): number => {
    if (esPrimeraPagina && esUltimaPagina) {
      return pageHeight - y - ESPACIO_FOOTER
    } else if (esPrimeraPagina) {
      return pageHeight - y - MARGEN_INFERIOR
    } else if (esUltimaPagina) {
      return pageHeight - margin - ESPACIO_HEADER_TABLA - ESPACIO_FOOTER
    } else {
      return pageHeight - margin - ESPACIO_HEADER_TABLA - MARGEN_INFERIOR
    }
  }

  // Contar páginas simulando el mismo corte que el loop de abajo. Ya no
  // alcanza con dividir por rowH: las líneas con nota son más altas.
  {
    let ySim = y
    orden.items.forEach((item, idx) => {
      const alto = altoFila(item)
      const necesario = idx === orden.items.length - 1 ? alto + ESPACIO_FOOTER : alto
      if (ySim + necesario > pageHeight - MARGEN_INFERIOR) {
        totalPaginas++
        ySim = margin + 4 + rowH
      }
      ySim += alto
    })
  }

  // Filas con paginación
  orden.items.forEach((item, idx) => {
    // Verificar si necesitamos nueva página
    const esUltimoItem = idx === orden.items.length - 1
    const alto = altoFila(item)
    const espacioNecesario = esUltimoItem ? alto + ESPACIO_FOOTER : alto

    if (y + espacioNecesario > pageHeight - MARGEN_INFERIOR) {
      // Nueva página
      doc.addPage()
      paginaActual++
      y = margin + 4
      y = dibujarHeaderTabla(y)
    }
    const cantidadRecibida = item.cantidad_recibida ?? 0
    const precioFactura = item.precio_factura ?? item.precio_unitario
    const subtotalFactura = item.subtotal_factura ?? item.subtotal
    const faltante = item.cantidad - cantidadRecibida
    const hayFaltante = esParcialORecibida && faltante > 0
    const precioDiferente = item.precio_factura !== undefined && item.precio_factura !== item.precio_unitario
    const cantidadDiferente = item.cantidad_recibida !== undefined && item.cantidad_recibida !== item.cantidad

    // Fondo: rojo claro si hay diferencias en OC recibida, naranja si hay faltante
    const hayDiferencia = esRecibidaCompleta && (precioDiferente || cantidadDiferente)
    if (hayDiferencia) {
      doc.setFillColor(255, 235, 235) // rojo muy claro
      doc.rect(margin, y, contentWidth, alto, 'F')
    } else if (hayFaltante) {
      doc.setFillColor(255, 240, 230) // naranja claro
      doc.rect(margin, y, contentWidth, alto, 'F')
    }
    // Filas en blanco, separadas por un filete fino (no la primera: pega con el encabezado)
    if (idx > 0) {
      doc.setDrawColor(232, 228, 222)
      doc.setLineWidth(0.15)
      doc.line(margin, y, pageWidth - margin, y)
    }

    const textY = y + 4.5
    doc.setFontSize(6.5)

    doc.setFont(FUENTE, 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(`${idx + 1}`, colX.num, textY)

    doc.setTextColor(30, 30, 30)
    const maxNombreLen = esRecibidaCompleta ? 24 : (esParcialORecibida ? 22 : 28)
    const nombreTruncado = item.insumo_nombre.length > maxNombreLen
      ? item.insumo_nombre.substring(0, maxNombreLen) + '...'
      : item.insumo_nombre
    doc.text(nombreTruncado, colX.insumo, textY)

    if (esRecibidaCompleta) {
      // OC Recibida: estilo igual que la vista de edición

      // Badge después del nombre
      let badgeText = ''
      let badgeColor: [number, number, number] = [34, 139, 34] // verde
      if (cantidadRecibida === 0) {
        badgeText = 'No entregado'
        badgeColor = [200, 50, 50] // rojo
      } else if (cantidadRecibida >= item.cantidad) {
        badgeText = 'Completo'
      } else {
        badgeText = `Parcial (${cantidadRecibida % 1 === 0 ? cantidadRecibida.toFixed(0) : cantidadRecibida.toFixed(1).replace('.', ',')} de ${item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(1).replace('.', ',')})`
        badgeColor = [200, 150, 0] // amarillo/naranja
      }

      // Dibujar badge
      const nombreWidth = doc.getTextWidth(nombreTruncado)
      doc.setFontSize(5)
      doc.setTextColor(...badgeColor)
      doc.text(badgeText, colX.insumo + nombreWidth + 2, textY)
      doc.setFontSize(6.5)

      // Cantidad recibida
      doc.setTextColor(30, 30, 30)
      const cantStr = cantidadRecibida % 1 === 0 ? cantidadRecibida.toFixed(0) : cantidadRecibida.toFixed(2).replace('.', ',')
      doc.text(cantStr, (colX as any).cantRight, textY, { align: 'right' })

      // Unidad
      doc.setTextColor(120, 120, 120)
      doc.setFontSize(6)
      doc.text(item.unidad_display, colX.unidad, textY)
      doc.setFontSize(6.5)

      // Precio con comparación
      doc.setTextColor(30, 30, 30)
      if (precioDiferente) {
        // Precio factura (principal)
        doc.text(fmtMoney(precioFactura), colX.precioRight, textY, { align: 'right' })
        // Segunda línea: precio OC + signo + %
        const diff = precioFactura - item.precio_unitario
        const pct = Math.abs((diff / item.precio_unitario) * 100).toFixed(1)
        const signo = diff > 0 ? '+' : '-'
        doc.setFontSize(4.5)
        doc.setTextColor(150, 150, 150)
        const precioOCStr = fmtMoney(item.precio_unitario)
        doc.text(`${precioOCStr} ${signo}${pct}%`, colX.precioRight, textY + 3, { align: 'right' })
        doc.setFontSize(6.5)
      } else {
        doc.text(fmtMoney(precioFactura), colX.precioRight, textY, { align: 'right' })
      }

      // IVA
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(5.5)
      const ivaStr = item.iva_porcentaje === 10.5 ? '10,5%' : item.iva_porcentaje === 0 ? '0%' : '21%'
      doc.text(ivaStr, (colX as any).ivaRight, textY, { align: 'right' })
      doc.setFontSize(6.5)

      // Subtotal de factura
      doc.setFont(FUENTE, 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(fmtMoney(subtotalFactura), colX.subtotalRight, textY, { align: 'right' })
    } else if (esParcialORecibida) {
      // Columnas: PEDIDO, RECIBIDO, FALTANTE
      doc.setTextColor(50, 50, 50)
      const pedidoStr = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(2).replace('.', ',')
      doc.text(pedidoStr, (colX as any).pedidoRight, textY, { align: 'right' })

      doc.setTextColor(34, 139, 34) // verde
      const recibidoStr = cantidadRecibida % 1 === 0 ? cantidadRecibida.toFixed(0) : cantidadRecibida.toFixed(2).replace('.', ',')
      doc.text(recibidoStr, (colX as any).recibidoRight, textY, { align: 'right' })

      if (faltante > 0) {
        doc.setFont(FUENTE, 'bold')
        doc.setTextColor(200, 50, 50) // rojo
        const faltanteStr = faltante % 1 === 0 ? faltante.toFixed(0) : faltante.toFixed(2).replace('.', ',')
        doc.text(faltanteStr, (colX as any).faltanteRight, textY, { align: 'right' })
        doc.setFont(FUENTE, 'normal')
      } else {
        doc.setTextColor(150, 150, 150)
        doc.text('-', (colX as any).faltanteRight, textY, { align: 'right' })
      }

      doc.setTextColor(120, 120, 120)
      doc.setFontSize(6)
      doc.text(item.unidad_display, colX.unidad, textY)
      doc.setFontSize(6.5)

      doc.setTextColor(50, 50, 50)
      doc.text(fmtMoney(item.precio_unitario), colX.precioRight, textY, { align: 'right' })

      doc.setFont(FUENTE, 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(fmtMoney(item.subtotal), colX.subtotalRight, textY, { align: 'right' })
    } else {
      // IVA y CANT normales
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(5.5)
      const ivaStr = item.iva_porcentaje === 10.5 ? '10,5%' : item.iva_porcentaje === 0 ? '0%' : '21%'
      doc.text(ivaStr, (colX as any).ivaRight, textY, { align: 'right' })
      doc.setFontSize(6.5)

      // Bultos. Las líneas que se piden a granel no lo llevan: va un guión,
      // no un 1 que nadie cargó.
      if (hayUnidades) {
        doc.setTextColor(50, 50, 50)
        const unidadesStr =
          item.unidades == null
            ? '-'
            : item.unidades % 1 === 0
              ? item.unidades.toFixed(0)
              : item.unidades.toFixed(2).replace('.', ',')
        doc.text(unidadesStr, (colX as any).unidadesRight, textY, { align: 'right' })
      }

      doc.setTextColor(50, 50, 50)
      const cantStr = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(2).replace('.', ',')
      doc.text(cantStr, (colX as any).cantRight, textY, { align: 'right' })

      doc.setTextColor(120, 120, 120)
      doc.setFontSize(6)
      doc.text(item.unidad_display, colX.unidad, textY)
      doc.setFontSize(6.5)

      doc.setTextColor(50, 50, 50)
      doc.text(fmtMoney(item.precio_unitario), colX.precioRight, textY, { align: 'right' })

      doc.setFont(FUENTE, 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(fmtMoney(item.subtotal), colX.subtotalRight, textY, { align: 'right' })
    }

    // Nota de la línea, en un renglón propio debajo del insumo. Ocupa todo el
    // ancho de la fila: en ese renglón no hay números con los que chocar.
    if (item.nota) {
      doc.setFont(FUENTE, 'italic')
      doc.setFontSize(5.5)
      doc.setTextColor(...TERRACOTA)
      const anchoNota = colX.subtotalRight - colX.insumo
      const [primera, ...resto] = doc.splitTextToSize(item.nota, anchoNota) as string[]
      doc.text(resto.length > 0 ? primera.replace(/\s*\S*$/, '') + '…' : primera, colX.insumo, y + rowH + 0.8)
      doc.setFont(FUENTE, 'normal')
    }

    y += alto
  })

  // Línea cierre tabla
  doc.setDrawColor(...TERRACOTA)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // === TOTALES ===
  const totalesX = colX.subtotalRight
  const labelX = colX.precioRight

  doc.setFont(FUENTE, 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 100, 100)
  doc.text('Subtotal Neto', labelX, y, { align: 'right' })
  doc.setFont(FUENTE, 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text(fmtMoney(subtotalNeto), totalesX, y, { align: 'right' })
  y += 4.5

  if (totalIva21 > 0) {
    doc.setFont(FUENTE, 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('IVA (21%)', labelX, y, { align: 'right' })
    doc.setFont(FUENTE, 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(fmtMoney(totalIva21), totalesX, y, { align: 'right' })
    y += 4.5
  }

  if (totalIva105 > 0) {
    doc.setFont(FUENTE, 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('IVA (10.5%)', labelX, y, { align: 'right' })
    doc.setFont(FUENTE, 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(fmtMoney(totalIva105), totalesX, y, { align: 'right' })
    y += 4.5
  }

  // Línea separadora
  y += 1
  doc.setDrawColor(...TERRACOTA_LIGHT)
  doc.setLineWidth(0.2)
  doc.line(labelX - 25, y, totalesX, y)
  y += 4

  // Total final
  doc.setFillColor(...TERRACOTA)
  const totalBoxW = 55
  const totalBoxX = pageWidth - margin - totalBoxW
  doc.roundedRect(totalBoxX, y - 3, totalBoxW, 10, 1.5, 1.5, 'F')

  doc.setFont(FUENTE, 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL', totalBoxX + 5, y + 3.3, { charSpace: 0.4 })
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.25)
  doc.line(totalBoxX + 22, y - 0.8, totalBoxX + 22, y + 5)
  doc.setFontSize(10)
  doc.text(fmtMoney(totalConIva), pageWidth - margin - 4, y + 3.5, { align: 'right' })
  y += 12

  // Diferencia vs OC (solo si está recibida y hay diferencia)
  if (esRecibidaCalc && Math.abs(diferenciaVsOC) > 0.01) {
    const subio = diferenciaVsOC > 0
    const colorDif: [number, number, number] = subio ? [200, 50, 50] : [34, 139, 34] // rojo si subió, verde si bajó

    doc.setFillColor(...colorDif)
    doc.setDrawColor(...colorDif)
    doc.roundedRect(totalBoxX, y - 2, totalBoxW, 8, 1.5, 1.5, 'S')

    doc.setFont(FUENTE, 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...colorDif)
    doc.text('Diferencia vs OC:', totalBoxX + 3, y + 3)

    const signo = subio ? '+' : ''
    const difText = `${signo}${fmtMoney(diferenciaVsOC)} (${subio ? '+' : '-'}${Math.abs(parseFloat(diferenciaVsOCPct))}%)`
    doc.text(difText, pageWidth - margin - 3, y + 3, { align: 'right' })
    y += 10
  }

  // Observaciones (indicaciones especiales del usuario)
  if (orden.notas) {
    // Caja destacada para observaciones
    doc.setFillColor(255, 250, 230) // amarillo suave
    doc.setDrawColor(...TERRACOTA_LIGHT)
    doc.setLineWidth(0.3)
    const notasLines = doc.splitTextToSize(orden.notas, contentWidth - 6)
    const boxH = notasLines.length * 3.5 + 8
    doc.roundedRect(margin, y, contentWidth, boxH, 1.5, 1.5, 'FD')

    doc.setFont(FUENTE, 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...TERRACOTA)
    doc.text('OBSERVACIONES:', margin + 3, y + 5)

    doc.setFont(FUENTE, 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(40, 40, 40)
    doc.text(notasLines, margin + 3, y + 10)
    y += boxH + 4
  }

  // Condiciones de entrega (texto fijo)
  y += 2
  doc.setFont(FUENTE, 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...TERRACOTA)
  doc.text('Condiciones:', margin + 2, y)
  y += 4.5

  // Cada condición con su viñeta terracota
  function condicion(texto: string, destacada: boolean) {
    doc.setFillColor(...TERRACOTA)
    doc.circle(margin + 3, y - 0.9, 0.45, 'F')
    doc.setFont(FUENTE, destacada ? 'bold' : 'normal')
    doc.setFontSize(6.3)
    if (destacada) doc.setTextColor(40, 40, 40)
    else doc.setTextColor(100, 100, 100)
    doc.text(texto, margin + 6, y)
    y += 3.6
  }

  // El horario va primero y en negrita: es lo primero que el proveedor
  // necesita para coordinar la entrega
  if (empresa.horario_entrega) {
    condicion(`Horario de entrega: ${empresa.horario_entrega.replace(/\.$/, '')}.`, true)
  }
  condiciones.forEach((cond) => condicion(cond, false))

  // Footer con número de página
  const footerY = pageHeight - margin - 8
  doc.setDrawColor(...TERRACOTA)
  doc.setLineWidth(0.25)
  doc.line(margin, footerY, pageWidth - margin, footerY)

  doc.setFont(FUENTE, 'normal')
  doc.setFontSize(5)
  doc.setTextColor(150, 130, 120)

  const textoPagina = totalPaginas > 1 ? `  |  Página ${paginaActual} de ${totalPaginas}` : ''
  doc.text(`${empresa.nombre_fantasia}  |  Orden de Compra${textoPagina}`, pageWidth / 2, footerY + 4, { align: 'center' })

  // Guardar - Proveedor primero, luego número de OC, y RECIBIDA si corresponde
  const proveedorNombre = orden.proveedor_nombre.replace(/\s+/g, '_')
  const numPart = orden.numero ? `_${orden.numero}` : ''
  const estadoPart = esRecibidaCalc ? '_RECIBIDA' : ''
  const fileName = `OC_${proveedorNombre}${numPart}${estadoPart}_${orden.fecha}.pdf`
  doc.save(fileName)

  // Si es borrador, marcar como enviada
  if ((data as any).estado === 'borrador') {
    await supabase
      .from('ordenes_compra')
      .update({ estado: 'enviada' })
      .eq('id', ordenId)
  }

  return (data as any).estado === 'borrador'
}
