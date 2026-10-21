import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Los datos del restaurante: nombre, razón social, domicilio, logo.
 *
 * POR QUÉ EXISTE: hasta V.63 vivían escritos a mano — la razón social y el
 * CUIT en generar-pdf-oc.ts, "Tero Restó" en unos diez lugares, y el logo de
 * los PDF era "el primer archivo del bucket fotos platos", copiado en cinco
 * generadores. Ahora salen de la tabla `restaurantes` (supabase-restaurantes.sql)
 * y se editan desde Configuración → Empresa.
 *
 * Hoy hay una sola fila. Cuando llegue el multiusuario, el perfil va a decir
 * de qué restaurante es cada uno y esta lectura filtra por eso: es el único
 * lugar que hay que tocar.
 */

export interface Empresa {
  id: string
  nombre_fantasia: string
  razon_social: string | null
  cuit: string | null
  condicion_iva: string | null
  direccion: string | null
  localidad: string | null
  codigo_postal: string | null
  provincia: string | null
  telefono: string | null
  email_compras: string | null
  horario_entrega: string | null
  condiciones_oc: string | null
  logo: string | null
  /** El logo va en el encabezado de la orden de compra */
  logo_en_oc: boolean
  /** El logo va en los informes internos (consumo, resúmenes, cierre de mes) */
  logo_en_informes: boolean
  // Objetivos (V.65). Ver useObjetivos()
  objetivo_fc_cocina: number
  objetivo_bc_tragos: number
  objetivo_costo_vinos: number
  objetivo_incidencia: number
  tolerancia_incidencia: number
}

export const COLUMNAS_EMPRESA =
  'id, nombre_fantasia, razon_social, cuit, condicion_iva, direccion, localidad, codigo_postal, provincia, telefono, email_compras, horario_entrega, condiciones_oc, logo, logo_en_oc, logo_en_informes, objetivo_fc_cocina, objetivo_bc_tragos, objetivo_costo_vinos, objetivo_incidencia, tolerancia_incidencia'

export const CONDICIONES_IVA = ['Responsable inscripto', 'Monotributo', 'Exento']

// Una lectura por sesión: el nombre lo piden el menú y cada PDF, y no cambia
// salvo que se guarde Configuración, que llama a invalidarEmpresa().
let cache: Promise<Empresa> | null = null

/**
 * Lee los datos de la empresa. Si no puede, FALLA en vez de devolver vacío:
 * una orden de compra sin razón social ni domicilio no se tiene que mandar.
 */
export function obtenerEmpresa(): Promise<Empresa> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabase
        .from('restaurantes')
        .select(COLUMNAS_EMPRESA)
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`No se pudieron leer los datos de la empresa: ${error.message}`)
      if (!data) throw new Error('No hay datos de la empresa cargados. Completalos en Configuración → Empresa.')
      return data as Empresa
    })()
    // Si falla, que el próximo intento vuelva a consultar
    cache.catch(() => { cache = null })
  }
  return cache
}

const EVENTO_ACTUALIZADA = 'empresa-actualizada'

/** Después de guardar Configuración: olvida la lectura y avisa al menú. */
export function invalidarEmpresa() {
  cache = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ACTUALIZADA))
}

/** Nombre para el menú y los pies de página. Vacío mientras carga. */
export function useNombreEmpresa(): string {
  const [nombre, setNombre] = useState('')
  useEffect(() => {
    let vivo = true
    const leer = () => {
      obtenerEmpresa()
        .then((e) => { if (vivo) setNombre(e.nombre_fantasia) })
        .catch(() => {})
    }
    leer()
    window.addEventListener(EVENTO_ACTUALIZADA, leer)
    return () => {
      vivo = false
      window.removeEventListener(EVENTO_ACTUALIZADA, leer)
    }
  }, [])
  return nombre
}

/**
 * Los objetivos de costo del restaurante, de Configuración → Objetivos.
 *
 * Son el valor con el que ARRANCA un plato, trago o vino nuevo —cada uno
 * después tiene el suyo, y cambiar estos no lo toca— y el semáforo de la
 * incidencia real en Ventas y Análisis. Hasta V.65 estaban escritos en unos
 * 40 lugares, y no siempre iguales: 30 en Carta, 25 en Tragos, 30 en Vinos.
 */
export interface Objetivos {
  /** Food cost de platos y menús nuevos, en % */
  fcCocina: number
  /** Beverage cost de tragos nuevos, en % */
  bcTragos: number
  /** Costo sobre precio de vinos nuevos en carta, en % */
  costoVinos: number
  /** Incidencia real objetivo: hasta acá es verde */
  incidencia: number
  /** Puntos por encima del objetivo que todavía son amarillo */
  tolerancia: number
}

/** Mientras cargan, y si la lectura falla: los mismos valores que trae la base */
export const OBJETIVOS_POR_DEFECTO: Objetivos = {
  fcCocina: 25, bcTragos: 25, costoVinos: 40, incidencia: 30, tolerancia: 5,
}

