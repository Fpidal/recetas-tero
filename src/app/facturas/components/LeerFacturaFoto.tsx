'use client'

import { useMemo, useRef, useState } from 'react'
import { Camera, Loader2, CheckCircle2, AlertTriangle, X, FileDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatearMoneda, formatearFecha } from '@/lib/formato-numeros'
import { prepararArchivo, type LecturaFactura, type LineaLeida } from '@/lib/leer-factura'
import { leerFactura } from '../nueva/leer-factura-action'

/**
 * "Cargar desde foto" en Nueva factura (V.74). Lee la foto, muestra lo leído
 * para revisar y recién con "Pasar al formulario" completa la factura. Ver
 * `src/lib/leer-factura.ts`.
 *
 * Con OC, cada línea de la foto se busca en la orden: no hay que elegir
 * insumos, y lo que no vino se saca de la factura —como hoy al borrar un ítem—
 * para que el guardado arme la OC de faltantes. Sin OC, cada línea necesita
 * su insumo; Claude sugiere uno y se confirma.
 */

interface ItemOrden {
  insumo_id: string | null
  vino_id: string | null
  insumo_nombre: string
  unidad_medida: string
  cantidad: number
  precio_unitario: number
}

export interface OrdenParaLeer {
  id: string
  fecha: string
  proveedor_id: string
  proveedor_nombre: string
  items: ItemOrden[]
}

export interface LineaAplicada {
  linea: LineaLeida
  insumoId: string | null
  /** Índice en `orden.items`, o null si no estaba pedido */
  ocIndice: number | null
}

const IGNORAR = '__ignorar'
/** Diferencia de redondeo aceptada entre la suma y el total impreso */
const TOLERANCIA_TOTAL = 5

const fmt = (v: number) => formatearMoneda(v, true, 2)
const cant = (v: number | null) => (v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: 3 }))

