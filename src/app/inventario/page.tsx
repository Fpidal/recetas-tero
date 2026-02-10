'use client'

import { useState, useEffect } from 'react'
import { Warehouse } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function InventarioPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Placeholder - aquí irá la carga del inventario
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-600">Control de stock de insumos</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <Warehouse className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">Página en construcción</p>
        <p className="text-gray-400 text-sm mt-2">
          Acá se mostrará el stock de los insumos marcados con "Inventario"
        </p>
      </div>
    </div>
  )
}