export function objetivosDe(e: Empresa): Objetivos {
  const n = (v: unknown, def: number) => (v == null || isNaN(Number(v)) ? def : Number(v))
  const d = OBJETIVOS_POR_DEFECTO
  return {
    fcCocina: n(e.objetivo_fc_cocina, d.fcCocina),
    bcTragos: n(e.objetivo_bc_tragos, d.bcTragos),
    costoVinos: n(e.objetivo_costo_vinos, d.costoVinos),
    incidencia: n(e.objetivo_incidencia, d.incidencia),
    tolerancia: n(e.tolerancia_incidencia, d.tolerancia),
  }
}

/**
 * Los objetivos para usar en una pantalla. `cargado` pasa a true cuando llegan
 * de la base: los formularios de alta lo usan para poner el valor inicial una
 * sola vez, sin pisar lo que el usuario ya tipeó.
 */
export function useObjetivos(): Objetivos & { cargado: boolean } {
  const [obj, setObj] = useState<Objetivos & { cargado: boolean }>({ ...OBJETIVOS_POR_DEFECTO, cargado: false })
  useEffect(() => {
    let vivo = true
    const leer = () => {
      obtenerEmpresa()
        .then((e) => { if (vivo) setObj({ ...objetivosDe(e), cargado: true }) })
        .catch(() => { if (vivo) setObj((o) => ({ ...o, cargado: true })) })
    }
    leer()
    window.addEventListener(EVENTO_ACTUALIZADA, leer)
    return () => {
      vivo = false
      window.removeEventListener(EVENTO_ACTUALIZADA, leer)
    }
  }, [])
  return obj
}

/** Las condiciones de la OC, una por renglón, sin renglones vacíos. */
export function condicionesOC(empresa: Empresa): string[] {
  return (empresa.condiciones_oc || '')
    .split('\n')
    .map((c) => c.trim())
    .filter(Boolean)
}

/** "Tero Restó (Oret SRL)", o sólo el nombre si no hay razón social. */
export function nombreConRazonSocial(empresa: Empresa): string {
  return empresa.razon_social
    ? `${empresa.nombre_fantasia} (${empresa.razon_social})`
    : empresa.nombre_fantasia
}

/** Formato de imagen para jsPDF.addImage, según el data URL. */
export function formatoLogo(logo: string): 'PNG' | 'JPEG' {
  return logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
}

/**
 * Nombre y logo para el encabezado de los informes internos (consumo, cierre
 * de mes, resúmenes). A diferencia de la OC, no van al proveedor: si no se
 * pueden leer los datos, el informe sale igual, sin logo y sin nombre.
 */
export async function datosMarcaPDF(): Promise<{
  nombre: string
  /** Ya en blanco y con su proporción, para la franja terracota */
  logo: { imagen: string; proporcion: number } | null
}> {
  try {
    const e = await obtenerEmpresa()
    const logo = e.logo && e.logo_en_informes ? await logoParaFranja(e.logo) : null
    return { nombre: e.nombre_fantasia, logo }
  } catch {
    return { nombre: '', logo: null }
  }
}

/**
 * El logo listo para ir sobre la franja terracota de un PDF: teñido de blanco
 * y con su proporción real.
 *
 * Los PDF lo dibujaban en un cuadrado fijo de 20 × 20 mm, así que un logo
 * apaisado salía aplastado, y uno negro quedaba oscuro sobre el terracota.
 * El teñido conserva la forma (el canal alfa) y pinta todo lo visible de
 * blanco: por eso el logo tiene que tener fondo transparente.
 */
export function logoParaFranja(logo: string): Promise<{ imagen: string; proporcion: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onerror = () => resolve(null)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) return resolve(null)
      ctx.drawImage(img, 0, 0)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      resolve({ imagen: canvas.toDataURL('image/png'), proporcion: canvas.width / canvas.height })
    }
    img.src = logo
  })
}

/** Ancho y alto para que el logo entre en una caja sin deformarse */
export function encajarLogo(proporcion: number, anchoMax: number, altoMax: number) {
  const ancho = Math.min(anchoMax, altoMax * proporcion)
  return { ancho, alto: ancho / proporcion }
}

/**
 * Semáforo de un costo contra su objetivo: verde si cumple, amarillo hasta
 * `tolerancia` puntos arriba, rojo después. Es la regla de Carta y Menús.
 * Tragos y Vinos tenían el corte escrito a mano (22/28% y 40% fijo) y no
 * miraban el objetivo de cada uno (V.65).
 */
export function estadoContraObjetivo(
  porcentaje: number,
  objetivo: number,
  tolerancia = 5,
): 'ok' | 'warning' | 'danger' {
  if (porcentaje <= objetivo) return 'ok'
  if (porcentaje <= objetivo + tolerancia) return 'warning'
  return 'danger'
}
