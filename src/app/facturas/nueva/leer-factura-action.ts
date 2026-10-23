'use server'

import { createClient } from '@/lib/supabase-server'
import type { ArchivoParaLeer, ContextoLectura, LecturaFactura, ResultadoLectura } from '@/lib/leer-factura'

/**
 * Lee la foto de una factura con Claude (ver `src/lib/leer-factura.ts`).
 *
 * Corre en el servidor porque la clave de la API no puede viajar al navegador:
 * quien la tenga gasta a cuenta del restaurante. Por la misma razón se pide
 * sesión iniciada antes de llamar.
 *
 * La respuesta se pide como una "herramienta" con esquema fijo, así vuelve un
 * JSON con los campos esperados. Este modelo no acepta que se la imponga
 * (`tool_choice: tool` da error 400), así que se pide en las instrucciones y,
 * si igual contesta en texto, se busca el JSON adentro.
 */

const MODELO = 'claude-sonnet-5-5'
const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_ARCHIVOS = 3
/** En base64; una foto preparada pesa unos cientos de KB */
const MAX_BYTES = 7_000_000

const INSTRUCCIONES = `Leés facturas de compra de proveedores de un restaurante en Argentina. Respondé SIEMPRE llamando a la herramienta registrar_factura, una sola vez, sin texto aparte.

Reglas:
- En la factura los números vienen en formato argentino (punto de miles, coma decimal: 1.234,56). Devolvelos como números JSON (1234.56).
- precio_unitario es el precio NETO de una unidad, sin IVA y antes del descuento de la línea. Si la línea tiene bonificación o descuento en %, va en descuento_pct.
- Si la factura es B o C los precios suelen incluir IVA: devolvelos como figuran y aclaralo en observaciones.
- cantidad y unidad, tal como figuran en la factura (kg, lt, un, caja, bulto…).
- iva_pct de cada línea si figura (21, 10.5, 0). Si no figura por línea, deducilo del desglose de IVA; si no se puede, null.
- numero con el formato "<letra> <punto de venta>-<número>", con los ceros como figuran. Ejemplo: "A 0015-00565584".
- fecha de emisión en formato YYYY-MM-DD.
- tipo: "nota_credito" si el comprobante es una nota de crédito; si no, "factura".
- percepciones: cada una con su nombre (ej. "PERC IIBB BS AS", "PERC IVA"), porcentaje si figura y monto.
- proveedor: el índice de la lista PROVEEDORES. Buscá primero por CUIT (sin guiones); si no hay CUIT cargado, por razón social o nombre de fantasía. null si no está.
- oc: si hay ORDEN DE COMPRA, el índice del ítem de la orden que corresponde a la línea; null si ese producto no estaba pedido. Cada ítem de la orden se usa una sola vez.
- insumo: el índice del CATÁLOGO que corresponde al producto de la línea; null si ninguno corresponde. Los marcados con * ya se le compraron a este proveedor. Si la línea tiene ítem de OC, el insumo es el de ese ítem.
- confianza: "alta" si el producto es claramente ese insumo, "media" si es probable, "baja" si es una suposición.
- No inventes: lo que no se pueda leer va en null y se menciona en observaciones.`

const ESQUEMA = {
  type: 'object',
  properties: {
    proveedor: { type: ['integer', 'null'] },
    proveedor_texto: { type: ['string', 'null'] },
    cuit: { type: ['string', 'null'] },
    tipo: { type: 'string', enum: ['factura', 'nota_credito'] },
    letra: { type: ['string', 'null'] },
    numero: { type: ['string', 'null'] },
    fecha: { type: ['string', 'null'] },
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descripcion: { type: 'string' },
          cantidad: { type: ['number', 'null'] },
          unidad: { type: ['string', 'null'] },
          precio_unitario: { type: ['number', 'null'] },
          descuento_pct: { type: 'number' },
          iva_pct: { type: ['number', 'null'] },
          subtotal: { type: ['number', 'null'] },
          oc: { type: ['integer', 'null'] },
          insumo: { type: ['integer', 'null'] },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['descripcion', 'cantidad', 'unidad', 'precio_unitario', 'descuento_pct', 'iva_pct', 'subtotal', 'oc', 'insumo', 'confianza'],
      },
    },
    neto: { type: ['number', 'null'] },
    iva_total: { type: ['number', 'null'] },
    percepciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          porcentaje: { type: ['number', 'null'] },
          monto: { type: 'number' },
        },
        required: ['nombre', 'porcentaje', 'monto'],
      },
    },
    total: { type: ['number', 'null'] },
    observaciones: { type: ['string', 'null'] },
  },
  required: ['proveedor', 'proveedor_texto', 'cuit', 'tipo', 'letra', 'numero', 'fecha', 'lineas', 'neto', 'iva_total', 'percepciones', 'total', 'observaciones'],
}

