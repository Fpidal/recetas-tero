'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  FileText,
  ClipboardList,
  Plus,
  BarChart3,
  Calendar,
  ChefHat,
  ArrowUpRight,
  XCircle,
  UtensilsCrossed,
  RefreshCw
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
  insumosMinimo: number
  foodCostPromedio: number
  foodCostVariacion: number
  ordenesPendientes: number
  ultimaVariacion: { nombre: string; porcentaje: number } | null
  alertas: {
    insumosAumento: number
    ordenesSinFactura: number
    platosFueraRango: number
    recetasSinActualizar: number
  }
  mejorMargen: { nombre: string; ganancia: number } | null
}

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    insumosMinimo: 0,
    foodCostPromedio: 0,
    foodCostVariacion: 0,
    ordenesPendientes: 0,
    ultimaVariacion: null,
    alertas: {
      insumosAumento: 0,
      ordenesSinFactura: 0,
      platosFueraRango: 0,
      recetasSinActualizar: 0,
    },
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

      // Mejor margen (mayor contribución)
      const { data: mejorMargenData } = await supabase
        .from('carta')
        .select('precio_carta, platos(nombre)')
        .eq('activo', true)
        .order('precio_carta', { ascending: false })
        .limit(1)

      let mejorMargen = null
      if (mejorMargenData && mejorMargenData.length > 0) {
        const item = mejorMargenData[0] as any
        // Calcular contribución aproximada (precio - 30% costo estimado)
        const ganancia = item.precio_carta * 0.65
        mejorMargen = {
          nombre: item.platos?.nombre || 'Plato',
          ganancia: ganancia,
        }
      }

      // Última variación de precios (simulado por ahora)
      const ultimaVariacion = { nombre: 'Queso rallado', porcentaje: 18 }

      setData({
        insumosMinimo: 6, // TODO: calcular desde stock mínimo
        foodCostPromedio,
        foodCostVariacion: 1.2, // TODO: calcular variación real
        ordenesPendientes: ordenesPendientes || 0,
        ultimaVariacion,
        alertas: {
          insumosAumento: 3, // TODO: calcular desde historial precios
          ordenesSinFactura,
          platosFueraRango,
          recetasSinActualizar: 8, // TODO: calcular recetas antiguas
        },
        mejorMargen,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }

    setIsLoading(false)
  }

  // Datos del gráfico (simulados)
  const chartData = [
    { fecha: '30/8', valor: 180 },
    { fecha: '3/9', valor: 220 },
    { fecha: '6/9', valor: 250 },
    { fecha: '9/9', valor: 230 },
    { fecha: '12/9', valor: 270 },
    { fecha: '15/9', valor: 290 },
    { fecha: '18/9', valor: 260 },
    { fecha: '21/9', valor: 300 },
    { fecha: '24/9', valor: 280 },
    { fecha: '27/9', valor: 310 },
  ]

  const maxValor = Math.max(...chartData.map(d => d.valor))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Resumen del sistema Tero Restó</p>
      </div>

      {/* 4 Tarjetas Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tarjeta 1 - Insumos bajo mínimo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              className="p-2.5 rounded-lg"
              style={{ backgroundColor: COLORS.verdeBg }}
            >
              <Package className="w-5 h-5" style={{ color: COLORS.verde }} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">Insumos bajo mínimo</p>
          <p className="text-2xl font-bold text-gray-900">
            {isLoading ? '...' : `${data.insumosMinimo} insumos`}
          </p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: COLORS.verde, width: '40%' }}
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
            <span className="flex items-center text-xs font-medium text-red-500">
              <TrendingUp className="w-3 h-3 mr-0.5" />
              {data.foodCostVariacion}%
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-1">Food Cost Promedio Carta</p>
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

        {/* Tarjeta 4 - Última Variación de Precios */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div
              className="p-2.5 rounded-lg"
              style={{ backgroundColor: COLORS.moradoBg }}
            >
              <TrendingUp className="w-5 h-5" style={{ color: COLORS.morado }} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">Última Variación de Precios</p>
          <p className="text-2xl font-bold text-gray-900">
            {isLoading ? '...' : data.ultimaVariacion ? `${data.ultimaVariacion.nombre} +${data.ultimaVariacion.porcentaje}%` : 'Sin datos'}
          </p>
          <p className="text-xs text-gray-400 mt-1">(últimos 7 días)</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: COLORS.morado, width: '60%' }}
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
            {/* Alerta 1 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.naranjaBg }}>
                  <ArrowUpRight className="w-4 h-4" style={{ color: COLORS.naranja }} />
                </div>
                <span className="text-sm text-gray-700">Insumos con aumento &gt;10%</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: COLORS.naranja }}
              >
                {data.alertas.insumosAumento}
              </span>
            </div>

            {/* Alerta 2 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.rojoBg }}>
                  <XCircle className="w-4 h-4" style={{ color: COLORS.rojo }} />
                </div>
                <span className="text-sm text-gray-700">Órdenes enviadas sin factura</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: COLORS.rojo }}
              >
                {data.alertas.ordenesSinFactura}
              </span>
            </div>

            {/* Alerta 3 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.naranjaBg }}>
                  <ChefHat className="w-4 h-4" style={{ color: COLORS.naranja }} />
                </div>
                <span className="text-sm text-gray-700">Platos con food cost fuera de rango</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: COLORS.naranja }}
              >
                {data.alertas.platosFueraRango}
              </span>
            </div>

            {/* Alerta 4 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: COLORS.moradoBg }}>
                  <RefreshCw className="w-4 h-4" style={{ color: COLORS.morado }} />
                </div>
                <span className="text-sm text-gray-700">Recetas sin costo actualizado</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: COLORS.morado }}
              >
                {data.alertas.recetasSinActualizar}
              </span>
            </div>
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

      {/* Tercera fila: Gráfico + Mejor Margen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico Evolución Food Cost */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Evolución Food Cost</h2>
              <p className="text-xs text-gray-500">Últimos 30 días</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1.5 rounded hover:bg-gray-100">
                <BarChart3 className="w-4 h-4 text-gray-400" />
              </button>
              <button className="p-1.5 rounded hover:bg-gray-100">
                <TrendingUp className="w-4 h-4 text-gray-400" />
              </button>
              <button className="p-1.5 rounded hover:bg-gray-100">
                <Calendar className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Gráfico simple con CSS */}
          <div className="relative h-48">
            {/* Líneas de referencia */}
            <div className="absolute inset-0 flex flex-col justify-between py-2">
              {[300, 250, 200, 150].map((val) => (
                <div key={val} className="flex items-center">
                  <span className="text-[10px] text-gray-400 w-8">{val}</span>
                  <div className="flex-1 border-t border-dashed border-gray-100" />
                </div>
              ))}
            </div>

            {/* Barras del gráfico */}
            <div className="absolute inset-0 flex items-end justify-around pl-10 pb-6">
              {chartData.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className="w-6 rounded-t-sm transition-all hover:opacity-80"
                    style={{
                      height: `${(d.valor / maxValor) * 140}px`,
                      background: `linear-gradient(180deg, ${COLORS.verde} 0%, #14B8A6 100%)`,
                    }}
                  />
                  <span className="text-[9px] text-gray-400">{d.fecha}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Widget Mejor Margen del Día */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Mejor Margen del Día</h2>

          {/* Imagen placeholder */}
          <div className="relative h-32 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
            <ChefHat className="w-16 h-16 text-orange-300" />
          </div>

          <p className="text-sm text-gray-600 mb-1">
            {data.mejorMargen?.nombre || 'Bife de chorizo'}
          </p>
          <p className="text-3xl font-bold" style={{ color: COLORS.verde }}>
            + ${(data.mejorMargen?.ganancia || 4320).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </p>

          {/* Toggle */}
          <div className="flex items-center gap-2 mt-4 p-1 bg-gray-100 rounded-lg">
            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white rounded-md shadow-sm text-xs font-medium text-gray-700">
              <BarChart3 className="w-3 h-3" />
              Gráfico
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-500">
              <ClipboardList className="w-3 h-3" />
              Corto
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
