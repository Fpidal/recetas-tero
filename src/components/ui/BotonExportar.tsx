'use client'

import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'

/**
 * Botón de exportar a Excel.
 *
 * La descarga puede tardar unos segundos: los exportadores traen las tablas
 * paginadas de a 1000 filas y arman el archivo en el browser. Por eso el
 * estado de carga no es decorativo — sin él, el usuario hace clic de nuevo.
 */
interface Props {
  /** Qué hace el botón. Debe resolver cuando el archivo ya se descargó. */
  onExportar: () => Promise<void>
  /** Texto del tooltip, ej: "Descargar insumos en Excel" */
  titulo: string
  /** Texto visible. Si no se pasa, solo muestra el icono. */
  etiqueta?: string
  disabled?: boolean
  className?: string
}

export default function BotonExportar({
  onExportar,
  titulo,
  etiqueta = 'Excel',
  disabled,
  className = '',
}: Props) {
  const [exportando, setExportando] = useState(false)

  async function handleClick() {
    if (exportando) return
    try {
      setExportando(true)
      await onExportar()
    } catch (e) {
      console.error('Error exportando a Excel:', e)
      alert('No se pudo generar el Excel. Probá de nuevo en unos segundos.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || exportando}
      title={titulo}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {exportando ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="w-4 h-4 text-green-700" />
      )}
      {etiqueta && <span>{exportando ? 'Generando...' : etiqueta}</span>}
    </button>
  )
}
