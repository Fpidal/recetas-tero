import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { coincideBusqueda } from './buscar'
import type { Servicio, TipoConsumoItem } from '@/types/analisis'

/**
 * Importar el informe de ventas del salón.
 *
 * DE DÓNDE SALE CADA COSA. El archivo trae una fila por producto con código,
 * nombre, unidades e importe. De ahí salen tres cosas que hoy se cargan a mano:
 *
 *   la venta del día      →  suma de los importes
 *   los cubiertos         →  las filas de "Cubierto"
 *   el consumo del turno  →  las unidades de cada producto
 *
 * El costo NO viene del archivo: sale de las recetas, como siempre. El sistema
 * de ventas sabe qué se vendió; el recetario sabe cuánto costó.
 *
 * ⚠️ EL $0 ES UNA PISTA, NO UNA REGLA. Casi todas las filas en cero son
 * componentes que ya vienen adentro de un menú: en el archivo del 24/07,
 * "Ensalada rusa M. PESCADO" tiene 9 unidades y "Menu Pescado" también — es la
 * misma ensalada, una vez suelta y otra dentro del menú. Cargar las dos
 * duplicaría su costo.
 *
 * Pero NO todas. El "Cubierto Menor" también viene en $0 —es una cortesía— y
 * esa persona igual usó su servilleta y su pan. Ahí sí hay consumo.
 *
 * Por eso el $0 solo define qué se propone por defecto (ignorar), y lo que
 * manda es el mapeo: si apunta a un producto, se carga; si está marcado como
 * ignorado, no. La decisión se toma una vez y queda guardada.
 */

/** Una fila del archivo, ya limpia */
export interface FilaVenta {
  codigo: string
  nombre: string
  unidades: number
  importe: number
  /** true si viene en $0: es componente de un menú, no una venta */
  incluida: boolean
}

export interface ArchivoVentas {
  filas: FilaVenta[]
  /** Suma de los importes: la venta del turno */
  venta: number
  /** Suma de las filas de cubierto */
  cubiertos: number
}

const COLUMNAS = ['codigo', 'nombre', 'unidades', 'importe'] as const

/**
 * Lee el Excel. Acepta `.xls` viejo y `.xlsx`.
 *
 * Se valida que estén las cuatro columnas que importan y se ignora el resto
 * —costo, p_total, neto, tipo_iva— que el sistema de ventas trae pero acá no
 * se usan: el costo sale del recetario.
 */
