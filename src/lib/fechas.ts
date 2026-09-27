/**
 * Fechas como YYYY-MM-DD, siempre en hora LOCAL.
 *
 * ⚠️ `new Date().toISOString().split('T')[0]` NO sirve para esto. Da la fecha
 * en UTC, y Argentina está tres horas atrás: todo lo que se guarde después de
 * las 21:00 queda fechado al día siguiente. Al 24/08/26 había 136 precios de
 * insumo con la fecha adelantada un día, cargados de noche.
 *
 * No es un detalle cosmético. Las columnas `date` de la base guardan fechas
 * locales —el día del negocio— y son las que filtran el resumen semanal: un
 * precio cargado un domingo a la noche caía en la semana siguiente y aparecía
 * en el informe equivocado.
 *
 * Para guardar "hoy" va `hoyISO()`. Para una fecha cualquiera, `dateToString()`.
 */

export function dateToString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** El día de hoy según el reloj del que lo usa, no según UTC */
export function hoyISO(): string {
  return dateToString(new Date())
}

/**
 * Convierte una fecha YYYY-MM-DD de la base en un Date a la medianoche LOCAL.
 *
 * ⚠️ `new Date('2026-09-26')` la interpreta como medianoche UTC, que en Argentina
 * son las 21:00 del día ANTERIOR: la lista de Insumos mostraba 25/09 para una
 * factura del 26/09, y el PDF de la OC salía fechado un día antes.
 * Con timestamps completos (`created_at`) no hace falta: esos traen la hora.
 */
export function parseFechaLocal(fecha: string): Date {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** YYYY-MM-DD → DD/MM/YY, sin pasar por UTC */
export function formatearFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '-'
  const [y, m, d] = fecha.slice(0, 10).split('-')
  if (!y || !m || !d) return fecha
  return `${d}/${m}/${y.slice(2)}`
}
