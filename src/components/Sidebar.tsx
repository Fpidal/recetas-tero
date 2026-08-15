'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Package,
  ShoppingCart,
  ChefHat,
  ClipboardList,
  FileText,
  Users,
  BookOpen,
  Home,
  BarChart3,
  Trash2,
  Menu,
  X,
  Warehouse,
  Wine,
  Martini,
  LogOut,
  User,
  DollarSign,
  TrendingUp,
  History
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { APP_VERSION, APP_FECHA, CHANGELOG } from '@/lib/version'
import Modal from './ui/Modal'

/**
 * Navegación agrupada por lo que estás haciendo, no por tipo de dato.
 *
 * Son los MISMOS catorce destinos de antes: no se agregó ni se quitó ninguno,
 * solo se ordenaron y se les puso un título arriba. Catorce ítems seguidos no
 * dicen qué hace el sistema; agrupados se pueden escanear.
 *
 * POR QUÉ NO ES UN ACORDEÓN: las pantallas tienen 26 solapas entre todas
 * (Estadísticas 6, Análisis 5, Carta 4…). Desplegarlas acá llevaría el Sidebar
 * de 14 líneas a 40. Y las solapas comunican algo que el Sidebar no puede:
 * "estás en el mismo lugar, cambiando el ángulo".
 *
 * QUÉ NO ENTRA: Proveedores vive dentro de Insumos y Menús ejecutivos dentro
 * de Carta. Los dos son importantes pero se tocan poco, y un renglón fijo del
 * Sidebar se le debe a lo que se usa todos los días.
 *
 * Cocina y Barra separadas no es capricho visual: desde V.23 el sistema separa
 * el costo del servicio en esas dos áreas, así que el menú refleja cómo está
 * pensado el negocio por dentro.
 */
interface ItemNav {
  name: string
  href: string
  icon: any
}

interface GrupoNav {
  /** null = sin encabezado, para Inicio y Papelera */
  titulo: string | null
  items: ItemNav[]
}

