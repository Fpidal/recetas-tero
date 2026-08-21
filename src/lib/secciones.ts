/**
 * Las secciones de la carta — en un solo lugar.
 *
 * POR QUÉ EXISTE: hasta V.38 la lista estaba escrita a mano en 12 lugares de
 * 9 archivos — cuatro copias del array ordenado, dos listas de <option>, tres
 * mapas de agrupación y una tabla de márgenes. Agregar una sección obligaba a
 * tocar los doce, y si se escapaba uno la sección aparecía en una pantalla y
 * no en otra, sin ningún error.
 *
 * Es el mismo problema que ya nos costó caro con la fórmula de la merma (V.20)
 * y con la terracota (V.34): la misma información copiada deriva sola.
 *
 * Si hace falta una sección nueva, se agrega ACÁ y aparece en todas partes.
 */

/** Orden en que se muestran, en la carta y en los listados */
export const SECCIONES = [
  'Entradas',
  'Principales',
  'Parrilla',
  'Pastas y Arroces',
  'Ensaladas',
  'Postres',
  'Bebidas',
  // Va última y a propósito: es lo que se cobra pero no se elige de la carta.
  // El "Cubierto" vive acá — como receta arrastra la servilleta, el pan y el
  // aceite de mesa, pero con 55 unidades por servicio aplastaba la matriz de
  // Entradas, donde estaba antes: se llevaba el 90% de las unidades y dejaba a
  // todas las entradas reales por debajo del umbral de popularidad.
  'Otros',
] as const

export type Seccion = (typeof SECCIONES)[number]

/** Para los <Select> de alta y edición de platos */
export const SECCION_OPCIONES = SECCIONES.map((s) => ({ value: s, label: s }))

/**
 * Agrupación gruesa, para los menús.
 *
 * Un menú se arma con entrada + principal + postre + bebida, y no le importa
 * si el principal vino de Parrilla o de Pastas. Incluye las variantes en
 * minúscula y singular porque hay datos viejos cargados así.
 */
export const SECCION_AGRUPADA: Record<string, string> = {
  entrada: 'Entradas',
  Entrada: 'Entradas',
  Entradas: 'Entradas',
  principal: 'Principales',
  Principal: 'Principales',
  Principales: 'Principales',
  Parrilla: 'Principales',
  'Pastas y Arroces': 'Principales',
  Ensaladas: 'Principales',
  guarnicion: 'Principales',
  Guarnición: 'Principales',
  postre: 'Postres',
  Postre: 'Postres',
  Postres: 'Postres',
  bebida: 'Bebidas',
  Bebida: 'Bebidas',
  Bebidas: 'Bebidas',
  // No agrupa en ninguna parte de un menú: el cubierto no es un plato del menú
  Otros: 'Otros',
}

export function agruparSeccion(seccion: string | null | undefined): string {
  if (!seccion) return 'Principales'
  return SECCION_AGRUPADA[seccion] || 'Principales'
}

/**
 * Food cost objetivo sugerido al poner un plato en carta.
 *
 * Es solo el valor que aparece propuesto: se edita plato por plato. Las
 * bebidas van más abajo que la comida porque es donde está el mejor margen
 * del salón —una gaseosa que cuesta $800 se vende a $4.000— y arrancar la
 * sugerencia en el número de un principal la subvalúa.
 */
export const MARGEN_POR_SECCION: Record<string, number> = {
  Entradas: 15,
  Principales: 25,
  Parrilla: 25,
  'Pastas y Arroces': 20,
  Ensaladas: 15,
  Postres: 20,
  Bebidas: 20,
  Otros: 30,
}

export function margenDeSeccion(seccion: string): number {
  return MARGEN_POR_SECCION[seccion] ?? 25
}

/**
 * A qué área del negocio pertenece una sección.
 *
 * POR QUÉ NO ALCANZA CON EL TIPO: `areaDeTipo()` decide por el tipo del item
 * de consumo, y manda a Barra solo `trago` y `vino`. Una receta de café o de
 * gaseosa es tipo `receta`, así que caía en Cocina. En el servicio del 8/8
 * eso puso $35.426 de agua y cerveza dentro del costo de cocina, y la
 * división cocina/barra existe justamente porque tienen márgenes distintos.
 *
 * Con la sección, una receta de bebida va a Barra sin ambigüedad.
 */
export function areaDeSeccion(seccion: string | null | undefined): 'cocina' | 'barra' {
  return agruparSeccion(seccion) === 'Bebidas' ? 'barra' : 'cocina'
}

/**
 * Qué secciones de plato caen dentro de un grupo. Se calcula de SECCIONES y
 * SECCION_AGRUPADA en vez de repetirse: si mañana se agrega "Woks" y se la
 * agrupa en Principales, los menús especiales la ven sola.
 */
export function seccionesQueAgrupanEn(grupo: string): string[] {
  return (SECCIONES as readonly string[]).filter((s) => agruparSeccion(s) === grupo)
}

/** ¿Es una de las secciones conocidas? Acepta cualquier string: las pantallas
 *  reciben la sección de la base, no un literal. */
export function esSeccionConocida(seccion: string): boolean {
  return (SECCIONES as readonly string[]).includes(seccion)
}

/** Ordena por el orden de la carta; lo que no esté en la lista va al final */
export function ordenDeSeccion(seccion: string): number {
  const i = (SECCIONES as readonly string[]).indexOf(seccion)
  return i === -1 ? SECCIONES.length : i
}
