'use client'

import { Eye } from 'lucide-react'

interface ClickableItemNameProps {
  /** Nombre del ítem (lo único clickeable: el texto secundario va fuera) */
  nombre: string
  /** Abre la vista de detalle del ítem */
  onClick: () => void
  /** Tamaño del texto: 'sm' para Recetas y Elaboraciones, 'xs' para la tabla de En Carta */
  size?: 'sm' | 'xs'
  title?: string
}

/**
 * Nombre de ítem clickeable que abre su vista de detalle.
 * Patrón compartido por las tablas de En Carta, Recetas y Elaboraciones:
 * verde + subrayado en hover, ícono de ojo al costado, cursor pointer.
 *
 * Es un <button> real, así que se activa con Enter/Espacio y el foco se ve
 * al navegar con teclado (el ojo también aparece al recibir foco).
 */
export default function ClickableItemName({
  nombre,
  onClick,
  size = 'sm',
  title = 'Ver detalle',
}: ClickableItemNameProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`group inline-flex items-center gap-1 text-left font-medium text-gray-900 rounded-sm
        hover:text-primary-600 hover:underline
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1
        ${size === 'xs' ? 'text-xs' : 'text-sm'}`}
    >
      {nombre}
      <Eye
        aria-hidden="true"
        className="w-3 h-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50"
      />
    </button>
  )
}