const navigation: GrupoNav[] = [
  {
    titulo: null,
    items: [{ name: 'Inicio', href: '/', icon: Home }],
  },
  {
    titulo: 'Compras',
    items: [
      { name: 'Órdenes de Compra', href: '/ordenes-compra', icon: ShoppingCart },
      { name: 'Facturas', href: '/facturas', icon: FileText },
      { name: 'Insumos', href: '/insumos', icon: Package },
    ],
  },
  {
    titulo: 'Cocina',
    items: [
      { name: 'Elaboraciones', href: '/recetas-base', icon: BookOpen },
      { name: 'Recetas', href: '/platos', icon: ChefHat },
      { name: 'Carta', href: '/carta', icon: ClipboardList },
    ],
  },
  {
    titulo: 'Barra',
    items: [
      { name: 'Vinos', href: '/vinos', icon: Wine },
      { name: 'Tragos', href: '/tragos', icon: Martini },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { name: 'Ventas', href: '/ventas', icon: DollarSign },
      { name: 'Análisis', href: '/analisis', icon: TrendingUp },
      { name: 'Inventario', href: '/inventario', icon: Warehouse },
    ],
  },
  {
    titulo: 'Informes',
    items: [{ name: 'Estadísticas', href: '/estadisticas', icon: BarChart3 }],
  },
  {
    titulo: null,
    items: [{ name: 'Papelera', href: '/papelera', icon: Trash2 }],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [papeleraCount, setPapeleraCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [changelogOpen, setChangelogOpen] = useState(false)

  useEffect(() => {
    fetchPapeleraCount()
    fetchUserProfile()
  }, [pathname])

  // Cerrar menú mobile al cambiar de página
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function fetchUserProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('nombre, rol')
        .eq('id', user.id)
        .single()
      if (perfil) {
        setUserName(perfil.nombre)
        setUserRole(perfil.rol)
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function fetchPapeleraCount() {
    // Nota: carta no se cuenta porque "Fuera de Carta" no es papelera, es temporal
    const [prov, ins, rb, pl, tr, me, mesp, oc, fa] = await Promise.all([
      supabase.from('proveedores').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('insumos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('recetas_base').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('platos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('tragos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('menus_ejecutivos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('menus_especiales').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('ordenes_compra').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('facturas_proveedor').select('id', { count: 'exact', head: true }).eq('activo', false),
    ])

    const total = (prov.count || 0) + (ins.count || 0) + (rb.count || 0) +
      (pl.count || 0) + (tr.count || 0) + (me.count || 0) + (mesp.count || 0) +
      (oc.count || 0) + (fa.count || 0)

    setPapeleraCount(total)
  }

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div>
          <h1 className="font-serif text-[20px] text-white tracking-tight leading-none">Tero Restó</h1>
          <button
            onClick={() => setChangelogOpen(true)}
            className="text-[10px] text-white/35 hover:text-white/70 font-mono tracking-wide mt-1 transition-colors cursor-pointer text-left inline-flex items-center gap-1"
            title="Ver novedades"
          >
            {APP_VERSION.toLowerCase()} · {APP_FECHA}
            <History className="w-2.5 h-2.5" />
          </button>
        </div>
        {/* Botón cerrar en mobile */}
        <button
          className="lg:hidden text-white/60 hover:text-white p-2 transition-colors"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Navegación */}
      {/* min-h-0 es lo que permite que el scroll viva DENTRO del nav.
          Sin eso, un item flex no baja de la altura de su contenido (min-height:auto),
          el nav crece con la lista y empuja el bloque del usuario fuera de pantalla. */}
      <nav className="flex-1 min-h-0 px-3 py-2 overflow-y-auto">
        {navigation.map((grupo, i) => (
          <div key={grupo.titulo ?? `sin-titulo-${i}`} className={i > 0 ? 'mt-2.5' : ''}>
            {grupo.titulo && (
              <div className="px-3 pb-0.5 text-[9.5px] font-bold uppercase tracking-[0.11em] text-white/30">
                {grupo.titulo}
              </div>
            )}
            <div className="space-y-0.5">
        {grupo.items.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const isPapelera = item.href === '/papelera'
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`group flex items-center rounded-lg px-3 py-2.5 lg:py-[5px] text-base lg:text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white/[0.09] text-white'
                  : 'text-white/65 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <item.icon
                strokeWidth={1.5}
                className={`mr-3 lg:mr-2.5 h-5 w-5 lg:h-4 lg:w-4 flex-shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-white/45 group-hover:text-white/80'
                }`}
              />
              {item.name}
              {isPapelera && papeleraCount > 0 && (
                <span className="ml-auto bg-terracotta text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {papeleraCount}
                </span>
              )}
            </Link>
          )
        })}
            </div>
          </div>
        ))}
      </nav>

      {/* Usuario y logout */}
      {userName && (
        <div className="flex-shrink-0 border-t border-white/10 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-terracotta rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-white/50 capitalize">{userRole}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/50 hover:text-terracotta p-1.5 rounded-md hover:bg-white/5 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Header mobile con hamburger */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-forest flex items-end px-4 pb-3 shadow-lg"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)',
          minHeight: 'calc(56px + env(safe-area-inset-top, 0px))'
        }}
      >
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="text-white p-2 -ml-2 hover:bg-white/10 rounded-md transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="ml-3 font-serif text-lg text-white tracking-tight">Tero Restó</h1>
      </div>

      {/* Overlay para mobile */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar mobile (drawer) */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-forest transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <NavContent />
        </div>
      </div>

      {/* Sidebar desktop (fijo) */}
      <div className="hidden lg:flex h-full w-64 flex-col bg-forest flex-shrink-0">
        <NavContent />
      </div>

      {/* Modal de Novedades (changelog) */}
      <Modal
        isOpen={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        title="Novedades"
        size="sm"
      >
        <div className="space-y-5">
          {CHANGELOG.map((v, i) => (
            <div key={v.version}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-sm font-bold text-forest">{v.version}</span>
                {i === 0 && (
                  <span className="text-[10px] font-medium text-forest bg-forest/10 px-2 py-0.5 rounded-full">
                    actual
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-ink/40">{v.fecha}</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-sm text-ink/70">
                {v.cambios.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
