/**
 * Cálculo del costo final de un insumo — LA fórmula, en un solo lugar.
 *
 * C. Final = precio × (1 + IVA) ÷ (1 − merma)
 *
 * La merma es pérdida de aprovechamiento: si comprás 1 kg y en la limpieza se
 * pierde el 10%, te quedan 0,9 kg utilizables, así que el kilo servible costó
 * precio / 0,9. NO es precio × 1,10 — esa fórmula subestima el costo, y cada vez
 * más cuanto mayor es la merma (con 40% de merma, un 19% por debajo del real).
 *
 * El precio que entra acá ya viene normalizado a la unidad base (el paquete de
 * 3 kg se convirtió a precio por kilo al cargar la factura). Ese es el criterio
 * único que hace comparables a todas las recetas.
 *
 * IMPORTANTE: no duplicar esta cuenta en las pantallas. Estaba copiada en 30
 * lugares y por eso el error de la merma sobrevivió meses sin que nadie lo viera.
 */

/** Tope de merma: evita la división por cero si alguien carga 100%. */
const MERMA_MAXIMA = 99

/**
 * Factor de aprovechamiento: qué proporción del insumo comprado es utilizable.
 * Merma 25% → 0,75 (aprovechás tres cuartos de lo que comprás).
 */
export function factorAprovechamiento(mermaPorcentaje: number | null | undefined): number {
  const merma = Math.min(Math.max(Number(mermaPorcentaje) || 0, 0), MERMA_MAXIMA)
  return 1 - merma / 100
}

/**
 * Costo final de un insumo por unidad base, con IVA y merma aplicados.
 * Es el valor que usan todas las recetas, elaboraciones, tragos y menús.
 */
export function costoFinalInsumo(
  precio: number | null | undefined,
  ivaPorcentaje: number | null | undefined,
  mermaPorcentaje: number | null | undefined
): number {
  const p = Number(precio) || 0
  if (p === 0) return 0
  const iva = Number(ivaPorcentaje) || 0
  return (p * (1 + iva / 100)) / factorAprovechamiento(mermaPorcentaje)
}

/**
 * Costo de UNA botella, con el descuento de bodega aplicado. IVA incluido.
 *
 * Los vinos no pasan por `insumos`: no tienen merma ni IVA editable, y el precio
 * viene por caja desde la lista de la bodega. `precio_caja` ya trae el IVA
 * adentro (es el "Precio Final" de la lista), así que el descuento —que se pacta
 * sobre el neto— se aplica sacando el IVA y volviéndolo a poner. Esas dos
 * operaciones se cancelan, por eso la cuenta queda directa.
 *
 * Se usa tanto en la pantalla de Vinos como en la carga de consumo de Análisis:
 * no la copies en una tercera pantalla.
 */
export function costoBotellaVino(
  precioCaja: number | null | undefined,
  unidadesCaja: number | null | undefined,
  descuentoPorcentaje: number | null | undefined
): number {
  const caja = Number(precioCaja) || 0
  const unidades = Number(unidadesCaja) || 0
  if (caja === 0 || unidades <= 0) return 0
  const descuento = Math.min(Math.max(Number(descuentoPorcentaje) || 0, 0), 100)
  return (caja / unidades) * (1 - descuento / 100)
}

/**
 * Precio por unidad base de una línea de factura: lo que queda guardado en
 * `precios_insumo`. Es la MISMA cuenta que el trigger `actualizar_precio_desde_factura`
 * (ver `supabase-fix-contenido-linea-factura.sql`); si se toca una, se toca la otra.
 *
 * `contenido` es lo que trae cada unidad facturada: una bolsa de arroz de 5 kg → 5;
 * el mismo arroz vendido suelto por kilo → 1. Sale de la LÍNEA, no del insumo,
 * porque el mismo insumo se compra en bolsa a un proveedor y suelto a otro.
 * Hasta el 26/09/26 el trigger ignoraba el de la línea y dividía siempre por el
 * del insumo: la yerba de Blancaluna, facturada por kg, quedó a 1/5 de su precio.
 */
export function precioPorUnidadBase(
  precioUnitario: number | null | undefined,
  descuentoPorcentaje: number | null | undefined,
  contenido: number | null | undefined
): number {
  const p = Number(precioUnitario) || 0
  const d = Number(descuentoPorcentaje) || 0
  const c = Number(contenido) > 0 ? Number(contenido) : 1
  return (p * (1 - d / 100)) / c
}

/**
 * Contenido con el que se calculó el precio que hoy tiene la línea.
 * Se deduce del precio guardado y no de `contenido_override`, porque hasta el
 * 26/09/26 el trigger ignoraba esa columna: hay líneas con 1 que en realidad se
 * dividieron por 5. Así, guardar una factura vieja no le cambia el precio.
 */
export function contenidoDeLinea(item: {
  precio_unitario: number | string
  descuento?: number | string | null
  contenido_override?: number | string | null
  precios_insumo?: { precio: number | string } | { precio: number | string }[] | null
}): number | null {
  // PostgREST lo devuelve como objeto o como lista según detecte la relación
  const precio = Array.isArray(item.precios_insumo) ? item.precios_insumo[0] : item.precios_insumo
  const guardado = Number(precio?.precio)
  const neto = Number(item.precio_unitario) * (1 - (Number(item.descuento) || 0) / 100)
  if (guardado > 0 && neto > 0) return Math.round((neto / guardado) * 1000) / 1000
  return item.contenido_override != null ? Number(item.contenido_override) : null
}
