'use client'

import { useState, useEffect } from 'react'
import { FileDown, Beef, Fish, Package, Carrot, Milk, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { CategoriaStock, contarInsumosCategoria, generarPDFStock } from '@/lib/generar-pdf-stock'

interface CategoriaCard {
  categoria: CategoriaStock
  titulo: string
  descripcion: string
  icon: React.ElementType
  iconColor: string
  bgColor: string
}

const CATEGORIAS: CategoriaCard[] = [
  {
    categoria: 'Carnes',
    titulo: 'Carnes',
    descripcion: 'Pollo y otras carnes',
    icon: Beef,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  {
    categoria: 'Pescados_Mariscos',
    titulo: 'Pescados y Mariscos',
    descripcion: 'Mariscos y pescados',
    icon: Fish,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    categoria: 'Almacen',
    titulo: 'Almacen',
    descripcion: 'Productos secos y envasados',
    icon: Package,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  {
    categoria: 'Verduras_Frutas',
    titulo: 'Verduras y Frutas',
    descripcion: 'Productos frescos',
    icon: Carrot,
    iconColor: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    categoria: 'Lacteos_Fiambres',
    titulo: 'Lacteos y Fiambres',
    descripcion: 'Refrigerados',
    icon: Milk,
    iconColor: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
]

export default function HojasControl() {
  const [conteos, setConteos] = useState<Record<CategoriaStock, number>>({} as Record<CategoriaStock, number>)
  const [loading, setLoading] = useState<CategoriaStock | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchConteos()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  async function fetchConteos() {
    const results: Partial<Record<CategoriaStock, number>> = {}
    for (const cat of CATEGORIAS) {
      results[cat.categoria] = await contarInsumosCategoria(cat.categoria)
    }
    setConteos(results as Record<CategoriaStock, number>)
  }

  async function handleGenerarPDF(categoria: CategoriaStock) {
    setLoading(categoria)
    try {
      await generarPDFStock(categoria)
      setToast({ message: 'PDF generado correctamente', type: 'success' })
    } catch (error) {
      console.error('Error generando PDF:', error)
      setToast({ message: error instanceof Error ? error.message : 'Error al generar PDF', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-gray-600">
          Genera hojas de control de stock para imprimir y completar manualmente
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIAS.map((cat) => {
          const Icon = cat.icon
          const count = conteos[cat.categoria] ?? 0
          const isLoading = loading === cat.categoria

          return (
            <div
              key={cat.categoria}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${cat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${cat.iconColor}`} />
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {count} insumo{count !== 1 ? 's' : ''}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{cat.titulo}</h3>
              <p className="text-sm text-gray-500 mb-4">{cat.descripcion}</p>

              <Button
                onClick={() => handleGenerarPDF(cat.categoria)}
                disabled={isLoading || count === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 mr-2" />
                    Generar PDF
                  </>
                )}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
