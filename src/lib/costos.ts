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
