'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, MessageSquareText, Check, X } from 'lucide-react'

/**
 * Nota de una línea del resumen semanal.
 *
 * Colapsada cuando está vacía (solo el ícono) para no ensuciar el informe:
 * la mayoría de las líneas no van a tener nota, y el valor del resumen es que
 * se lea de un vistazo. Cuando hay nota escrita, se muestra completa.
 *
 * Se guarda al salir del campo o con Enter. Escribirla vacía la borra.
 */
interface Props {
  valor: string
  onGuardar: (texto: string) => Promise<void>
  /** Ej: "¿por qué subió?" — orienta sobre qué escribir */
  placeholder?: string
}

export default function NotaLinea({ valor, onGuardar, placeholder = 'Agregar una nota…' }: Props) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(valor)
  const [guardando, setGuardando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Si la nota cambió por fuera (cambio de semana), reflejarlo
  useEffect(() => { setTexto(valor) }, [valor])

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  async function confirmar() {
    if (texto.trim() === valor.trim()) {
      setEditando(false)
      return
    }
    try {
      setGuardando(true)
      await onGuardar(texto)
      setEditando(false)
    } catch (e: any) {
      console.error('Error guardando la nota:', e)
      // El mensaje anterior decía "puede faltar crear la tabla", y mandaba a
      // buscar al lugar equivocado: lo que falla casi siempre es el CHECK de
      // `bloque`, que quedó sin el valor nuevo cuando se agregó un tipo de nota.
      // Pasó con 'item_factura' en V.27 y estuvo roto hasta el 19/08/26.
      const detalle = String(e?.message || e)
      alert(
        detalle.includes('bloque_check')
          ? 'No se pudo guardar: la base no reconoce este tipo de nota.\n\n' +
            'Falta agregar el valor al CHECK de notas_auditoria.bloque — ver ' +
            'supabase-notas-auditoria.sql.'
          : `No se pudo guardar la nota.\n\n${detalle}`
      )
    } finally {
      setGuardando(false)
    }
  }

  function cancelar() {
    setTexto(valor)
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1 mt-1">
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmar()
            if (e.key === 'Escape') cancelar()
          }}
          disabled={guardando}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-[11px] border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          onMouseDown={(e) => e.preventDefault()} // que no dispare el blur antes del click
          onClick={confirmar}
          disabled={guardando}
          className="p-1 text-green-600 hover:bg-green-50 rounded"
          title="Guardar"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancelar}
          className="p-1 text-gray-400 hover:bg-gray-100 rounded"
          title="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  if (!valor) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700"
        title="Agregar una nota a esta línea"
      >
        <MessageSquarePlus className="w-3 h-3" />
        nota
      </button>
    )
  }

  return (
    <button
      onClick={() => setEditando(true)}
      className="mt-1 flex items-start gap-1 text-left text-[11px] text-gray-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 hover:bg-amber-100 w-full"
      title="Editar la nota"
    >
      <MessageSquareText className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-600" />
      <span className="flex-1">{valor}</span>
    </button>
  )
}
