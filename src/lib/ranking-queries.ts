import { supabase } from './supabase'
import { nombreVino } from './consumo-queries'
import type { Servicio, TipoConsumoItem } from '@/types/analisis'

/**
 * Ranking de productos vendidos, e ingeniería de menú.
 *
 * QUÉ CUENTA COMO PRODUCTO: solo lo que tiene precio de venta propio —
 * recetas, promociones, tragos y vinos. Los insumos y elaboraciones que se
 * cargan sueltos NO son productos: son costo sin nada que vender detrás.
 *
 * Eso no es un agujero, es cómo trabaja el restaurante. Los menús ejecutivos
 * del mediodía se cargan como insumos a propósito: son seis por día y cambian
 * según el stock y las ofertas, así que llevarlos como recetas serían treinta
 * recetas nuevas por semana. La consecuencia es que **el ranking nunca suma el
 * 100% del costo del período**, y eso hay que mostrarlo (ver `cobertura`), no
 * esconderlo: en el mediodía la diferencia ES el menú ejecutivo, y verla
 * separada del consumo de carta es justamente lo útil.
 *
 * POR QUÉ LAS UNIDADES Y LA PLATA NO VALEN LO MISMO:
 *
 *   Las unidades no caducan. Cuántos salmones se vendieron en julio es un
 *   hecho, y sirve igual dentro de dos años.
 *
 *   La plata sí caduca. El costo queda congelado al cargar (bien), pero el
 *   precio sale de la carta de HOY. Un período viejo mezcla costo de entonces
 *   con precio de ahora: no es el food cost que tuviste ni el que tenés. Y el
 *   sesgo va siempre para el mismo lado —el pasado se ve mejor de lo que fue—
 *   porque los precios suben. Por eso `preciosSonDeHoy` viaja hasta la
 *   pantalla: en el período en curso no molesta, y hacia atrás hay que decirlo.
 */

const TAMANO_PAGINA = 1000
const MAX_PAGINAS = 50

/** Los tipos que tienen precio de venta. El resto es costo sin producto. */
const TIPOS_VENDIBLES: TipoConsumoItem[] = ['receta', 'ejecutivo', 'trago', 'vino']

/** Cómo se llama cada grupo en pantalla. `ejecutivo` son las promos de la
 *  noche: la tabla se llama `menus_ejecutivos` por historia, pero el menú
 *  ejecutivo de verdad es el del mediodía y ese no pasa por acá. */
export const GRUPO_LABEL: Record<string, string> = {
  receta: 'Carta',
  ejecutivo: 'Promociones',
  trago: 'Tragos',
  vino: 'Vinos',
}

export interface ProductoRanking {
  clave: string
  tipo: TipoConsumoItem
  refId: string
  nombre: string
  /** Sección de la carta. Solo para recetas; el resto va en su propio grupo. */
  seccion: string
  /** Área del negocio, para no comparar un vino con un plato */
  area: 'cocina' | 'barra'
  /** Unidades vendidas, tal cual se cargaron */
  unidades: number
  /**
   * A cuántas personas alcanza una unidad. 1 para casi todo; 2 para un menú
   * para dos. Sale de `menus_ejecutivos.cubiertos`.
   */
  cubiertos: number
  /**
   * Unidades × cubiertos. Es lo que hay que usar para medir popularidad: si un
   * menú para dos se vende 10 veces, comieron 20 personas, y contra un plato
   * individual esas son 20 decisiones de compra, no 10.
   */
  cubiertosServidos: number
  /** Costo real, sumado de los subtotales congelados en la carga */
  costo: number
  /** Precio de venta de UNA unidad, de la carta de hoy. null si no está en carta. */
  precio: number | null
  facturacion: number | null
  /** Facturación menos costo, en pesos. Plata de verdad, sin normalizar. */
  contribucion: number | null
  /**
   * Lo que deja UN CUBIERTO. Es el eje de la matriz, y va por cubierto y no
   * por unidad justamente por el menú para dos: sin dividir aparece con el
   * doble de contribución que todo lo demás y corre el umbral de la sección.
   */
  contribucionUnitaria: number | null
  foodCost: number | null
}

export interface RankingPeriodo {
  productos: ProductoRanking[]
  desde: string
  hasta: string
  diasConCarga: number
  /** Costo de TODO lo cargado, productos y sueltos */
  costoTotal: number
  /** Costo de lo que sí es producto vendible */
  costoProductos: number
  /** Qué porción del costo llega a este ranking (0-1) */
  cobertura: number
  /** true si el rango incluye hoy: ahí costo y precio son contemporáneos */
  preciosSonDeHoy: boolean
}

