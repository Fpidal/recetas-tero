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
  Trash2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Proveedores', href: '/proveedores', icon: Users },
  { name: 'Insumos', href: '/insumos', icon: Package },
  { name: 'Evolución Precios', href: '/precios', icon: TrendingUp },
  { name: 'Elaboraciones', href: '/recetas-base', icon: BookOpen },
  { name: 'Recetas', href: '/platos', icon: ChefHat },
  { name: 'Menús Ejecutivos', href: '/menus-ejecutivos', icon: UtensilsCrossed },
  { name: 'Menús Especiales', href: '/menus-especiales', icon: LayoutGrid },
  { name: 'Carta', href: '/carta', icon: ClipboardList },
  { name: 'Órdenes de Compra', href: '/ordenes-compra', icon: ShoppingCart },
  { name: 'Facturas', href: '/facturas', icon: FileText },
  { name: 'Papelera', href: '/papelera', icon: Trash2 },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [papeleraCount, setPapeleraCount] = useState(0)

  useEffect(() => {
    fetchPapeleraCount()
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

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Tero Restó</h1>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const isPapelera = item.href === '/papelera'
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <item.icon
                className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                }`}
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
    </div>
  )
}
