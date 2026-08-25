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
