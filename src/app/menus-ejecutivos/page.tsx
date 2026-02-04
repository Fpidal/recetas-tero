'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, UtensilsCrossed } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Table } from '@/components/ui'
import { MenuEjecutivo } from '@/types/database'
import Link from 'next/link'

export default function MenusEjecutivosPage() {
  const [menus, setMenus] = useState<MenuEjecutivo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchMenus()
  }, [])

  async function fetchMenus() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('menus_ejecutivos')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching menus:', error)
    } else {
      setMenus(data || [])
    }
    setIsLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este menú?')) return

    const { error } = await supabase
      .from('menus_ejecutivos')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      alert('Error al eliminar el menú')
    } else {
      fetchMenus()
    }
  }

  const columns = [
    {
      key: 'nombre',
      header: 'Nombre',
      render: (m: MenuEjecutivo) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg">
            <UtensilsCrossed className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{m.nombre}</p>
            {m.descripcion && (
              <p className="text-sm text-gray-500 truncate max-w-xs">
                {m.descripcion}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'costo',
      header: 'Costo Total',
      render: (m: MenuEjecutivo) => (
        <span className="font-medium text-green-600">
          ${m.costo_total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      render: (m: MenuEjecutivo) => (
        <div className="flex justify-end gap-2">
          <Link href={`/menus-ejecutivos/${m.id}`}>
            <Button variant="ghost" size="sm">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(m.id)}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menús Ejecutivos</h1>
          <p className="text-gray-600">Menús del día con composición directa</p>
        </div>
        <Link href="/menus-ejecutivos/nuevo">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Menú
          </Button>
        </Link>
      </div>

      <Table
        columns={columns}
        data={menus}
        keyExtractor={(m) => m.id}
        isLoading={isLoading}
        emptyMessage="No hay menús ejecutivos registrados"
      />
    </div>
  )
}
