'use client'

import { FileDown } from 'lucide-react'
import { HOJA_COLORES } from '@/lib/colores'

/**
 * Hojas de inventario para imprimir y contar a mano.
 *
 * Son FIJAS: un PDF armado a mano por categoría, en public/hojas/, con los
 * artículos agrupados por rubro y columnas de stock, pedido y recibido. Hasta
 * V.61 se autogeneraban con un generador —ya borrado— que listaba todo lo que
 * tuviera la categoría y salía desordenado. La de carnes incluye pollo, cerdo,
 * pescados y mariscos, así que no hay hoja aparte de Pescados.
 *
 * Contra: un insumo nuevo no aparece solo. Para sumarlo hay que rehacer el PDF
 * —o anotarlo a mano en "Faltantes / otros", que para eso está—.
 *
 * Van en una sola fila, sin íconos ni botones llenos. El único color es la
 * franja del título, un tono por categoría (HOJA_COLORES), para reconocer la
 * hoja de un vistazo.
 */

interface Hoja {
  clave: string
  color: string
  titulo: string
  descripcion: string
  archivo: string
}

const HOJAS: Hoja[] = [
  {
    clave: 'carnes',
    color: HOJA_COLORES.Carnes,
    titulo: 'Carnes',
    descripcion: 'Vacuno, cerdo, pollo, pescados, mariscos y achuras',
    archivo: '/hojas/Hoja-Pedidos-Carnes-Tero.pdf',
  },
  {
    clave: 'almacen',
    color: HOJA_COLORES.Almacen,
    titulo: 'Almacén',
    descripcion: 'Secos, conservas, especias, salsas, congelados y repostería',
    archivo: '/hojas/Hoja-Pedidos-Almacen-Tero.pdf',
  },
  {
    clave: 'verduras',
    color: HOJA_COLORES.Verduras_Frutas,
    titulo: 'Verduras y frutas',
    descripcion: 'Hojas, hierbas, bulbos, raíces, hortalizas, hongos y frutas',
    archivo: '/hojas/Hoja-Pedidos-Verduras-Tero.pdf',
  },
  {
    clave: 'lacteos',
    color: HOJA_COLORES.Lacteos_Fiambres,
    titulo: 'Lácteos y fiambres',
    descripcion: 'Lácteos, quesos, fiambres y helados',
    archivo: '/hojas/Hoja-Pedidos-Lacteos-Fiambres-Tero.pdf',
  },
]

const CLASE_BOTON =
  'mt-auto w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-sand-dark text-ink bg-white hover:bg-cream-dark transition-colors'

export default function HojasControl() {
  return (
    <div>
      <p className="text-sm text-ink-muted mb-4">
        Hojas de inventario para imprimir y completar a mano
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HOJAS.map((hoja) => (
          <div key={hoja.clave} className="card overflow-hidden flex flex-col">
            <h3
              className="px-4 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-white"
              style={{ backgroundColor: hoja.color }}
            >
              {hoja.titulo}
            </h3>
            <div className="p-4 flex flex-col flex-1">
              <p className="text-xs text-ink-muted mb-4">{hoja.descripcion}</p>
              <a href={hoja.archivo} download className={CLASE_BOTON}>
                <FileDown className="w-4 h-4" />
                Descargar PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
