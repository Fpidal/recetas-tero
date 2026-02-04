'use client'

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

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Proveedores', href: '/proveedores', icon: Users },
  { name: 'Insumos', href: '/insumos', icon: Package },
  { name: 'Evolución Precios', href: '/precios', icon: TrendingUp },
  { name: 'Recetas Base', href: '/recetas-base', icon: BookOpen },
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

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Tero Restó</h1>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
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
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
