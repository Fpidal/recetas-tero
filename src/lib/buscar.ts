/**
 * Búsqueda por fragmentos, para los buscadores de la app.
 *
 * POR QUÉ EXISTE: buscar por substring contiguo obliga a tipear el nombre casi
 * entero y en el orden exacto en que está guardado. Con 65 vinos y 300 insumos
 * eso es lento, y encima muchos nombres empiezan igual: "Reserva (Salentein)"
 * son ocho vinos distintos.
 *
 * Acá la búsqueda se parte en fragmentos y pide que estén TODOS, en cualquier
 * orden. Así se llega a un item con tres sílabas:
 *
 *   "sal res mal"  →  Reserva Malbec (Salentein)
 *   "mila nap"     →  Milanesa napolitana
 *   "ace oli"      →  Aceite de oliva
 *
 * Además ignora acentos, así "angelica" encuentra "Angélica Zapata" sin tener
 * que acordarse de la tilde.
 */

/** Minúsculas y sin acentos, para comparar. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combina: quita los acentos
}

/**
 * ¿El texto contiene todos los fragmentos de la búsqueda, en cualquier orden?
 * Una búsqueda vacía coincide con todo.
 */
export function coincideBusqueda(texto: string, busqueda: string): boolean {
  const fragmentos = normalizar(busqueda).trim().split(/\s+/).filter(Boolean)
  if (fragmentos.length === 0) return true

  const objetivo = normalizar(texto)
  return fragmentos.every((f) => objetivo.includes(f))
}
