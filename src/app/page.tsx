'use client'

import { useState, useEffect } from 'react'
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  ChefHat,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  DollarSign,
  X
} from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts'

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
  turquesa: '#14B8A6',
  rosa: '#EC4899',
  gris: '#6B7280',
  grisBg: '#F3F4F6',
}

// Colores para el gráfico de torta
const PIE_COLORS = ['#4F8EF7', '#14B8A6', '#10B981', '#6B7280', '#EC4899', '#F97316']

// Las 5 categorías principales para los gráficos
const CATEGORIAS_GRAFICOS = ['Carnes', 'Pescados_Mariscos', 'Verduras_Frutas', 'Almacen', 'Lacteos_Fiambres']

// Colores por categoría para el gráfico de barras (por key interna)
const CATEG_COLORES: Record<string, string> = {
  Carnes: '#dc2626',
  Almacen: '#d97706',
  Verduras_Frutas: '#16a34a',
  Pescados_Mariscos: '#0891b2',
  Lacteos_Fiambres: '#7c3aed',
  Salsas_Recetas: '#db2777',
}

const CATEG_LABELS: Record<string, string> = {
  Carnes: 'Carnes',
  Almacen: 'Almacén',
  Verduras_Frutas: 'Verduras',
  Pescados_Mariscos: 'Pescados',
  Lacteos_Fiambres: 'Lácteos',
  Salsas_Recetas: 'Salsas',
}

// Colores por label visible (para el gráfico de barras - más robusto)
const LABEL_COLORES: Record<string, string> = {
  'Carnes': '#dc2626',
  'Almacén': '#d97706',
  'Verduras': '#16a34a',
  'Pescados': '#0891b2',
  'Lácteos': '#7c3aed',
  'Salsas': '#db2777',
}

interface DistribucionItem {
  nombre: string
  valor: number
  porcentaje: number
  color?: string
}

interface ItemConAumentoDetalle {
  nombre: string
  categoria: string
  variacion: number
}

interface OrdenSinFacturaDetalle {
  id: string
  numero: string | null
  proveedor: string
  total: number
}

interface PlatoFueraRangoDetalle {
  nombre: string
  foodCost: number
  margenObjetivo: number
}

interface RecetaSinCostoDetalle {
  id: string
  nombre: string
}

interface DashboardData {
  foodCostPromedio: number
  ordenesPendientes: number
  ordenesSinFactura: number
  totalOrdenesSinFacturar: number
  platosFueraRango: number
  recetasSinCosto: number
  mayorVariacion: { nombre: string; variacion: number; categoria: string } | null
  comprasSemanaActual: number
  comprasSemanaPasada: number
  comprasSemanalesData: { semana: string; valor: number }[]
  comprasMensualesData: { mes: string; valor: number }[]
  variacionCategoriasData: { categoria: string; variacion: number; monto: number; color: string }[]
  distribucionProveedorData: DistribucionItem[]
  distribucionCategoriaData: DistribucionItem[]
  itemsConAumento: number
  // Detalles para alertas clickeables
  itemsConAumentoDetalle: ItemConAumentoDetalle[]
  ordenesSinFacturaDetalle: OrdenSinFacturaDetalle[]
  platosFueraRangoDetalle: PlatoFueraRangoDetalle[]
  recetasSinCostoDetalle: RecetaSinCostoDetalle[]
}

