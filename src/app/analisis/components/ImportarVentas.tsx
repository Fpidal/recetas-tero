'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Check, X, AlertTriangle, Search } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatearMoneda, formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'
import { formatearMonedaAnalisis, obtenerTodasOpciones } from '@/lib/consumo-queries'
import {
  leerArchivo, obtenerMapeos, guardarMapeo, sugerir, buscar, obtenerCatalogo,
  aplicarImportacion, guardarVentaDelTurno, ventaCargada, FK_POR_TIPO,
  type ArchivoVentas, type FilaVenta, type Mapeo, type Producto,
} from '@/lib/importar-ventas'
import { SERVICIO_LABEL, TIPO_CONFIG, type OpcionBuscador, type Servicio, type TipoConsumoItem } from '@/types/analisis'

/**
 * Importar el informe del sistema de ventas.
 *
 * Reemplaza tipear 45 renglones por subir un archivo y revisar. Lo que no pasa
 * por la caja —el aceite de freír, los insumos del menú del mediodía— se sigue
 * cargando a mano en la solapa de al lado.
 */

interface Props {
  fecha: string
  servicio: Servicio
  onImportado?: () => void
}

/** Estado de cada fila mientras se revisa */
type Estado = 'listo' | 'sugerido' | 'sin-mapear' | 'ignorado'

interface Linea extends FilaVenta {
  mapeo: Mapeo
  estado: Estado
  /** Lo que propone el sistema, hasta que se confirme */
  sugerencia: Producto | null
  /**
   * El factor como se está escribiendo. Sin esto, tipear "0," daba un número
   * inválido, se reseteaba a 1 y la coma desaparecía: no había forma de
   * escribir un decimal. Es la misma convención que el resto de los inputs
   * numéricos del sistema (ver CLAUDE.md).
   */
  factorTexto: string
}

function mapeoVacio(f: FilaVenta): Mapeo {
  return {
    codigo: f.codigo, nombre_origen: f.nombre, tipo: null,
    insumo_id: null, receta_base_id: null, plato_id: null,
    trago_id: null, menu_ejecutivo_id: null, vino_id: null,
    ignorar: false, factor: 1,
  }
}

function estadoDe(m: Mapeo, sug: Producto | null): Estado {
  if (m.ignorar) return 'ignorado'
  if (m.tipo) return 'listo'
  return sug ? 'sugerido' : 'sin-mapear'
}

