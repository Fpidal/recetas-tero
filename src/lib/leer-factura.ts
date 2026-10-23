/**
 * Cargar una factura desde la foto (V.74).
 *
 * La foto la lee Claude por la API de Anthropic, desde el servidor
 * (`src/app/facturas/nueva/leer-factura-action.ts`): la clave vive sólo en la
 * variable ANTHROPIC_API_KEY de Vercel y nunca llega al navegador.
 *
 * La lectura NO graba nada. Completa el formulario de Nueva factura y el
 * usuario revisa antes de guardar; el guardado es el de siempre, con sus
 * triggers de precio y la gestión de la OC.
 *
 * La foto tampoco se guarda (decidido el 23/10/26): se lee y se descarta. El
 * comprobante en papel queda archivado y, si hace falta, se le pide copia al
 * proveedor.
 *
 * Este archivo tiene lo que comparten el servidor y la pantalla: los tipos y la
 * preparación de la imagen, que corre en el navegador.
 */

/** Lo que se le manda al servidor */
export interface ArchivoParaLeer {
  /** image/jpeg, image/png, image/webp o application/pdf */
  tipo: string
  /** Base64 sin el prefijo data: */
  datos: string
}

/**
 * Con qué comparar lo leído. Va con índices cortos (0, 1, 2…) y no con los id
 * de la base: a Claude le cuesta menos y no puede inventar un uuid que exista.
 * El servidor traduce los índices de vuelta.
 */
export interface ContextoLectura {
  proveedores: { id: string; nombre: string; cuit?: string | null }[]
  /** Ítems de la OC elegida, si hay */
  oc: { nombre: string; unidad: string; cantidad: number; precio: number }[] | null
  /**
   * Catálogo para sugerir insumos. Con OC va vacío salvo lo ya comprado al
   * proveedor: la orden ya dice qué productos son, y el catálogo entero era
   * la mayor parte de lo que se paga por lectura (unos 10.000 tokens de
   * entrada en la primera prueba, 23/10/26).
   */
  insumos: { id: string; nombre: string; unidad: string }[]
  /** Insumos que ya se le compraron al proveedor elegido: ayudan a desempatar */
  compradosAlProveedor: string[]
}

export interface LineaLeida {
  /** Como figura en la factura */
  descripcion: string
  cantidad: number | null
  /** Como figura: kg, lt, un, caja, bulto… */
  unidad: string | null
  /** Neto, sin IVA y antes del descuento de la línea */
  precioUnitario: number | null
  descuento: number
  iva: number | null
  /** Neto de la línea según la factura, para controlar */
  subtotal: number | null
  /** Índice en `contexto.oc`, o null si no estaba pedido */
  ocIndice: number | null
  /** id del insumo sugerido, o null */
  insumoId: string | null
  confianza: 'alta' | 'media' | 'baja'
}

export interface LecturaFactura {
  proveedorId: string | null
  /** Como figura, por si no está en la lista */
  proveedorTexto: string | null
  cuit: string | null
  tipo: 'factura' | 'nota_credito'
  /** A, B, C, T… */
  letra: string | null
  /** "A 0015-00565584" */
  numero: string | null
  /** YYYY-MM-DD */
  fecha: string | null
  lineas: LineaLeida[]
  neto: number | null
  ivaTotal: number | null
  percepciones: { nombre: string; porcentaje: number | null; monto: number }[]
  total: number | null
  /** Lo que no se pudo leer o conviene mirar, en palabras de Claude */
  observaciones: string | null
}

export type ResultadoLectura =
  | { ok: true; lectura: LecturaFactura; uso: { entrada: number; salida: number } }
  | { ok: false; error: string }

/** Lado más largo de la imagen que se manda: más no mejora la lectura y cuesta más */
const LADO_MAXIMO = 2000

/**
 * Achica la foto antes de mandarla. Una foto de celular pesa 3-5 MB; a 2000 px
 * en JPEG queda en unos cientos de KB y se lee igual de bien.
 */
export async function prepararArchivo(file: File): Promise<ArchivoParaLeer> {
  if (file.type === 'application/pdf') {
    return { tipo: file.type, datos: await aBase64(file) }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return { tipo: 'image/jpeg', datos: dataUrl.split(',')[1] }
  } catch {
    // Un formato que el navegador no sabe abrir (HEIC en algunos Chrome): va tal cual
    return { tipo: file.type || 'image/jpeg', datos: await aBase64(file) }
  }
}

function aBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
