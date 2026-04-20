'use client'

import { useState } from 'react'
import { ClipboardEdit, Package, Star, History, CalendarRange } from 'lucide-react'
import CargaDiaria from './components/CargaDiaria'
import ConsumoDiario from './components/ConsumoDiario'
import Incidencia from './components/Incidencia'
import Resumen from './components/Resumen'
import Historico from './components/Historico'
import type { Servicio } from '@/types/analisis'

type Tab = 'carga' | 'consumo' | 'incidencia' | 'resumen' | 'historico'

function dateToString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AnalisisPage() {
  const [tab, setTab] = useState<Tab>('carga')

  // Estado compartido entre solapas: fecha + servicio seleccionados
  // Se mantiene al cambiar de solapa así el usuario no tiene que reseleccionar
  const [fecha, setFecha] = useState(dateToString(new Date()))
  const [servicio, setServicio] = useState<Servicio>('mediodia')

  return (
    <div className="p-4 lg:p-6 mobile-content-padding">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📈 Análisis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carga real de cocina, desglose por insumo e incidencia real (food cost)
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
        <TabButton
          active={tab === 'carga'}
          onClick={() => setTab('carga')}
          icon={<ClipboardEdit className="w-4 h-4" />}
          label="Carga diaria"
        />
        <TabButton
          active={tab === 'consumo'}
          onClick={() => setTab('consumo')}
          icon={<Package className="w-4 h-4" />}
          label="Consumo diario"
        />
        <TabButton
          active={tab === 'incidencia'}
          onClick={() => setTab('incidencia')}
          icon={<Star className="w-4 h-4" />}
          label="Incidencia"
        />
        <TabButton
          active={tab === 'resumen'}
          onClick={() => setTab('resumen')}
          icon={<CalendarRange className="w-4 h-4" />}
          label="Resumen"
        />
        <TabButton
          active={tab === 'historico'}
          onClick={() => setTab('historico')}
          icon={<History className="w-4 h-4" />}
          label="Histórico"
        />
      </div>

      {tab === 'carga' && (
        <CargaDiaria fecha={fecha} setFecha={setFecha} servicio={servicio} setServicio={setServicio} />
      )}
      {tab === 'consumo' && (
        <ConsumoDiario fecha={fecha} setFecha={setFecha} servicio={servicio} setServicio={setServicio} />
      )}
      {tab === 'incidencia' && (
        <Incidencia fecha={fecha} setFecha={setFecha} servicio={servicio} setServicio={setServicio} />
      )}
      {tab === 'resumen' && (
        <Resumen fecha={fecha} servicio={servicio} setServicio={setServicio} />
      )}
      {tab === 'historico' && <Historico />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 pb-3 px-2 sm:px-1 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
        active
          ? 'border-gray-900 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
