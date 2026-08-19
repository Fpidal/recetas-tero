/**
 * Percepciones de las facturas de compra.
 *
 * QUÉ SON: impuestos que el proveedor cobra por adelantado además del IVA, y
 * que se descuentan después en la declaración. Van en la factura como líneas
 * aparte y suman al total.
 *
 * SOBRE QUÉ SE CALCULAN — verificado contra facturas reales el 19/08/26, al
 * centavo, en dos comprobantes con IVA mezclado:
 *
 *   El Triunfo 00004-00128024 — neto $629.094,37, ítems al 21% y al 10,5%
 *       3% → $18.872,83     4% → $25.163,77
 *   Morres 1001-00175687 — neto $676.990,00, todo al 10,5%
 *       4% → $27.079,60
 *
 * Las dos dan exacto sobre el **subtotal neto completo**. No sobre el neto
 * gravado de cada alícuota, ni sobre neto + IVA. Eso importa: con neto + IVA,
 * la primera factura habría dado $22.541 en vez de $18.872 — casi $4.000 de
 * más en un solo comprobante, y el error se repetiría en todas.
 *
 * NO TODOS LOS PROVEEDORES LAS APLICAN. De tres facturas del mismo período: El
 * Triunfo cobra las dos, Morres solo IIBB, Rincón de Sabores ninguna. Por eso
 * se eligen al cargar y no se aplican solas.
 */

export interface TipoPercepcion {
  /** Cómo se guarda y se muestra en la factura */
  nombre: string
  porcentaje: number
  /** Para el desplegable */
  etiqueta: string
}

export const TIPOS_PERCEPCION: TipoPercepcion[] = [
  { nombre: 'PERC IVA', porcentaje: 3, etiqueta: 'PERC IVA (3%)' },
  { nombre: 'PERC IIBB BS AS', porcentaje: 4, etiqueta: 'PERC IIBB BS AS (4%)' },
]

/**
 * Cuánto corresponde de una percepción.
 *
 * `neto` es el subtotal neto de la factura, entero. Ver arriba por qué no es
 * el neto gravado.
 */
export function calcularPercepcion(neto: number, porcentaje: number): number {
  if (!neto || !porcentaje) return 0
  return Math.round(neto * porcentaje) / 100
}

/** Busca un tipo por su nombre guardado, para reconocer facturas ya cargadas */
export function tipoPorNombre(nombre: string): TipoPercepcion | undefined {
  const limpio = nombre.trim().toUpperCase()
  return TIPOS_PERCEPCION.find((t) => t.nombre.toUpperCase() === limpio)
}
