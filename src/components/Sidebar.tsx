'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package,
  ShoppingCart,
  ChefHat,
  UtensilsCrossed,
  ClipboardList,
  FileText,
  Users,
  LayoutGrid,
  BookOpen,
  Home,
  TrendingUp,
  Trash2,
  Menu,
  X
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const navigation = [
  { name: 'Inicio', href: '/', icon: Home, color: '#FFFFFF' },
  { name: 'Proveedores', href: '/proveedores', icon: Users, color: '#4F8EF7' },
  { name: 'Insumos', href: '/insumos', icon: Package, color: '#10B981' },
  { name: 'Evolución Precios', href: '/precios', icon: TrendingUp, color: '#8B5CF6' },
  { name: 'Elaboraciones', href: '/recetas-base', icon: BookOpen, color: '#EF4444' },
  { name: 'Recetas', href: '/platos', icon: ChefHat, color: '#A855F7' },
  { name: 'Menús Ejecutivos', href: '/menus-ejecutivos', icon: UtensilsCrossed, color: '#14B8A6' },
  { name: 'Menús Especiales', href: '/menus-especiales', icon: LayoutGrid, color: '#EC4899' },
  { name: 'Carta', href: '/carta', icon: ClipboardList, color: '#EF4444' },
  { name: 'Órdenes de Compra', href: '/ordenes-compra', icon: ShoppingCart, color: '#6366F1' },
  { name: 'Facturas', href: '/facturas', icon: FileText, color: '#6B7280' },
  { name: 'Papelera', href: '/papelera', icon: Trash2, color: '#DC2626' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [papeleraCount, setPapeleraCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetchPapeleraCount()
  }, [pathname])

  // Cerrar menú mobile al cambiar de página
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  async function fetchPapeleraCount() {
    const [prov, ins, rb, pl, me, mesp, ca, oc, fa] = await Promise.all([
      supabase.from('proveedores').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('insumos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('recetas_base').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('platos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('menus_ejecutivos').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('menus_especiales').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('carta').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('ordenes_compra').select('id', { count: 'exact', head: true }).eq('activo', false),
      supabase.from('facturas_proveedor').select('id', { count: 'exact', head: true }).eq('activo', false),
    ])

    const total = (prov.count || 0) + (ins.count || 0) + (rb.count || 0) +
      (pl.count || 0) + (me.count || 0) + (mesp.count || 0) +
      (ca.count || 0) + (oc.count || 0) + (fa.count || 0)

    setPapeleraCount(total)
  }

  const NavContent = () => (
    <>
      <div className="flex h-16 items-center justify-between border-b border-gray-800 px-4">
        <h1 className="text-xl font-bold text-white">Tero Restó</h1>
        {/* Botón cerrar en mobile */}
        <button
          className="lg:hidden text-gray-400 hover:text-white p-2"
          onClick={() => setMobileMenuOpen(false)}
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const isPapelera = item.href === '/papelera'
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center rounded-md px-3 py-3 lg:py-2 text-base lg:text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <item.icon
                className="mr-3 h-6 w-6 lg:h-5 lg:w-5 flex-shrink-0"
                style={{ color: isActive ? '#FFFFFF' : item.color }}
              />
              {item.name}
              {isPapelera && papeleraCount > 0 && (
                <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {papeleraCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      {/* Header mobile con hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 h-14 flex items-center px-4 shadow-lg">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="text-white p-2 -ml-2 hover:bg-gray-800 rounded-md"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="ml-3 text-lg font-bold text-white">Tero Restó</h1>
      </div>

      {/* Overlay para mobile */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar mobile (drawer) */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <NavContent />
        </div>
      </div>

      {/* Sidebar desktop (fijo) */}
      <div className="hidden lg:flex h-full w-64 flex-col bg-gray-900 flex-shrink-0">
        <NavContent />
      </div>
    </>
  )
}
