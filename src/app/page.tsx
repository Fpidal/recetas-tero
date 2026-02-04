import Link from 'next/link'
import {
  Package,
  ShoppingCart,
  ChefHat,
  UtensilsCrossed,
  ClipboardList,
  FileText,
  Users,
  LayoutGrid,
  BookOpen
} from 'lucide-react'

const modules = [
  { name: 'Proveedores', href: '/proveedores', icon: Users, color: 'bg-blue-500', description: 'Gestión de proveedores' },
  { name: 'Insumos', href: '/insumos', icon: Package, color: 'bg-green-500', description: 'Mercadería y materias primas' },
  { name: 'Recetas Base', href: '/recetas-base', icon: BookOpen, color: 'bg-purple-500', description: 'Salsas, guarniciones, preparados' },
  { name: 'Platos', href: '/platos', icon: ChefHat, color: 'bg-orange-500', description: 'Recetas de platos principales' },
  { name: 'Menús Ejecutivos', href: '/menus-ejecutivos', icon: UtensilsCrossed, color: 'bg-teal-500', description: 'Menús del día' },
  { name: 'Menús Especiales', href: '/menus-especiales', icon: LayoutGrid, color: 'bg-pink-500', description: 'Menús con opciones' },
  { name: 'Carta', href: '/carta', icon: ClipboardList, color: 'bg-red-500', description: 'Precios y food cost' },
  { name: 'Órdenes de Compra', href: '/ordenes-compra', icon: ShoppingCart, color: 'bg-indigo-500', description: 'Pedidos a proveedores' },
  { name: 'Facturas', href: '/facturas', icon: FileText, color: 'bg-gray-500', description: 'Registro de compras' },
]

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Tero Restó</h1>
      <p className="text-gray-600 mb-8">Sistema de Gestión de Mercadería y Recetas</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => (
          <Link
            key={module.name}
            href={module.href}
            className="block p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${module.color}`}>
                <module.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{module.name}</h2>
                <p className="text-sm text-gray-500">{module.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
