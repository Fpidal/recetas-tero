import jsPDF from 'jspdf'
import { supabase } from './supabase'
import { PlayfairDisplayBold } from './fonts/playfair-display'
import { LogoTeroNegro, LOGO_TERO_RATIO } from './logo-tero'
import { formatearMoneda } from './formato-numeros'
import { hoyISO } from './fechas'

/**
 * Carta de vinos para imprimir.
 *
 * DOS COSAS QUE HAY QUE SABER ANTES DE TOCAR ESTE ARCHIVO:
 *
 * 1. NADA SE DIBUJA SIN MEDIR ANTES. La versión anterior acumulaba una `y` y
 *    dibujaba donde cayera: con los 48 vinos de agosto los últimos Malbec ya
 *    se escribían encima del pie de página, y todo lo que pasara los 297 mm
 *    jsPDF lo descartaba **sin error**. Es decir: agregar vinos los hacía
 *    desaparecer de la carta en silencio. Acá cada bloque se mide contra el
 *    tope de su columna y, si no entra, salta a la columna o a la carilla
 *    siguiente. Si agregás algo nuevo, medilo igual.
 *
 * 2. EL PRECIO SALE DE `carta_vinos.precio_carta`, no del costo. El costo de
 *    la botella se calcula con la lista de la bodega (ver CLAUDE.md, trampa 9)
 *    y no tiene nada que ver con lo que se le cobra al cliente.
 */

interface VinoEnCarta {
  bodega: string
  nombre: string
  cepa: string
  zona: string | null
  categoria: string
  recomendado: boolean
  precioCarta: number
}

/** Fondo blanco. Los grises son cálidos para que no se peleen con el terracota. */
const COLORS = {
  marcoExt: [123, 48, 33] as const,   // #7B3021 terracota
  linea: [217, 211, 203] as const,    // #D9D3CB gris cálido (sobre blanco, el beige viejo se veía sucio)
  titulo: [123, 48, 33] as const,     // #7B3021 títulos de sección de tintos
  verde: [74, 88, 48] as const,       // #4A5830 blancos y espumantes
  rosa: [168, 83, 106] as const,      // #A8536A rosados y dulces
  etiqueta: [35, 21, 8] as const,     // #231508 negro cálido — el único acento de cada línea
  gris: [138, 112, 96] as const,      // #8A7060 bodega, precio, zona
  cepa: [160, 80, 48] as const,       // #A05030 terracota claro
}

/** Cuerpos en pt. La jerarquía la dan el color y el tamaño, no el peso. */
const PT = {
  titulo: 14.7,
  seccion: 10.5,
  etiqueta: 9.9,
  bodega: 8.5,
  precio: 8.5,
  cepa: 7.2,
  zona: 7.6,
  pie: 7.4,
}

/** Todo lo demás en mm. */
const PAGINA = { ancho: 210, alto: 297 }
const MARGEN = { x: 18, y: 16 }
const COL_GAP = 6
const ANCHO_UTIL = PAGINA.ancho - MARGEN.x * 2
const ANCHO_COL = (ANCHO_UTIL - COL_GAP * 2) / 2

const ALTO = {
  lineaNombre: 4,
  detalle: 4.4,
  gapVino: 1.8,
  gapVinoAireado: 4,
  tituloSeccion: 7.3,
  gapSeccion: 5,
  gapSeccionAireado: 9,
  pie: 8,
}
const ALTO_VINO = ALTO.lineaNombre + ALTO.detalle

const LOGO_ANCHO = 44
const LOGO_ALTO = LOGO_ANCHO / LOGO_TERO_RATIO

type Color = readonly [number, number, number]
interface Seccion {
  titulo: string
  color: Color
  vinos: VinoEnCarta[]
  /**
   * Las secciones de la segunda carilla van con más aire. Son 15 etiquetas
   * contra 34 de tintos: apretadas arriba dejan media hoja en blanco. El aire
   * es de composición, no un descuido — y si algún día no entra, el maquetador
   * las pasa de columna igual.
   */
  aire?: boolean
}

/**
 * Una carilla se parte en dos columnas. El maquetador va llenando la columna
 * activa y pasa sola a la siguiente (creando carillas nuevas si hace falta),
 * así la carta puede crecer sin que se pierda nada.
 */
