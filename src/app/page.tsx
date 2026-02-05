'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ShoppingCart,
  AlertTriangle,
  FileText,
  ClipboardList,
  Plus,
  ChefHat,
  XCircle,
  UtensilsCrossed
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Colores del sistema
const COLORS = {
  verde: '#10B981',
  verdeBg: '#DCFCE7',
  naranja: '#F97316',
  naranjaBg: '#FFEDD5',
  indigo: '#6366F1',
  indigoBg: '#E0E7FF',
  morado: '#A855F7',
  moradoBg: '#F3E8FF',
  rojo: '#EF4444',
  rojoBg: '#FEE2E2',
  gris: '#6B7280',
  grisBg: '#F3F4F6',
}

interface DashboardData {
  totalPlatos: number
  foodCostPromedio: number
  ordenesPendientes: number
  ordenesSinFactura: number
  platosFueraRango: number
  mejorMargen: { nombre: string; ganancia: number } | null
}

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    totalPlatos: 0,
    foodCostPromedio: 0,
    ordenesPendientes: 0,
    ordenesSinFactura: 0,
    platosFueraRango: 0,
    mejorMargen: null,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setIsLoading(true)

    try {
      // Órdenes pendientes (enviadas pero no recibidas)
      const { count: ordenesPendientes } = await supabase
        .from('ordenes_compra')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'enviada')
        .eq('activo', true)

      // Órdenes enviadas sin factura
      const { data: ordenesEnviadas } = await supabase
        .from('ordenes_compra')
        .select('id, facturas_proveedor(id)')
        .in('estado', ['enviada', 'recibida'])
        .eq('activo', true)

      const ordenesSinFactura = (ordenesEnviadas || []).filter(
        (o: any) => !o.facturas_proveedor || o.facturas_proveedor.length === 0
      ).length

      // Food cost de la carta
      const { data: cartaData } = await supabase
        .from('carta')
        .select('food_cost_real')
        .eq('activo', true)

      const foodCosts = (cartaData || []).map((c: any) => c.food_cost_real).filter((fc: number) => fc > 0)
      const foodCostPromedio = foodCosts.length > 0
        ? foodCosts.reduce((a: number, b: number) => a + b, 0) / foodCosts.length
        : 0

      // Platos fuera de rango (food cost > 35%)
      const platosFueraRango = foodCosts.filter((fc: number) => fc > 35).length

      // Obtener todos los items de carta con precio y costo para calcular contribución real
      const { data: cartaCompleta } = await supabase
        .from('carta')
        .select('precio_carta, food_cost_real, platos(nombre)')
        .eq('activo', true)

      // Calcular mejor margen (mayor contribución = precio - costo)
      let mejorMargen = null
      if (cartaCompleta && cartaCompleta.length > 0) {
        const cartaConContribucion = cartaCompleta.map((item: any) => {
          const costo = item.precio_carta * (item.food_cost_real / 100)
          const contribucion = item.precio_carta - costo
          return {
            nombre: item.platos?.nombre || 'Plato',
            precio: item.precio_carta,
            contribucion,
          }
        })

        // Ordenar por contribución descendente
        cartaConContribucion.sort((a, b) => b.contribucion - a.contribucion)

        if (cartaConContribucion.length > 0) {
          mejorMargen = {
            nombre: cartaConContribucion[0].nombre,
            ganancia: cartaConContribucion[0].contribucion,
          }
        }
      }

      // Contar platos en carta
      const totalPlatos = cartaCompleta?.length || 0

      setData({
        totalPlatos,
        foodCostPromedio,
        ordenesPendientes: ordenesPendientes || 0,
        ordenesSinFactura,
        platosFueraRango,
        mejorMargen,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }

    setIsLoading(false)
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Resumen del sistema Tero Restó</p>
      </div>

      {/* 4 Tarjetas Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tarjeta 1 - Platos en Carta */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              className="p-2.5 rounded-lg"
              style={{ backgroundColor: COLORS.verdeBg }}
            >
              <ClipboardList className="w-5 h-5" style={{ color: COLORS.verde }} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">Platos en Carta</p>
          <p className="text-2xl font-bold text-gray-900">
            {isLoading ? '...' : `${data.totalPlatos} platos`}
          </p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: COLORS.verde, width: '100%' }}
            />
          </div>
        </div>

        {/* Tarjeta 2 - Food Cost Promedio */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              className="p-2.5 rounded-lg"
              style={{ backgroundColor: COLORS.naranjaBg }}
            >
              <UtensilsCrossed className="w-5 h-5" style={{ color: COLORS.naranja }} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">Food Cost Promedio</p>
          <p className="text-2xl font-bold text-gray-900">
            {isLoading ? '...' : `${data.foodCostPromedio.toFixed(1)}%`}
          </p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: COLORS.naranja, width: `${Math.min(data.foodCostPromedio * 2.5, 100)}%` }}
            />
          </div>
        </div>

        {/* Tarjeta 3 - Órdenes Pendientes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              className="p-2.5 rounded-lg"
              style={{ backgroundColor: COLORS.indigoBg }}
            >
              <ShoppingCart className="w-5 h-5" style={{ color: COLORS.indigo }} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">Órdenes Pendientes</p>
          <p className="text-2xl font-bold text-gray-900">
            {isLoading ? '...' : `${data.ordenesPendientes} sin recibir`}
          </p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: COLORS.indigo, width: `${Math.min(data.ordenesPendientes * 20, 100)}%` }}
            />
          </div>
        </div>

        {/* Tarjeta 4 - Platos Fuera de Rango */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              className="p-2.5 rounded-lg"
              style={{ backgroundColor: COLORS.rojoBg }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: COLORS.rojo }} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">Platos Fuera de Rango</p>
          <p className="text-2xl font-bold text-gray-900">
            {isLoading ? '...' : `${data.platosFueraRango} platos`}
          </p>
          <p className="text-xs text-gray-400 mt-1">(food cost &gt;35%)</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: COLORS.rojo, width: `${data.totalPlatos > 0 ? (data.platosFueraRango / data.totalPlatos) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Segunda fila: Alertas + Acciones Rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel de Alertas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Alertas</h2>
          <div className="space-y-3">
            {/* Alerta - Órdenes sin factura */}
            <Link href="/ordenes-compra" className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.rojoBg }}>
                  <XCircle className="w-4 h-4" style={{ color: COLORS.rojo }} />
                </div>
                <span className="text-sm text-gray-700">Órdenes sin factura</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: data.ordenesSinFactura > 0 ? COLORS.rojo : COLORS.verde }}
              >
                {data.ordenesSinFactura}
              </span>
            </Link>

            {/* Alerta - Platos fuera de rango */}
            <Link href="/carta" className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.naranjaBg }}>
                  <ChefHat className="w-4 h-4" style={{ color: COLORS.naranja }} />
                </div>
                <span className="text-sm text-gray-700">Platos con food cost &gt;35%</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: data.platosFueraRango > 0 ? COLORS.naranja : COLORS.verde }}
              >
                {data.platosFueraRango}
              </span>
            </Link>

            {/* Alerta - Órdenes pendientes */}
            <Link href="/ordenes-compra" className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.indigoBg }}>
                  <ShoppingCart className="w-4 h-4" style={{ color: COLORS.indigo }} />
                </div>
                <span className="text-sm text-gray-700">Órdenes pendientes de recibir</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: data.ordenesPendientes > 0 ? COLORS.indigo : COLORS.verde }}
              >
                {data.ordenesPendientes}
              </span>
            </Link>
          </div>
        </div>

        {/* Panel de Acciones Rápidas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/ordenes-compra/nueva"
              className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
            >
              <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.indigoBg }}>
                <Plus className="w-4 h-4" style={{ color: COLORS.indigo }} />
              </div>
              <span className="text-sm font-medium text-gray-700">Nueva Orden de Compra</span>
            </Link>

            <Link
              href="/facturas"
              className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.grisBg }}>
                <FileText className="w-4 h-4" style={{ color: COLORS.gris }} />
              </div>
              <span className="text-sm font-medium text-gray-700">Cargar Factura</span>
            </Link>

            <Link
              href="/carta"
              className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors"
            >
              <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.rojoBg }}>
                <ClipboardList className="w-4 h-4" style={{ color: COLORS.rojo }} />
              </div>
              <span className="text-sm font-medium text-gray-700">Ajustar Precios en Carta</span>
            </Link>

            <Link
              href="/carta"
              className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-colors"
            >
              <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.naranjaBg }}>
                <Plus className="w-4 h-4" style={{ color: COLORS.naranja }} />
              </div>
              <span className="text-sm font-medium text-gray-700">Agregar Plato a Carta</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Tercera fila: Mejor Margen */}
      {data.mejorMargen && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Mejor Contribución en Carta</h2>
          <div className="flex items-center gap-6">
            {/* Imagen placeholder */}
            <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg flex items-center justify-center flex-shrink-0">
              <ChefHat className="w-10 h-10 text-orange-300" />
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900 mb-1">
                {data.mejorMargen.nombre}
              </p>
              <p className="text-sm text-gray-500 mb-2">Mayor contribución por plato vendido</p>
              <p className="text-3xl font-bold" style={{ color: COLORS.verde }}>
                + ${data.mejorMargen.ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
