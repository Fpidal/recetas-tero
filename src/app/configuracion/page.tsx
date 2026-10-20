'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  obtenerEmpresa, invalidarEmpresa, condicionesOC, nombreConRazonSocial,
  CONDICIONES_IVA, type Empresa,
} from '@/lib/empresa'

/**
 * Configuración → Empresa: los datos del restaurante que salen en la orden de
 * compra, los PDF y el menú. Hasta V.63 estaban escritos en el código.
 *
 * Sólo un admin guarda: lo frena la policy de `restaurantes`, no esta
 * pantalla. Acá se deshabilitan los campos para no dejar tipear algo que
 * después la base va a rechazar.
 *
 * Usuarios (alta y baja sin SQL) va a ser la segunda solapa de esta pantalla.
 */

type Campos = Omit<Empresa, 'id'>

const VACIO: Campos = {
  nombre_fantasia: '', razon_social: null, cuit: null, condicion_iva: null,
  direccion: null, localidad: null, codigo_postal: null, provincia: null,
  telefono: null, email_compras: null, horario_entrega: null, condiciones_oc: null,
  logo: null, logo_en_oc: true, logo_en_informes: true,
}

/** El logo se achica a este ancho: alcanza para un PDF y pesa decenas de KB */
const LOGO_ANCHO_MAX = 400

/** Achica la imagen y la devuelve como PNG en data URL (conserva la transparencia) */
function achicarLogo(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'))
      img.onload = () => {
        const escala = Math.min(1, LOGO_ANCHO_MAX / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * escala)
        canvas.height = Math.round(img.height * escala)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = lector.result as string
    }
    lector.readAsDataURL(archivo)
  })
}

