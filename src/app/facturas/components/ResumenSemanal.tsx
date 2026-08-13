'use client'

import { useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, PackageX, TrendingUp, AlertCircle,
  PlusCircle, Clock, CheckCircle2, FileDown,
} from 'lucide-react'
import {
  auditarSemana, ultimaSemanaCerrada, correrSemana, aISO,
  obtenerNotas, guardarNota, claveNota,
  UMBRAL_PRECIO, DIAS_SIN_FACTURA,
  type AuditoriaSemanal, type BloqueAuditoria, type MapaNotas,
} from '@/lib/auditoria-semanal'
import NotaLinea from './NotaLinea'
import { generarPDFResumenSemanal } from '@/lib/generar-pdf-resumen-semanal'
import { formatearMoneda, formatearFecha } from '@/lib/formato-numeros'

const fmt = (v: number) => formatearMoneda(v, true, 0)
const cant = (v: number) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 3 })

export default function ResumenSemanal() {
  const [semana, setSemana] = useState(ultimaSemanaCerrada)
  const [data, setData] = useState<AuditoriaSemanal | null>(null)
  const [notas, setNotas] = useState<MapaNotas>(new Map())
  const [cargando, setCargando] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    Promise.all([auditarSemana(semana.desde, semana.hasta), obtenerNotas(semana.desde)])
      .then(([d, n]) => { if (!cancelado) { setData(d); setNotas(n) } })
      .catch((e) => console.error('Error auditando la semana:', e))
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [semana])

  /** Guarda la nota y la refleja en pantalla sin recargar toda la semana */
  async function handleNota(bloque: BloqueAuditoria, ref: string, texto: string) {
    await guardarNota(semana.desde, bloque, ref, texto)
    setNotas((prev) => {
      const copia = new Map(prev)
      const k = claveNota(bloque, ref)
      if (texto.trim()) copia.set(k, texto.trim())
      else copia.delete(k)
      return copia
    })
  }

  const nota = (bloque: BloqueAuditoria, ref: string) => notas.get(claveNota(bloque, ref)) ?? ''

  // No tiene sentido navegar a semanas que todavía no terminaron
  const esUltimaCerrada = semana.desde === ultimaSemanaCerrada().desde

  async function handlePDF() {
    if (!data) return
    try {
      setGenerandoPDF(true)
      await generarPDFResumenSemanal(data, notas)
    } catch (e) {
      console.error('Error generando PDF:', e)
      alert('Error al generar el PDF')
    } finally {
      setGenerandoPDF(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Navegación de semana */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSemana(correrSemana(semana.desde, -1))}
              className="p-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-[9rem]">
              <div className="text-[10px] uppercase text-gray-400 font-semibold">Semana</div>
              <div className="text-sm font-semibold text-gray-900 font-mono">
                {formatearFecha(semana.desde)} — {formatearFecha(semana.hasta)}
              </div>
            </div>
            <button
              onClick={() => setSemana(correrSemana(semana.desde, 1))}
              disabled={esUltimaCerrada}
              className="p-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title={esUltimaCerrada ? 'Es la última semana cerrada' : 'Semana siguiente'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!esUltimaCerrada && (
              <button
                onClick={() => setSemana(ultimaSemanaCerrada())}
                className="ml-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md border border-gray-300"
              >
                Última
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <div className="hidden sm:block text-right">
                <div className="text-[10px] uppercase text-gray-400 font-semibold">Compras</div>
                <div className="text-sm font-bold text-gray-900 font-mono">{fmt(data.comprasSemana)}</div>
                <div className="text-[10px] text-gray-400 font-mono">
                  {data.cantidadFacturas} comprobantes
                </div>
              </div>
            )}
            <button
              onClick={handlePDF}
              disabled={!data || cargando || generandoPDF}
              title="Descargar el resumen en PDF"
              className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">{generandoPDF ? 'Generando...' : 'PDF'}</span>
            </button>
          </div>
        </div>
      </div>

      {cargando || !data ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
          Revisando la semana...
        </div>
      ) : data.sinNovedades ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-900">Semana sin novedades</p>
          <p className="text-xs text-green-700 mt-1">
            Todo llegó completo, a precio, y no hay órdenes esperando factura.
          </p>
        </div>
      ) : (
        <>
          {/* Sin importe: lo que no llegó tampoco se pagó, así que poner plata
              acá haría pensar en una pérdida que no existe. El problema es de
              mercadería faltante, no de dinero. Igual se ordena por monto, que
              sirve para poner arriba lo que más importa. */}
          <Bloque
            titulo="No llegó completo"
            icono={<PackageX className="w-4 h-4" />}
            color="red"
            cantidad={data.faltantes.length}
          >
            {data.faltantes.map((f, i) => (
              <Fila
                key={i}
                nota={
                  <NotaLinea
                    valor={nota('faltante', f.ref)}
                    onGuardar={(t) => handleNota('faltante', f.ref, t)}
                    placeholder="¿por qué no llegó?"
                  />
                }
              >
                <Principal nombre={f.nombre} detalle={`${f.proveedor} · ${f.factura}`} />
                <div className="text-right whitespace-nowrap">
                  <div className="text-xs font-mono text-gray-500">
                    pediste {cant(f.pedido)} {f.unidad}
                  </div>
                  <div className="text-sm font-mono font-semibold text-red-600">
                    {f.recibido === 0 ? 'no llegó' : `llegó ${cant(f.recibido)} ${f.unidad}`}
                  </div>
                </div>
              </Fila>
            ))}
          </Bloque>

          <Bloque
            titulo="Cambios de precio"
            icono={<TrendingUp className="w-4 h-4" />}
            color="amber"
            cantidad={data.cambiosPrecio.length}
            nota={`Contra lo que se venía pagando. Cambios de más de ${UMBRAL_PRECIO}%, para arriba o para abajo. Si además cambió el proveedor, se aclara cuál era el anterior.`}
          >
            {data.cambiosPrecio.map((c, i) => {
              const subio = c.variacion > 0
              return (
                <Fila
                  key={i}
                  nota={
                    <NotaLinea
                      valor={nota('cambio_precio', c.ref)}
                      onGuardar={(t) => handleNota('cambio_precio', c.ref, t)}
                      placeholder="¿por qué cambió? ej: es de mejor calidad, hacía meses que no se compraba"
                    />
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate">{c.nombre}</div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {c.proveedor}
                      {c.subasEnDosMeses > 1 && (
                        <span className={c.subasEnDosMeses > 2 ? 'text-red-600 font-medium' : ''}>
                          {' · '}{c.subasEnDosMeses}ª suba en 2 meses
                        </span>
                      )}
                    </div>
                    {/* Solo si se le compró a otro: ahí la pregunta cambia */}
                    {c.proveedorAnterior && (
                      <div className="text-[11px] text-blue-700 font-medium truncate">
                        ⇄ antes se le compraba a {c.proveedorAnterior}
                      </div>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-xs font-mono text-gray-500">
                      {fmt(c.precioAnterior)} → {fmt(c.precioNuevo)}
                    </div>
                    <div className={`text-sm font-bold font-mono ${subio ? 'text-amber-700' : 'text-green-700'}`}>
                      {subio ? '+' : ''}{c.variacion.toFixed(1)}%
                    </div>
                  </div>
                </Fila>
              )
            })}
          </Bloque>

          <Bloque
            titulo="Precio distinto al pedido"
            icono={<AlertCircle className="w-4 h-4" />}
            color="orange"
            cantidad={data.preciosDistintos.length}
            total={data.preciosDistintos.reduce((s, p) => s + p.impacto, 0)}
            etiquetaTotal="de más"
            nota="Lo que se facturó contra lo que decía la orden de compra."
          >
            {data.preciosDistintos.map((p, i) => (
              <Fila
                key={i}
                nota={
                  <NotaLinea
                    valor={nota('precio_distinto', p.ref)}
                    onGuardar={(t) => handleNota('precio_distinto', p.ref, t)}
                    placeholder="¿se acordó este precio?"
                  />
                }
              >
                <Principal nombre={p.nombre} detalle={`${p.proveedor} · ${p.factura}`} />
                <div className="text-right">
                  <div className="text-xs font-mono text-gray-500">
                    pedido {fmt(p.precioPedido)} · facturado {fmt(p.precioFacturado)}
                  </div>
                  <div className={`text-sm font-bold font-mono ${p.impacto > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                    {p.variacion > 0 ? '+' : ''}{p.variacion.toFixed(1)}% · {p.impacto > 0 ? '+' : ''}{fmt(p.impacto)}
                  </div>
                </div>
              </Fila>
            ))}
          </Bloque>

          <Bloque
            titulo="Llegó sin pedir"
            icono={<PlusCircle className="w-4 h-4" />}
            color="blue"
            cantidad={data.agregados.length}
            total={data.agregados.reduce((s, a) => s + a.monto, 0)}
            etiquetaTotal="agregado"
          >
            {data.agregados.map((a, i) => (
              <Fila
                key={i}
                nota={
                  <NotaLinea
                    valor={nota('agregado', a.ref)}
                    onGuardar={(t) => handleNota('agregado', a.ref, t)}
                    placeholder="¿quién lo pidió?"
                  />
                }
              >
                <Principal nombre={a.nombre} detalle={`${a.proveedor} · ${a.factura}`} />
                <div className="text-right">
                  <div className="text-xs font-mono text-gray-500">{cant(a.cantidad)} {a.unidad}</div>
                  <div className="text-sm font-bold text-blue-700 font-mono">{fmt(a.monto)}</div>
                </div>
              </Fila>
            ))}
          </Bloque>

          <Bloque
            titulo="Órdenes sin factura"
            icono={<Clock className="w-4 h-4" />}
            color="gray"
            cantidad={data.ordenesSinFactura.length}
            total={data.ordenesSinFactura.reduce((s, o) => s + o.total, 0)}
            etiquetaTotal="sin facturar"
            nota={`Órdenes enviadas o parciales con más de ${DIAS_SIN_FACTURA} días. No incluye borradores ni canceladas.`}
          >
            {data.ordenesSinFactura.map((o, i) => (
              <Fila
                key={i}
                nota={
                  <NotaLinea
                    valor={nota('orden_sin_factura', o.ref)}
                    onGuardar={(t) => handleNota('orden_sin_factura', o.ref, t)}
                    placeholder="¿se reclamó?"
                  />
                }
              >
                <Principal nombre={o.numero} detalle={`${o.proveedor} · ${formatearFecha(o.fecha)}`} />
                <div className="text-right">
                  <div className="text-xs font-mono text-gray-500">hace {o.diasEsperando} días</div>
                  <div className="text-sm font-bold text-gray-700 font-mono">{fmt(o.total)}</div>
                </div>
              </Fila>
            ))}
          </Bloque>
        </>
      )}
    </div>
  )
}

// =====================================================
// Piezas
// =====================================================

const COLORES = {
  red: 'bg-red-50 text-red-800 border-red-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  orange: 'bg-orange-50 text-orange-800 border-orange-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
}

/** Un bloque no se muestra si no tiene nada: la lista corta es la que se lee. */
function Bloque({
  titulo, icono, color, cantidad, total, etiquetaTotal, nota, children,
}: {
  titulo: string
  icono: React.ReactNode
  color: keyof typeof COLORES
  cantidad: number
  total?: number
  etiquetaTotal?: string
  nota?: string
  children: React.ReactNode
}) {
  if (cantidad === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 ${COLORES[color]}`}>
        <div className="flex items-center gap-2">
          {icono}
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <span className="text-xs opacity-70 font-mono">({cantidad})</span>
        </div>
        {total !== undefined && total !== 0 && (
          <div className="text-right">
            <div className="text-sm font-bold font-mono">{fmt(Math.abs(total))}</div>
            {etiquetaTotal && <div className="text-[10px] opacity-70">{etiquetaTotal}</div>}
          </div>
        )}
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
      {nota && (
        <p className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">{nota}</p>
      )}
    </div>
  )
}

function Fila({ children, nota }: { children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-3">{children}</div>
      {nota}
    </div>
  )
}

function Principal({ nombre, detalle, destacar }: { nombre: string; detalle: string; destacar?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-sm text-gray-900 truncate">{nombre}</div>
      <div className={`text-[11px] truncate ${destacar ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
        {detalle}
      </div>
    </div>
  )
}
