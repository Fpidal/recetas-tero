import { supabase } from './supabase'

/**
 * Historial completo de precios, paginado.
 *
 * POR QUÉ EXISTE: Supabase (PostgREST) devuelve como máximo 1000 filas por
 * consulta, aunque no se pida un límite. La tabla `precios_insumo` ya pasó las
 * 3.400 filas, así que una consulta sin paginar solo veía los precios más
 * recientes — el 04/08/26 el corte estaba en el 27/05, y todo lo anterior era
 * invisible.
 *
 * Consecuencia real: 63 insumos no mostraban su variación de precio porque su
 * precio anterior quedaba fuera del corte. Insumos y el dashboard decían
 * "sin cambios" cuando el precio sí había subido. El síntoma empeoraba solo,
 * a medida que la tabla crecía.
 *
 * Si en el futuro esto se vuelve pesado, la solución de fondo es una vista en
 * la base que devuelva precio actual + anterior por insumo (unas 300 filas en
 * vez de 3.400).
 */

export interface PrecioHistorial {
  insumo_id: string
  precio: number
  fecha: string
  es_precio_actual: boolean
  factura_items?: { facturas_proveedor?: { fecha: string } | null } | null
}

const TAMANO_PAGINA = 1000
/** Tope de seguridad: evita un bucle infinito si algo sale mal. */
const MAX_PAGINAS = 50

export async function obtenerHistorialPrecios(): Promise<PrecioHistorial[]> {
  const todos: PrecioHistorial[] = []

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * TAMANO_PAGINA
    const { data, error } = await supabase
      .from('precios_insumo')
      .select('insumo_id, precio, fecha, es_precio_actual, factura_items (facturas_proveedor (fecha))')
      .order('fecha', { ascending: false })
      .range(desde, desde + TAMANO_PAGINA - 1)

    if (error) {
      console.error('Error trayendo historial de precios:', error)
      break
    }
    if (!data || data.length === 0) break

    todos.push(...(data as unknown as PrecioHistorial[]))
    if (data.length < TAMANO_PAGINA) break
  }

  return todos
}

/**
 * Fecha real de un precio: la de la factura que lo originó.
 * La copia en `precios_insumo.fecha` puede quedar desfasada si la factura se
 * edita después, así que la factura manda.
 */
export function fechaRealDePrecio(p: any): string {
  return p?.factura_items?.facturas_proveedor?.fecha || p?.fecha
}
