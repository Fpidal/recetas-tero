'use client'

import { useState } from 'react'
import { DollarSign, BarChart3, History } from 'lucide-react'
import CargaDiaria from './components/CargaDiaria'
import DashboardIncidencia from './components/DashboardIncidencia'
import Historico from './components/Historico'

type Tab = 'carga' | 'dashboard' | 'historico'

export default function VentasPage() {
  const [tab, setTab] = useState<Tab>('carga')

  return (
    <div className="p-4 lg:p-6 mobile-content-padding">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ventas e Incidencia</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carga diaria de ventas y análisis de food cost real
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
        <TabButton
          active={tab === 'carga'}
          onClick={() => setTab('carga')}
          icon={<DollarSign className="w-4 h-4" />}
          label="Carga diaria"
        />
        <TabButton
          active={tab === 'dashboard'}
          onClick={() => setTab('dashboard')}
          icon={<BarChart3 className="w-4 h-4" />}
          label="Incidencia"
        />
        <TabButton
          active={tab === 'historico'}
          onClick={() => setTab('historico')}
          icon={<History className="w-4 h-4" />}
          label="Histórico"
        />
      </div>

      {/* Contenido */}
      {tab === 'carga' && <CargaDiaria />}
      {tab === 'dashboard' && <DashboardIncidencia />}
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