interface Columna {
  x: number
  y: number
  yInicio: number
  tope: number
  pagina: number
}

interface OpcionesCarta {
  /** Con precio por botella (la carta de mesa) o sin precios (la de cortesía). */
  conPrecios?: boolean
}

export async function generarPDFCartaVinos({ conPrecios = true }: OpcionesCarta = {}) {
  // Son ~50 filas, muy lejos del corte de 1000 de PostgREST (CLAUDE.md, trampa 4).
  const { data, error } = await supabase
    .from('carta_vinos')
    .select(`
      id,
      recomendado,
      precio_carta,
      vinos (id, bodega, nombre, cepa, zona, categoria)
    `)
    .eq('activo', true)

  if (error || !data) {
    alert('No se pudo cargar la carta de vinos')
    console.error(error)
    return
  }

  // Los espacios de más se ven en el papel: "DV  Tinto Histórico" deja un
  // hueco en medio del nombre. Se limpian acá porque la carta no debería
  // depender de cómo se tipeó la carga.
  const limpio = (texto: unknown) => String(texto ?? '').replace(/\s+/g, ' ').trim()

  const vinos: VinoEnCarta[] = data.map((item: any) => ({
    bodega: limpio(item.vinos?.bodega),
    nombre: limpio(item.vinos?.nombre),
    cepa: limpio(item.vinos?.cepa),
    zona: limpio(item.vinos?.zona) || null,
    categoria: item.vinos?.categoria || '',
    recomendado: item.recomendado || false,
    precioCarta: Number(item.precio_carta) || 0,
  }))

  if (vinos.length === 0) {
    alert('No hay vinos activos en la carta')
    return
  }

  // === AGRUPADO ===
  // Cada sección sale de la categoría de la ficha del vino, y de nada más. Hubo
  // una versión que forzaba acá el Late Harvest a Dulces y el rosado a Rosados,
  // porque estaban mal cargados; se sacó a propósito. Una regla escondida en el
  // generador pisa lo que se elige en la pantalla y no avisa: si un vino sale en
  // la sección equivocada, se corrige la categoría en Vinos, no este archivo.
  const es = (v: VinoEnCarta, cat: string) => v.categoria.toLowerCase().startsWith(cat)

  /** De mayor a menor precio. Los que no tienen precio cargado caen al final. */
  const porPrecio = (a: VinoEnCarta, b: VinoEnCarta) =>
    (b.precioCarta || -1) - (a.precioCarta || -1) ||
    a.bodega.localeCompare(b.bodega, 'es') ||
    a.nombre.localeCompare(b.nombre, 'es')

  const sueltos = vinos.filter(v => !v.recomendado)
  const recomendados = vinos.filter(v => v.recomendado).sort(porPrecio)
  const malbec = sueltos.filter(v => es(v, 'tinto') && /malbec/i.test(v.cepa)).sort(porPrecio)
  const otrosTintos = sueltos.filter(v => es(v, 'tinto') && !/malbec/i.test(v.cepa)).sort(porPrecio)
  const blancos = sueltos.filter(v => es(v, 'blanco')).sort(porPrecio)
  const rosados = sueltos.filter(v => es(v, 'rosado')).sort(porPrecio)
  const espumantes = sueltos.filter(v => es(v, 'espumante')).sort(porPrecio)
  const dulces = sueltos.filter(v => es(v, 'dulce')).sort(porPrecio)

  // === DOCUMENTO ===
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('PlayfairDisplay-Bold.ttf', PlayfairDisplayBold)
  doc.addFont('PlayfairDisplay-Bold.ttf', 'PlayfairDisplay', 'bold')

  const mm = (pt: number) => pt / 2.8346

  function dibujarMarco() {
    // Blanco explícito: un PDF sin fondo se compone sobre lo que haya debajo
    // (negro en varios visores) y la carta se ve al revés antes de imprimirla.
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, PAGINA.ancho, PAGINA.alto, 'F')

    doc.setDrawColor(...COLORS.marcoExt)
    doc.setLineWidth(0.46)
    doc.rect(8, 8, PAGINA.ancho - 16, PAGINA.alto - 16)
    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.16)
    doc.rect(10.5, 10.5, PAGINA.ancho - 21, PAGINA.alto - 21)
  }

  function dibujarPie(ultima: boolean) {
    const y = PAGINA.alto - MARGEN.y - ALTO.pie
    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.18)
    doc.line(MARGEN.x, y, PAGINA.ancho - MARGEN.x, y)

    let cursor = y + 4
    if (ultima) {
      doc.setFont('PlayfairDisplay', 'bold')
      doc.setFontSize(PT.seccion)
      doc.setTextColor(...COLORS.verde)
      doc.text('Preguntá a nuestro equipo por la sugerencia del día', PAGINA.ancho / 2, cursor, { align: 'center' })
      cursor += 4
    }
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(PT.pie)
    doc.setTextColor(...COLORS.gris)
    const nota = conPrecios
      ? 'Precios por botella, en pesos, con IVA incluido.'
      : 'La carta cambia según disponibilidad y añadas de bodega.'
    doc.text(nota, PAGINA.ancho / 2, cursor, { align: 'center' })
  }

  /** Cabecera de la primera carilla: el logo manda, el título acompaña. */
  function dibujarCabeceraPrincipal(): number {
    let y = MARGEN.y
    doc.addImage(LogoTeroNegro, 'PNG', (PAGINA.ancho - LOGO_ANCHO) / 2, y, LOGO_ANCHO, LOGO_ALTO)
    y += LOGO_ALTO + 4

    doc.setFont('PlayfairDisplay', 'bold')
    doc.setFontSize(PT.titulo)
    doc.setTextColor(...COLORS.titulo)
    doc.text('CARTA DE VINOS', PAGINA.ancho / 2, y + mm(PT.titulo) * 0.75, { align: 'center', charSpace: 0.75 })
    y += mm(PT.titulo) + 4.5

    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.18)
    doc.line(MARGEN.x, y, PAGINA.ancho - MARGEN.x, y)
    return y + 4
  }

  /** Las carillas siguientes sólo llevan el logo chico, para que no queden anónimas. */
  function dibujarCabeceraSecundaria(): number {
    const ancho = 30
    const alto = ancho / LOGO_TERO_RATIO
    const y = MARGEN.y
    doc.addImage(LogoTeroNegro, 'PNG', (PAGINA.ancho - ancho) / 2, y, ancho, alto)

    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.18)
    const medio = y + alto / 2
    doc.line(MARGEN.x, medio, (PAGINA.ancho - ancho) / 2 - 6, medio)
    doc.line((PAGINA.ancho + ancho) / 2 + 6, medio, PAGINA.ancho - MARGEN.x, medio)
    return y + alto + 5
  }

  // === MAQUETADOR ===
  const topeColumna = PAGINA.alto - MARGEN.y - ALTO.pie - 4
  const columnas: Columna[] = []
  let indiceCol = 0
  let paginas = 0

  function abrirCarilla(): number {
    if (paginas > 0) doc.addPage()
    paginas += 1
    dibujarMarco()
    return paginas
  }

  /** Crea las dos columnas de una carilla nueva. */
  function agregarCarilla(yInicial: number, pagina: number) {
    columnas.push({ x: MARGEN.x, y: yInicial, yInicio: yInicial, tope: topeColumna, pagina })
    columnas.push({
      x: MARGEN.x + ANCHO_COL + COL_GAP * 2,
      y: yInicial,
      yInicio: yInicial,
      tope: topeColumna,
      pagina,
    })
  }

  function columnaActual(): Columna {
    while (indiceCol >= columnas.length) {
      const pagina = abrirCarilla()
      agregarCarilla(dibujarCabeceraSecundaria(), pagina)
    }
    return columnas[indiceCol]
  }

  /** Avanza hasta la columna pedida sin retroceder si el contenido ya la pasó. */
  function irAColumna(indice: number) {
    indiceCol = Math.max(indiceCol, indice)
  }

  /** Título centrado con una línea a cada lado. Devuelve la `y` de abajo. */
  function dibujarTituloSeccion(titulo: string, x: number, ancho: number, y: number, color: Color): number {
    const centro = x + ancho / 2
    const base = y + mm(PT.seccion) * 0.8
    const texto = titulo.toUpperCase()

    doc.setFont('PlayfairDisplay', 'bold')
    doc.setFontSize(PT.seccion)
    doc.setTextColor(...color)
    doc.text(texto, centro, base, { align: 'center', charSpace: 0.32 })

    const anchoTexto = doc.getTextWidth(texto) + texto.length * 0.32
    doc.setDrawColor(...color)
    doc.setLineWidth(0.18)
    const separacion = 3
    doc.line(x, base - 1, centro - anchoTexto / 2 - separacion, base - 1)
    doc.line(centro + anchoTexto / 2 + separacion, base - 1, x + ancho, base - 1)

    return y + ALTO.tituloSeccion
  }

  /**
   * Una línea de vino: bodega en gris, etiqueta en negro, puntos, precio en gris;
   * debajo la cepa en versalita y la zona en itálica.
   */
  function dibujarVino(v: VinoEnCarta, x: number, ancho: number, y: number) {
    const base = y + mm(PT.etiqueta) * 0.78

    const precio = v.precioCarta > 0 ? formatearMoneda(v.precioCarta, true, 0) : '—'
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(PT.precio)
    const anchoPrecio = conPrecios ? doc.getTextWidth(precio) : 0

    doc.setFont('PlayfairDisplay', 'bold')
    doc.setFontSize(PT.bodega)
    const anchoBodega = doc.getTextWidth(v.bodega)
    const guion = ' – '
    const anchoGuion = doc.getTextWidth(guion)

    // La etiqueta se recorta antes que nada: es la única pieza elástica.
    doc.setFontSize(PT.etiqueta)
    const disponible = ancho - anchoBodega - anchoGuion - anchoPrecio - (conPrecios ? 6 : 1)
    let etiqueta = v.nombre
    while (etiqueta.length > 4 && doc.getTextWidth(etiqueta) > disponible) {
      etiqueta = etiqueta.slice(0, -2).trimEnd()
    }
    if (etiqueta !== v.nombre) etiqueta += '…'

    doc.setFontSize(PT.bodega)
    doc.setTextColor(...COLORS.gris)
    doc.text(v.bodega, x, base)

    doc.setTextColor(...COLORS.linea)
    doc.text(guion, x + anchoBodega, base)

    doc.setFontSize(PT.etiqueta)
    doc.setTextColor(...COLORS.etiqueta)
    doc.text(etiqueta, x + anchoBodega + anchoGuion, base)
    const finEtiqueta = x + anchoBodega + anchoGuion + doc.getTextWidth(etiqueta)

    if (conPrecios) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(PT.precio)
      doc.setTextColor(...COLORS.gris)
      doc.text(precio, x + ancho, base, { align: 'right' })

      // Guía de puntos entre la etiqueta y el precio
      const desde = finEtiqueta + 2
      const hasta = x + ancho - anchoPrecio - 2
      if (hasta > desde) {
        doc.setFillColor(...COLORS.linea)
        for (let px = desde; px <= hasta; px += 1.6) {
          doc.circle(px, base - 0.9, 0.15, 'F')
        }
      }
    }

    // Cepa y zona
    const detalle = y + ALTO.lineaNombre + mm(PT.zona) * 0.75
    let cursor = x
    if (v.cepa) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(PT.cepa)
      doc.setTextColor(...COLORS.cepa)
      const cepa = v.cepa.toUpperCase()
      doc.text(cepa, cursor, detalle, { charSpace: 0.18 })
      cursor += doc.getTextWidth(cepa) + cepa.length * 0.18
    }
    if (v.zona) {
      if (v.cepa) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(PT.zona)
        doc.setTextColor(...COLORS.linea)
        doc.text(' · ', cursor, detalle)
        cursor += doc.getTextWidth(' · ')
      }
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(PT.zona)
      doc.setTextColor(...COLORS.gris)
      doc.text(v.zona, cursor, detalle)
    }
  }

  /**
   * Coloca una sección entera. Si no entra en la columna, sigue en la que
   * venga — repitiendo el título, para que el cliente sepa qué está leyendo.
   */
  function colocarSeccion(sec: Seccion) {
    if (sec.vinos.length === 0) return

    const gapVino = sec.aire ? ALTO.gapVinoAireado : ALTO.gapVino
    const gapSeccion = sec.aire ? ALTO.gapSeccionAireado : ALTO.gapSeccion
    let pendientes = [...sec.vinos]
    let primera = true

    while (pendientes.length > 0) {
      let col = columnaActual()

      // Un título solo al pie de una columna es una viuda: que arranque en la siguiente.
      const minimo = ALTO.tituloSeccion + ALTO_VINO
      if (col.y + minimo > col.tope) {
        indiceCol += 1
        col = columnaActual()
      }

      const titulo = primera ? sec.titulo : `${sec.titulo} (cont.)`
      col.y = dibujarTituloSeccion(titulo, col.x, ANCHO_COL, col.y, sec.color)

      while (pendientes.length > 0 && col.y + ALTO_VINO <= col.tope) {
        dibujarVino(pendientes[0], col.x, ANCHO_COL, col.y)
        col.y += ALTO_VINO + gapVino
        pendientes = pendientes.slice(1)
      }

      col.y += gapSeccion
      if (pendientes.length > 0) indiceCol += 1
      primera = false
    }
  }

  // === CARILLA 1: cabecera, recomendados a todo el ancho, y los tintos ===
  const pagina1 = abrirCarilla()
  let y = dibujarCabeceraPrincipal()

  if (recomendados.length > 0) {
    y = dibujarTituloSeccion('Recomendados del mes', MARGEN.x, ANCHO_UTIL, y, COLORS.titulo)

    // Dos por fila, llenando de izquierda a derecha
    const anchoRec = (ANCHO_UTIL - COL_GAP * 2) / 2
    const xs = [MARGEN.x, MARGEN.x + anchoRec + COL_GAP * 2]
    for (let i = 0; i < recomendados.length; i += 2) {
      for (let j = 0; j < 2 && i + j < recomendados.length; j++) {
        dibujarVino(recomendados[i + j], xs[j], anchoRec, y)
      }
      y += ALTO_VINO + ALTO.gapVino
    }

    y += 2
    doc.setDrawColor(...COLORS.linea)
    doc.setLineWidth(0.18)
    doc.line(MARGEN.x, y, PAGINA.ancho - MARGEN.x, y)
    y += 4
  }

  agregarCarilla(y, pagina1)

  irAColumna(0)
  colocarSeccion({ titulo: 'Malbec', color: COLORS.titulo, vinos: malbec })
  irAColumna(1)
  colocarSeccion({ titulo: 'Otros tintos', color: COLORS.titulo, vinos: otrosTintos })

  // === CARILLA 2: blancos a la izquierda, el resto a la derecha ===
  irAColumna(2)
  colocarSeccion({ titulo: 'Blancos', color: COLORS.verde, vinos: blancos, aire: true })
  irAColumna(3)
  colocarSeccion({ titulo: 'Rosados', color: COLORS.rosa, vinos: rosados, aire: true })
  colocarSeccion({ titulo: 'Espumantes', color: COLORS.verde, vinos: espumantes, aire: true })
  colocarSeccion({ titulo: 'Dulces y cosecha tardía', color: COLORS.rosa, vinos: dulces, aire: true })

  // El divisor entre columnas y el pie van al final: recién acá se sabe hasta
  // dónde llegó cada carilla, y el divisor tiene que medir lo que se usó.
  const xDivisor = MARGEN.x + ANCHO_COL + COL_GAP
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)

    const cols = columnas.filter(c => c.pagina === p)
    if (cols.length === 2) {
      const desde = Math.min(...cols.map(c => c.yInicio))
      const hasta = Math.max(...cols.map(c => c.y)) - ALTO.gapSeccion
      if (hasta > desde) {
        doc.setDrawColor(...COLORS.linea)
        doc.setLineWidth(0.18)
        doc.line(xDivisor, desde, xDivisor, Math.min(hasta, topeColumna))
      }
    }

    dibujarPie(p === paginas)
  }

  const sufijo = conPrecios ? '' : '_sin_precios'
  doc.save(`Carta_Vinos_Tero_${hoyISO()}${sufijo}.pdf`)
}
