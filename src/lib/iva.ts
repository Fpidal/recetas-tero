/**
 * El IVA de una línea de orden de compra — la cuenta, en un solo lugar.
 *
 * Hasta el 07/09/26 esto vivía copiado en siete pantallas, todas con la misma
 * forma: `esVino ? 21 : (item.insumos?.iva_porcentaje ?? 21)`. Leía SIEMPRE el
 * insumo, así que el porcentaje que el usuario elegía al cargar la orden se
 * mostraba bien mientras cargaba y se perdía al guardar.
 *
 * Ahora `orden_compra_items` guarda su propio `iva_porcentaje`
 * (`supabase-oc-iva-por-linea.sql`), porque el mismo insumo se compra con
 * distinto IVA según el proveedor: la bondiola figura al 0% en `insumos` y a
 * Avicola del Norte se le compra al 21%.
 *
 * El orden de prioridad importa:
 *
 *   1. Lo guardado en la línea — es lo que alguien eligió a propósito.
 *   2. El del insumo — para las órdenes anteriores al 07/09/26, que tienen la
 *      columna en NULL y tienen que seguir dando el mismo total que siempre.
 *   3. 21% — último recurso, si el insumo tampoco lo tiene.
 *
 * Los vinos no están en `insumos`, así que sin dato propio caen al 21%.
 *
 * IMPORTANTE: no volver a copiar esta cuenta en una pantalla. Ya pasó con la
 * comparación de OC contra factura (trampa 10 del CLAUDE.md), donde la misma
 * fórmula vivía en dos lados y se arregló uno solo.
 */

/** Lo que se asume cuando no hay ningún dato: la alícuota general. */
export const IVA_POR_DEFECTO = 21

export interface LineaConIva {
  /** El pactado para esta línea. NULL en las órdenes anteriores al 07/09/26. */
  iva_porcentaje?: number | null
  vino_id?: string | null
  insumos?: { iva_porcentaje?: number | null } | null
}

export function ivaLineaOrden(item: LineaConIva): number {
  if (item.iva_porcentaje !== null && item.iva_porcentaje !== undefined) {
    return Number(item.iva_porcentaje)
  }
  if (item.vino_id) return IVA_POR_DEFECTO

  const delInsumo = item.insumos?.iva_porcentaje
  if (delInsumo !== null && delInsumo !== undefined) return Number(delInsumo)

  return IVA_POR_DEFECTO
}