export default function LeerFacturaFoto({
  proveedores, insumos, orden, ordenesPendientes, proveedorId, onAsociarOrden, onAplicar,
}: {
  proveedores: { id: string; nombre: string; cuit?: string | null }[]
  insumos: { id: string; nombre: string; unidad_medida: string }[]
  orden: OrdenParaLeer | null
  ordenesPendientes: OrdenParaLeer[]
  /** Proveedor ya elegido en el formulario, si hay */
  proveedorId: string
  onAsociarOrden: (orden: OrdenParaLeer) => void
  onAplicar: (lectura: LecturaFactura, lineas: LineaAplicada[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<'inicio' | 'leyendo' | 'revisar'>('inicio')
  const [error, setError] = useState<string | null>(null)
  const [miniaturas, setMiniaturas] = useState<string[]>([])
  const [lectura, setLectura] = useState<LecturaFactura | null>(null)
  const [uso, setUso] = useState<{ entrada: number; salida: number } | null>(null)
  /** Insumo elegido por línea (índice de línea → id o IGNORAR) */
  const [elegidos, setElegidos] = useState<Record<number, string>>({})
  const [comprados, setComprados] = useState<Set<string>>(new Set())

  const nombreInsumo = useMemo(() => new Map(insumos.map((i) => [i.id, i.nombre])), [insumos])

  async function insumosComprados(provId: string): Promise<string[]> {
    if (!provId) return []
    const { data } = await supabase
      .from('facturas_proveedor')
      .select('factura_items (insumo_id)')
      .eq('proveedor_id', provId)
      .eq('activo', true)
      .order('fecha', { ascending: false })
      .limit(60)
    const ids = new Set<string>()
    ;(data ?? []).forEach((f: any) => (f.factura_items ?? []).forEach((it: any) => it.insumo_id && ids.add(it.insumo_id)))
    return Array.from(ids)
  }

  async function alElegirArchivos(lista: FileList | null) {
    if (!lista?.length) return
    const files = Array.from(lista).slice(0, 3)
    setError(null)
    setEstado('leyendo')
    setMiniaturas(files.filter((f) => f.type.startsWith('image/')).map((f) => URL.createObjectURL(f)))
    try {
      const provContexto = orden?.proveedor_id || proveedorId
      const [archivos, compradosIds] = await Promise.all([
        Promise.all(files.map(prepararArchivo)),
        insumosComprados(provContexto),
      ])
      const r = await leerFactura(archivos, {
        proveedores,
        oc: orden ? orden.items.map((i) => ({ nombre: i.insumo_nombre, unidad: i.unidad_medida, cantidad: i.cantidad, precio: i.precio_unitario })) : null,
        // Con OC sólo lo ya comprado al proveedor, por si vino algo que no se pidió
        insumos: insumos
          .filter((i) => !orden || compradosIds.includes(i.id))
          .map((i) => ({ id: i.id, nombre: i.nombre, unidad: i.unidad_medida })),
        compradosAlProveedor: compradosIds,
      })
      if (!r.ok) {
        setError(r.error)
        setEstado('inicio')
        return
      }
      // Si el proveedor salió de la foto, se buscan sus compras para marcar lo ya conocido
      const provLeido = r.lectura.proveedorId
      setComprados(new Set(provLeido && provLeido !== provContexto ? await insumosComprados(provLeido) : compradosIds))
      const iniciales: Record<number, string> = {}
      r.lectura.lineas.forEach((l, i) => {
        const deOC = l.ocIndice != null ? orden?.items[l.ocIndice] : undefined
        const id = deOC?.insumo_id ?? l.insumoId
        if (id) iniciales[i] = id
      })
      setElegidos(iniciales)
      setLectura(r.lectura)
      setUso(r.uso)
      setEstado('revisar')
    } catch (e: any) {
      setError(e?.message || 'No se pudo leer la factura.')
      setEstado('inicio')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function descartar() {
    miniaturas.forEach((u) => URL.revokeObjectURL(u))
    setMiniaturas([])
    setLectura(null)
    setElegidos({})
    setUso(null)
    setEstado('inicio')
  }

  /**
   * Con qué ítem de la OC va cada línea: el que dijo Claude o, si la OC se
   * asoció después de leer, el del mismo insumo. Cada ítem se usa una vez.
   */
  const ocPorLinea = useMemo(() => {
    const res: (number | null)[] = []
    if (!lectura || !orden) return lectura?.lineas.map(() => null) ?? []
    const usados = new Set<number>()
    lectura.lineas.forEach((l) => { if (l.ocIndice != null) usados.add(l.ocIndice) })
    lectura.lineas.forEach((l, i) => {
      if (l.ocIndice != null) { res[i] = l.ocIndice; return }
      const elegido = elegidos[i]
      const idx = orden.items.findIndex((it, k) => !usados.has(k) && elegido && it.insumo_id === elegido)
      if (idx >= 0) { usados.add(idx); res[i] = idx } else res[i] = null
    })
    return res
  }, [lectura, orden, elegidos])

  if (estado === 'inicio') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Camera className="w-5 h-5 text-terracotta flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900">Cargar desde foto</p>
              <p className="text-sm text-gray-500">
                {orden
                  ? 'Sacale una foto a la factura: se compara línea por línea con la orden elegida.'
                  : 'Sacale una foto o subí la imagen o el PDF. Si viene de una OC, importala antes.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-terracotta text-terracotta px-4 py-2 text-sm font-medium hover:bg-terracotta/5"
          >
            <Camera className="w-4 h-4" /> Elegir foto
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => alElegirArchivos(e.target.files)}
          />
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}
      </div>
    )
  }

  if (estado === 'leyendo' || !lectura) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6 flex items-center gap-4">
        {miniaturas[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={miniaturas[0]} alt="" className="w-14 h-20 object-cover rounded border border-gray-200" />
        )}
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-terracotta" />
          Leyendo la factura… tarda unos segundos.
        </div>
      </div>
    )
  }

  // ── Revisión ──────────────────────────────────────────────────────────────
  const provNombre = proveedores.find((p) => p.id === lectura.proveedorId)?.nombre
  const otroProveedor = orden && lectura.proveedorId && lectura.proveedorId !== orden.proveedor_id
  const pendientesDelProveedor = !orden && lectura.proveedorId
    ? ordenesPendientes.filter((o) => o.proveedor_id === lectura.proveedorId)
    : []

  const lineasActivas = lectura.lineas.map((l, i) => ({ l, i })).filter(({ i }) => elegidos[i] !== IGNORAR)
  const faltanInsumo = lineasActivas.filter(({ i }) => !elegidos[i] && ocPorLinea[i] == null).length
  const ocUsados = new Set(ocPorLinea.filter((x): x is number => x != null))
  const noVinieron = orden ? orden.items.filter((_, k) => !ocUsados.has(k)) : []

  // Control: lo que suman las líneas contra el total impreso
  const netoCalc = lineasActivas.reduce((s, { l }) => s + (l.cantidad ?? 0) * (l.precioUnitario ?? 0) * (1 - (l.descuento || 0) / 100), 0)
  const ivaCalc = lineasActivas.reduce((s, { l }) => s + (l.cantidad ?? 0) * (l.precioUnitario ?? 0) * (1 - (l.descuento || 0) / 100) * ((l.iva ?? 21) / 100), 0)
  const percCalc = lectura.percepciones.reduce((s, p) => s + p.monto, 0)
  const totalCalc = netoCalc + ivaCalc + percCalc
  const difTotal = lectura.total != null ? totalCalc - lectura.total : null
  const ignoradas = lectura.lineas.length - lineasActivas.length

  function chip(i: number, l: LineaLeida) {
    if (elegidos[i] === IGNORAR) return <span className="text-[10.5px] text-gray-400">No se carga</span>
    if (ocPorLinea[i] != null) return <span className="text-[10.5px] font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">En la OC</span>
    const id = elegidos[i]
    if (!id) return <span className="text-[10.5px] font-semibold text-red-700 bg-red-50 rounded-full px-2 py-0.5">Elegir insumo</span>
    if (comprados.has(id) && l.confianza !== 'baja') return <span className="text-[10.5px] font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">Comprado antes</span>
    return <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">¿Es este? Revisá</span>
  }

  return (
    <div className="bg-white rounded-lg border border-terracotta/40 shadow-sm p-4 sm:p-5 mb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {miniaturas[0] && (
            <a href={miniaturas[0]} target="_blank" rel="noreferrer" title="Ver la foto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={miniaturas[0]} alt="Foto de la factura" className="w-14 h-20 object-cover rounded border border-gray-200 flex-shrink-0" />
            </a>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Lo que se leyó de la factura</p>
            <p className="text-sm text-gray-600">
              {provNombre ?? <span className="text-amber-700">Proveedor no encontrado: {lectura.proveedorTexto ?? 'sin nombre'}</span>}
              {' · '}<span className="font-mono">{lectura.numero ?? 'sin número'}</span>
              {' · '}<span className="font-mono">{lectura.fecha ? formatearFecha(lectura.fecha) : 'sin fecha'}</span>
              {lectura.tipo === 'nota_credito' && <span className="text-red-700"> · Nota de crédito</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Nada se guarda hasta que pases los datos al formulario y guardes la factura.</p>
          </div>
        </div>
        <button onClick={descartar} className="p-1 text-gray-400 hover:text-gray-700" title="Descartar la lectura">
          <X className="w-5 h-5" />
        </button>
      </div>

      {lectura.observaciones && (
        <div className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{lectura.observaciones}</span>
        </div>
      )}
      {otroProveedor && (
        <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          La factura dice {lectura.proveedorTexto || provNombre}{lectura.cuit ? ` (CUIT ${lectura.cuit})` : ''} y la orden es de {orden!.proveedor_nombre}.
          Si es el mismo proveedor con otro nombre, seguí: la factura queda a nombre de {orden!.proveedor_nombre}. Para que no vuelva a aparecer, cargá el CUIT en su ficha.
        </div>
      )}
      {pendientesDelProveedor.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          <span>Hay {pendientesDelProveedor.length === 1 ? 'una orden enviada' : `${pendientesDelProveedor.length} órdenes enviadas`} de {provNombre}. Si la factura viene de una, asociala para comparar.</span>
          <div className="flex flex-wrap gap-2">
            {pendientesDelProveedor.slice(0, 3).map((o) => (
              <button key={o.id} onClick={() => onAsociarOrden(o)} className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-blue-100">
                <FileDown className="w-3.5 h-3.5" /> OC del {formatearFecha(o.fecha)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <th className="text-left font-semibold px-3 py-2">Como dice la factura</th>
              <th className="text-left font-semibold px-3 py-2">Insumo</th>
              <th className="text-right font-semibold px-2 py-2">Cant.</th>
              <th className="text-right font-semibold px-2 py-2">Precio</th>
              <th className="text-right font-semibold px-2 py-2">Dto</th>
              <th className="text-right font-semibold px-2 py-2">IVA</th>
              {orden && <th className="text-right font-semibold px-3 py-2">Contra la OC</th>}
            </tr>
          </thead>
          <tbody>
            {lectura.lineas.map((l, i) => {
              const k = ocPorLinea[i]
              const itemOC = k != null ? orden?.items[k] : undefined
              const varPrecio = itemOC && itemOC.precio_unitario > 0 && l.precioUnitario != null
                ? ((l.precioUnitario * (1 - (l.descuento || 0) / 100) - itemOC.precio_unitario) / itemOC.precio_unitario) * 100
                : null
              const ignorada = elegidos[i] === IGNORAR
              return (
                <tr key={i} className={`border-t border-gray-100 align-top ${ignorada ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{l.descripcion}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {itemOC ? (
                        <span className="text-gray-900">{itemOC.insumo_nombre}</span>
                      ) : (
                        <select
                          value={elegidos[i] ?? ''}
                          onChange={(e) => setElegidos((prev) => ({ ...prev, [i]: e.target.value }))}
                          className={`w-full max-w-[240px] rounded border px-1.5 py-1 text-xs bg-white ${elegidos[i] ? 'border-gray-300' : 'border-red-300'}`}
                        >
                          <option value="">Elegir insumo…</option>
                          <option value={IGNORAR}>No cargar esta línea</option>
                          {insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad_medida})</option>)}
                        </select>
                      )}
                      {chip(i, l)}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{cant(l.cantidad)} {l.unidad ?? ''}</td>
                  <td className="px-2 py-2 text-right font-mono">{l.precioUnitario != null ? fmt(l.precioUnitario) : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono">{l.descuento ? `${cant(l.descuento)}%` : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono">{l.iva != null ? `${cant(l.iva)}%` : '—'}</td>
                  {orden && (
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {itemOC ? (
                        <>
                          <div className={varPrecio == null || Math.abs(varPrecio) < 0.5 ? 'text-gray-500' : varPrecio > 0 ? 'text-red-700' : 'text-green-700'}>
                            {varPrecio == null || Math.abs(varPrecio) < 0.5 ? 'al precio' : `${varPrecio > 0 ? '+' : '−'}${cant(Math.abs(Math.round(varPrecio * 10) / 10))}%`}
                          </div>
                          {l.cantidad != null && l.cantidad !== itemOC.cantidad && (
                            <div className="text-[10.5px] text-amber-700">pedido {cant(itemOC.cantidad)}</div>
                          )}
                        </>
                      ) : !ignorada ? (
                        <span className="text-[10.5px] font-sans text-amber-700">No estaba en la OC</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {noVinieron.length > 0 && (
        <p className="text-sm text-gray-600">
          <b className="text-gray-800">No figuran en la factura:</b> {noVinieron.map((x) => x.insumo_nombre).join(', ')}.
          Se sacan de la factura y, al guardar, van a la OC de faltantes como siempre.
        </p>
      )}

      {difTotal == null ? (
        <div className="flex gap-2 text-sm text-amber-800 bg-amber-50 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> No se pudo leer el total de la factura: controlalo a mano.
        </div>
      ) : Math.abs(difTotal) <= TOLERANCIA_TOTAL ? (
        <div className="flex gap-2 text-sm text-green-800 bg-green-50 rounded-md px-3 py-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          La suma de las líneas da el total impreso: <span className="font-mono">{fmt(lectura.total!)}</span>.
        </div>
      ) : (
        <div className="flex gap-2 text-sm text-red-800 bg-red-50 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            La suma de las líneas da <span className="font-mono">{fmt(totalCalc)}</span> y la factura dice{' '}
            <span className="font-mono">{fmt(lectura.total!)}</span>: <span className="font-mono">{fmt(Math.abs(difTotal))}</span> de diferencia
            {ignoradas > 0 ? ` (hay ${ignoradas} ${ignoradas === 1 ? 'línea' : 'líneas'} sin cargar)` : ''}. Revisá cantidades y precios contra la foto.
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-gray-400 font-mono">
          {uso ? `Lectura: ${uso.entrada.toLocaleString('es-AR')} tokens de entrada · ${uso.salida.toLocaleString('es-AR')} de salida` : ''}
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {faltanInsumo > 0 && <span className="text-xs text-red-700">Falta elegir el insumo de {faltanInsumo} {faltanInsumo === 1 ? 'línea' : 'líneas'}</span>}
          <button onClick={descartar} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Descartar</button>
          <button
            disabled={faltanInsumo > 0 || lineasActivas.length === 0}
            onClick={() => {
              onAplicar(
                lectura,
                lineasActivas.map(({ l, i }) => ({
                  linea: l,
                  ocIndice: ocPorLinea[i] ?? null,
                  insumoId: ocPorLinea[i] != null ? orden!.items[ocPorLinea[i]!].insumo_id : elegidos[i] || null,
                }))
              )
              descartar()
            }}
            className="rounded-lg bg-terracotta text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Pasar al formulario
          </button>
        </div>
      </div>
    </div>
  )
}
