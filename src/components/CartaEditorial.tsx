'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const SECCIONES_ORDEN = ['Entradas', 'Principales', 'Parrilla', 'Pastas y Arroces', 'Ensaladas', 'Postres']

interface DishItem {
  nombre: string
  descripcion: string | null
  precio: number
}
interface Seccion {
  nombre: string
  items: DishItem[]
}

interface Props {
  showPrices?: boolean
  qrDataUrl?: string
  tagline?: string
}

export default function CartaEditorial({ showPrices = true, qrDataUrl, tagline = 'Cocina de Autor' }: Props) {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCarta()
  }, [])

  async function fetchCarta() {
    const { data } = await supabase
      .from('carta')
      .select('precio_carta, platos(nombre, seccion, descripcion)')
      .eq('activo', true)

    const map = new Map<string, DishItem[]>()
    ;(data || []).forEach((row: any) => {
      const p = row.platos
      if (!p) return
      const sec = p.seccion || 'Principales'
      if (!map.has(sec)) map.set(sec, [])
      map.get(sec)!.push({
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: Number(row.precio_carta) || 0,
      })
    })

    const ordered: Seccion[] = SECCIONES_ORDEN
      .filter((s) => map.has(s))
      .map((s) => ({
        nombre: s,
        items: map.get(s)!.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }))
    // Secciones que no estén en el orden conocido, al final
    Array.from(map.entries()).forEach(([s, items]) => {
      if (!SECCIONES_ORDEN.includes(s)) ordered.push({ nombre: s, items })
    })

    setSecciones(ordered)
    setLoading(false)
  }

  if (loading) {
    return <div className="cm-loading">Cargando carta…</div>
  }

  return (
    <div className="cm-carta">
      <style>{cmStyles}</style>
      <div className="cm-side" />

      <div className="cm-header">
        <img className="cm-logo" src="/logo-tero-menu.png" alt="Tero Restó" />
        <div className="cm-tag">{tagline}</div>
      </div>

      <div className="cm-body">
        {secciones.map((sec) => (
          <div className="cm-section" key={sec.nombre}>
            <div className="cm-section-head">
              <span className="cm-cat">{sec.nombre}</span>
              <span className="cm-cat-line" />
            </div>
            {sec.items.map((it, i) => (
              <div className="cm-dish" key={i}>
                <div className="cm-dish-head">
                  <span className="cm-dish-name">{it.nombre}</span>
                  {showPrices && it.precio > 0 && (
                    <>
                      <span className="cm-dots" />
                      <span className="cm-dish-price">
                        ${it.precio.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                    </>
                  )}
                </div>
                {it.descripcion && <div className="cm-dish-desc">{it.descripcion}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="cm-footer">
        <div className="cm-foot-txt">
          <span className="cm-foot-brand">Tero Restó</span>
          <span>Precios sujetos a modificación</span>
        </div>
        {qrDataUrl && (
          <div className="cm-qr">
            <img src={qrDataUrl} alt="QR carta digital" />
            <span>Escaneá para ver<br />la carta digital</span>
          </div>
        )}
      </div>
    </div>
  )
}

const cmStyles = `
.cm-carta {
  position: relative;
  background: #fafaf8;
  color: #1a2a20;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-shadow: 0 20px 60px rgba(0,0,0,.12);
  overflow: hidden;
}
.cm-side { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: #1B3A2D; }
.cm-header {
  background: #1B3A2D;
  padding: 26px 28px 22px 34px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
/* Logo negro transparente → lo volvemos blanco para que resalte sobre el verde */
.cm-logo { width: 150px; height: auto; filter: brightness(0) invert(1); }
.cm-tag {
  font-family: var(--font-menu-sans), sans-serif;
  color: #c9a96e; font-size: 11px; letter-spacing: 4px; text-transform: uppercase;
}
.cm-body { padding: 28px 32px 14px 36px; }
.cm-section { margin-bottom: 22px; break-inside: avoid; }
.cm-section-head {
  display: flex; align-items: baseline; gap: 10px;
  margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #1B3A2D;
}
.cm-cat {
  font-family: var(--font-display), serif;
  font-size: 21px; font-weight: 600; color: #1B3A2D; letter-spacing: .3px;
}
.cm-cat-line { flex: 1; }
.cm-dish { padding: 7px 0; border-bottom: 1px solid #ece8e0; }
.cm-dish:last-child { border-bottom: none; }
.cm-dish-head { display: flex; align-items: baseline; }
.cm-dish-name {
  font-family: var(--font-display), serif;
  font-size: 15.5px; font-weight: 600; color: #1a2a20; line-height: 1.25;
}
.cm-dots { flex: 1; border-bottom: 1px dotted #c9b9a0; margin: 0 7px; transform: translateY(-4px); }
.cm-dish-price {
  font-family: var(--font-menu-sans), sans-serif;
  font-size: 14px; font-weight: 600; color: #1B3A2D; white-space: nowrap;
}
.cm-dish-desc {
  font-family: var(--font-display), serif; font-style: italic;
  font-size: 12.5px; color: #4a6a54; margin-top: 2px; max-width: 85%; line-height: 1.3;
}
.cm-footer {
  background: #f0ece2; padding: 16px 32px; border-top: 1px solid #e0dbd0;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.cm-foot-txt {
  display: flex; flex-direction: column; gap: 3px;
  font-family: var(--font-menu-sans), sans-serif;
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #9a9080;
}
.cm-foot-brand { font-family: var(--font-display), serif; font-style: italic; font-size: 14px; text-transform: none; letter-spacing: 0; color: #1B3A2D; }
.cm-qr { display: flex; align-items: center; gap: 8px; }
.cm-qr img { width: 58px; height: 58px; }
.cm-qr span { font-family: var(--font-menu-sans), sans-serif; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; color: #9a9080; line-height: 1.4; }
.cm-loading { text-align: center; padding: 60px; color: #888; font-family: var(--font-menu-sans), sans-serif; }
`
