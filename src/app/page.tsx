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

// Colores del sistema editorial
const COLORS = {
  terracotta: '#C4704B',
  terracottaBg: '#FDF0E6',
  olive: '#5C7A5E',
  oliveBg: '#E8F5EC',
  forest: '#1B3A2D',
  success: '#3D8B5E',
  successBg: '#E8F5EC',
  warning: '#A67B3D',
  warningBg: '#FDF6E6',
  danger: '#9B2C2C',
  dangerBg: '#FDE8E8',
  info: '#4A6572',
  infoBg: '#EDF2F4',
  ink: '#1A1A1A',
  inkMuted: '#6B6560',
}

// Colores para el gráfico de torta
const PIE_COLORS = ['#C4704B', '#5C7A5E', '#4A6572', '#A67B3D', '#8CA88F', '#B5553A']

// Las 5 categorías principales para los gráficos
const CATEGORIAS_GRAFICOS = ['Carnes', 'Pescados_Mariscos', 'Verduras_Frutas', 'Almacen', 'Lacteos_Fiambres']

// Colores por categoría para el gráfico de barras (por key interna)
const CATEG_COLORES: Record<string, string> = {
  Carnes: '#9B2C2C',
  Almacen: '#A67B3D',
  Verduras_Frutas: '#3D8B5E',
  Pescados_Mariscos: '#4A6572',
  Lacteos_Fiambres: '#5C7A5E',
  Salsas_Recetas: '#C4704B',
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
  'Carnes': '#9B2C2C',
  'Almacén': '#A67B3D',
  'Verduras': '#3D8B5E',
  'Pescados': '#4A6572',
  'Lácteos': '#5C7A5E',
  'Salsas': '#C4704B',
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

interface ItemConBajaDetalle {
  nombre: string
  categoria: string
  variacion: number
}

interface ComprasPorCategoriaItem {
  periodo: string
  Carnes: number
  Pescados: number
  Verduras: number
  Almacen: number
  Lacteos: number
  total: number
}

interface DashboardData {
  foodCostPromedio: number
  ordenesPendientes: number
  ordenesSinFactura: number
  totalOrdenesSinFacturar: number
  platosFueraRango: number
  itemsConBaja: number
  mayorVariacion: { nombre: string; variacion: number; categoria: string } | null
  comprasSemanaActual: number
  comprasSemanaPasada: number
  comprasSemanalesData: { semana: string; valor: number }[]
  comprasMensualesData: { mes: string; valor: number }[]
  variacionCategoriasData: { categoria: string; variacion: number; monto: number; color: string }[]
  distribucionProveedorData: DistribucionItem[]
  distribucionCategoriaData: DistribucionItem[]
  itemsConAumento: number
  // Compras por categoría en el tiempo
  comprasPorCategoriaSemanales: ComprasPorCategoriaItem[]
  comprasPorCategoriaMensuales: ComprasPorCategoriaItem[]
  // Detalles para alertas clickeables
  itemsConAumentoDetalle: ItemConAumentoDetalle[]
  itemsConBajaDetalle: ItemConBajaDetalle[]
  ordenesSinFacturaDetalle: OrdenSinFacturaDetalle[]
  platosFueraRangoDetalle: PlatoFueraRangoDetalle[]
}

type AlertaModal = 'itemsAumento' | 'itemsBaja' | 'ordenesSinFactura' | 'platosFuera' | null

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    foodCostPromedio: 0,
    ordenesPendientes: 0,
    ordenesSinFactura: 0,
    totalOrdenesSinFacturar: 0,
    platosFueraRango: 0,
    itemsConBaja: 0,
    mayorVariacion: null,
    comprasSemanaActual: 0,
    comprasSemanaPasada: 0,
    comprasSemanalesData: [],
    comprasMensualesData: [],
    variacionCategoriasData: [],
    distribucionProveedorData: [],
    distribucionCategoriaData: [],
    itemsConAumento: 0,
    comprasPorCategoriaSemanales: [],
    comprasPorCategoriaMensuales: [],
    itemsConAumentoDetalle: [],
    itemsConBajaDetalle: [],
    ordenesSinFacturaDetalle: [],
    platosFueraRangoDetalle: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [modoDistribucion, setModoDistribucion] = useState<'proveedor' | 'categoria'>('proveedor')
  const [modoCompras, setModoCompras] = useState<'semanal' | 'mensual'>('semanal')
  const [modoComprasCat, setModoComprasCat] = useState<'semanal' | 'mensual'>('semanal')
  const [alertaModal, setAlertaModal] = useState<AlertaModal>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setIsLoading(true)
    console.log('Iniciando fetchDashboardData...')

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

      // ===== MAYOR VARIACIÓN DE INSUMO (último precio vs anterior) =====
      const { data: insumos } = await supabase
        .from('insumos')
        .select('id, nombre, categoria')
        .eq('activo', true)

      // Traer precios actuales (es_precio_actual = true)
      const { data: preciosActuales } = await supabase
        .from('precios_insumo')
        .select('insumo_id, precio, fecha')
        .eq('es_precio_actual', true)

      // Traer todos los precios para encontrar el anterior
      const { data: todosPrecios } = await supabase
        .from('precios_insumo')
        .select('insumo_id, precio, es_precio_actual')
        .order('fecha', { ascending: false })

      let mayorVariacion: DashboardData['mayorVariacion'] = null
      let itemsConAumentoCount = 0
      let itemsConBajaCount = 0
      const itemsConAumentoDetalle: ItemConAumentoDetalle[] = []
      const itemsConBajaDetalle: ItemConBajaDetalle[] = []

      if (preciosActuales && todosPrecios && insumos) {
        const variaciones: { insumoId: string; nombre: string; categoria: string; variacion: number }[] = []

        // Fecha límite: últimos 30 días
        const hace30Dias = new Date()
        hace30Dias.setDate(hace30Dias.getDate() - 30)
        const fechaLimite = hace30Dias.toISOString().split('T')[0]

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

            // Solo mostrar aumentos/bajas si el precio actual es de los últimos 30 días
            const precioEsReciente = precioActualReg.fecha >= fechaLimite

            // Items con aumento >7% (solo últimos 30 días)
            if (variacion > 7 && precioEsReciente) {
              itemsConAumentoCount++
              itemsConAumentoDetalle.push({
                nombre: insumo.nombre,
                categoria: CATEG_LABELS[insumo.categoria] || insumo.categoria,
                variacion,
              })
            }

            // Items con baja >5% (solo últimos 30 días)
            if (variacion < -5 && precioEsReciente) {
              itemsConBajaCount++
              itemsConBajaDetalle.push({
                nombre: insumo.nombre,
                categoria: CATEG_LABELS[insumo.categoria] || insumo.categoria,
                variacion,
              })
            }
          }
        })

        // Ordenar detalles por variación descendente (aumento) y ascendente (baja)
        itemsConAumentoDetalle.sort((a, b) => b.variacion - a.variacion)
        itemsConBajaDetalle.sort((a, b) => a.variacion - b.variacion)

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
          id, fecha, total, tipo,
          factura_items (cantidad, precio_unitario, insumos (iva_porcentaje))
        `)
        .neq('activo', false)
        .order('fecha', { ascending: true })

      // El total almacenado en la DB ya incluye IVA, usarlo directamente
      const calcularTotalFactura = (factura: any): number => {
        return factura.total || 0
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

      ;(facturas || []).forEach((factura: any) => {
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
        fecha.setDate(1) // Usar día 1 para evitar problemas con meses cortos (ej: 30 marzo - 1 mes = 2 marzo, no febrero)
        fecha.setMonth(fecha.getMonth() - i)
        const mesKey = `${mesesNombres[fecha.getMonth()]} ${fecha.getFullYear().toString().slice(-2)}`
        mesesMap.set(mesKey, 0)
      }

      ;(facturas || []).forEach((factura: any) => {
        const fechaFactura = new Date(factura.fecha)
        const total = calcularTotalFactura(factura)
        const mesKey = `${mesesNombres[fechaFactura.getMonth()]} ${fechaFactura.getFullYear().toString().slice(-2)}`

        if (mesesMap.has(mesKey)) {
          mesesMap.set(mesKey, (mesesMap.get(mesKey) || 0) + total)
        }
      })

      const comprasMensualesData = Array.from(mesesMap.entries())
        .map(([mes, valor]) => ({ mes, valor }))

      // ===== COMPRAS POR CATEGORÍA EN EL TIEMPO =====
      // Necesitamos facturas con items y categoría de insumos
      const { data: facturasConCategoria, error: errorFactCat } = await supabase
        .from('facturas_proveedor')
        .select(`
          fecha, tipo, total,
          factura_items (
            cantidad,
            precio_unitario,
            insumos (categoria, iva_porcentaje)
          )
        `)
        .neq('activo', false)
        .order('fecha', { ascending: true })

      if (errorFactCat) {
        console.error('Error fetching facturas para categorías:', errorFactCat)
      }

      // Mapa de categoría interna a label
      const categToLabel: Record<string, string> = {
        'Carnes': 'Carnes',
        'Pescados_Mariscos': 'Pescados',
        'Verduras_Frutas': 'Verduras',
        'Almacen': 'Almacen',
        'Lacteos_Fiambres': 'Lacteos',
      }

      // Inicializar datos semanales por categoría (últimas 8 semanas)
      const semanasCategMap = new Map<string, ComprasPorCategoriaItem>()
      for (let i = 0; i < 8; i++) {
        const inicioSemana = new Date(inicioSemanaActual)
        inicioSemana.setDate(inicioSemana.getDate() - (i * 7))
        const semanaKey = `${inicioSemana.getDate()}/${inicioSemana.getMonth() + 1}`
        semanasCategMap.set(semanaKey, {
          periodo: semanaKey,
          Carnes: 0, Pescados: 0, Verduras: 0, Almacen: 0, Lacteos: 0, total: 0
        })
      }

      // Inicializar datos mensuales por categoría (últimos 6 meses)
      const mesesCategMap = new Map<string, ComprasPorCategoriaItem>()
      for (let i = 5; i >= 0; i--) {
        const fecha = new Date()
        fecha.setDate(1) // Usar día 1 para evitar problemas con meses cortos
        fecha.setMonth(fecha.getMonth() - i)
        const mesKey = `${mesesNombres[fecha.getMonth()]}`
        mesesCategMap.set(mesKey, {
          periodo: mesKey,
          Carnes: 0, Pescados: 0, Verduras: 0, Almacen: 0, Lacteos: 0, total: 0
        })
      }

      // Procesar facturas para compras por categoría
      ;(facturasConCategoria || []).forEach((factura: any) => {
        const fechaFactura = new Date(factura.fecha)
        const esNotaCredito = factura.tipo === 'nota_credito'

        // Por cada item, sumar a la categoría correspondiente (o restar si es NC)
        ;(factura.factura_items || []).forEach((item: any) => {
          if (!item.insumos?.categoria) return
          const catInterna = item.insumos.categoria
          const catLabel = categToLabel[catInterna]
          if (!catLabel) return

          const subtotal = item.cantidad * item.precio_unitario
          const iva = subtotal * ((item.insumos.iva_porcentaje ?? 21) / 100)
          // Si es NC, el monto es negativo (resta)
          const total = esNotaCredito ? -(subtotal + iva) : (subtotal + iva)

          // Agregar a semana correspondiente
          for (let i = 0; i < 8; i++) {
            const inicioSemana = new Date(inicioSemanaActual)
            inicioSemana.setDate(inicioSemana.getDate() - (i * 7))
            const finSemana = new Date(inicioSemana)
            finSemana.setDate(finSemana.getDate() + 6)

            if (fechaFactura >= inicioSemana && fechaFactura <= finSemana) {
              const semanaKey = `${inicioSemana.getDate()}/${inicioSemana.getMonth() + 1}`
              const entry = semanasCategMap.get(semanaKey)
              if (entry) {
                (entry as any)[catLabel] += total
                entry.total += total
              }
              break
            }
          }

          // Agregar a mes correspondiente
          const mesKey = `${mesesNombres[fechaFactura.getMonth()]}`
          const mesEntry = mesesCategMap.get(mesKey)
          if (mesEntry) {
            (mesEntry as any)[catLabel] += total
            mesEntry.total += total
          }
        })
      })

      const comprasPorCategoriaSemanales = Array.from(semanasCategMap.values()).reverse().slice(-4)
      const comprasPorCategoriaMensuales = Array.from(mesesCategMap.values())

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
            color: CATEG_COLORES[cat] || '#6B6560',
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
          proveedor_id, total, tipo,
          factura_items (cantidad, precio_unitario, insumos (iva_porcentaje))
        `)
        .neq('activo', false)
        .gte('fecha', fecha30DiasAtras.toISOString().split('T')[0])

      const facturasConProveedor = facturasProveedorRes.data as any[] | null

      ;(facturasConProveedor || []).forEach((factura: any) => {
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
          tipo,
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
        const esNotaCredito = factura.tipo === 'nota_credito'
        ;(factura.factura_items || []).forEach((item: any) => {
          if (item.insumos?.categoria && CATEGORIAS_GRAFICOS.includes(item.insumos.categoria)) {
            const subtotal = item.cantidad * item.precio_unitario
            const iva = subtotal * ((item.insumos.iva_porcentaje ?? 21) / 100)
            // Si es NC, el monto es negativo (resta)
            const total = esNotaCredito ? -(subtotal + iva) : (subtotal + iva)
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
        color: CATEG_COLORES[cat] || '#6B6560',
      }))

      setData({
        foodCostPromedio,
        ordenesPendientes: ordenesPendientes || 0,
        ordenesSinFactura,
        totalOrdenesSinFacturar,
        platosFueraRango,
        itemsConBaja: itemsConBajaCount,
        mayorVariacion,
        comprasSemanaActual,
        comprasSemanaPasada,
        comprasSemanalesData,
        comprasMensualesData,
        variacionCategoriasData: top4Categorias,
        distribucionProveedorData,
        distribucionCategoriaData,
        itemsConAumento: itemsConAumentoCount,
        comprasPorCategoriaSemanales,
        comprasPorCategoriaMensuales,
        itemsConAumentoDetalle,
        itemsConBajaDetalle,
        ordenesSinFacturaDetalle,
        platosFueraRangoDetalle,
      })
    console.log('fetchDashboardData completado')
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-0.5">Resumen del sistema</p>
        </div>
      </div>

      {/* 4 KPIs Superiores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1 - Food Cost Promedio */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.oliveBg }}>
              <ChefHat className="w-4 h-4" style={{ color: COLORS.olive }} />
            </div>
            <p className="text-xs text-ink-muted font-medium uppercase tracking-wide">Food Cost</p>
          </div>
          <p className="font-mono text-2xl font-semibold text-ink">
            {isLoading ? '...' : `${data.foodCostPromedio.toFixed(1)}%`}
          </p>
          <p className="text-xs text-ink-muted mt-1">Promedio carta</p>
        </div>

        {/* KPI 2 - OC Pendientes de Facturar */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.warningBg }}>
              <ShoppingCart className="w-4 h-4" style={{ color: COLORS.warning }} />
            </div>
            <p className="text-xs text-ink-muted font-medium uppercase tracking-wide">OC Pendientes</p>
          </div>
          <p className="font-mono text-2xl font-semibold text-ink">
            {isLoading ? '...' : formatMoney(data.totalOrdenesSinFacturar)}
          </p>
          <p className="text-xs text-ink-muted mt-1">{data.ordenesSinFactura} órdenes</p>
        </div>

        {/* KPI 3 - Mayor Variación de Insumo */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.terracottaBg }}>
              <TrendingUp className="w-4 h-4" style={{ color: COLORS.terracotta }} />
            </div>
            <p className="text-xs text-ink-muted font-medium uppercase tracking-wide">Mayor Variación</p>
          </div>
          {isLoading ? (
            <p className="text-xl font-semibold text-ink">...</p>
          ) : data.mayorVariacion ? (
            <p className="text-lg font-semibold text-ink truncate" title={data.mayorVariacion.nombre}>
              {data.mayorVariacion.nombre.substring(0, 12)}{data.mayorVariacion.nombre.length > 12 ? '...' : ''} <span className="font-mono">{data.mayorVariacion.variacion > 0 ? '+' : ''}{data.mayorVariacion.variacion.toFixed(0)}%</span>
            </p>
          ) : (
            <p className="text-lg font-semibold text-ink-muted">Sin datos</p>
          )}
          <p className="text-xs text-ink-muted mt-1">{data.mayorVariacion?.categoria || '-'}</p>
        </div>

        {/* KPI 4 - Compras Semana Actual */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg" style={{ backgroundColor: COLORS.infoBg }}>
                <DollarSign className="w-4 h-4" style={{ color: COLORS.info }} />
              </div>
              <p className="text-xs text-ink-muted font-medium uppercase tracking-wide">Compras</p>
            </div>
            {data.comprasSemanaPasada > 0 && (
              <span className="flex items-center text-xs font-medium" style={{ color: variacionSemanal < 0 ? COLORS.success : COLORS.danger }}>
                {variacionSemanal < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {variacionSemanal > 0 ? '+' : ''}{variacionSemanal.toFixed(0)}%
              </span>
            )}
          </div>
          <p className="font-mono text-2xl font-semibold text-ink">
            {isLoading ? '...' : formatMoney(data.comprasSemanaActual)}
          </p>
          <p className="text-xs text-ink-muted mt-1">vs sem. ant: {formatMoney(data.comprasSemanaPasada)}</p>
        </div>
      </div>

      {/* Segunda fila: Alertas + Variación por Categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel de Alertas */}
        <div className="card p-4">
          <h2 className="text-lg font-semibold text-ink mb-3">Alertas</h2>
          <div className="space-y-2">
            {/* Alerta 1 - Ítems con aumento >7% */}
            <button
              onClick={() => data.itemsConAumento > 0 && setAlertaModal('itemsAumento')}
              className={`w-full flex items-center justify-between p-3 bg-cream-dark rounded-lg transition-colors ${data.itemsConAumento > 0 ? 'hover:bg-sand cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-full" style={{ backgroundColor: COLORS.dangerBg }}>
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: COLORS.danger }} />
                </div>
                <span className="text-sm text-ink">Ítems con aumento &gt;7%</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: data.itemsConAumento > 0 ? COLORS.danger : COLORS.success }}
              >
                {data.itemsConAumento}
              </span>
            </button>

            {/* Alerta 2 - Ítems con baja de precio */}
            <button
              onClick={() => data.itemsConBaja > 0 && setAlertaModal('itemsBaja')}
              className={`w-full flex items-center justify-between p-3 bg-cream-dark rounded-lg transition-colors ${data.itemsConBaja > 0 ? 'hover:bg-sand cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-full" style={{ backgroundColor: COLORS.successBg }}>
                  <TrendingDown className="w-3.5 h-3.5" style={{ color: COLORS.success }} />
                </div>
                <span className="text-sm text-ink">Ítems con baja &gt;5%</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: data.itemsConBaja > 0 ? COLORS.success : COLORS.inkMuted }}
              >
                {data.itemsConBaja}
              </span>
            </button>

            {/* Alerta 3 - Órdenes sin factura */}
            <button
              onClick={() => data.ordenesSinFactura > 0 && setAlertaModal('ordenesSinFactura')}
              className={`w-full flex items-center justify-between p-3 bg-cream-dark rounded-lg transition-colors ${data.ordenesSinFactura > 0 ? 'hover:bg-sand cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-full" style={{ backgroundColor: COLORS.warningBg }}>
                  <XCircle className="w-3.5 h-3.5" style={{ color: COLORS.warning }} />
                </div>
                <span className="text-sm text-ink">Órdenes sin factura</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: data.ordenesSinFactura > 0 ? COLORS.warning : COLORS.success }}
              >
                {data.ordenesSinFactura}
              </span>
            </button>

            {/* Alerta 4 - Platos fuera de rango */}
            <button
              onClick={() => data.platosFueraRango > 0 && setAlertaModal('platosFuera')}
              className={`w-full flex items-center justify-between p-3 bg-cream-dark rounded-lg transition-colors ${data.platosFueraRango > 0 ? 'hover:bg-sand cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-full" style={{ backgroundColor: COLORS.terracottaBg }}>
                  <ChefHat className="w-3.5 h-3.5" style={{ color: COLORS.terracotta }} />
                </div>
                <span className="text-sm text-ink">Platos fuera de rango</span>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: data.platosFueraRango > 0 ? COLORS.terracotta : COLORS.success }}
              >
                {data.platosFueraRango}
              </span>
            </button>
          </div>
        </div>

        {/* Variación de Precios por Categoría */}
        <div className="card p-4">
          <h2 className="text-lg font-semibold text-ink mb-3">Variación Precios por Categoría</h2>
          {data.variacionCategoriasData.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-ink-muted">Sin datos</p>
            </div>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.variacionCategoriasData} margin={{ top: 20, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E2DA" />
                  <XAxis dataKey="categoria" tick={{ fontSize: 10, fill: '#6B6560' }} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#6B6560' }} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Variación']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E8E2DA', fontSize: 12, backgroundColor: '#FEFCF9' }}
                  />
                  <Bar dataKey="variacion" radius={[4, 4, 0, 0]}>
                    {data.variacionCategoriasData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={LABEL_COLORES[entry.categoria] || entry.color || '#6B6560'} />
                    ))}
                    <LabelList
                      dataKey="variacion"
                      position="top"
                      formatter={(v) => `${Number(v).toFixed(1)}%`}
                      style={{ fontSize: 10, fill: '#1A1A1A' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tercera fila: Evolución Compras + Distribución */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evolución Compras */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-ink">Compras</h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold" style={{ color: COLORS.olive }}>
                {formatMoney(modoCompras === 'semanal' ? totalCompras4Semanas : totalCompras6Meses)}
              </span>
              <select
                value={modoCompras}
                onChange={(e) => setModoCompras(e.target.value as 'semanal' | 'mensual')}
                className="text-xs border border-sand-dark rounded-lg px-2 py-1 text-ink-muted bg-white focus:outline-none focus:border-terracotta"
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
                <div className="flex items-center justify-center h-48">
                  <p className="text-sm text-ink-muted">Sin datos</p>
                </div>
              )
            }

            return (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comprasData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E2DA" />
                    <XAxis dataKey={dataKey} tick={{ fontSize: 10, fill: '#6B6560' }} />
                    <YAxis tickFormatter={formatMoney} tick={{ fontSize: 10, fill: '#6B6560' }} />
                    <Tooltip
                      formatter={(value) => [formatMoney(Number(value)), 'Compras']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E8E2DA', fontSize: 12, backgroundColor: '#FEFCF9' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke={COLORS.olive}
                      strokeWidth={2}
                      dot={{ fill: COLORS.olive, strokeWidth: 1, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>

        {/* Distribución de Compras */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-ink">Distribución Compras</h2>
            <select
              value={modoDistribucion}
              onChange={(e) => setModoDistribucion(e.target.value as 'proveedor' | 'categoria')}
              className="text-xs border border-sand-dark rounded-lg px-2 py-1 text-ink-muted bg-white focus:outline-none focus:border-terracotta"
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
                <div className="flex items-center justify-center h-48">
                  <p className="text-sm text-ink-muted">Sin datos</p>
                </div>
              )
            }

            return (
              <div className="flex items-center gap-6">
                <div className="h-48 w-48 flex-shrink-0 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribucionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={70}
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
                        contentStyle={{ borderRadius: 8, border: '1px solid #E8E2DA', fontSize: 12, backgroundColor: '#FEFCF9' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5 min-w-0">
                  {distribucionData.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: modoDistribucion === 'categoria'
                              ? (LABEL_COLORES[item.nombre] || item.color || PIE_COLORS[i % PIE_COLORS.length])
                              : PIE_COLORS[i % PIE_COLORS.length]
                          }}
                        />
                        <span className="text-ink truncate" title={item.nombre}>{item.nombre}</span>
                      </div>
                      <span className="text-ink-muted font-mono text-xs flex-shrink-0">{item.porcentaje}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Cuarta fila: Compras por Categoría en el Tiempo */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-ink">Compras por Categoría</h2>
          <select
            value={modoComprasCat}
            onChange={(e) => setModoComprasCat(e.target.value as 'semanal' | 'mensual')}
            className="text-xs border border-sand-dark rounded-lg px-2 py-1 text-ink-muted bg-white focus:outline-none focus:border-terracotta"
          >
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
        </div>
        {(() => {
          const comprasData = modoComprasCat === 'semanal'
            ? data.comprasPorCategoriaSemanales
            : data.comprasPorCategoriaMensuales

          if (comprasData.length === 0) {
            return (
              <div className="flex items-center justify-center h-56">
                <p className="text-sm text-ink-muted">Sin datos</p>
              </div>
            )
          }

          // Calcular totales y porcentajes para la leyenda
          const totales = comprasData.reduce((acc, d) => ({
            Carnes: acc.Carnes + d.Carnes,
            Pescados: acc.Pescados + d.Pescados,
            Verduras: acc.Verduras + d.Verduras,
            Almacen: acc.Almacen + d.Almacen,
            Lacteos: acc.Lacteos + d.Lacteos,
            total: acc.total + d.total
          }), { Carnes: 0, Pescados: 0, Verduras: 0, Almacen: 0, Lacteos: 0, total: 0 })

          const pct = (val: number) => totales.total > 0 ? ((val / totales.total) * 100).toFixed(0) : '0'

          return (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comprasData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E2DA" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#6B6560' }} />
                    <YAxis tickFormatter={formatMoney} tick={{ fontSize: 10, fill: '#6B6560' }} />
                    <Tooltip
                      formatter={(value, name) => [formatMoney(Number(value)), name]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E8E2DA', fontSize: 12, backgroundColor: '#FEFCF9' }}
                    />
                    <Line type="monotone" dataKey="Carnes" stroke={CATEG_COLORES.Carnes} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Pescados" stroke={CATEG_COLORES.Pescados_Mariscos} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Verduras" stroke={CATEG_COLORES.Verduras_Frutas} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Almacen" stroke={CATEG_COLORES.Almacen} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Lacteos" stroke={CATEG_COLORES.Lacteos_Fiambres} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Leyenda con porcentajes */}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: CATEG_COLORES.Carnes }} /> Carnes ({pct(totales.Carnes)}%)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: CATEG_COLORES.Pescados_Mariscos }} /> Pescados ({pct(totales.Pescados)}%)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: CATEG_COLORES.Verduras_Frutas }} /> Verduras ({pct(totales.Verduras)}%)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: CATEG_COLORES.Almacen }} /> Almacén ({pct(totales.Almacen)}%)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: CATEG_COLORES.Lacteos_Fiambres }} /> Lácteos ({pct(totales.Lacteos)}%)
                </span>
              </div>
            </>
          )
        })()}
      </div>

      {/* Modal de Alertas */}
      {alertaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-cream-light rounded-card border border-sand shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            {/* Header del modal */}
            <div className="flex items-center justify-between p-4 border-b border-sand">
              <h3 className="text-lg font-semibold text-ink">
                {alertaModal === 'itemsAumento' && 'Ítems con aumento >7%'}
                {alertaModal === 'itemsBaja' && 'Ítems con baja >5%'}
                {alertaModal === 'ordenesSinFactura' && 'Órdenes sin factura'}
                {alertaModal === 'platosFuera' && 'Platos fuera de rango'}
              </h3>
              <button
                onClick={() => setAlertaModal(null)}
                className="p-1.5 hover:bg-cream-dark rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-ink-muted" />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {/* Items con aumento */}
              {alertaModal === 'itemsAumento' && (
                <div className="space-y-2">
                  {data.itemsConAumentoDetalle.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-cream-dark rounded-lg">
                      <div>
                        <p className="font-medium text-ink">{item.nombre}</p>
                        <p className="text-xs text-ink-muted">{item.categoria}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: COLORS.dangerBg, color: COLORS.danger }}>
                        +{item.variacion.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-sand mt-3">
                    <Link href="/insumos" className="text-sm text-terracotta hover:text-terracotta-dark font-medium">
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
                      className="flex items-center justify-between p-3 bg-cream-dark rounded-lg hover:bg-sand transition-colors"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          {orden.numero ? `OC #${orden.numero}` : 'Sin número'}
                        </p>
                        <p className="text-xs text-ink-muted">{orden.proveedor}</p>
                      </div>
                      <span className="text-sm font-mono font-semibold text-ink">
                        {formatMoney(orden.total)}
                      </span>
                    </Link>
                  ))}
                  <div className="pt-3 border-t border-sand mt-3">
                    <Link href="/ordenes-compra" className="text-sm text-terracotta hover:text-terracotta-dark font-medium">
                      Ver todas las órdenes →
                    </Link>
                  </div>
                </div>
              )}

              {/* Platos fuera de rango */}
              {alertaModal === 'platosFuera' && (
                <div className="space-y-2">
                  {data.platosFueraRangoDetalle.map((plato, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-cream-dark rounded-lg">
                      <div>
                        <p className="font-medium text-ink">{plato.nombre}</p>
                        <p className="text-xs text-ink-muted">Margen objetivo: {plato.margenObjetivo}%</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: COLORS.dangerBg, color: COLORS.danger }}>
                        {plato.foodCost.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-sand mt-3">
                    <Link href="/carta" className="text-sm text-terracotta hover:text-terracotta-dark font-medium">
                      Ver carta completa →
                    </Link>
                  </div>
                </div>
              )}

              {/* Items con baja de precio */}
              {alertaModal === 'itemsBaja' && (
                <div className="space-y-2">
                  {data.itemsConBajaDetalle.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-cream-dark rounded-lg">
                      <div>
                        <p className="font-medium text-ink">{item.nombre}</p>
                        <p className="text-xs text-ink-muted">{item.categoria}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: COLORS.successBg, color: COLORS.success }}>
                        {item.variacion.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-sand mt-3">
                    <Link href="/insumos" className="text-sm text-terracotta hover:text-terracotta-dark font-medium">
                      Ver comparador de precios →
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