export default function ImportarVentas({ fecha, servicio, onImportado }: Props) {
  const [archivo, setArchivo] = useState<{ nombre: string; datos: ArchivoVentas } | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [catalogo, setCatalogo] = useState<Producto[]>([])
  // El COSTO no sale del archivo: sale de las recetas, con el mismo cálculo que
  // usa el buscador de Carga diaria. Así una línea importada y una cargada a
  // mano valen exactamente lo mismo.
  const [costos, setCostos] = useState<Map<string, number>>(new Map())
  const [yaCargado, setYaCargado] = useState<{ venta: number; cubiertos: number } | null>(null)
  const [cubiertos, setCubiertos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Estado | 'todos'>('todos')
  const [buscando, setBuscando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    obtenerCatalogo().then(setCatalogo).catch(console.error)
    obtenerTodasOpciones()
      .then((ops: OpcionBuscador[]) =>
        setCostos(new Map(ops.map((o) => [`${o.tipo}:${o.id}`, o.costo_unitario]))))
      .catch(console.error)
  }, [])

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null); setResultado(null)
    try {
      const datos = leerArchivo(await f.arrayBuffer())
      const [mapeos, cargado] = await Promise.all([
        obtenerMapeos(),
        ventaCargada(fecha, servicio),
      ])

      setLineas(datos.filas.map((fila) => {
        const guardado = mapeos.get(fila.codigo)
        // Sin mapeo guardado: las filas en $0 se proponen como ignoradas —casi
        // siempre son componentes de menú— y el resto busca a qué se parece.
        const m = guardado ?? { ...mapeoVacio(fila), ignorar: fila.incluida }
        const sug = guardado || fila.incluida ? null : sugerir(fila.nombre, catalogo)
        return {
          ...fila, mapeo: m, sugerencia: sug, estado: estadoDe(m, sug),
          factorTexto: String(m.factor ?? 1).replace('.', ','),
        }
      }))

      setArchivo({ nombre: f.name, datos })
      setCubiertos(datos.cubiertos)
      setYaCargado(cargado)
    } catch (err: any) {
      setError(err?.message || String(err))
      setArchivo(null)
    }
    e.target.value = ''
  }

  function actualizar(codigo: string, cambio: Partial<Mapeo>) {
    setLineas((prev) => prev.map((l) => {
      if (l.codigo !== codigo) return l
      const m = { ...l.mapeo, ...cambio }
      return {
        ...l, mapeo: m, estado: estadoDe(m, l.sugerencia),
        factorTexto: 'factor' in cambio ? l.factorTexto : String(m.factor ?? 1).replace('.', ','),
      }
    }))
  }

  /** El texto se guarda tal cual; el número solo cuando ya es válido */
  function cambiarFactor(codigo: string, texto: string) {
    const limpio = formatearInputNumero(texto)
    const n = parsearNumero(limpio)
    setLineas((prev) => prev.map((l) =>
      l.codigo !== codigo ? l
        : { ...l, factorTexto: limpio, mapeo: { ...l.mapeo, factor: n > 0 ? n : l.mapeo.factor } }
    ))
  }

  function enlazar(codigo: string, p: Producto) {
    const limpio: Partial<Mapeo> = {
      tipo: p.tipo, ignorar: false,
      insumo_id: null, receta_base_id: null, plato_id: null,
      trago_id: null, menu_ejecutivo_id: null, vino_id: null,
    }
    ;(limpio as any)[FK_POR_TIPO[p.tipo]] = p.id
    actualizar(codigo, limpio)
    setBuscando(null); setTexto('')
  }

  const conteo = useMemo(() => {
    const c: Record<string, number> = { todos: lineas.length, listo: 0, sugerido: 0, 'sin-mapear': 0, ignorado: 0 }
    lineas.forEach((l) => { c[l.estado]++ })
    return c
  }, [lineas])

  const pendientes = conteo['sin-mapear'] + conteo.sugerido

  const visibles = useMemo(
    () => lineas.filter((l) => filtro === 'todos' || l.estado === filtro).sort((a, b) => b.unidades - a.unidades),
    [lineas, filtro]
  )

  /** Costo de una unidad, del recetario. Cero significa que falta el precio. */
  const costoDe = (m: Mapeo): number => {
    if (!m.tipo) return 0
    const id = m[FK_POR_TIPO[m.tipo]] as string | null
    return id ? costos.get(`${m.tipo}:${id}`) ?? 0 : 0
  }

  /** Enlazados que quedarían a costo cero: la receta no tiene precio de insumos */
  const sinCosto = useMemo(
    () => lineas.filter((l) => l.estado === 'listo' && costoDe(l.mapeo) === 0),
    [lineas, costos]
  )

  async function aplicar() {
    if (!archivo) return
    if (pendientes > 0) {
      alert(`Quedan ${pendientes} productos sin resolver. Enlazalos o marcalos como ignorados.`)
      return
    }
    try {
      setAplicando(true)
      // Guardar los mapeos nuevos para que la próxima vez no pregunte
      await Promise.all(lineas.map((l) => guardarMapeo(l.mapeo)))
      const r = await aplicarImportacion(fecha, servicio, lineas.map((l) => ({
        codigo: l.codigo, nombre: l.nombre, unidades: l.unidades, importe: l.importe, mapeo: l.mapeo,
      })), costoDe)
      await guardarVentaDelTurno(fecha, servicio, archivo.datos.venta, cubiertos)
      setResultado(`Se cargaron ${r.lineasCargadas} líneas y se omitieron ${r.omitidas}.`)
      setArchivo(null); setLineas([])
      onImportado?.()
    } catch (err: any) {
      console.error('Error importando:', err)
      setError(err?.message || String(err))
    } finally {
      setAplicando(false)
    }
  }

  // --- Sin archivo todavía ---
  if (!archivo) {
    return (
      <div className="space-y-4">
        {resultado && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-gray-800">
            <span className="font-semibold text-green-800">Importado.</span> {resultado}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-red-800 mb-1">No se pudo leer el archivo</p>
            <p className="text-xs text-red-700 font-mono break-words">{error}</p>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <Upload className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-700 mb-1">Subí el informe del sistema de ventas</p>
          <p className="text-xs text-gray-500 mb-4">
            Para <span className="font-medium">{fecha.split('-').reverse().join('/')}</span>,{' '}
            <span className="font-medium">{SERVICIO_LABEL[servicio]}</span> · archivo .xls o .xlsx
          </p>
          <input ref={inputRef} type="file" accept=".xls,.xlsx" onChange={onArchivo} className="hidden" />
          <Button onClick={() => inputRef.current?.click()}>Elegir archivo</Button>
          <p className="text-xs text-gray-400 mt-4 max-w-md mx-auto">
            Necesita las columnas <span className="font-mono">codigo</span>,{' '}
            <span className="font-mono">nombre</span>, <span className="font-mono">unidades</span> e{' '}
            <span className="font-mono">importe</span>.
          </p>
        </div>
      </div>
    )
  }

  const d = archivo.datos
  const difVenta = yaCargado && Math.abs(yaCargado.venta - d.venta) > 1
  const difCub = yaCargado && yaCargado.cubiertos !== cubiertos

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-sm text-gray-900">{archivo.nombre}</span>
          <span className="text-xs text-gray-500 ml-2">
            {fecha.split('-').reverse().join('/')} · {SERVICIO_LABEL[servicio]} · {d.filas.length} productos
          </span>
        </div>
        <button onClick={() => { setArchivo(null); setLineas([]) }}
          className="text-xs text-gray-500 hover:text-gray-800 underline">
          Elegir otro
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        <Celda rotulo="Venta" cifra={formatearMoneda(d.venta, true, 0)} pie="del archivo" />
        <div className="bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Cubiertos</div>
          <input type="number" value={cubiertos} onChange={(e) => setCubiertos(Number(e.target.value) || 0)}
            className="font-mono text-lg font-semibold text-gray-900 w-20 border-b border-dashed border-gray-300 focus:outline-none focus:border-primary-500" />
          <div className="text-xs text-gray-500 mt-0.5">editable</div>
        </div>
        <Celda rotulo="A cargar" cifra={String(conteo.listo)} pie="productos" />
        <Celda rotulo="Se omiten" cifra={String(conteo.ignorado)} pie="ya van en menús" />
      </div>

      {yaCargado && !difVenta && !difCub && (
        <div className="bg-green-50 border border-green-200 border-l-[3px] border-l-green-600 rounded-lg px-4 py-2.5 text-sm text-gray-700">
          Coincide con lo que ya está cargado: <span className="font-mono">{formatearMoneda(d.venta, true, 0)}</span>{' '}
          y <span className="font-mono">{cubiertos}</span> cubiertos.
        </div>
      )}
      {(difVenta || difCub) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-800">Difiere de lo cargado a mano.</span>
              {difVenta && (
                <div className="mt-1">
                  Venta: cargada <span className="font-mono">{formatearMoneda(yaCargado!.venta, true, 0)}</span> ·
                  archivo <span className="font-mono">{formatearMoneda(d.venta, true, 0)}</span>
                </div>
              )}
              {difCub && (
                <div>
                  Cubiertos: cargados <span className="font-mono">{yaCargado!.cubiertos}</span> ·
                  archivo <span className="font-mono">{cubiertos}</span>
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1.5">
                Al importar se guarda lo del archivo. Si el bueno es el otro, corregí arriba antes.
              </div>
            </div>
          </div>
        </div>
      )}

      {sinCosto.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-gray-700">
          <span className="font-semibold text-amber-800">
            {sinCosto.length} {sinCosto.length === 1 ? 'producto quedaría' : 'productos quedarían'} a costo cero:
          </span>{' '}
          {sinCosto.slice(0, 4).map((l) => l.nombre).join(', ')}
          {sinCosto.length > 4 && ` y ${sinCosto.length - 4} más`}.
          <div className="text-xs text-gray-600 mt-1">
            Su receta no tiene ingredientes con precio. Se pueden importar igual —las unidades son
            correctas— pero no van a sumar al costo del turno.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {([
          ['todos', 'Todos'], ['sin-mapear', 'Sin enlazar'], ['sugerido', 'A confirmar'],
          ['listo', 'Enlazados'], ['ignorado', 'Se omiten'],
        ] as const).map(([k, t]) => conteo[k] > 0 || k === 'todos' ? (
          <button key={k} onClick={() => setFiltro(k as any)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              filtro === k ? 'bg-gray-900 text-white border-gray-900'
                           : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {t} <span className="font-mono">({conteo[k]})</span>
          </button>
        ) : null)}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="border-b border-gray-200">
              {['Producto en ventas', 'Unid.', 'Importe', 'Se carga como'].map((h, i) => (
                <th key={h} className={`text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2.5 ${i === 0 ? 'text-left' : i === 3 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <tr key={l.codigo} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2">
                  <span className="text-gray-900">{l.nombre}</span>
                  <span className="text-[10px] text-gray-400 font-mono ml-1.5">{l.codigo}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{l.unidades}</td>
                <td className={`px-3 py-2 text-right font-mono ${l.importe ? 'text-gray-700' : 'text-gray-300'}`}>
                  {l.importe ? formatearMonedaAnalisis(l.importe) : '—'}
                </td>
                <td className="px-3 py-2">
                  <Destino
                    linea={l} catalogo={catalogo}
                    abierto={buscando === l.codigo} texto={texto}
                    onAbrir={() => { setBuscando(l.codigo); setTexto('') }}
                    onCerrar={() => setBuscando(null)}
                    onTexto={setTexto}
                    onElegir={(p) => enlazar(l.codigo, p)}
                    onIgnorar={() => actualizar(l.codigo, { ignorar: true, tipo: null })}
                    onFactor={(v) => cambiarFactor(l.codigo, v)}
                    onLimpiar={() => actualizar(l.codigo, {
                      ignorar: false, tipo: null, insumo_id: null, receta_base_id: null,
                      plato_id: null, trago_id: null, menu_ejecutivo_id: null, vino_id: null,
                    })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-xs text-gray-500 max-w-lg">
          {pendientes > 0
            ? `Faltan resolver ${pendientes}. Cada enlace queda guardado: la próxima importación no vuelve a preguntar.`
            : 'Todo resuelto. Al importar se reemplaza lo que haya cargado una importación anterior de este turno; lo cargado a mano no se toca.'}
        </p>
        <Button onClick={aplicar} disabled={aplicando || pendientes > 0}>
          {aplicando ? 'Importando…' : `Importar ${conteo.listo} productos`}
        </Button>
      </div>
    </div>
  )
}

function Celda({ rotulo, cifra, pie }: { rotulo: string; cifra: string; pie: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{rotulo}</div>
      <div className="font-mono text-lg font-semibold text-gray-900">{cifra}</div>
      <div className="text-xs text-gray-500 mt-0.5">{pie}</div>
    </div>
  )
}

function Destino({
  linea, catalogo, abierto, texto, onAbrir, onCerrar, onTexto, onElegir, onIgnorar, onLimpiar, onFactor,
}: {
  linea: Linea; catalogo: Producto[]; abierto: boolean; texto: string
  onAbrir: () => void; onCerrar: () => void; onTexto: (t: string) => void
  onElegir: (p: Producto) => void; onIgnorar: () => void; onLimpiar: () => void
  onFactor: (v: string) => void
}) {
  const { mapeo, estado, sugerencia, factorTexto } = linea

  // La sugerencia va PRIMERA, siempre. Si acierta —y acierta en la mitad de los
  // casos— es un clic en vez de tipear el nombre completo. Al abrir el campo sin
  // escribir nada, es lo único que se ve arriba de todo.
  const resultados = useMemo(() => {
    if (!abierto) return []
    const encontrados = buscar(catalogo, texto)
    if (!sugerencia) return encontrados
    return [sugerencia, ...encontrados.filter((p) => p.id !== sugerencia.id)]
  }, [abierto, catalogo, texto, sugerencia])

  if (estado === 'ignorado') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-gray-400 italic">no se carga</span>
        <button onClick={onLimpiar} className="text-xs text-gray-400 hover:text-gray-700 underline">enlazar</button>
      </span>
    )
  }

  if (estado === 'listo' && mapeo.tipo) {
    const id = mapeo[FK_POR_TIPO[mapeo.tipo]] as string
    const p = catalogo.find((x) => x.id === id)
    const cfg = TIPO_CONFIG[mapeo.tipo as TipoConsumoItem]
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-gray-900">{p?.nombre ?? '(no encontrado)'}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${cfg.badgeClass}`}>{cfg.badge}</span>
        {/* Solo donde una fracción tiene sentido: un vino se vende por copa, un
            plato no se vende por mitades. Mostrarlo en las 45 filas para el
            único caso que lo usa era ruido. */}
        {(mapeo.tipo === 'vino' || Number(mapeo.factor) !== 1) && (
          <span className="inline-flex items-center gap-0.5"
            title="Cuántas unidades del producto equivalen a una del sistema de ventas. Una copa es 0,333 de botella.">
            <span className="text-[10px] text-gray-400">×</span>
            <input
              type="text" inputMode="decimal" value={factorTexto}
              onChange={(e) => onFactor(e.target.value)}
              className={`w-12 text-[11px] font-mono text-right border-b border-dashed focus:outline-none bg-transparent ${
                Number(mapeo.factor) !== 1 ? 'border-amber-400 text-amber-800' : 'border-gray-200 text-gray-400'
              }`}
            />
          </span>
        )}
        <button onClick={onLimpiar} className="text-gray-300 hover:text-red-600" title="Quitar">
          <X className="w-3 h-3" />
        </button>
      </span>
    )
  }


  return (
    <span className="relative inline-block min-w-[230px]">
      <span className="flex items-center gap-1">
        <span className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            value={abierto ? texto : ''}
            onFocus={onAbrir}
            onChange={(e) => onTexto(e.target.value)}
            placeholder={sugerencia ? `¿${sugerencia.nombre}?` : 'Buscar producto…'}
            className="w-full pl-7 pr-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </span>
        {sugerencia && !abierto && (
          <button onClick={() => onElegir(sugerencia)} title="Confirmar la sugerencia"
            className="p-1 text-green-700 hover:bg-green-50 rounded">
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onIgnorar} title="No cargar este producto"
          className="text-[10px] text-gray-400 hover:text-gray-700 underline whitespace-nowrap">
          omitir
        </button>
      </span>

      {abierto && (
        <span className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto block">
          {resultados.length === 0 ? (
            <span className="block px-3 py-2 text-xs text-gray-400">Nada con esa búsqueda</span>
          ) : resultados.map((p) => {
            const esSugerido = sugerencia?.id === p.id
            return (
              <button key={p.id} onClick={() => onElegir(p)}
                className={`w-full text-left px-3 py-1.5 text-xs flex justify-between gap-2 ${
                  esSugerido ? 'bg-green-50 hover:bg-green-100 border-b border-green-100' : 'hover:bg-gray-50'
                }`}>
                <span className="text-gray-900">
                  {p.nombre}
                  {esSugerido && <span className="text-[10px] text-green-700 ml-1.5">sugerido</span>}
                </span>
                <span className="text-[10px] text-gray-400 uppercase flex-shrink-0">
                  {TIPO_CONFIG[p.tipo].badge}{p.precio ? ` · ${formatearMonedaAnalisis(p.precio)}` : ''}
                </span>
              </button>
            )
          })}
          <button onClick={onCerrar} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-400 border-t border-gray-100">
            cerrar
          </button>
        </span>
      )}
    </span>
  )
}