type AlertaModal = 'itemsAumento' | 'ordenesSinFactura' | 'platosFuera' | 'recetasSinCosto' | null

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    foodCostPromedio: 0,
    ordenesPendientes: 0,
    ordenesSinFactura: 0,
    totalOrdenesSinFacturar: 0,
    platosFueraRango: 0,
    recetasSinCosto: 0,
    mayorVariacion: null,
    comprasSemanaActual: 0,
    comprasSemanaPasada: 0,
    comprasSemanalesData: [],
    comprasMensualesData: [],
    variacionCategoriasData: [],
    distribucionProveedorData: [],
    distribucionCategoriaData: [],
    itemsConAumento: 0,
    itemsConAumentoDetalle: [],
    ordenesSinFacturaDetalle: [],
    platosFueraRangoDetalle: [],
    recetasSinCostoDetalle: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [modoDistribucion, setModoDistribucion] = useState<'proveedor' | 'categoria'>('proveedor')
  const [modoCompras, setModoCompras] = useState<'semanal' | 'mensual'>('semanal')
  const [alertaModal, setAlertaModal] = useState<AlertaModal>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setIsLoading(true)

    try {
      // ===== KPIs BÁSICOS =====

      // Órdenes pendientes (enviadas pero no recibidas)
      const { count: ordenesPendientes } = await supabase
        .from('ordenes_compra')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'enviada')
        .eq('activo', true)

      // Órdenes sin factura (con items para calcular total)
      const { data: ordenesEnviadas, error: errorOrdenes } = await supabase
        .from('ordenes_compra')
        .select(`
          id, numero, total,
          orden_compra_items (cantidad, precio_unitario, insumos (iva_porcentaje)),
          facturas_proveedor (id),
          proveedores (nombre)
        `)
        .in('estado', ['enviada', 'recibida', 'parcialmente_recibida'])
        .eq('activo', true)

      if (errorOrdenes) {
        console.error('Error fetching ordenes:', errorOrdenes)
      }

      // Función para calcular total con IVA de una orden
      const calcularTotalOrden = (orden: any): number => {
        if (!orden.orden_compra_items || orden.orden_compra_items.length === 0) return orden.total || 0
        return orden.orden_compra_items.reduce((sum: number, item: any) => {
          const subtotal = item.cantidad * item.precio_unitario
          const iva = subtotal * ((item.insumos?.iva_porcentaje ?? 21) / 100)
          return sum + subtotal + iva
        }, 0)
      }

      // Filtrar órdenes que no tienen factura vinculada
      const ordenesSinFacturaList = (ordenesEnviadas || []).filter((o: any) => {
        // Si no tiene facturas_proveedor o está vacío, es una orden sin facturar
        return !o.facturas_proveedor ||
               (Array.isArray(o.facturas_proveedor) && o.facturas_proveedor.length === 0)
      })

      const ordenesSinFactura = ordenesSinFacturaList.length
      const totalOrdenesSinFacturar = ordenesSinFacturaList.reduce(
        (sum: number, o: any) => sum + calcularTotalOrden(o), 0
      )

      // Detalles de órdenes sin factura
      const ordenesSinFacturaDetalle: OrdenSinFacturaDetalle[] = ordenesSinFacturaList.map((o: any) => ({
        id: o.id,
        numero: o.numero,
        proveedor: o.proveedores?.nombre || 'Sin proveedor',
        total: calcularTotalOrden(o),
      }))

      // Food cost de la carta - recalcular dinámicamente como en /carta
      // Obtener items "En Carta" (activo !== false)
      const { data: cartaData } = await supabase
        .from('carta')
        .select('plato_id, precio_carta, margen_objetivo, activo')
        .neq('activo', false)

      // Obtener precios actuales de insumos para calcular costos
      const { data: insumosConPrecio } = await supabase
        .from('v_insumos_con_precio')
        .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

      // Obtener recetas base con ingredientes
      const { data: recetasBaseData } = await supabase
        .from('recetas_base')
        .select('id, rendimiento_porciones, receta_base_ingredientes (insumo_id, cantidad)')
        .eq('activo', true)

      // Obtener platos con ingredientes y nombre
      const { data: platosData } = await supabase
        .from('platos')
        .select('id, nombre, rendimiento_porciones, plato_ingredientes (insumo_id, receta_base_id, cantidad)')
        .eq('activo', true)

      // Función para calcular costo final de un insumo
      const getCostoFinalInsumo = (insumoId: string): number => {
        const insumo = insumosConPrecio?.find((i: any) => i.id === insumoId)
        if (!insumo || !insumo.precio_actual) return 0
        return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
      }

      // Función para calcular costo de un plato (por porción)
      const calcularCostoPlato = (platoId: string): number => {
        const plato = platosData?.find((p: any) => p.id === platoId)
        if (!plato) return 0

        let costoTotal = 0
        for (const ing of plato.plato_ingredientes || []) {
          if (ing.insumo_id) {
            costoTotal += ing.cantidad * getCostoFinalInsumo(ing.insumo_id)
          } else if (ing.receta_base_id) {
            const receta = recetasBaseData?.find((r: any) => r.id === ing.receta_base_id)
            if (receta) {
              let costoReceta = 0
              for (const rIng of receta.receta_base_ingredientes || []) {
                costoReceta += rIng.cantidad * getCostoFinalInsumo(rIng.insumo_id)
              }
              const costoPorPorcion = receta.rendimiento_porciones > 0
                ? costoReceta / receta.rendimiento_porciones
                : 0
              costoTotal += ing.cantidad * costoPorPorcion
            }
          }
        }
        // Dividir por rendimiento para obtener costo por porción
        const rendimiento = plato.rendimiento_porciones > 0 ? plato.rendimiento_porciones : 1
        return costoTotal / rendimiento
      }

      // Calcular food cost real para cada item de carta
      const cartaConFoodCost = (cartaData || []).map((item: any) => {
        const costoReal = calcularCostoPlato(item.plato_id)
        const foodCost = item.precio_carta > 0 ? (costoReal / item.precio_carta) * 100 : 0
        const plato = platosData?.find((p: any) => p.id === item.plato_id)
        return { ...item, food_cost_calculado: foodCost, plato_nombre: plato?.nombre || 'Desconocido' }
      })

      const foodCosts = cartaConFoodCost.map((c: any) => c.food_cost_calculado).filter((fc: number) => fc > 0)
      const foodCostPromedio = foodCosts.length > 0
        ? foodCosts.reduce((a: number, b: number) => a + b, 0) / foodCosts.length
        : 0

      // Platos fuera de rango: food_cost > margen_objetivo * 1.1 (misma lógica que /carta)
      const platosFueraRangoList = cartaConFoodCost.filter((c: any) => {
        if (!c.food_cost_calculado || !c.margen_objetivo) return false
        return c.food_cost_calculado > c.margen_objetivo * 1.1
      })
      const platosFueraRango = platosFueraRangoList.length

      // Detalles de platos fuera de rango
      const platosFueraRangoDetalle: PlatoFueraRangoDetalle[] = platosFueraRangoList.map((c: any) => ({
        nombre: c.plato_nombre,
        foodCost: c.food_cost_calculado,
        margenObjetivo: c.margen_objetivo,
      }))

      // Recetas sin costo actualizado (costo = 0 o null)
      const { data: recetasSinCostoData } = await supabase
        .from('platos')
        .select('id, nombre')
        .eq('activo', true)
        .or('costo.is.null,costo.eq.0')

      const recetasSinCosto = recetasSinCostoData?.length || 0
      const recetasSinCostoDetalle: RecetaSinCostoDetalle[] = (recetasSinCostoData || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
      }))

      // ===== MAYOR VARIACIÓN DE INSUMO (último precio vs anterior) =====
      const { data: insumos } = await supabase
        .from('insumos')
        .select('id, nombre, categoria')
        .eq('activo', true)

      // Traer precios actuales (es_precio_actual = true)
      const { data: preciosActuales } = await supabase
        .from('precios_insumo')
        .select('insumo_id, precio')
        .eq('es_precio_actual', true)

      // Traer todos los precios para encontrar el anterior
      const { data: todosPrecios } = await supabase
        .from('precios_insumo')
        .select('insumo_id, precio, es_precio_actual')
        .order('fecha', { ascending: false })

      let mayorVariacion: DashboardData['mayorVariacion'] = null
      let itemsConAumentoCount = 0
      const itemsConAumentoDetalle: ItemConAumentoDetalle[] = []

      if (preciosActuales && todosPrecios && insumos) {
        const variaciones: { insumoId: string; nombre: string; categoria: string; variacion: number }[] = []

        insumos.forEach((insumo: any) => {
          // Buscar precio actual (es_precio_actual = true)
          const precioActualReg = preciosActuales.find((p: any) => p.insumo_id === insumo.id)
          if (!precioActualReg) return // Sin precio actual, no se puede calcular variación

          // Buscar precio anterior (NO es_precio_actual)
          const preciosInsumo = todosPrecios.filter((p: any) => p.insumo_id === insumo.id)
          const precioAnteriorReg = preciosInsumo.find((p: any) => !p.es_precio_actual)

          if (precioAnteriorReg && precioAnteriorReg.precio > 0) {
            const precioActual = precioActualReg.precio
            const precioAnterior = precioAnteriorReg.precio
            const variacion = ((precioActual - precioAnterior) / precioAnterior) * 100

            variaciones.push({
              insumoId: insumo.id,
              nombre: insumo.nombre,
              categoria: insumo.categoria,
              variacion,
            })

            if (variacion > 10) {
              itemsConAumentoCount++
              itemsConAumentoDetalle.push({
                nombre: insumo.nombre,
                categoria: CATEG_LABELS[insumo.categoria] || insumo.categoria,
                variacion,
              })
            }
          }
        })

        // Ordenar detalles por variación descendente
        itemsConAumentoDetalle.sort((a, b) => b.variacion - a.variacion)

        // Ordenar por mayor variación absoluta
        variaciones.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))

        if (variaciones.length > 0) {
          mayorVariacion = {
            nombre: variaciones[0].nombre,
            variacion: variaciones[0].variacion,
            categoria: CATEG_LABELS[variaciones[0].categoria] || variaciones[0].categoria,
          }
        }
      }

      // ===== COMPRAS SEMANALES (desde facturas) =====
      const { data: facturas } = await supabase
        .from('facturas_proveedor')
        .select(`
          id, fecha, total,
          factura_items (cantidad, precio_unitario, insumos (iva_porcentaje))
        `)
        .neq('activo', false)
        .order('fecha', { ascending: true })

      // Función para calcular total con IVA
      const calcularTotalFactura = (factura: any): number => {
        if (!factura.factura_items || factura.factura_items.length === 0) return factura.total || 0
        return factura.factura_items.reduce((sum: number, item: any) => {
          const subtotal = item.cantidad * item.precio_unitario
          const iva = subtotal * ((item.insumos?.iva_porcentaje ?? 21) / 100)
          return sum + subtotal + iva
        }, 0)
      }

      // Calcular semanas
      const hoy = new Date()
      const inicioSemanaActual = new Date(hoy)
      inicioSemanaActual.setDate(hoy.getDate() - hoy.getDay())
      inicioSemanaActual.setHours(0, 0, 0, 0)

      const inicioSemanaPasada = new Date(inicioSemanaActual)
      inicioSemanaPasada.setDate(inicioSemanaPasada.getDate() - 7)

      let comprasSemanaActual = 0
      let comprasSemanaPasada = 0

      // Calcular compras por semana (últimas 8 semanas)
      const semanasMap = new Map<string, number>()

      for (let i = 0; i < 8; i++) {
        const inicioSemana = new Date(inicioSemanaActual)
        inicioSemana.setDate(inicioSemana.getDate() - (i * 7))
        const finSemana = new Date(inicioSemana)
        finSemana.setDate(finSemana.getDate() + 6)

        const semanaKey = `${inicioSemana.getDate()}/${inicioSemana.getMonth() + 1}`
        semanasMap.set(semanaKey, 0)
      }

      (facturas || []).forEach((factura: any) => {
        const fechaFactura = new Date(factura.fecha)
        const total = calcularTotalFactura(factura)

        // Semana actual
        if (fechaFactura >= inicioSemanaActual) {
          comprasSemanaActual += total
        }
        // Semana pasada
        else if (fechaFactura >= inicioSemanaPasada && fechaFactura < inicioSemanaActual) {
          comprasSemanaPasada += total
        }

        // Para el gráfico semanal
        for (let i = 0; i < 8; i++) {
          const inicioSemana = new Date(inicioSemanaActual)
          inicioSemana.setDate(inicioSemana.getDate() - (i * 7))
          const finSemana = new Date(inicioSemana)
          finSemana.setDate(finSemana.getDate() + 6)

          if (fechaFactura >= inicioSemana && fechaFactura <= finSemana) {
            const semanaKey = `${inicioSemana.getDate()}/${inicioSemana.getMonth() + 1}`
            semanasMap.set(semanaKey, (semanasMap.get(semanaKey) || 0) + total)
            break
          }
        }
      })

      const comprasSemanalesData = Array.from(semanasMap.entries())
        .reverse()
        .slice(-4)
        .map(([semana, valor]) => ({ semana, valor }))

      // ===== COMPRAS MENSUALES =====
      const mesesMap = new Map<string, number>()
      const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

      // Inicializar últimos 6 meses
      for (let i = 5; i >= 0; i--) {
        const fecha = new Date()
        fecha.setMonth(fecha.getMonth() - i)
        const mesKey = `${mesesNombres[fecha.getMonth()]} ${fecha.getFullYear().toString().slice(-2)}`
        mesesMap.set(mesKey, 0)
      }

      (facturas || []).forEach((factura: any) => {
        const fechaFactura = new Date(factura.fecha)
        const total = calcularTotalFactura(factura)
        const mesKey = `${mesesNombres[fechaFactura.getMonth()]} ${fechaFactura.getFullYear().toString().slice(-2)}`

        if (mesesMap.has(mesKey)) {
          mesesMap.set(mesKey, (mesesMap.get(mesKey) || 0) + total)
        }
      })

      const comprasMensualesData = Array.from(mesesMap.entries())
        .map(([mes, valor]) => ({ mes, valor }))

      // ===== VARIACIÓN POR CATEGORÍA =====
      const fecha30DiasAtras = new Date()
      fecha30DiasAtras.setDate(fecha30DiasAtras.getDate() - 30)

      // Traer precios con fecha para gráfico de variación por categoría
      const { data: preciosConFecha } = await supabase
        .from('precios_insumo')
        .select('insumo_id, precio, fecha')
        .order('fecha', { ascending: false })

      const variacionCategoriasData: DashboardData['variacionCategoriasData'] = []

      if (insumos && preciosActuales && todosPrecios) {
        // Usar solo las 5 categorías principales
        CATEGORIAS_GRAFICOS.forEach((cat: string) => {
          const categInsumos = insumos.filter((i: any) => i.categoria === cat)

          let totalVariacion = 0
          let countConVariacion = 0

          categInsumos.forEach((insumo: any) => {
            const precioActualReg = preciosActuales.find((p: any) => p.insumo_id === insumo.id)
            if (!precioActualReg) return

            const preciosInsumo = todosPrecios.filter((p: any) => p.insumo_id === insumo.id)
            const precioAnteriorReg = preciosInsumo.find((p: any) => !p.es_precio_actual)

            if (precioAnteriorReg && precioAnteriorReg.precio > 0) {
              const variacion = ((precioActualReg.precio - precioAnteriorReg.precio) / precioAnteriorReg.precio) * 100
              totalVariacion += variacion
              countConVariacion++
            }
          })

          const variacionPromedio = countConVariacion > 0 ? totalVariacion / countConVariacion : 0

          variacionCategoriasData.push({
            categoria: CATEG_LABELS[cat] || cat,
            variacion: parseFloat(variacionPromedio.toFixed(1)),
            monto: 0,
            color: CATEG_COLORES[cat] || '#6B7280',
          })
        })
      }

      // Las 5 categorías fijas
      const top4Categorias = variacionCategoriasData

      // ===== DISTRIBUCIÓN DE COMPRAS POR PROVEEDOR (desde facturas) =====
      const proveedorTotales = new Map<string, { nombre: string; total: number }>()

      const { data: proveedores } = await supabase
        .from('proveedores')
        .select('id, nombre')
        .eq('activo', true)

      const facturasProveedorRes = await supabase
        .from('facturas_proveedor')
        .select(`
          proveedor_id, total,
          factura_items (cantidad, precio_unitario, insumos (iva_porcentaje))
        `)
        .neq('activo', false)
        .gte('fecha', fecha30DiasAtras.toISOString().split('T')[0])

      const facturasConProveedor = facturasProveedorRes.data as any[] | null

      (facturasConProveedor || []).forEach((factura: any) => {
        const total = calcularTotalFactura(factura)
        const proveedor = proveedores?.find((p: any) => p.id === factura.proveedor_id)
        if (proveedor) {
          const current = proveedorTotales.get(proveedor.id) || { nombre: proveedor.nombre, total: 0 }
          current.total += total
          proveedorTotales.set(proveedor.id, current)
        }
      })

      const sortedProveedores = Array.from(proveedorTotales.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      const totalGeneralProv = sortedProveedores.reduce((s, p) => s + p.total, 0)
      const otrosTotalProv = Array.from(proveedorTotales.values())
        .sort((a, b) => b.total - a.total)
        .slice(5)
        .reduce((s, p) => s + p.total, 0)

      const totalProv = totalGeneralProv + otrosTotalProv

      const distribucionProveedorData: DistribucionItem[] = sortedProveedores.map(p => ({
        nombre: p.nombre.length > 15 ? p.nombre.substring(0, 15) + '...' : p.nombre,
        valor: p.total,
        porcentaje: totalProv > 0 ? parseFloat(((p.total / totalProv) * 100).toFixed(1)) : 0,
      }))

      if (otrosTotalProv > 0) {
        distribucionProveedorData.push({
          nombre: 'Otros',
          valor: otrosTotalProv,
          porcentaje: parseFloat(((otrosTotalProv / totalProv) * 100).toFixed(1)),
        })
      }

      // ===== DISTRIBUCIÓN DE COMPRAS POR CATEGORÍA (desde facturas) =====
      const { data: facturasConItems } = await supabase
        .from('facturas_proveedor')
        .select(`
          factura_items (
            cantidad,
            precio_unitario,
            insumos (id, categoria, iva_porcentaje)
          )
        `)
        .neq('activo', false)
        .gte('fecha', fecha30DiasAtras.toISOString().split('T')[0])

      const categoriaTotales = new Map<string, number>()

      // Inicializar las 5 categorías con 0
      CATEGORIAS_GRAFICOS.forEach(cat => categoriaTotales.set(cat, 0))

      ;(facturasConItems || []).forEach((factura: any) => {
        ;(factura.factura_items || []).forEach((item: any) => {
          if (item.insumos?.categoria && CATEGORIAS_GRAFICOS.includes(item.insumos.categoria)) {
            const subtotal = item.cantidad * item.precio_unitario
            const iva = subtotal * ((item.insumos.iva_porcentaje ?? 21) / 100)
            const total = subtotal + iva
            const cat = item.insumos.categoria
            categoriaTotales.set(cat, (categoriaTotales.get(cat) || 0) + total)
          }
        })
      })

      // Ordenar por valor descendente
      const sortedCategorias = Array.from(categoriaTotales.entries())
        .sort((a, b) => b[1] - a[1])

      const totalCat = sortedCategorias.reduce((s, [, v]) => s + v, 0)

      const distribucionCategoriaData: DistribucionItem[] = sortedCategorias.map(([cat, valor]) => ({
        nombre: CATEG_LABELS[cat] || cat,
        valor,
        porcentaje: totalCat > 0 ? parseFloat(((valor / totalCat) * 100).toFixed(1)) : 0,
        color: CATEG_COLORES[cat] || '#6B7280',
      }))

      setData({
        foodCostPromedio,
        ordenesPendientes: ordenesPendientes || 0,
        ordenesSinFactura,
        totalOrdenesSinFacturar,
        platosFueraRango,
        recetasSinCosto,
        mayorVariacion,
        comprasSemanaActual,
        comprasSemanaPasada,
        comprasSemanalesData,
        comprasMensualesData,
        variacionCategoriasData: top4Categorias,
        distribucionProveedorData,
        distribucionCategoriaData,
        itemsConAumento: itemsConAumentoCount,
        itemsConAumentoDetalle,
        ordenesSinFacturaDetalle,
        platosFueraRangoDetalle,
        recetasSinCostoDetalle,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }

    setIsLoading(false)
  }

  const formatMoney = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toLocaleString('es-AR')}`
  }

  const variacionSemanal = data.comprasSemanaPasada > 0
    ? ((data.comprasSemanaActual - data.comprasSemanaPasada) / data.comprasSemanaPasada) * 100
    : 0

  const totalCompras4Semanas = data.comprasSemanalesData.reduce((s, d) => s + d.valor, 0)
  const totalCompras6Meses = data.comprasMensualesData.reduce((s, d) => s + d.valor, 0)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-xs text-gray-500">Resumen del sistema</p>
      </div>

      {/* 4 KPIs Superiores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1 - Food Cost Promedio */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: COLORS.verdeBg }}>
              <ChefHat className="w-4 h-4" style={{ color: COLORS.verde }} />
            </div>
            <p className="text-xs text-gray-500">Food Cost Promedio Carta</p>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {isLoading ? '...' : `${data.foodCostPromedio.toFixed(1)}%`}
          </p>
        </div>

        {/* KPI 2 - OC Pendientes de Facturar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: COLORS.indigoBg }}>
              <ShoppingCart className="w-4 h-4" style={{ color: COLORS.indigo }} />
            </div>
            <p className="text-xs text-gray-500">OC Pendientes de Facturar</p>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {isLoading ? '...' : formatMoney(data.totalOrdenesSinFacturar)}
          </p>
          <p className="text-[10px] text-gray-400">{data.ordenesSinFactura} órdenes</p>
        </div>

        {/* KPI 3 - Mayor Variación de Insumo */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: COLORS.moradoBg }}>
              <TrendingUp className="w-4 h-4" style={{ color: COLORS.morado }} />
            </div>
            <p className="text-xs text-gray-500">Mayor Variación Insumo</p>
          </div>
          {isLoading ? (
            <p className="text-base font-bold text-gray-900">...</p>
          ) : data.mayorVariacion ? (
            <p className="text-base font-bold text-gray-900 truncate" title={data.mayorVariacion.nombre}>
              {data.mayorVariacion.nombre.substring(0, 15)}{data.mayorVariacion.nombre.length > 15 ? '...' : ''} {data.mayorVariacion.variacion > 0 ? '+' : ''}{data.mayorVariacion.variacion.toFixed(0)}%
            </p>
          ) : (
            <p className="text-base font-bold text-gray-400">Sin datos</p>
          )}
        </div>

        {/* KPI 4 - Compras Semana Actual */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md" style={{ backgroundColor: COLORS.moradoBg }}>
                <DollarSign className="w-4 h-4" style={{ color: COLORS.morado }} />
              </div>
              <p className="text-xs text-gray-500">Compras Semana Actual</p>
            </div>
            {data.comprasSemanaPasada > 0 && (
              <span className="flex items-center text-[10px] font-medium" style={{ color: variacionSemanal < 0 ? COLORS.verde : COLORS.rojo }}>
                {variacionSemanal < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {variacionSemanal > 0 ? '+' : ''}{variacionSemanal.toFixed(0)}%
              </span>
            )}
          </div>
          <p className="text-lg font-bold text-gray-900">
            {isLoading ? '...' : formatMoney(data.comprasSemanaActual)}
          </p>
          <p className="text-[10px] text-gray-400">vs sem. ant: {formatMoney(data.comprasSemanaPasada)}</p>
        </div>
      </div>

      {/* Segunda fila: Alertas + Variación por Categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Panel de Alertas */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Alertas</h2>
          <div className="space-y-1.5">
            {/* Alerta 1 - Ítems con aumento */}
            <button
              onClick={() => data.itemsConAumento > 0 && setAlertaModal('itemsAumento')}
              className={`w-full flex items-center justify-between p-2 bg-gray-50 rounded-md transition-colors ${data.itemsConAumento > 0 ? 'hover:bg-gray-100 cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-full" style={{ backgroundColor: COLORS.naranjaBg }}>
                  <ArrowUpRight className="w-3 h-3" style={{ color: COLORS.naranja }} />
                </div>
                <span className="text-xs text-gray-700">Ítems con aumento &gt;10%</span>
              </div>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: data.itemsConAumento > 0 ? COLORS.rojo : COLORS.verde }}
              >
                {data.itemsConAumento}
              </span>
            </button>

            {/* Alerta 2 - Órdenes sin factura */}
            <button
              onClick={() => data.ordenesSinFactura > 0 && setAlertaModal('ordenesSinFactura')}
              className={`w-full flex items-center justify-between p-2 bg-gray-50 rounded-md transition-colors ${data.ordenesSinFactura > 0 ? 'hover:bg-gray-100 cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-full" style={{ backgroundColor: COLORS.rojoBg }}>
                  <XCircle className="w-3 h-3" style={{ color: COLORS.rojo }} />
                </div>
                <span className="text-xs text-gray-700">Órdenes sin factura</span>
              </div>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: data.ordenesSinFactura > 0 ? COLORS.rojo : COLORS.verde }}
              >
                {data.ordenesSinFactura}
              </span>
            </button>

            {/* Alerta 3 - Platos fuera de rango */}
            <button
              onClick={() => data.platosFueraRango > 0 && setAlertaModal('platosFuera')}
              className={`w-full flex items-center justify-between p-2 bg-gray-50 rounded-md transition-colors ${data.platosFueraRango > 0 ? 'hover:bg-gray-100 cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-full" style={{ backgroundColor: COLORS.naranjaBg }}>
                  <ChefHat className="w-3 h-3" style={{ color: COLORS.naranja }} />
                </div>
                <span className="text-xs text-gray-700">Platos fuera de rango</span>
              </div>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: data.platosFueraRango > 0 ? COLORS.naranja : COLORS.verde }}
              >
                {data.platosFueraRango}
              </span>
            </button>

            {/* Alerta 4 - Recetas sin actualizar */}
            <button
              onClick={() => data.recetasSinCosto > 0 && setAlertaModal('recetasSinCosto')}
              className={`w-full flex items-center justify-between p-2 bg-gray-50 rounded-md transition-colors ${data.recetasSinCosto > 0 ? 'hover:bg-gray-100 cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-full" style={{ backgroundColor: COLORS.moradoBg }}>
                  <RefreshCw className="w-3 h-3" style={{ color: COLORS.morado }} />
                </div>
                <span className="text-xs text-gray-700">Recetas sin costo</span>
              </div>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: data.recetasSinCosto > 0 ? COLORS.morado : COLORS.verde }}
              >
                {data.recetasSinCosto}
              </span>
            </button>
          </div>
        </div>

        {/* Variación de Precios por Categoría */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Variación Precios por Categoría</h2>
          {data.variacionCategoriasData.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-gray-400">Sin datos</p>
            </div>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.variacionCategoriasData} margin={{ top: 20, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="categoria" tick={{ fontSize: 9 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9 }} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Variación']}
                    contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 11 }}
                  />
                  <Bar dataKey="variacion" radius={[3, 3, 0, 0]}>
                    {data.variacionCategoriasData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={LABEL_COLORES[entry.categoria] || entry.color || '#6B7280'} />
                    ))}
                    <LabelList
                      dataKey="variacion"
                      position="top"
                      formatter={(v) => `${Number(v).toFixed(1)}%`}
                      style={{ fontSize: 9, fill: '#374151' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tercera fila: Evolución Compras + Distribución */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Evolución Compras */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Compras</h2>
            <div className="flex items-center gap-2">
              <span style={{ color: COLORS.turquesa }} className="text-xs font-semibold">
                {formatMoney(modoCompras === 'semanal' ? totalCompras4Semanas : totalCompras6Meses)}
              </span>
              <select
                value={modoCompras}
                onChange={(e) => setModoCompras(e.target.value as 'semanal' | 'mensual')}
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none"
              >
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
          </div>
          {(() => {
            const comprasData = modoCompras === 'semanal' ? data.comprasSemanalesData : data.comprasMensualesData
            const dataKey = modoCompras === 'semanal' ? 'semana' : 'mes'

            if (comprasData.length === 0) {
              return (
                <div className="flex items-center justify-center h-44">
                  <p className="text-xs text-gray-400">Sin datos</p>
                </div>
              )
            }

            return (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comprasData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey={dataKey} tick={{ fontSize: 9 }} />
                    <YAxis tickFormatter={formatMoney} tick={{ fontSize: 9 }} />
                    <Tooltip
                      formatter={(value) => [formatMoney(Number(value)), 'Compras']}
                      contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke={COLORS.turquesa}
                      strokeWidth={2}
                      dot={{ fill: COLORS.turquesa, strokeWidth: 1, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>

        {/* Distribución de Compras */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Distribución Compras</h2>
            <select
              value={modoDistribucion}
              onChange={(e) => setModoDistribucion(e.target.value as 'proveedor' | 'categoria')}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none"
            >
              <option value="proveedor">Proveedor</option>
              <option value="categoria">Categoría</option>
            </select>
          </div>
          {(() => {
            const distribucionData = modoDistribucion === 'proveedor'
              ? data.distribucionProveedorData
              : data.distribucionCategoriaData

            if (distribucionData.length === 0) {
              return (
                <div className="flex items-center justify-center h-44">
                  <p className="text-xs text-gray-400">Sin datos</p>
                </div>
              )
            }

            return (
              <div className="flex items-center gap-6">
                <div className="h-44 w-44 flex-shrink-0 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribucionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={32}
                        outerRadius={65}
                        paddingAngle={2}
                        dataKey="valor"
                      >
                        {distribucionData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={modoDistribucion === 'categoria'
                              ? (LABEL_COLORES[entry.nombre] || entry.color || PIE_COLORS[index % PIE_COLORS.length])
                              : PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [formatMoney(Number(value)), 'Monto']}
                        contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {distribucionData.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: modoDistribucion === 'categoria'
                              ? (LABEL_COLORES[item.nombre] || item.color || PIE_COLORS[i % PIE_COLORS.length])
                              : PIE_COLORS[i % PIE_COLORS.length]
                          }}
                        />
                        <span className="text-gray-700 truncate" title={item.nombre}>{item.nombre}</span>
                      </div>
                      <span className="text-gray-500 font-medium flex-shrink-0">{item.porcentaje}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Modal de Alertas */}
      {alertaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            {/* Header del modal */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {alertaModal === 'itemsAumento' && 'Ítems con aumento >10%'}
                {alertaModal === 'ordenesSinFactura' && 'Órdenes sin factura'}
                {alertaModal === 'platosFuera' && 'Platos fuera de rango'}
                {alertaModal === 'recetasSinCosto' && 'Recetas sin costo actualizado'}
              </h3>
              <button
                onClick={() => setAlertaModal(null)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Items con aumento */}
              {alertaModal === 'itemsAumento' && (
                <div className="space-y-2">
                  {data.itemsConAumentoDetalle.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{item.nombre}</p>
                        <p className="text-xs text-gray-500">{item.categoria}</p>
                      </div>
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-semibold">
                        +{item.variacion.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t mt-3">
                    <Link href="/insumos" className="text-sm text-primary-600 hover:underline">
                      Ver todos los insumos →
                    </Link>
                  </div>
                </div>
              )}

              {/* Órdenes sin factura */}
              {alertaModal === 'ordenesSinFactura' && (
                <div className="space-y-2">
                  {data.ordenesSinFacturaDetalle.map((orden, i) => (
                    <Link
                      key={i}
                      href={`/ordenes-compra/${orden.id}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {orden.numero ? `OC #${orden.numero}` : 'Sin número'}
                        </p>
                        <p className="text-xs text-gray-500">{orden.proveedor}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {formatMoney(orden.total)}
                      </span>
                    </Link>
                  ))}
                  <div className="pt-3 border-t mt-3">
                    <Link href="/ordenes-compra" className="text-sm text-primary-600 hover:underline">
                      Ver todas las órdenes →
                    </Link>
                  </div>
                </div>
              )}

              {/* Platos fuera de rango */}
              {alertaModal === 'platosFuera' && (
                <div className="space-y-2">
                  {data.platosFueraRangoDetalle.map((plato, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{plato.nombre}</p>
                        <p className="text-xs text-gray-500">Margen objetivo: {plato.margenObjetivo}%</p>
                      </div>
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-semibold">
                        {plato.foodCost.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t mt-3">
                    <Link href="/carta" className="text-sm text-primary-600 hover:underline">
                      Ver carta completa →
                    </Link>
                  </div>
                </div>
              )}

              {/* Recetas sin costo */}
              {alertaModal === 'recetasSinCosto' && (
                <div className="space-y-2">
                  {data.recetasSinCostoDetalle.map((receta, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <p className="font-medium text-gray-900">{receta.nombre}</p>
                      <span className="text-xs text-gray-400">Sin costo</span>
                    </div>
                  ))}
                  <div className="pt-3 border-t mt-3">
                    <Link href="/platos" className="text-sm text-primary-600 hover:underline">
                      Ver todos los platos →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
