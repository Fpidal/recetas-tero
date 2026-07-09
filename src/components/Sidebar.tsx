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

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Insumos', href: '/insumos', icon: Package },
  { name: 'Vinos', href: '/vinos', icon: Wine },
  { name: 'Estadísticas', href: '/estadisticas', icon: BarChart3 },
  { name: 'Ventas', href: '/ventas', icon: DollarSign },
  { name: 'Análisis', href: '/analisis', icon: TrendingUp },
  { name: 'Elaboraciones', href: '/recetas-base', icon: BookOpen },
  { name: 'Recetas', href: '/platos', icon: ChefHat },
  { name: 'Tragos', href: '/tragos', icon: Martini },
  { name: 'Carta', href: '/carta', icon: ClipboardList },
  { name: 'Órdenes de Compra', href: '/ordenes-compra', icon: ShoppingCart },
  { name: 'Facturas', href: '/facturas', icon: FileText },
  { name: 'Inventario', href: '/inventario', icon: Warehouse },
  { name: 'Papelera', href: '/papelera', icon: Trash2 },
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
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <div>
          <h1 className="font-display text-xl font-bold text-white tracking-tight leading-none">Tero Restó</h1>
          <button
            onClick={() => setChangelogOpen(true)}
            className="text-[10px] text-white/40 hover:text-white/80 font-mono mt-0.5 transition-colors cursor-pointer text-left inline-flex items-center gap-1"
            title="Ver novedades"
          >
            {APP_VERSION} ({APP_FECHA})
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
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const isPapelera = item.href === '/papelera'
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center rounded-lg px-3 py-3 lg:py-2.5 text-base lg:text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white/10 text-white border-l-4 border-l-terracotta -ml-px'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon
                className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                  isActive ? 'text-terracotta' : 'text-olive-light group-hover:text-white/90'
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
      </nav>

      {/* Usuario y logout */}
      {userName && (
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-terracotta rounded-full flex items-center justify-center flex-shrink-0">
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
        <h1 className="ml-3 font-display text-lg font-bold text-white tracking-tight">Tero Restó</h1>
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