function armarContexto(c: ContextoLectura): string {
  const comprados = new Set(c.compradosAlProveedor)
  const partes = [
    'PROVEEDORES (índice | nombre | CUIT):',
    ...c.proveedores.map((p, i) => `${i} | ${p.nombre} | ${(p.cuit || '').replace(/\D/g, '') || '—'}`),
  ]
  if (c.oc?.length) {
    partes.push('', 'ORDEN DE COMPRA (índice | producto | unidad | cantidad pedida | precio neto pedido):')
    partes.push(...c.oc.map((o, i) => `${i} | ${o.nombre} | ${o.unidad} | ${o.cantidad} | ${o.precio}`))
  }
  if (!c.insumos.length) return partes.join('\n')
  partes.push('', 'CATÁLOGO (índice | insumo | unidad; * = ya comprado a este proveedor):')
  partes.push(...c.insumos.map((x, i) => `${i} | ${x.nombre}${comprados.has(x.id) ? ' *' : ''} | ${x.unidad}`))
  return partes.join('\n')
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export async function leerFactura(archivos: ArchivoParaLeer[], contexto: ContextoLectura): Promise<ResultadoLectura> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return { ok: false, error: 'La sesión venció. Volvé a iniciar sesión.' }

  const clave = process.env.ANTHROPIC_API_KEY
  if (!clave) {
    return { ok: false, error: 'Falta configurar la clave de la API de Anthropic (ANTHROPIC_API_KEY).' }
  }

  if (!archivos.length || archivos.length > MAX_ARCHIVOS) {
    return { ok: false, error: `Subí entre 1 y ${MAX_ARCHIVOS} imágenes de la factura.` }
  }
  if (archivos.some((a) => !TIPOS_ACEPTADOS.includes(a.tipo))) {
    return { ok: false, error: 'Formato no admitido: usá una foto (JPG, PNG) o un PDF.' }
  }
  if (archivos.reduce((s, a) => s + a.datos.length, 0) > MAX_BYTES) {
    return { ok: false, error: 'Las imágenes son demasiado pesadas. Probá con una foto o con un PDF más liviano.' }
  }

  const contenido: any[] = archivos.map((a) =>
    a.tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: a.tipo, data: a.datos } }
      : { type: 'image', source: { type: 'base64', media_type: a.tipo, data: a.datos } }
  )
  contenido.push({
    type: 'text',
    text: `${armarContexto(contexto)}\n\n${archivos.length > 1 ? 'Las imágenes son partes de UNA misma factura.' : ''}Leé la factura y registrala.`,
  })

  let respuesta: Response
  try {
    respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        system: INSTRUCCIONES,
        tools: [{ name: 'registrar_factura', description: 'Registra los datos leídos de la factura', input_schema: ESQUEMA }],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: contenido }],
      }),
    })
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servicio de lectura. Revisá la conexión y probá de nuevo.' }
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null)
    const mensaje: string = cuerpo?.error?.message ?? ''
    console.error('leerFactura:', respuesta.status, mensaje)
    if (respuesta.status === 401) return { ok: false, error: 'La clave de la API de Anthropic no es válida.' }
    if (/credit balance/i.test(mensaje)) return { ok: false, error: 'Se terminó el crédito de la API de Anthropic. Cargá saldo en console.anthropic.com.' }
    if (respuesta.status === 429 || respuesta.status === 529) return { ok: false, error: 'El servicio de lectura está ocupado. Probá de nuevo en un minuto.' }
    return { ok: false, error: `El servicio de lectura respondió con un error (${respuesta.status}).` }
  }

  const datos = await respuesta.json()
  const bloque = (datos.content ?? []).find((b: any) => b.type === 'tool_use')
  let r: any = bloque?.input
  if (!r) {
    // Respaldo: contestó en texto. Se toma el primer objeto JSON que aparezca
    const texto = (datos.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    const desde = texto.indexOf('{')
    const hasta = texto.lastIndexOf('}')
    try { if (desde >= 0 && hasta > desde) r = JSON.parse(texto.slice(desde, hasta + 1)) } catch { /* sigue abajo */ }
  }
  if (!r || !Array.isArray(r.lineas)) return { ok: false, error: 'No se pudo leer la factura. Probá con una foto más nítida.' }

  const proveedor = Number.isInteger(r.proveedor) ? contexto.proveedores[r.proveedor] : undefined
  const lectura: LecturaFactura = {
    proveedorId: proveedor?.id ?? null,
    proveedorTexto: r.proveedor_texto ?? null,
    cuit: r.cuit ?? null,
    tipo: r.tipo === 'nota_credito' ? 'nota_credito' : 'factura',
    letra: r.letra ?? null,
    numero: r.numero ?? null,
    fecha: typeof r.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : null,
    lineas: (r.lineas ?? []).map((l: any) => ({
      descripcion: String(l.descripcion ?? ''),
      cantidad: numero(l.cantidad),
      unidad: l.unidad ?? null,
      precioUnitario: numero(l.precio_unitario),
      descuento: numero(l.descuento_pct) ?? 0,
      iva: numero(l.iva_pct),
      subtotal: numero(l.subtotal),
      ocIndice: Number.isInteger(l.oc) && contexto.oc && l.oc >= 0 && l.oc < contexto.oc.length ? l.oc : null,
      insumoId: Number.isInteger(l.insumo) ? contexto.insumos[l.insumo]?.id ?? null : null,
      confianza: ['alta', 'media', 'baja'].includes(l.confianza) ? l.confianza : 'baja',
    })),
    neto: numero(r.neto),
    ivaTotal: numero(r.iva_total),
    percepciones: (r.percepciones ?? [])
      .filter((p: any) => numero(p.monto))
      .map((p: any) => ({ nombre: String(p.nombre ?? ''), porcentaje: numero(p.porcentaje), monto: p.monto })),
    total: numero(r.total),
    observaciones: r.observaciones ?? null,
  }

  return {
    ok: true,
    lectura,
    uso: { entrada: datos.usage?.input_tokens ?? 0, salida: datos.usage?.output_tokens ?? 0 },
  }
}