export default function ConfiguracionPage() {
  const [id, setId] = useState<string | null>(null)
  const [campos, setCampos] = useState<Campos>(VACIO)
  const [esAdmin, setEsAdmin] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const inputLogo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    try {
      const [empresa, { data: { user } }] = await Promise.all([
        obtenerEmpresa(),
        supabase.auth.getUser(),
      ])
      const { id: idEmpresa, ...resto } = empresa
      setId(idEmpresa)
      setCampos(resto)
      if (user) {
        const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
        setEsAdmin(perfil?.rol === 'admin')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los datos de la empresa')
    } finally {
      setCargando(false)
    }
  }

  function cambiar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((c) => ({ ...c, [campo]: valor }))
    setGuardado(false)
  }

  async function elegirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    try {
      cambiar('logo', await achicarLogo(archivo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el logo')
    }
  }

  async function guardar() {
    if (!id) return
    if (!campos.nombre_fantasia.trim()) {
      setError('El nombre de fantasía no puede quedar vacío: es el que sale en el menú y en todos los PDF.')
      return
    }
    setGuardando(true)
    setError(null)
    // Texto vacío se guarda como null, para que los PDF no dejen renglones en blanco
    const limpio = Object.fromEntries(
      Object.entries(campos).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v])
    )
    const { data, error: err } = await supabase
      .from('restaurantes')
      .update(limpio)
      .eq('id', id)
      .select('id')
    setGuardando(false)
    if (err) {
      setError(`No se pudo guardar: ${err.message}`)
      return
    }
    // Sin error pero sin filas: la policy no dejó modificar (no es admin)
    if (!data || data.length === 0) {
      setError('No se guardó: sólo un administrador puede modificar los datos de la empresa.')
      return
    }
    invalidarEmpresa()
    setGuardado(true)
  }

  if (cargando) {
    return (
      <div>
        <p className="text-sm text-ink-muted">Cargando…</p>
      </div>
    )
  }

  const deshabilitado = !esAdmin || !id
  const v = (x: string | null) => x ?? ''

  return (
    <div>
      <div className="mb-6">
        <h1>Configuración</h1>
        <p className="text-sm text-ink-muted mt-1">
          Los datos del restaurante que salen en las órdenes de compra, los PDF y el menú
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">{error}</div>
      )}
      {!esAdmin && id && (
        <div className="bg-warning-bg border border-sand-dark rounded-lg px-4 py-3 text-sm text-ink mb-4">
          Sólo un administrador puede modificar estos datos.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Seccion titulo="Identidad" descripcion="Cómo se llama el restaurante y a nombre de quién se factura">
            <Campo label="Nombre de fantasía" ayuda="El que va en el menú, los PDF y el Excel" span={3}>
              <input id="nombre_fantasia" className="input" disabled={deshabilitado}
                value={campos.nombre_fantasia} onChange={(e) => cambiar('nombre_fantasia', e.target.value)} />
            </Campo>
            <Campo label="Razón social" ayuda='Sale en "Entregar en" de la OC' span={3}>
              <input id="razon_social" className="input" disabled={deshabilitado}
                value={v(campos.razon_social)} onChange={(e) => cambiar('razon_social', e.target.value)} />
            </Campo>
            <Campo label="CUIT" span={3}>
              <input id="cuit" className="input font-mono" inputMode="numeric" placeholder="30-12345678-9" disabled={deshabilitado}
                value={v(campos.cuit)} onChange={(e) => cambiar('cuit', e.target.value)} />
            </Campo>
            <Campo label="Condición frente al IVA" span={3}>
              <select id="condicion_iva" className="select" disabled={deshabilitado}
                value={v(campos.condicion_iva)} onChange={(e) => cambiar('condicion_iva', e.target.value || null)}>
                <option value="">Elegir…</option>
                {CONDICIONES_IVA.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
          </Seccion>

          <Seccion titulo="Domicilio" descripcion="Donde el proveedor entrega la mercadería">
            <Campo label="Dirección" span={4}>
              <input id="direccion" className="input" disabled={deshabilitado}
                value={v(campos.direccion)} onChange={(e) => cambiar('direccion', e.target.value)} />
            </Campo>
            <Campo label="Código postal" span={2}>
              <input id="codigo_postal" className="input font-mono" disabled={deshabilitado}
                value={v(campos.codigo_postal)} onChange={(e) => cambiar('codigo_postal', e.target.value)} />
            </Campo>
            <Campo label="Localidad" ayuda="También encabeza la fecha de la OC" span={3}>
              <input id="localidad" className="input" disabled={deshabilitado}
                value={v(campos.localidad)} onChange={(e) => cambiar('localidad', e.target.value)} />
            </Campo>
            <Campo label="Provincia" span={3}>
              <input id="provincia" className="input" disabled={deshabilitado}
                value={v(campos.provincia)} onChange={(e) => cambiar('provincia', e.target.value)} />
            </Campo>
          </Seccion>

          <Seccion titulo="Contacto" descripcion='Para que el proveedor sepa a quién responder. Si se cargan, salen en "Entregar en"'>
            <Campo label="Teléfono" span={3}>
              <input id="telefono" className="input font-mono" placeholder="Ej: 11 4567-8900" disabled={deshabilitado}
                value={v(campos.telefono)} onChange={(e) => cambiar('telefono', e.target.value)} />
            </Campo>
            <Campo label="Mail de compras" span={3}>
              <input id="email_compras" type="email" className="input" placeholder="Ej: compras@turestaurante.com" disabled={deshabilitado}
                value={v(campos.email_compras)} onChange={(e) => cambiar('email_compras', e.target.value)} />
            </Campo>
          </Seccion>

          <Seccion titulo="Órdenes de compra" descripcion="Lo que va al pie de cada orden">
            <Campo label="Horario de entrega" ayuda="Va primero en Condiciones, en negrita" span={6}>
              <input id="horario_entrega" className="input" placeholder="de lunes a sábado de 10.00 a 16.00" disabled={deshabilitado}
                value={v(campos.horario_entrega)} onChange={(e) => cambiar('horario_entrega', e.target.value)} />
            </Campo>
            <Campo label="Condiciones" ayuda="Una por renglón" span={6}>
              <textarea id="condiciones_oc" className="input min-h-[84px] leading-relaxed" rows={3} disabled={deshabilitado}
                value={v(campos.condiciones_oc)} onChange={(e) => cambiar('condiciones_oc', e.target.value)} />
            </Campo>
          </Seccion>

          <Seccion titulo="Logo" descripcion="Para el encabezado de la OC y de los informes en PDF">
            <div className="col-span-6 flex flex-wrap items-center gap-4">
              <div className="w-[132px] h-[72px] rounded-lg border border-dashed border-sand-dark bg-cream grid place-items-center">
                {campos.logo
                  ? <img src={campos.logo} alt="Logo" className="max-w-[108px] max-h-[52px]" />
                  : <span className="text-xs text-ink-light">Sin logo</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={deshabilitado}
                    onClick={() => inputLogo.current?.click()}>
                    {campos.logo ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {campos.logo && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={deshabilitado}
                      onClick={() => cambiar('logo', null)}>
                      Quitar
                    </button>
                  )}
                </div>
                <span className="text-xs text-ink-muted">PNG con fondo transparente. En los PDF sale en blanco, sobre la franja terracota.</span>
                <input ref={inputLogo} type="file" accept="image/png,image/jpeg" hidden onChange={elegirLogo} />
              </div>
            </div>
            <div className="col-span-6 flex flex-col gap-2 pt-1">
              <p className="text-sm font-medium text-ink">Dónde va el logo</p>
              <Tilde id="logo_en_oc" disabled={deshabilitado || !campos.logo} checked={campos.logo_en_oc}
                onChange={(v) => cambiar('logo_en_oc', v)}
                label="Orden de compra" />
              <Tilde id="logo_en_informes" disabled={deshabilitado || !campos.logo} checked={campos.logo_en_informes}
                onChange={(v) => cambiar('logo_en_informes', v)}
                label="Informes: consumo, resumen semanal y cierre de mes" />
              <span className="text-xs text-ink-muted">Donde no va el logo, el encabezado lleva el nombre de fantasía.</span>
            </div>
          </Seccion>

          {esAdmin && (
            <div className="flex items-center justify-end gap-3">
              {guardado && <span className="text-sm text-success">Guardado</span>}
              <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>

        <VistaPreviaOC campos={campos} />
      </div>
    </div>
  )
}

function Tilde({ id, label, checked, disabled, onChange }: {
  id: string; label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className={`flex items-center gap-2.5 text-sm ${disabled ? 'text-ink-light' : 'text-ink cursor-pointer'}`}>
      <input id={id} type="checkbox" className="h-4 w-4 rounded border-sand-dark accent-terracotta"
        checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-header py-3">
        <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
        <p className="text-xs text-ink-muted mt-0.5">{descripcion}</p>
      </div>
      <div className="p-4 grid grid-cols-6 gap-3.5">{children}</div>
    </div>
  )
}

const SPAN: Record<number, string> = {
  2: 'col-span-6 sm:col-span-2',
  3: 'col-span-6 sm:col-span-3',
  4: 'col-span-6 sm:col-span-4',
  6: 'col-span-6',
}

function Campo({ label, ayuda, span, children }: { label: string; ayuda?: string; span: number; children: React.ReactNode }) {
  return (
    <div className={`${SPAN[span]} flex flex-col gap-1.5 min-w-0`}>
      <label className="text-sm font-medium text-ink">{label}</label>
      {children}
      {ayuda && <span className="text-xs text-ink-muted">{ayuda}</span>}
    </div>
  )
}

/**
 * El encabezado y el pie de la OC tal como los dibuja generar-pdf-oc.ts, para
 * ver el efecto de un cambio antes de mandar una orden. Es una aproximación en
 * HTML, no el PDF.
 */
function VistaPreviaOC({ campos }: { campos: Campos }) {
  const nombre = campos.nombre_fantasia.trim() || 'Sin nombre'
  const usaLogo = !!campos.logo && campos.logo_en_oc
  const empresa = { ...campos, id: '', nombre_fantasia: nombre } as Empresa
  const lineasEntrega = [
    campos.cuit ? `CUIT ${campos.cuit}` : null,
    campos.direccion,
    [campos.localidad, campos.codigo_postal ? `CP ${campos.codigo_postal}` : null].filter(Boolean).join(' - ') || null,
    [campos.telefono, campos.email_compras].filter(Boolean).join(' · ') || null,
  ].filter(Boolean) as string[]
  const hoy = new Date()
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const fecha = [campos.localidad, `${String(hoy.getDate()).padStart(2, '0')} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`]
    .filter(Boolean).join(' ')

  return (
    <div className="xl:sticky xl:top-6 flex flex-col gap-4 min-w-0">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2">Así sale en la orden de compra</p>
        <div className="bg-white border border-sand rounded-md p-2.5 shadow-card font-[Lato,Helvetica,Arial,sans-serif]">
          <div className="bg-terracotta text-white rounded flex items-center gap-2.5 px-3 py-2.5">
            {usaLogo
              ? <img src={campos.logo!} alt="" className="h-[30px] w-auto max-w-[72px] object-contain brightness-0 invert" />
              : <span className="font-[Times_New_Roman,serif] italic font-bold text-[16px] leading-tight truncate max-w-[90px]">{nombre}</span>}
            <span className="self-stretch w-px bg-white/80 my-1" />
            <span className="flex-1 text-center font-bold text-[13px] leading-tight">Orden de compra</span>
            <span className="self-stretch w-px bg-white/80 my-1" />
            <div className="text-right text-[9px] shrink-0 leading-snug">
              <b className="block text-[11px]">N° OC-0000</b>
              {fecha}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <div className="bg-cream-dark rounded p-2 pl-3.5 text-[9px] text-[#646464] leading-snug border-l-2 border-terracotta">
              <div className="text-terracotta font-bold text-[7.5px] tracking-[0.08em]">PROVEEDOR:</div>
              <div className="text-[#282828] font-bold text-[11px]">Proveedor de ejemplo</div>
            </div>
            <div className="bg-cream-dark rounded p-2 pl-3.5 text-[9px] text-[#646464] leading-snug break-words min-w-0 border-l-2 border-terracotta">
              <div className="text-terracotta font-bold text-[7.5px] tracking-[0.08em]">ENTREGAR EN:</div>
              <div className="text-[#282828] font-bold text-[10px]">{nombreConRazonSocial(empresa)}</div>
              {lineasEntrega.map((l) => <div key={l}>{l}</div>)}
            </div>
          </div>
          <div className="mt-1.5 h-10 bg-[repeating-linear-gradient(#fff_0_9px,#F4F2EE_9px_10px)]" aria-hidden="true" />
          <div className="mt-2 text-[8.5px] text-[#646464] leading-relaxed">
            <b className="text-terracotta text-[10px]">Condiciones:</b>
            {campos.horario_entrega?.trim() && (
              <div className="font-bold text-[#282828]"><span className="text-terracotta">• </span>Horario de entrega: {campos.horario_entrega.trim().replace(/\.$/, '')}.</div>
            )}
            {condicionesOC(empresa).map((c, i) => <div key={i}><span className="text-terracotta">• </span>{c}</div>)}
          </div>
          <div className="mt-2 border-t border-terracotta pt-1 text-center text-[8px] text-ink-light">{nombre} | Orden de Compra</div>
        </div>
      </div>

      <div className="card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1">Dónde se usa</p>
        <ul className="text-sm divide-y divide-sand">
          {[
            ['Órdenes de compra', 'todo'],
            ['Menú lateral', 'nombre'],
            ['Fichas de receta y elaboración', 'nombre'],
            ['Consumo, resumen semanal, cierre de mes', 'nombre y logo'],
            ['Comparación de precios', 'nombre'],
            ['Exportación a Excel', 'nombre'],
          ].map(([donde, que]) => (
            <li key={donde} className="flex justify-between gap-3 py-1.5">
              <span>{donde}</span><span className="text-ink-muted text-right">{que}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
