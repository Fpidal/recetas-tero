'use client'

import { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, MoreHorizontal, X } from 'lucide-react'

/**
 * Botón "Instalar" del encabezado mobile: deja el sistema como un ícono en la
 * pantalla del celular, que abre a pantalla completa (lo arma manifest.json).
 *
 * Android (Chrome, Samsung, Edge): el navegador avisa con `beforeinstallprompt`
 * que la app se puede instalar; se guarda ese evento y el botón lo dispara, así
 * se instala de un toque con el cartel del propio teléfono.
 *
 * iPhone: Apple no deja que una página se instale sola —no existe ese evento en
 * Safari—, así que el botón abre un cartel con los pasos. Desde iOS 26 Safari
 * esconde Compartir dentro de "⋯" en su barra compacta, y el cartel original
 * —"tocá Compartir"— dejaba al usuario buscando un botón que no veía
 * (22/10/26). Por eso los pasos nombran los dos caminos.
 *
 * Si ya está abierta como app instalada, el botón no aparece.
 */

interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function yaInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

function esIPhone(): boolean {
  const ua = navigator.userAgent
  // El iPad con iPadOS 13+ se presenta como Mac, pero tiene pantalla táctil
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const [iphone, setIphone] = useState(false)
  const [instalada, setInstalada] = useState(true)
  const [ayudaIphone, setAyudaIphone] = useState(false)

  useEffect(() => {
    setInstalada(yaInstalada())
    setIphone(esIPhone())
    const alAvisar = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalar)
    }
    const alInstalar = () => { setInstalada(true); setEvento(null) }
    window.addEventListener('beforeinstallprompt', alAvisar)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alAvisar)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (instalada || (!evento && !iphone)) return null

  async function instalar() {
    if (evento) {
      await evento.prompt()
      const { outcome } = await evento.userChoice
      // El evento sirve una sola vez: si lo rechazó, el navegador vuelve a avisar más adelante
      setEvento(null)
      if (outcome === 'accepted') setInstalada(true)
      return
    }
    setAyudaIphone(true)
  }

  return (
    <>
      <button
        onClick={instalar}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Instalar
      </button>

      {ayudaIphone && (
        <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setAyudaIphone(false)}>
          <div
            className="absolute left-3 right-3 rounded-2xl bg-white p-5 shadow-xl"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAyudaIphone(false)}
              className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-700"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <p className="font-medium text-gray-900 pr-6">Instalar en el iPhone</p>
            <p className="text-sm text-gray-500 mt-1">
              El iPhone no deja instalar desde la página: se hace con el menú de Safari. Cerrá este cartel y seguí estos pasos.
            </p>
            <ol className="mt-4 space-y-3 text-sm text-gray-800">
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                  <MoreHorizontal className="w-4 h-4 text-blue-600" />
                </span>
                <span>Abajo en Safari, tocá <b>⋯</b> y después <b>Compartir</b>. Si ves el botón <Share className="inline w-3.5 h-3.5 text-blue-600 -mt-0.5" />, tocalo directo</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                  <PlusSquare className="w-4 h-4 text-gray-700" />
                </span>
                <span>Bajá en la lista y elegí <b>Agregar a inicio</b></span>
              </li>
            </ol>
            <button
              onClick={() => setAyudaIphone(false)}
              className="mt-5 w-full rounded-lg bg-forest py-2.5 text-sm font-medium text-white"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
