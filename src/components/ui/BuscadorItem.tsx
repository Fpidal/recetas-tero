'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { coincideBusqueda } from '@/lib/buscar'

/**
 * Buscador para ELEGIR un item en un formulario (un insumo para una receta).
 *
 * Reemplaza al <select> de 300 opciones: se tipea un pedazo —"ace oli"— y
 * aparecen las coincidencias, con la misma búsqueda por fragmentos que usan
 * los listados (`coincideBusqueda`, sin acentos y en cualquier orden).
 *
 * Teclado: ↑ ↓ para moverse, Enter elige, Esc cierra. Al elegir se llama a
 * `onElegido`, que sirve para pasar el foco a la cantidad.
 */

export interface OpcionBuscador {
  id: string
  nombre: string
  /** Texto chico a la derecha: unidad y costo, por ejemplo */
  detalle?: string
}

interface Props {
  opciones: OpcionBuscador[]
  value: string
  onChange: (id: string) => void
  onElegido?: () => void
  placeholder?: string
  /** 'sm' para la fila de escritorio, 'md' para mobile */
  tamano?: 'sm' | 'md'
}

const MAX_RESULTADOS = 50

export default function BuscadorItem({
  opciones,
  value,
  onChange,
  onElegido,
  placeholder = 'Buscar...',
  tamano = 'sm',
}: Props) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const elegida = opciones.find((o) => o.id === value)

  // Si el formulario limpia la selección (después de "Agregar"), limpiar el texto
  useEffect(() => {
    if (!value) setTexto('')
  }, [value])

  const resultados = useMemo(
    () => opciones.filter((o) => coincideBusqueda(o.nombre, texto)).slice(0, MAX_RESULTADOS),
    [opciones, texto]
  )

  // Cerrar al hacer clic afuera
  useEffect(() => {
    function alClickAfuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', alClickAfuera)
    return () => document.removeEventListener('mousedown', alClickAfuera)
  }, [])

  // Mantener visible la opción resaltada al moverse con las flechas
  useEffect(() => {
    const el = listaRef.current?.children[resaltado] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [resaltado])

  function elegir(o: OpcionBuscador) {
    onChange(o.id)
    setTexto(o.nombre)
    setAbierto(false)
    onElegido?.()
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAbierto(true)
      setResaltado((r) => Math.min(r + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((r) => Math.max(r - 1, 0))
    } else if (e.key === 'Enter') {
      if (abierto && resultados[resaltado]) {
        e.preventDefault()
        elegir(resultados[resaltado])
      }
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  const estilos = tamano === 'md'
    ? 'pl-9 pr-8 py-2.5 text-base'
    : 'pl-7 pr-7 py-1.5 text-xs'

  return (
    <div ref={contenedorRef} className="relative">
      <Search
        className={`absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${
          tamano === 'md' ? 'left-3 w-4 h-4' : 'left-2 w-3.5 h-3.5'
        }`}
      />
      <input
        type="text"
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          setResaltado(0)
          // Si se edita el texto después de elegir, la elección deja de valer
          if (value) onChange('')
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        className={`block w-full rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 ${estilos}`}
        role="combobox"
        aria-expanded={abierto}
        aria-autocomplete="list"
      />
      {(texto || elegida) && (
        <button
          type="button"
          onClick={() => { setTexto(''); onChange(''); setAbierto(true) }}
          className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 ${
            tamano === 'md' ? 'right-3' : 'right-2'
          }`}
          aria-label="Limpiar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {abierto && !elegida && (
        <ul
          ref={listaRef}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">Sin coincidencias</li>
          ) : (
            resultados.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={i === resaltado}
                // mousedown y no click: el click llega después del blur y
                // la lista ya se cerró
                onMouseDown={(e) => { e.preventDefault(); elegir(o) }}
                onMouseEnter={() => setResaltado(i)}
                className={`flex items-baseline justify-between gap-2 px-3 cursor-pointer ${
                  tamano === 'md' ? 'py-2 text-sm' : 'py-1.5 text-xs'
                } ${i === resaltado ? 'bg-gray-100' : ''}`}
              >
                <span className="text-gray-900">{o.nombre}</span>
                {o.detalle && <span className="text-gray-500 font-mono whitespace-nowrap">{o.detalle}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
