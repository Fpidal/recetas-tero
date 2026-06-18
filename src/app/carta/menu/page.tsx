'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { ArrowLeft, Download, DollarSign, EyeOff } from 'lucide-react'
import CartaEditorial from '@/components/CartaEditorial'

// URL pública del menú digital (a donde apunta el QR)
const SITE_URL = 'https://recetas-tero.vercel.app'

export default function CartaMenuImprimirPage() {
  const router = useRouter()
  const [showPrices, setShowPrices] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  useEffect(() => {
    QRCode.toDataURL(`${SITE_URL}/menu`, {
      margin: 1,
      width: 220,
      color: { dark: '#1B3A2D', light: '#fafaf8' },
    })
      .then(setQrDataUrl)
      .catch(() => {})
  }, [])

  return (
    <div className="cm-page">
      {/* Barra de controles (no se imprime) */}
      <div className="cm-controls no-print">
        <button className="cm-back" onClick={() => router.push('/carta')}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="cm-controls-title">
          <h1>Carta para imprimir</h1>
          <p>Estilo editorial · A4 · QR al menú digital</p>
        </div>

        <div className="cm-controls-actions">
          {/* Toggle con/sin precio */}
          <button
            className={`cm-toggle ${showPrices ? 'on' : ''}`}
            onClick={() => setShowPrices((v) => !v)}
            title={showPrices ? 'Ocultar precios' : 'Mostrar precios'}
          >
            {showPrices ? <DollarSign className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showPrices ? 'Con precio' : 'Sin precio'}
          </button>

          {/* Único botón de descarga */}
          <button className="cm-download" onClick={() => window.print()}>
            <Download className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>
      </div>

      <p className="cm-hint no-print">
        💡 Al tocar Descargar PDF se abre el diálogo de impresión → elegí <b>Guardar como PDF</b>.
        Activá la opción <b>Gráficos de fondo</b> para que salgan los colores.
      </p>

      {/* Área imprimible */}
      <div className="cm-print-area">
        <CartaEditorial showPrices={showPrices} qrDataUrl={qrDataUrl} />
      </div>

      <style>{`
        .cm-page { min-height: 100vh; background: #e9e6e0; padding: 16px 12px 40px; }
        .cm-controls {
          max-width: 760px; margin: 0 auto 10px; display: flex; align-items: center; gap: 12px;
          background: #fff; border: 1px solid #e0dbd0; border-radius: 12px; padding: 12px 16px;
        }
        .cm-back {
          width: 36px; height: 36px; border-radius: 8px; border: 1px solid #e0dbd0;
          display: flex; align-items: center; justify-content: center; background: #fafaf8; color: #1B3A2D; cursor: pointer;
        }
        .cm-controls-title { flex: 1; }
        .cm-controls-title h1 { font-size: 16px; font-weight: 700; color: #1a2a20; }
        .cm-controls-title p { font-size: 12px; color: #8a8278; }
        .cm-controls-actions { display: flex; gap: 8px; }
        .cm-toggle {
          display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: 2px solid;
        }
        .cm-toggle.on { background: #E8F5EC; color: #1B3A2D; border-color: #5C7A5E; }
        .cm-toggle:not(.on) { background: #f3f0ea; color: #8a8278; border-color: #ddd6cc; }
        .cm-download {
          display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer; border: none;
          background: #C4704B; color: #fff;
        }
        .cm-download:hover { background: #B5613E; }
        .cm-hint {
          max-width: 760px; margin: 0 auto 16px; font-size: 12px; color: #8a8278;
          background: #fff8ee; border: 1px solid #f0e4cf; border-radius: 8px; padding: 8px 14px;
        }
        .cm-print-area { display: flex; justify-content: center; }

        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .cm-page { padding: 0; background: #fff; }
          .cm-print-area { display: block; }
          .cm-carta { box-shadow: none !important; max-width: 100% !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  )
}