async function traerTodo<T = any>(
  tabla: string,
  select: string,
  filtros?: (q: any) => any
): Promise<T[]> {
  const todos: T[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * TAMANO_PAGINA
    let q = supabase.from(tabla).select(select).range(desde, desde + TAMANO_PAGINA - 1)
    if (filtros) q = filtros(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    todos.push(...(data as T[]))
    if (data.length < TAMANO_PAGINA) break
  }
  return todos
}

/** La FK que corresponde a cada tipo dentro de consumo_items */
const FK: Record<TipoConsumoItem, string> = {
  insumo: 'insumo_id',
  elaboracion: 'receta_base_id',
  receta: 'plato_id',
  trago: 'trago_id',
  ejecutivo: 'menu_ejecutivo_id',
  vino: 'vino_id',
}

/**
 * Precio de venta y datos de carta de cada producto, por tipo.
 * Cada uno vive en una tabla distinta, así que se traen en paralelo.
 */
async function traerDatosDeVenta(): Promise<{
  precios: Map<string, number>
  nombres: Map<string, string>
  secciones: Map<string, string>
  cubiertos: Map<string, number>
}> {
  const [carta, platos, promos, tragos, cartaVinos, vinos] = await Promise.all([
    traerTodo('carta', 'plato_id, precio_carta', (q) => q.eq('activo', true)),
    traerTodo('platos', 'id, nombre, seccion'),
    traerTodo('menus_ejecutivos', 'id, nombre, precio_carta, cubiertos'),
    traerTodo('tragos', 'id, nombre, precio_venta'),
    traerTodo('carta_vinos', 'vino_id, precio_carta', (q) => q.eq('activo', true)),
    // `bodega` es una columna de texto en `vinos`, no una relación: nombreVino() la usa asi.
    traerTodo('vinos', 'id, nombre, bodega, cepa'),
  ])

  const precios = new Map<string, number>()
  const nombres = new Map<string, string>()
  const secciones = new Map<string, string>()
  const cubiertos = new Map<string, number>()

  platos.forEach((p: any) => {
    nombres.set(`receta:${p.id}`, p.nombre)
    secciones.set(`receta:${p.id}`, p.seccion || 'Sin sección')
  })
  carta.forEach((c: any) => {
    if (c.precio_carta > 0) precios.set(`receta:${c.plato_id}`, Number(c.precio_carta))
  })

  promos.forEach((m: any) => {
    nombres.set(`ejecutivo:${m.id}`, m.nombre)
    if (m.precio_carta > 0) precios.set(`ejecutivo:${m.id}`, Number(m.precio_carta))
    // La columna es NOT NULL DEFAULT 1, pero si alguna vez falta se asume 1:
    // es el valor correcto para todo menú individual, que son casi todos.
    cubiertos.set(`ejecutivo:${m.id}`, Number(m.cubiertos) || 1)
  })

  tragos.forEach((t: any) => {
    nombres.set(`trago:${t.id}`, t.nombre)
    if (t.precio_venta > 0) precios.set(`trago:${t.id}`, Number(t.precio_venta))
  })

  vinos.forEach((v: any) => {
    nombres.set(`vino:${v.id}`, nombreVino(v))
  })
  cartaVinos.forEach((c: any) => {
    if (c.precio_carta > 0) precios.set(`vino:${c.vino_id}`, Number(c.precio_carta))
  })

  return { precios, nombres, secciones, cubiertos }
}

/**
 * Ranking de un rango de fechas, opcionalmente filtrado por servicio.
 */
export async function obtenerRanking(
  desde: string,
  hasta: string,
  servicio?: Servicio
): Promise<RankingPeriodo> {
  // 1. Qué consumos hay en el rango
  let q = supabase.from('consumo_diario').select('id, fecha').gte('fecha', desde).lte('fecha', hasta)
  if (servicio) q = q.eq('servicio', servicio)
  const { data: consumos, error } = await q
  if (error) throw error

  const vacio: RankingPeriodo = {
    productos: [], desde, hasta, diasConCarga: 0,
    costoTotal: 0, costoProductos: 0, cobertura: 0,
    preciosSonDeHoy: true,
  }
  if (!consumos || consumos.length === 0) return vacio

  const ids = consumos.map((c: any) => c.id)
  const diasConCarga = new Set(consumos.map((c: any) => c.fecha)).size

  // 2. Los items. Paginado: consumo_items crece por servicio y por día, y
  //    PostgREST corta en 1000 filas sin avisar (trampa 4 del CLAUDE.md).
  const items = await traerTodo<any>(
    'consumo_items',
    'tipo, insumo_id, receta_base_id, plato_id, trago_id, menu_ejecutivo_id, vino_id, cantidad, subtotal',
    (qq) => qq.in('consumo_id', ids)
  )
  if (items.length === 0) return { ...vacio, diasConCarga }

  // 3. Acumular por producto. El costo total incluye TODO —también los
  //    insumos sueltos— porque es contra eso que se mide la cobertura.
  const acumulado = new Map<string, { tipo: TipoConsumoItem; refId: string; unidades: number; costo: number }>()
  let costoTotal = 0

  for (const it of items) {
    const costo = Number(it.subtotal) || 0
    costoTotal += costo
    const tipo = it.tipo as TipoConsumoItem
    if (!TIPOS_VENDIBLES.includes(tipo)) continue

    const refId = it[FK[tipo]]
    if (!refId) continue

    const clave = `${tipo}:${refId}`
    const acc = acumulado.get(clave)
    if (acc) {
      acc.unidades += Number(it.cantidad) || 0
      acc.costo += costo
    } else {
      acumulado.set(clave, { tipo, refId, unidades: Number(it.cantidad) || 0, costo })
    }
  }

  // 4. Cruzar con la carta
  const { precios, nombres, secciones, cubiertos } = await traerDatosDeVenta()

  const productos: ProductoRanking[] = Array.from(acumulado.entries()).map(([clave, a]) => {
    const precio = precios.get(clave) ?? null
    const cub = cubiertos.get(clave) ?? 1
    const cubiertosServidos = a.unidades * cub

    const facturacion = precio !== null ? precio * a.unidades : null
    const contribucion = facturacion !== null ? facturacion - a.costo : null
    // Por CUBIERTO, no por unidad: un menú para dos deja el doble por venta,
    // pero lo mismo por persona, y es por persona que compite con un plato.
    const contribucionUnitaria =
      contribucion !== null && cubiertosServidos > 0 ? contribucion / cubiertosServidos : null

    return {
      clave,
      tipo: a.tipo,
      refId: a.refId,
      nombre: nombres.get(clave) || 'Sin nombre',
      seccion: a.tipo === 'receta' ? secciones.get(clave) || 'Sin sección' : GRUPO_LABEL[a.tipo],
      area: a.tipo === 'trago' || a.tipo === 'vino' ? 'barra' : 'cocina',
      unidades: a.unidades,
      cubiertos: cub,
      cubiertosServidos,
      costo: a.costo,
      precio,
      facturacion,
      contribucion,
      contribucionUnitaria,
      foodCost: facturacion && facturacion > 0 ? (a.costo / facturacion) * 100 : null,
    }
  })

  const costoProductos = productos.reduce((s, p) => s + p.costo, 0)

  // Si el rango llega hasta hoy, costo y precio son contemporáneos y la plata
  // se puede leer sin asteriscos. Hacia atrás, no.
  const hoy = new Date()
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  return {
    productos: productos.sort((a, b) => b.unidades - a.unidades),
    desde,
    hasta,
    diasConCarga,
    costoTotal,
    costoProductos,
    cobertura: costoTotal > 0 ? costoProductos / costoTotal : 0,
    preciosSonDeHoy: hasta >= hoyISO,
  }
}

// =====================================================
// INGENIERÍA DE MENÚ
// =====================================================

export type Cuadrante = 'estrella' | 'caballo' | 'rompecabezas' | 'perro'

export const CUADRANTE_LABEL: Record<Cuadrante, string> = {
  estrella: 'Estrella',
  caballo: 'Caballo',
  rompecabezas: 'Rompecabezas',
  perro: 'Perro',
}

export const CUADRANTE_AYUDA: Record<Cuadrante, string> = {
  estrella: 'Se vende y deja. No tocar el precio ni la receta; darle el mejor lugar en la carta.',
  caballo: 'Se vende mucho pero deja poco. Subir el precio de a poco, o bajarle el costo sin que se note.',
  rompecabezas: 'Deja bien pero no sale. Es un problema de venta: nombre, ubicación en la carta, o que el mozo lo ofrezca.',
  perro: 'Ni se vende ni deja. Candidato a salir de la carta, salvo que esté por otra razón.',
}

export interface ItemMatriz extends ProductoRanking {
  cuadrante: Cuadrante
  /** Qué porcentaje de los cubiertos de su sección se lleva */
  participacion: number
}

export interface MatrizSeccion {
  seccion: string
  items: ItemMatriz[]
  /** Umbral de popularidad: 70% de la participación promedio */
  umbralPopularidad: number
  /** Umbral de contribución: el promedio ponderado de la sección */
  umbralContribucion: number
  /** Cubiertos servidos por toda la sección */
  unidadesTotales: number
  /** Cuántos productos tienen precio. Sin precio no hay eje vertical. */
  conPrecio: number
}

/**
 * Arma la matriz de una sección.
 *
 * LOS UMBRALES NO SON A OJO, y es lo que separa esta matriz de un gráfico
 * decorativo. Son los del método de Kasavana & Smith:
 *
 *   Popularidad: se considera popular vender más del 70% de lo que vendería
 *   el producto promedio si todos vendieran igual. Con 10 productos el
 *   promedio es 10%, así que el umbral queda en 7%. El 70% existe porque
 *   partir por el promedio manda a la mitad del menú al lado malo por
 *   definición, y eso no es un diagnóstico.
 *
 *   Contribución: el promedio PONDERADO por unidades, no el simple. Un plato
 *   carísimo que se vende una vez no puede mover el umbral de toda la sección.
 *
 * Y LA CONTRIBUCIÓN VA EN PESOS, NO EN FOOD COST %. Es lo más contraintuitivo
 * del método: un plato con 40% de food cost que deja $15.000 contribuye más
 * que uno con 20% que deja $3.000. El restaurante deposita pesos. Con el eje
 * en porcentaje, los platos caros y rendidores caen del lado equivocado y la
 * matriz recomienda sacar justo lo que más deja.
 */
export function armarMatriz(productos: ProductoRanking[], seccion: string): MatrizSeccion {
  const items = productos.filter((p) => p.seccion === seccion)
  // Por CUBIERTOS servidos, no por unidades vendidas: un menú para dos que se
  // vende 10 veces son 20 personas comiendo, y contra un plato individual esas
  // son 20 decisiones de compra. Medido en unidades, el menú para dos aparece
  // con la mitad de la popularidad que realmente tiene.
  const unidadesTotales = items.reduce((s, p) => s + p.cubiertosServidos, 0)
  const conPrecio = items.filter((p) => p.contribucionUnitaria !== null).length

  const umbralPopularidad = items.length > 0 ? (100 / items.length) * 0.7 : 0

  // Ponderado por cubiertos: lo que deja la sección por persona servida
  const conDatos = items.filter((p) => p.contribucionUnitaria !== null)
  const cubiertosConDatos = conDatos.reduce((s, p) => s + p.cubiertosServidos, 0)
  const umbralContribucion =
    cubiertosConDatos > 0
      ? conDatos.reduce((s, p) => s + p.contribucionUnitaria! * p.cubiertosServidos, 0) / cubiertosConDatos
      : 0

  const conCuadrante: ItemMatriz[] = items.map((p) => {
    const participacion = unidadesTotales > 0 ? (p.cubiertosServidos / unidadesTotales) * 100 : 0
    const popular = participacion >= umbralPopularidad
    // Sin precio no se puede juzgar la contribución: se lo trata como bajo
    // para no inventarle un mérito que no se midió.
    const rinde = (p.contribucionUnitaria ?? 0) >= umbralContribucion

    const cuadrante: Cuadrante = popular
      ? rinde ? 'estrella' : 'caballo'
      : rinde ? 'rompecabezas' : 'perro'

    return { ...p, cuadrante, participacion }
  })

  return {
    seccion,
    items: conCuadrante.sort((a, b) => b.cubiertosServidos - a.cubiertosServidos),
    umbralPopularidad,
    umbralContribucion,
    unidadesTotales,
    conPrecio,
  }
}

/** Secciones presentes en el ranking, ordenadas por costo. */
export function seccionesDe(productos: ProductoRanking[]): string[] {
  const porSeccion = new Map<string, number>()
  productos.forEach((p) => porSeccion.set(p.seccion, (porSeccion.get(p.seccion) || 0) + p.costo))
  return Array.from(porSeccion.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
}

/**
 * Mínimo de productos para que la matriz signifique algo.
 *
 * Estuvo en 5 y era un número puesto a ojo, con una consecuencia que no vi:
 * Promociones tiene 4 productos y nunca va a tener más, así que esa sección
 * quedaba con la matriz bloqueada para siempre.
 *
 * Donde el método realmente se rompe es con uno o dos. Con un solo producto,
 * ese producto es el 100% de las unidades Y su propio promedio de
 * contribución: cae siempre en el mismo cuadrante por construcción. Con cuatro,
 * en cambio, el umbral de popularidad da 17,5% de las unidades y discrimina
 * bien.
 */
export const MINIMO_PARA_MATRIZ = 3

/**
 * Debajo de esto la matriz se dibuja igual, pero avisando: con pocos productos
 * un solo dato mueve los umbrales, y conviene leerla sabiéndolo.
 */
export const POCOS_PARA_MATRIZ = 6

/**
 * Último día con consumo cargado.
 *
 * Sirve para el caso en que el período elegido está vacío: "no hay datos" no
 * ayuda a nadie, "el último día con carga es el 8/8" te dice exactamente
 * adónde ir.
 */
export async function obtenerUltimaFechaConCarga(): Promise<string | null> {
  const { data, error } = await supabase
    .from('consumo_diario')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? (data[0] as any).fecha : null
}
