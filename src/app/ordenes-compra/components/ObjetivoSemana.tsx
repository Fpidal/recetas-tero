'use client'

import { useEffect, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { formatearMoneda, formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'
import {
  obtenerEstadoSemana,
  guardarObjetivo,
  estadoObjetivo,
  lunesDe,
  type EstadoSemana,
} from '@/lib/objetivo-compras'

/**
 * Cómo viene la semana contra el objetivo de compras.
 *
 * Va arriba de todo en Órdenes porque la pregunta "¿puedo pedir esto?" se hace
 * antes de armar la orden, no después. Sin dinero: es lo pedido en la semana,
 * con IVA y sin vinos.
 */

/** Sin decimales: con montos de millones, los centavos solo hacen ruido. */
const money = (v: number) => formatearMoneda(v, true, 0)

export default function ObjetivoSemana({ recargar }: { recargar?: number }) {
  const [datos, setDatos] = useState<EstadoSemana | null>(null)
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [guardando, setGuardando] = useState(false)

  const semana = lunesDe(new Date())

  async function cargar() {
    try {
      setCargando(true)
      setDatos(await obtenerEstadoSemana(semana))
    } catch (e) {
      console.error('Error cargando el objetivo:', e)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [recargar])

  async function confirmar() {
    const valor = parsearNumero(borrador)
    if (valor <= 0) { setEditando(false); return }
    try {
      setGuardando(true)
      await guardarObjetivo(semana, Math.round(valor))
      await cargar()
      setEditando(false)
    } catch (e: any) {
      console.error('Error guardando el objetivo:', e)
      alert(
        String(e?.message || e).includes('objetivos_compra')
          ? 'Falta crear la tabla objetivos_compra — ver supabase-objetivos-compra.sql'
          : `No se pudo guardar el objetivo.\n\n${e?.message || e}`
      )
    } finally {
      setGuardando(false)
    }
  }

  if (cargando || !datos) {
    return <div className="h-20 bg-white border border-gray-200 rounded-lg animate-pulse mb-4" />
  }

  const estado = estadoObjetivo(datos.porcentaje)
  const barra = {
    'sin-objetivo': { fill: 'bg-gray-300', texto: 'text-gray-500' },
    holgado:        { fill: 'bg-green-600',  texto: 'text-green-700' },
    cerca:          { fill: 'bg-yellow-600', texto: 'text-yellow-700' },
    excedido:       { fill: 'bg-red-600',    texto: 'text-red-700' },
  }[estado]

  const dm = (f: string) => f.split('-').reverse().slice(0, 2).join('/')

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Compras de la semana</h2>
          <p className="text-xs text-gray-500">
            {dm(datos.semanaDesde)} al {dm(datos.semanaHasta)} · con IVA, sin vinos ·{' '}
            <span className="font-mono">{datos.ordenes}</span>{' '}
            {datos.ordenes === 1 ? 'orden' : 'órdenes'}
          </p>
        </div>

        {editando ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Objetivo $</span>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={borrador}
              onChange={(e) => setBorrador(formatearInputNumero(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false) }}
              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button onClick={confirmar} disabled={guardando}
              className="p-1 text-green-700 hover:bg-green-50 rounded" aria-label="Guardar">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setEditando(false)}
              className="p-1 text-gray-400 hover:bg-gray-100 rounded" aria-label="Cancelar">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setBorrador(datos.objetivo ? String(Math.round(datos.objetivo)) : '')
              setEditando(true)
            }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            <Pencil className="w-3 h-3" />
            {datos.objetivo !== null
              ? <>Objetivo <span className="font-mono font-medium text-gray-900">{money(datos.objetivo)}</span></>
              : 'Definir objetivo'}
          </button>
        )}
      </div>

      {/* La barra puede pasar del 100%: se recorta al 100 para que no rompa el
          contenedor, y el número de al lado dice cuánto se pasó. */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full ${barra.fill} transition-all`}
          style={{ width: `${Math.min(datos.porcentaje ?? 0, 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Dato rotulo="Generado" valor={money(datos.generado)}
          pie={datos.porcentaje !== null ? `${datos.porcentaje.toFixed(0)}% del objetivo` : 'sin objetivo'}
          color={barra.texto} />
        <Dato rotulo="Recibido" valor={money(datos.recibido)} pie="ya ingresó" />
        <Dato rotulo="Pendiente" valor={money(datos.pendiente)} pie="falta llegar" />
        {datos.diferencia !== null ? (
          <Dato
            rotulo={datos.diferencia >= 0 ? 'Queda' : 'Excedido'}
            valor={money(Math.abs(datos.diferencia))}
            pie={datos.diferencia >= 0 ? 'para el objetivo' : 'sobre el objetivo'}
            color={datos.diferencia >= 0 ? 'text-gray-900' : 'text-red-700'}
          />
        ) : (
          <Dato rotulo="Objetivo" valor="—" pie="sin definir" />
        )}
      </div>

      {datos.vinos > 0 && (
        <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100">
          Además <span className="font-mono">{money(datos.vinos)}</span> en vinos, que no cuentan
          contra el objetivo: se compran por caja cuando hay oferta, no semana a semana.
        </p>
      )}
    </div>
  )
}

function Dato({ rotulo, valor, pie, color = 'text-gray-900' }: {
  rotulo: string; valor: string; pie: string; color?: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{rotulo}</div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{valor}</div>
      <div className="text-xs text-gray-500">{pie}</div>
    </div>
  )
}