export function leerArchivo(buffer: ArrayBuffer): ArchivoVentas {
  const wb = XLSX.read(buffer, { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  if (!hoja) throw new Error('El archivo no tiene ninguna hoja.')

  const crudo = XLSX.utils.sheet_to_json<Record<string, any>>(hoja, { defval: '' })
  if (crudo.length === 0) throw new Error('La hoja está vacía.')

  const faltan = COLUMNAS.filter((c) => !(c in crudo[0]))
  if (faltan.length > 0) {
    throw new Error(
      `Al archivo le faltan columnas: ${faltan.join(', ')}. ` +
        `Tiene: ${Object.keys(crudo[0]).join(', ')}.`
    )
  }

  const num = (v: any) => Number(String(v).replace(',', '.')) || 0

  const filas: FilaVenta[] = crudo
    .map((r) => ({
      codigo: String(r.codigo).trim(),
      nombre: String(r.nombre).trim(),
      unidades: num(r.unidades),
      importe: num(r.importe),
      incluida: num(r.importe) === 0,
    }))
    .filter((f) => f.codigo && f.unidades > 0)

  return {
    filas,
    venta: filas.reduce((s, f) => s + f.importe, 0),
    cubiertos: filas
      .filter((f) => /^cubierto/i.test(f.nombre))
      .reduce((s, f) => s + f.unidades, 0),
  }
}

// =====================================================
// MAPEO
// =====================================================

export interface Mapeo {
  codigo: string
  nombre_origen: string
  tipo: TipoConsumoItem | null
  insumo_id: string | null
  receta_base_id: string | null
  plato_id: string | null
  trago_id: string | null
  menu_ejecutivo_id: string | null
  vino_id: string | null
  ignorar: boolean
  /**
   * Cuántas unidades del producto del recetario son UNA unidad del sistema de
   * ventas. Casi siempre 1. Una copa de vino sobre una botella de 750 ml es
   * 0,333: nueve copas cargan tres botellas, con su costo real.
   *
   * Existe porque `plato_ingredientes` no acepta vino, así que no se puede
   * armar "Copa de Malbec" como receta. En vez de duplicar el vino como
   * insumo —dos precios que mantener— se guarda la equivalencia.
   */
  factor: number
}

/** Un producto del recetario, para el buscador */
export interface Producto {
  id: string
  tipo: TipoConsumoItem
  nombre: string
  /** Precio de carta, para confirmar que se enlazó el correcto */
  precio: number
}

export const FK_POR_TIPO: Record<TipoConsumoItem, keyof Mapeo> = {
  insumo: 'insumo_id',
  elaboracion: 'receta_base_id',
  receta: 'plato_id',
  trago: 'trago_id',
  ejecutivo: 'menu_ejecutivo_id',
  vino: 'vino_id',
}

export async function obtenerMapeos(): Promise<Map<string, Mapeo>> {
  const { data, error } = await supabase.from('mapeo_ventas').select('*')
  if (error) throw error
  return new Map((data || []).map((m: any) => [String(m.codigo), m as Mapeo]))
}

export async function guardarMapeo(m: Omit<Mapeo, 'nombre_origen'> & { nombre_origen: string }): Promise<void> {
  const { error } = await supabase
    .from('mapeo_ventas')
    .upsert({ ...m, updated_at: new Date().toISOString() }, { onConflict: 'codigo' })
  if (error) throw error
}

/**
 * Sugiere a qué producto se parece un nombre del sistema de ventas.
 *
 * Compara palabras de más de tres letras: las cortas —"de", "con", "la"— están
 * en todos los nombres y no distinguen nada. Se descarta el prefijo `M.` o `C.`
 * porque marca de dónde viene el producto, no qué es.
 *
 * Es solo una sugerencia: siempre se confirma a mano. Un mapeo mal hecho no da
 * error, carga el costo del plato equivocado.
 */
export function sugerir(nombreOrigen: string, catalogo: Producto[]): Producto | null {
  const limpiar = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^[mc]\.\s*/, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const palabras = (s: string) => new Set(limpiar(s).split(' ').filter((w) => w.length > 3))

  const a = palabras(nombreOrigen)
  if (a.size === 0) return null

  let mejor = 0
  let elegido: Producto | null = null
  for (const p of catalogo) {
    const b = palabras(p.nombre)
    if (b.size === 0) continue
    const comunes = Array.from(a).filter((w) => b.has(w)).length
    const puntaje = comunes / Math.max(a.size, b.size)
    if (puntaje > mejor) {
      mejor = puntaje
      elegido = p
    }
  }
  // Debajo de esto la sugerencia es más ruido que ayuda
  return mejor >= 0.34 ? elegido : null
}

/** Filtra el catálogo con el mismo buscador de Carga diaria */
export function buscar(catalogo: Producto[], texto: string): Producto[] {
  return catalogo.filter((p) => coincideBusqueda(p.nombre, texto)).slice(0, 50)
}

/**
 * Todo lo que se puede enlazar, con su precio de carta.
 *
 * Los insumos y las elaboraciones quedan afuera a propósito: el sistema de
 * ventas vende platos, menús, tragos y vinos. Si algún día hace falta enlazar
 * un insumo suelto se agrega, pero mientras tanto son 300 opciones más en un
 * buscador que ya tiene 188.
 */
export async function obtenerCatalogo(): Promise<Producto[]> {
  const [platos, menus, tragos, vinos, carta, cartaVinos] = await Promise.all([
    supabase.from('platos').select('id, nombre').eq('activo', true),
    supabase.from('menus_ejecutivos').select('id, nombre, precio_carta').eq('activo', true),
    supabase.from('tragos').select('id, nombre, precio_venta').eq('activo', true),
    supabase.from('vinos').select('id, nombre, bodega, cepa').eq('activo', true),
    supabase.from('carta').select('plato_id, precio_carta').eq('activo', true),
    supabase.from('carta_vinos').select('vino_id, precio_carta').eq('activo', true),
  ])

  const precioPlato = new Map((carta.data || []).map((c: any) => [c.plato_id, Number(c.precio_carta) || 0]))
  const precioVino = new Map((cartaVinos.data || []).map((c: any) => [c.vino_id, Number(c.precio_carta) || 0]))

  return [
    ...(platos.data || []).map((p: any) => ({
      id: p.id, tipo: 'receta' as const, nombre: p.nombre, precio: precioPlato.get(p.id) ?? 0,
    })),
    ...(menus.data || []).map((m: any) => ({
      id: m.id, tipo: 'ejecutivo' as const, nombre: m.nombre, precio: Number(m.precio_carta) || 0,
    })),
    ...(tragos.data || []).map((t: any) => ({
      id: t.id, tipo: 'trago' as const, nombre: t.nombre, precio: Number(t.precio_venta) || 0,
    })),
    ...(vinos.data || []).map((v: any) => ({
      id: v.id,
      tipo: 'vino' as const,
      nombre: [v.nombre, v.cepa].filter(Boolean).join(' ') + (v.bodega ? ` (${v.bodega})` : ''),
      precio: precioVino.get(v.id) ?? 0,
    })),
  ]
}

// =====================================================
// APLICAR LA IMPORTACIÓN
// =====================================================

export interface LineaAImportar {
  codigo: string
  nombre: string
  unidades: number
  importe: number
  mapeo: Mapeo
}

export interface ResultadoImportacion {
  lineasCargadas: number
  lineasActualizadas: number
  omitidas: number
  costoTotal: number
}

/**
 * Carga las líneas en el consumo del día y actualiza la venta.
 *
 * REIMPORTAR EL MISMO ARCHIVO NO DUPLICA NADA. Cada línea queda marcada con su
 * `origen_codigo`, así que la segunda vez se actualiza en vez de agregarse. Sin
 * eso, subir el archivo dos veces —por las dudas, o porque no quedó claro si
 * había andado— duplicaría el costo del turno entero.
 *
 * LO CARGADO A MANO NO SE TOCA. Solo se borran y rehacen las líneas que vienen
 * de una importación anterior (`origen_codigo IS NOT NULL`). El pan, las
 * servilletas y el menú del mediodía siguen ahí.
 */
export async function aplicarImportacion(
  fecha: string,
  servicio: Servicio,
  lineas: LineaAImportar[],
  costoUnitario: (m: Mapeo) => number
): Promise<ResultadoImportacion> {
  // 1. Cabecera del consumo, creándola si no existe
  const { data: existente } = await supabase
    .from('consumo_diario')
    .select('id')
    .eq('fecha', fecha)
    .eq('servicio', servicio)
    .maybeSingle()

  let consumoId = (existente as any)?.id as string | undefined
  if (!consumoId) {
    const { data, error } = await supabase
      .from('consumo_diario')
      .insert({ fecha, servicio })
      .select('id')
      .single()
    if (error) throw error
    consumoId = (data as any).id
  }

  // 2. Borrar lo que dejó una importación anterior de ESTE turno.
  //    Las líneas cargadas a mano tienen origen_codigo en NULL y no se tocan.
  const { error: eBorrar } = await supabase
    .from('consumo_items')
    .delete()
    .eq('consumo_id', consumoId)
    .not('origen_codigo', 'is', null)
  if (eBorrar) throw eBorrar

  // 3. Insertar. Manda el MAPEO, no el importe: si apunta a un producto se
  //    carga, aunque haya venido en $0. Es el caso del "Cubierto Menor", que
  //    es cortesía pero igual consumió servilleta y pan. Lo que no se carga es
  //    lo marcado como ignorado — los componentes que ya están dentro de un
  //    menú, y las filas que no son un producto del recetario.
  const aCargar = lineas.filter((l) => !l.mapeo.ignorar && l.mapeo.tipo !== null)
  const filas = aCargar.map((l) => {
    const tipo = l.mapeo.tipo as TipoConsumoItem
    const fk = FK_POR_TIPO[tipo]
    return {
      consumo_id: consumoId,
      tipo,
      insumo_id: null, receta_base_id: null, plato_id: null,
      trago_id: null, menu_ejecutivo_id: null, vino_id: null,
      [fk]: l.mapeo[fk],
      cantidad: l.unidades * (Number(l.mapeo.factor) || 1),
      unidad: tipo === 'vino' ? 'botella' : tipo === 'trago' ? 'trago' : tipo === 'ejecutivo' ? 'menu' : 'porcion',
      costo_unitario: costoUnitario(l.mapeo),
      origen_codigo: l.codigo,
    }
  })

  if (filas.length > 0) {
    const { error } = await supabase.from('consumo_items').insert(filas)
    if (error) throw error
  }

  return {
    lineasCargadas: filas.length,
    lineasActualizadas: 0,
    omitidas: lineas.length - filas.length,
    costoTotal: filas.reduce((s, f) => s + f.cantidad * f.costo_unitario, 0),
  }
}

/**
 * Guarda la venta del turno.
 *
 * NO PISA LO CARGADO A MANO SIN AVISAR: devuelve lo que había para que la
 * pantalla lo muestre y el usuario decida. Los dos sistemas conviven, y una
 * diferencia entre el archivo y la carga manual es justamente el tipo de cosa
 * que conviene ver, no resolver en silencio.
 */
export async function guardarVentaDelTurno(
  fecha: string,
  servicio: Servicio,
  venta: number,
  cubiertos: number
): Promise<void> {
  const campoVenta = { mediodia: 'venta_mediodia', noche: 'venta_noche', eventos: 'venta_eventos' }[servicio]
  const campoCub = { mediodia: 'cubiertos_mediodia', noche: 'cubiertos_noche', eventos: 'cubiertos_eventos' }[servicio]

  const { data: hay } = await supabase
    .from('ventas_diarias')
    .select('id')
    .eq('fecha', fecha)
    .maybeSingle()

  const valores = { [campoVenta]: venta, [campoCub]: cubiertos }

  const { error } = hay
    ? await supabase.from('ventas_diarias').update(valores).eq('fecha', fecha)
    : await supabase.from('ventas_diarias').insert({ fecha, ...valores })
  if (error) throw error
}

/** Qué venta hay cargada hoy para ese turno, para comparar contra el archivo */
export async function ventaCargada(
  fecha: string,
  servicio: Servicio
): Promise<{ venta: number; cubiertos: number } | null> {
  const campoVenta = { mediodia: 'venta_mediodia', noche: 'venta_noche', eventos: 'venta_eventos' }[servicio]
  const campoCub = { mediodia: 'cubiertos_mediodia', noche: 'cubiertos_noche', eventos: 'cubiertos_eventos' }[servicio]

  const { data } = await supabase
    .from('ventas_diarias')
    .select(`${campoVenta}, ${campoCub}`)
    .eq('fecha', fecha)
    .maybeSingle()

  if (!data) return null
  return { venta: Number((data as any)[campoVenta]) || 0, cubiertos: Number((data as any)[campoCub]) || 0 }
}
