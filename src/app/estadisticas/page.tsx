'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'
import { Select, Input } from '@/components/ui'
import { TrendingUp, TrendingDown, Minus, Users, Package, DollarSign, ChevronRight, ChevronDown, Search, AlertTriangle, Lightbulb, FileText, Scale } from 'lucide-react'

// ============ TIPOS ============
interface Insumo {
  id: string
  nombre: string
  categoria: string
}

interface PrecioRaw {
  insumo_id: string
  precio: number
  fecha: string
}

interface FacturaItemConFecha {
  insumo_id: string
  precio: number
  fecha: string
}

interface FacturaConDetalle {
  id: string
  fecha: string
  total: number
  tipo: string
  proveedor_id: string
  proveedores: { nombre: string } | null
  factura_items: {
    insumo_id: string
    cantidad: number
    precio_unitario: number
    insumos: { categoria: string; iva_porcentaje: number } | null
  }[]
}

// ============ CONSTANTES ============
const COLORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#ec4899', '#14b8a6', '#f59e0b']

const PERIODOS = [
  { value: 'esta_semana', label: 'Esta semana' },
  { value: 'semana_pasada', label: 'Semana pasada' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '60', label: 'Últimos 60 días' },
  { value: '90', label: 'Últimos 90 días' },
]

// Helper: obtener lunes de una semana
function getLunes(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Ajustar cuando es domingo
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Calcular rango de fechas según período
function calcularRangoFechas(periodo: string): { desde: string; hasta: string } {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const lunesActual = getLunes(hoy)

  let desde: Date
  let hasta: Date

  switch (periodo) {
    case 'esta_semana':
      // Esta semana: desde el lunes hasta hoy
      desde = new Date(lunesActual)
      hasta = new Date(hoy)
      break
    case 'semana_pasada':
      // Semana pasada: lunes a domingo
      desde = new Date(lunesActual)
      desde.setDate(desde.getDate() - 7)
      hasta = new Date(desde)
      hasta.setDate(hasta.getDate() + 6)
      break
    case '30':
    case '60':
    case '90':
      // Últimos X días
      const dias = parseInt(periodo)
      desde = new Date(hoy)
      desde.setDate(desde.getDate() - dias)
      hasta = new Date(hoy)
      break
    default:
      desde = new Date(hoy)
      desde.setDate(desde.getDate() - 30)
      hasta = new Date(hoy)
  }

  return {
    desde: desde.toISOString().split('T')[0],
    hasta: hasta.toISOString().split('T')[0],
  }
}

const CATEG_LABELS: Record<string, string> = {
  Carnes: 'Carnes',
  Almacen: 'Almacén',
  Verduras_Frutas: 'Verduras y Frutas',
  Pescados_Mariscos: 'Pescados y Mariscos',
  Lacteos_Fiambres: 'Lácteos y Fiambres',
  Bebidas: 'Bebidas',
  Salsas_Recetas: 'Salsas y Recetas',
}

const CATEG_COLORES: Record<string, string> = {
  Carnes: '#dc2626',
  Almacen: '#d97706',
  Verduras_Frutas: '#16a34a',
  Pescados_Mariscos: '#0891b2',
  Lacteos_Fiambres: '#7c3aed',
  Bebidas: '#2563eb',
  Salsas_Recetas: '#db2777',
}

type TabType = 'proveedores' | 'comparador' | 'variacion' | 'alertas'

interface FacturaResumenProveedor {
  proveedor_id: string
  nombre: string
  total: number
  cantidadFacturas: number
  ticketPromedio: number
  categorias: Map<string, number>
}

interface EvolucionMensual {
  mes: string
  [proveedor: string]: number | string
}

interface PrecioProveedor {
  proveedor: string
  ultimoPrecio: number
  fechaUltimo: string
  precioPromedio: number
  precioMin: number
  precioMax: number
  variacionPrimeraUltima: number
  cantidadCompras: number
}

interface Alerta {
  id: string
  tipo: 'aumento' | 'oportunidad'
  insumoId: string
  insumoNombre: string
  proveedorAfectado: string
  proveedorAlternativo?: string
  porcentaje: number
  fecha: string
  descripcion: string
}

interface InsumoVariacion {
  id: string
  nombre: string
  precioInicial: number
  precioFinal: number
  variacion: number
  cantidadRegistros: number
}

export default function EstadisticasPage() {
  const [activeTab, setActiveTab] = useState<TabType>('proveedores')
  const [periodo, setPeriodo] = useState('semana_pasada')
  const [isLoading, setIsLoading] = useState(true)
  const [categoriaExpandida, setCategoriaExpandida] = useState<string | null>(null)

  // Datos para proveedores
  const [facturas, setFacturas] = useState<FacturaConDetalle[]>([])
  const [facturas6Meses, setFacturas6Meses] = useState<FacturaConDetalle[]>([])

  // Datos para variación de precios
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [preciosDeFacturas, setPreciosDeFacturas] = useState<FacturaItemConFecha[]>([])
  const [preciosAnterioresMapa, setPreciosAnterioresMapa] = useState<Map<string, number>>(new Map())
  const [rangoFechas, setRangoFechas] = useState({ desde: '', hasta: '' })

  // Datos para comparador de precios
  const [modoComparador, setModoComparador] = useState<'insumo' | 'categoria'>('insumo')
  const [insumoSeleccionado, setInsumoSeleccionado] = useState('')
  const [categoriaComparador, setCategoriaComparador] = useState('')
  const [busquedaInsumo, setBusquedaInsumo] = useState('')

  // Todos los precios históricos para comparador y alertas
  const [todosLosPrecios, setTodosLosPrecios] = useState<{
    insumo_id: string
    proveedor_id: string
    proveedor_nombre: string
    precio: number
    fecha: string
  }[]>([])

  useEffect(() => {
    fetchData()
  }, [periodo])

  async function fetchData() {
    setIsLoading(true)
    const { desde, hasta } = calcularRangoFechas(periodo)
    setRangoFechas({ desde, hasta })

    // Calcular fecha de hace 6 meses para evolución
    const hace6Meses = new Date()
    hace6Meses.setMonth(hace6Meses.getMonth() - 6)
    const desde6Meses = hace6Meses.toISOString().split('T')[0]

    const [insumosRes, facturasRes, facturasAnterioresRes, facturas6MesesRes] = await Promise.all([
      supabase.from('insumos').select('id, nombre, categoria').eq('activo', true),
      supabase.from('facturas_proveedor').select(`
        id, fecha, total, tipo, proveedor_id,
        proveedores (nombre),
        factura_items (insumo_id, cantidad, precio_unitario, insumos (categoria, iva_porcentaje))
      `).eq('activo', true).gte('fecha', desde).lte('fecha', hasta),
      // Traer facturas ANTERIORES al período para obtener precios previos
      supabase.from('facturas_proveedor').select(`
        fecha,
        factura_items (insumo_id, precio_unitario)
      `).eq('activo', true).lt('fecha', desde).order('fecha', { ascending: false }),
      // Traer facturas de los últimos 6 meses para evolución y comparador
      supabase.from('facturas_proveedor').select(`
        id, fecha, total, tipo, proveedor_id,
        proveedores (nombre),
        factura_items (insumo_id, cantidad, precio_unitario, insumos (categoria, iva_porcentaje))
      `).eq('activo', true).gte('fecha', desde6Meses).order('fecha', { ascending: true }),
    ])

    if (insumosRes.data) setInsumos(insumosRes.data)

    // Guardar el precio más reciente ANTERIOR al período para cada insumo
    if (facturasAnterioresRes.data) {
      const mapAnteriores = new Map<string, number>()
      // Las facturas vienen ordenadas por fecha desc, así que la primera que encontremos es la más reciente
      facturasAnterioresRes.data.forEach((factura: any) => {
        if (factura.factura_items) {
          factura.factura_items.forEach((item: any) => {
            // Solo guardar si no tenemos ya un precio para este insumo (el primero es el más reciente)
            if (item.insumo_id && !mapAnteriores.has(item.insumo_id)) {
              mapAnteriores.set(item.insumo_id, item.precio_unitario)
            }
          })
        }
      })
      setPreciosAnterioresMapa(mapAnteriores)
    }

    if (facturasRes.data) {
      const facturasList = facturasRes.data as unknown as FacturaConDetalle[]
      setFacturas(facturasList)

      // Extraer precios de los items de facturas
      const precios: FacturaItemConFecha[] = []
      facturasList.forEach(factura => {
        if (factura.factura_items) {
          factura.factura_items.forEach((item: any) => {
            if (item.insumo_id) {
              precios.push({
                insumo_id: item.insumo_id,
                precio: item.precio_unitario,
                fecha: factura.fecha,
              })
            }
          })
        }
      })
      setPreciosDeFacturas(precios)
    }

    // Guardar facturas de 6 meses para evolución
    if (facturas6MesesRes.data) {
      const facturasList6 = facturas6MesesRes.data as unknown as FacturaConDetalle[]
      setFacturas6Meses(facturasList6)

      // Extraer todos los precios con proveedor para comparador y alertas
      const todosPrecios: typeof todosLosPrecios = []
      facturasList6.forEach(factura => {
        if (factura.factura_items) {
          factura.factura_items.forEach((item: any) => {
            if (item.insumo_id) {
              todosPrecios.push({
                insumo_id: item.insumo_id,
                proveedor_id: factura.proveedor_id,
                proveedor_nombre: factura.proveedores?.nombre || 'Sin proveedor',
                precio: item.precio_unitario,
                fecha: factura.fecha,
              })
            }
          })
        }
      })
      setTodosLosPrecios(todosPrecios)
    }

    setIsLoading(false)
  }

  // ============ CÁLCULOS PROVEEDORES ============
  const datosProveedores = useMemo(() => {
    const porProveedor = new Map<string, FacturaResumenProveedor>()

    facturas.forEach(f => {
      const provNombre = f.proveedores?.nombre || 'Sin proveedor'
      const esNC = f.tipo === 'nota_credito'

      if (!porProveedor.has(provNombre)) {
        porProveedor.set(provNombre, {
          proveedor_id: f.proveedor_id,
          nombre: provNombre,
          total: 0,
          cantidadFacturas: 0,
          ticketPromedio: 0,
          categorias: new Map()
        })
      }

      const prov = porProveedor.get(provNombre)!

      // Solo contar facturas (no NC) para cantidad
      if (!esNC) {
        prov.cantidadFacturas += 1
      }

      f.factura_items?.forEach(item => {
        const subtotal = item.cantidad * item.precio_unitario
        const iva = subtotal * ((item.insumos?.iva_porcentaje ?? 21) / 100)
        const totalItem = esNC ? -(subtotal + iva) : (subtotal + iva)

        prov.total += totalItem

        const cat = item.insumos?.categoria || 'Otros'
        prov.categorias.set(cat, (prov.categorias.get(cat) || 0) + totalItem)
      })
    })

    // Calcular ticket promedio
    porProveedor.forEach(prov => {
      prov.ticketPromedio = prov.cantidadFacturas > 0 ? prov.total / prov.cantidadFacturas : 0
    })

    return Array.from(porProveedor.values())
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [facturas])

  // Evolución mensual últimos 6 meses
  const evolucionMensual = useMemo(() => {
    const porMesProveedor = new Map<string, Map<string, number>>()
    const proveedoresSet = new Set<string>()

    facturas6Meses.forEach(f => {
      const provNombre = f.proveedores?.nombre || 'Sin proveedor'
      const esNC = f.tipo === 'nota_credito'
      const mes = f.fecha.substring(0, 7) // YYYY-MM
      proveedoresSet.add(provNombre)

      if (!porMesProveedor.has(mes)) {
        porMesProveedor.set(mes, new Map())
      }

      const mesData = porMesProveedor.get(mes)!

      f.factura_items?.forEach(item => {
        const subtotal = item.cantidad * item.precio_unitario
        const iva = subtotal * ((item.insumos?.iva_porcentaje ?? 21) / 100)
        const totalItem = esNC ? -(subtotal + iva) : (subtotal + iva)
        mesData.set(provNombre, (mesData.get(provNombre) || 0) + totalItem)
      })
    })

    // Convertir a array para el gráfico
    const meses = Array.from(porMesProveedor.keys()).sort()
    const proveedoresTop = datosProveedores.slice(0, 5).map(p => p.nombre)

    return meses.map(mes => {
      const mesData = porMesProveedor.get(mes)!
      const resultado: EvolucionMensual = {
        mes: new Date(mes + '-01').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
      }
      proveedoresTop.forEach(prov => {
        resultado[prov] = mesData.get(prov) || 0
      })
      return resultado
    })
  }, [facturas6Meses, datosProveedores])

  const totalCompras = useMemo(() => datosProveedores.reduce((s, p) => s + p.total, 0), [datosProveedores])

  const datosPieProveedores = useMemo(() => {
    return datosProveedores.slice(0, 6).map((p, idx) => ({
      name: p.nombre,
      value: p.total,
      color: COLORES[idx % COLORES.length],
    }))
  }, [datosProveedores])

  // Datos por categoría de todos los proveedores
  const datosPorCategoria = useMemo(() => {
    const porCat = new Map<string, { categoria: string; total: number; proveedores: Map<string, number> }>()

    datosProveedores.forEach(prov => {
      prov.categorias.forEach((total, cat) => {
        if (!porCat.has(cat)) {
          porCat.set(cat, { categoria: cat, total: 0, proveedores: new Map() })
        }
        const catData = porCat.get(cat)!
        catData.total += total
        catData.proveedores.set(prov.nombre, (catData.proveedores.get(prov.nombre) || 0) + total)
      })
    })

    return Array.from(porCat.values())
      .sort((a, b) => b.total - a.total)
      .map(cat => ({
        ...cat,
        proveedoresList: Array.from(cat.proveedores.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([nombre, total]) => ({ nombre, total })),
      }))
  }, [datosProveedores])

  // ============ CÁLCULOS VARIACIÓN ============
  const allCategResumen = useMemo(() => {
    if (preciosDeFacturas.length === 0 || insumos.length === 0) return []

    const insumosConPrecios = new Set(preciosDeFacturas.map(p => p.insumo_id))
    const insumosActivos = insumos.filter(i => insumosConPrecios.has(i.id))
    const categorias = Array.from(new Set(insumosActivos.map(i => i.categoria)))

    return categorias.map(cat => {
      const categInsumos = insumosActivos.filter(i => i.categoria === cat)
      const categInsumoIds = categInsumos.map(i => i.id)
      const preciosCat = preciosDeFacturas.filter(p => categInsumoIds.includes(p.insumo_id))

      if (preciosCat.length === 0) return null

      const variacionesPorInsumo: number[] = []
      const insumosDetalle: InsumoVariacion[] = []

      categInsumos.forEach(insumo => {
        const preciosInsumo = preciosCat
          .filter(p => p.insumo_id === insumo.id)
          .sort((a, b) => a.fecha.localeCompare(b.fecha))

        if (preciosInsumo.length >= 1) {
          // Precio actual: último precio del período
          const precioActual = preciosInsumo[preciosInsumo.length - 1].precio
          // Precio anterior: del mapa de precios anteriores (de facturas previas)
          const precioAnterior = preciosAnterioresMapa.get(insumo.id)

          const precioInicialFinal = precioAnterior && precioAnterior > 0 ? precioAnterior : precioActual
          let varInsumo = 0

          // Calcular variación si hay precio anterior diferente al actual
          if (precioInicialFinal !== precioActual && precioInicialFinal > 0) {
            varInsumo = ((precioActual - precioInicialFinal) / precioInicialFinal) * 100
            if (Math.abs(varInsumo) <= 200) {
              variacionesPorInsumo.push(varInsumo)
            }
          }

          insumosDetalle.push({
            id: insumo.id,
            nombre: insumo.nombre,
            precioInicial: precioInicialFinal,
            precioFinal: precioActual,
            variacion: varInsumo,
            cantidadRegistros: preciosInsumo.length,
          })
        }
      })

      // Ordenar insumos por variación absoluta
      insumosDetalle.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))

      const variacion = variacionesPorInsumo.length > 0
        ? variacionesPorInsumo.reduce((sum, v) => sum + v, 0) / variacionesPorInsumo.length
        : 0

      return {
        categoria: cat,
        label: CATEG_LABELS[cat] || cat,
        color: CATEG_COLORES[cat] || '#6b7280',
        insumos: categInsumos.length,
        variacion,
        insumosConVariacion: variacionesPorInsumo.length,
        insumosDetalle,
      }
    }).filter(Boolean).sort((a, b) => Math.abs(b!.variacion) - Math.abs(a!.variacion)) as {
      categoria: string; label: string; color: string; insumos: number; variacion: number; insumosConVariacion: number; insumosDetalle: InsumoVariacion[];
    }[]
  }, [preciosDeFacturas, insumos, preciosAnterioresMapa])

  // ============ COMPARADOR DE PRECIOS ============
  const insumosFiltrados = useMemo(() => {
    if (!busquedaInsumo) return insumos
    const busqueda = busquedaInsumo.toLowerCase()
    return insumos.filter(i => i.nombre.toLowerCase().includes(busqueda))
  }, [insumos, busquedaInsumo])

  const comparacionPrecios = useMemo((): PrecioProveedor[] => {
    if (!insumoSeleccionado) return []

    const preciosInsumo = todosLosPrecios.filter(p => p.insumo_id === insumoSeleccionado)
    if (preciosInsumo.length === 0) return []

    // Agrupar por proveedor
    const porProveedor = new Map<string, typeof preciosInsumo>()
    preciosInsumo.forEach(p => {
      if (!porProveedor.has(p.proveedor_nombre)) {
        porProveedor.set(p.proveedor_nombre, [])
      }
      porProveedor.get(p.proveedor_nombre)!.push(p)
    })

    const resultado: PrecioProveedor[] = []
    porProveedor.forEach((precios, proveedor) => {
      const preciosOrdenados = precios.sort((a, b) => a.fecha.localeCompare(b.fecha))
      const preciosNumeros = preciosOrdenados.map(p => p.precio)

      const ultimoPrecio = preciosOrdenados[preciosOrdenados.length - 1].precio
      const primerPrecio = preciosOrdenados[0].precio
      const variacion = primerPrecio > 0 ? ((ultimoPrecio - primerPrecio) / primerPrecio) * 100 : 0

      resultado.push({
        proveedor,
        ultimoPrecio,
        fechaUltimo: preciosOrdenados[preciosOrdenados.length - 1].fecha,
        precioPromedio: preciosNumeros.reduce((a, b) => a + b, 0) / preciosNumeros.length,
        precioMin: Math.min(...preciosNumeros),
        precioMax: Math.max(...preciosNumeros),
        variacionPrimeraUltima: variacion,
        cantidadCompras: precios.length,
      })
    })

    // Ordenar por último precio (menor primero)
    return resultado.sort((a, b) => a.ultimoPrecio - b.ultimoPrecio)
  }, [insumoSeleccionado, todosLosPrecios])

  const menorPrecioActual = useMemo(() => {
    if (comparacionPrecios.length === 0) return 0
    return comparacionPrecios[0].ultimoPrecio
  }, [comparacionPrecios])

  // Matriz de precios por categoría (proveedores vs insumos)
  const matrizPreciosCategoria = useMemo(() => {
    if (!categoriaComparador) return { insumos: [], proveedores: [], precios: new Map<string, number>() }

    // Filtrar insumos de la categoría seleccionada
    const insumosCategoria = insumos.filter(i => i.categoria === categoriaComparador)
    const insumoIds = new Set(insumosCategoria.map(i => i.id))

    // Filtrar precios de esos insumos
    const preciosFiltrados = todosLosPrecios.filter(p => insumoIds.has(p.insumo_id))

    // Obtener lista de proveedores únicos que tienen precios en esta categoría
    const proveedoresSet = new Set<string>()
    preciosFiltrados.forEach(p => proveedoresSet.add(p.proveedor_nombre))
    const proveedoresList = Array.from(proveedoresSet).sort()

    // Crear mapa de último precio por insumo-proveedor
    const ultimosPreciosMap = new Map<string, { precio: number; fecha: string }>()
    preciosFiltrados.forEach(p => {
      const key = `${p.insumo_id}|${p.proveedor_nombre}`
      const existing = ultimosPreciosMap.get(key)
      if (!existing || p.fecha > existing.fecha) {
        ultimosPreciosMap.set(key, { precio: p.precio, fecha: p.fecha })
      }
    })

    // Filtrar insumos que tienen al menos un precio
    const insumosConPrecios = insumosCategoria.filter(i => {
      return proveedoresList.some(prov => ultimosPreciosMap.has(`${i.id}|${prov}`))
    })

    // Crear mapa simple de precios
    const preciosSimple = new Map<string, number>()
    ultimosPreciosMap.forEach((val, key) => {
      preciosSimple.set(key, val.precio)
    })

    return {
      insumos: insumosConPrecios,
      proveedores: proveedoresList,
      precios: preciosSimple,
    }
  }, [categoriaComparador, insumos, todosLosPrecios])

  // Encontrar el mejor precio por insumo
  const mejorPrecioPorInsumo = useMemo(() => {
    const mejores = new Map<string, { proveedor: string; precio: number }>()

    matrizPreciosCategoria.insumos.forEach(insumo => {
      let mejorPrecio = Infinity
      let mejorProveedor = ''

      matrizPreciosCategoria.proveedores.forEach(prov => {
        const precio = matrizPreciosCategoria.precios.get(`${insumo.id}|${prov}`)
        if (precio !== undefined && precio < mejorPrecio) {
          mejorPrecio = precio
          mejorProveedor = prov
        }
      })

      if (mejorProveedor) {
        mejores.set(insumo.id, { proveedor: mejorProveedor, precio: mejorPrecio })
      }
    })

    return mejores
  }, [matrizPreciosCategoria])

  // ============ ALERTAS ============
  const alertas = useMemo((): Alerta[] => {
    const listaAlertas: Alerta[] = []

    // Fecha de hace 30 días
    const hace30Dias = new Date()
    hace30Dias.setDate(hace30Dias.getDate() - 30)
    const fechaLimite = hace30Dias.toISOString().split('T')[0]

    // Agrupar precios por insumo y proveedor
    const preciosPorInsumoProveedor = new Map<string, typeof todosLosPrecios>()
    todosLosPrecios.forEach(p => {
      const key = `${p.insumo_id}|${p.proveedor_nombre}`
      if (!preciosPorInsumoProveedor.has(key)) {
        preciosPorInsumoProveedor.set(key, [])
      }
      preciosPorInsumoProveedor.get(key)!.push(p)
    })

    // Detectar aumentos >10% en el último mes
    preciosPorInsumoProveedor.forEach((precios, key) => {
      const [insumoId] = key.split('|')
      const insumo = insumos.find(i => i.id === insumoId)
      if (!insumo) return

      const preciosOrdenados = precios.sort((a, b) => a.fecha.localeCompare(b.fecha))
      const preciosRecientes = preciosOrdenados.filter(p => p.fecha >= fechaLimite)

      if (preciosRecientes.length >= 2) {
        const primerPrecioMes = preciosRecientes[0].precio
        const ultimoPrecioMes = preciosRecientes[preciosRecientes.length - 1].precio

        if (primerPrecioMes > 0) {
          const variacion = ((ultimoPrecioMes - primerPrecioMes) / primerPrecioMes) * 100

          if (variacion > 10) {
            listaAlertas.push({
              id: `aumento-${insumoId}-${preciosRecientes[0].proveedor_nombre}`,
              tipo: 'aumento',
              insumoId,
              insumoNombre: insumo.nombre,
              proveedorAfectado: preciosRecientes[0].proveedor_nombre,
              porcentaje: variacion,
              fecha: preciosRecientes[preciosRecientes.length - 1].fecha,
              descripcion: `Aumento de precio del ${variacion.toFixed(0)}%`,
            })
          }
        }
      }
    })

    // Detectar oportunidades: hay proveedor más barato que el habitual
    const ultimosPreciosPorInsumo = new Map<string, { proveedor: string; precio: number; fecha: string }[]>()
    todosLosPrecios.forEach(p => {
      if (!ultimosPreciosPorInsumo.has(p.insumo_id)) {
        ultimosPreciosPorInsumo.set(p.insumo_id, [])
      }
      ultimosPreciosPorInsumo.get(p.insumo_id)!.push({
        proveedor: p.proveedor_nombre,
        precio: p.precio,
        fecha: p.fecha,
      })
    })

    ultimosPreciosPorInsumo.forEach((precios, insumoId) => {
      const insumo = insumos.find(i => i.id === insumoId)
      if (!insumo) return

      // Obtener último precio por proveedor
      const ultimoPorProveedor = new Map<string, { precio: number; fecha: string }>()
      precios.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(p => {
        ultimoPorProveedor.set(p.proveedor, { precio: p.precio, fecha: p.fecha })
      })

      if (ultimoPorProveedor.size < 2) return

      const proveedores = Array.from(ultimoPorProveedor.entries())
      const ordenadosPorPrecio = proveedores.sort((a, b) => a[1].precio - b[1].precio)
      const masBarcato = ordenadosPorPrecio[0]
      const masReciente = proveedores.reduce((a, b) => a[1].fecha > b[1].fecha ? a : b)

      // Si el proveedor más reciente no es el más barato
      if (masReciente[0] !== masBarcato[0] && masReciente[1].precio > masBarcato[1].precio) {
        const ahorro = ((masReciente[1].precio - masBarcato[1].precio) / masReciente[1].precio) * 100

        if (ahorro >= 5) { // Solo alertar si el ahorro es >= 5%
          listaAlertas.push({
            id: `oportunidad-${insumoId}`,
            tipo: 'oportunidad',
            insumoId,
            insumoNombre: insumo.nombre,
            proveedorAfectado: masReciente[0],
            proveedorAlternativo: masBarcato[0],
            porcentaje: ahorro,
            fecha: masBarcato[1].fecha,
            descripcion: `${masBarcato[0]} tiene mejor precio (-${ahorro.toFixed(0)}%)`,
          })
        }
      }
    })

    // Ordenar por fecha (más reciente primero)
    return listaAlertas.sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [todosLosPrecios, insumos])

  const formatMoney = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  const tabs = [
    { id: 'proveedores' as TabType, label: 'Compras por Proveedor', icon: Users },
    { id: 'comparador' as TabType, label: 'Comparador de Precios', icon: Scale },
    { id: 'variacion' as TabType, label: 'Variación de Precios', icon: TrendingUp },
    { id: 'alertas' as TabType, label: 'Alertas', icon: AlertTriangle },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>
          <p className="text-gray-600">
            {rangoFechas.desde && rangoFechas.hasta ? (
              <>
                {new Date(rangoFechas.desde + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                {' — '}
                {new Date(rangoFechas.hasta + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </>
            ) : 'Análisis de compras y precios'}
          </p>
        </div>
        <div className="w-44">
          <Select
            options={PERIODOS}
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Cargando datos...</p>
        </div>
      ) : activeTab === 'proveedores' ? (
        /* ============ TAB PROVEEDORES ============ */
        <div className="space-y-6">
          {/* Resumen rápido */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs">Total Compras</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatMoney(totalCompras)}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">Proveedores</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{datosProveedores.length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Package className="w-4 h-4" />
                <span className="text-xs">Categorías</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{datosPorCategoria.length}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs">Proveedor Principal</span>
              </div>
              <p className="text-lg font-bold text-gray-900 truncate">{datosProveedores[0]?.nombre || '-'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribución por proveedor */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución por Proveedor</h3>
              {datosPieProveedores.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datosPieProveedores}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }: any) => `${name || ''} (${((percent || 0) * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {datosPieProveedores.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatMoney(v || 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-12">Sin datos</p>
              )}
            </div>

            {/* Ranking proveedores */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Ranking de Proveedores</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {datosProveedores.map((prov, idx) => (
                  <div key={prov.nombre} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{prov.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                          <FileText className="w-3 h-3" />
                          {prov.cantidadFacturas} fact.
                        </span>
                        <span className="text-[10px] text-gray-500">
                          Ticket: {formatMoney(prov.ticketPromedio)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${(prov.total / totalCompras) * 100}%`,
                            backgroundColor: COLORES[idx % COLORES.length],
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatMoney(prov.total)}</p>
                      <p className="text-[10px] text-gray-500">{((prov.total / totalCompras) * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Evolución mensual */}
          {evolucionMensual.length > 0 && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolución Mensual (Últimos 6 meses)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={evolucionMensual}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatMoney(v || 0)} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {datosProveedores.slice(0, 5).map((prov, idx) => (
                      <Bar
                        key={prov.nombre}
                        dataKey={prov.nombre}
                        fill={COLORES[idx % COLORES.length]}
                        stackId="a"
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Compras por categoría */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Compras por Categoría</h3>
            <div className="space-y-4">
              {datosPorCategoria.map(cat => (
                <div key={cat.categoria} className="border-b pb-3 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: CATEG_COLORES[cat.categoria] || '#6b7280' }}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {CATEG_LABELS[cat.categoria] || cat.categoria}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatMoney(cat.total)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cat.proveedoresList.slice(0, 4).map(p => (
                      <span key={p.nombre} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                        {p.nombre}: {formatMoney(p.total)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'comparador' ? (
        /* ============ TAB COMPARADOR DE PRECIOS ============ */
        <div className="space-y-6">
          {/* Selector de modo */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => { setModoComparador('insumo'); setCategoriaComparador('') }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modoComparador === 'insumo'
                    ? 'bg-purple-100 text-purple-800 border-2 border-purple-500'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                }`}
              >
                <Package className="w-4 h-4" />
                Por Insumo
              </button>
              <button
                type="button"
                onClick={() => { setModoComparador('categoria'); setInsumoSeleccionado('') }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modoComparador === 'categoria'
                    ? 'bg-purple-100 text-purple-800 border-2 border-purple-500'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                }`}
              >
                <Users className="w-4 h-4" />
                Por Categoría
              </button>
            </div>

            {modoComparador === 'insumo' ? (
              <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar insumo..."
                    value={busquedaInsumo}
                    onChange={(e) => setBusquedaInsumo(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    options={[
                      { value: '', label: 'Seleccionar insumo...' },
                      ...insumosFiltrados.map(i => ({ value: i.id, label: `${i.nombre} (${CATEG_LABELS[i.categoria] || i.categoria})` }))
                    ]}
                    value={insumoSeleccionado}
                    onChange={(e) => setInsumoSeleccionado(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="max-w-md">
                <Select
                  label="Categoría"
                  options={[
                    { value: '', label: 'Seleccionar categoría...' },
                    { value: 'Carnes', label: 'Carnes' },
                    { value: 'Almacen', label: 'Almacén' },
                    { value: 'Verduras_Frutas', label: 'Verduras y Frutas' },
                    { value: 'Pescados_Mariscos', label: 'Pescados y Mariscos' },
                    { value: 'Lacteos_Fiambres', label: 'Lácteos y Fiambres' },
                    { value: 'Bebidas', label: 'Bebidas' },
                  ]}
                  value={categoriaComparador}
                  onChange={(e) => setCategoriaComparador(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Contenido según modo */}
          {modoComparador === 'insumo' ? (
            /* MODO INSUMO */
            insumoSeleccionado && comparacionPrecios.length > 0 ? (
              <>
                <div className="bg-white rounded-lg border overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Comparación de precios: {insumos.find(i => i.id === insumoSeleccionado)?.nombre}
                    </h3>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Último Precio</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Promedio</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Mín / Máx</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Var. 1ra/Últ</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Compras</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {comparacionPrecios.map((p, idx) => (
                        <tr key={p.proveedor} className={`hover:bg-gray-50 ${idx === 0 ? 'bg-green-50' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{p.proveedor}</span>
                              {p.ultimoPrecio === menorPrecioActual && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                                  MEJOR PRECIO
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-500">
                              Última compra: {new Date(p.fechaUltimo + 'T12:00:00').toLocaleDateString('es-AR')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-bold ${idx === 0 ? 'text-green-600' : 'text-gray-900'}`}>
                              {formatMoney(p.ultimoPrecio)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {formatMoney(p.precioPromedio)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {formatMoney(p.precioMin)} / {formatMoney(p.precioMax)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {p.variacionPrimeraUltima > 0 ? (
                                <TrendingUp className="w-3 h-3 text-red-500" />
                              ) : p.variacionPrimeraUltima < 0 ? (
                                <TrendingDown className="w-3 h-3 text-green-500" />
                              ) : (
                                <Minus className="w-3 h-3 text-gray-400" />
                              )}
                              <span className={`text-xs font-semibold ${
                                p.variacionPrimeraUltima > 0 ? 'text-red-600' : p.variacionPrimeraUltima < 0 ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {p.variacionPrimeraUltima > 0 ? '+' : ''}{p.variacionPrimeraUltima.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {p.cantidadCompras}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Gráfico de barras horizontal */}
                <div className="bg-white rounded-lg border p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Comparación Visual - Último Precio</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={comparacionPrecios.map(p => ({
                          proveedor: p.proveedor,
                          precio: p.ultimoPrecio,
                          fill: p.ultimoPrecio === menorPrecioActual ? '#16a34a' : '#6b7280'
                        }))}
                        margin={{ left: 100, right: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => formatMoney(v)} tick={{ fontSize: 11 }} />
                        <YAxis dataKey="proveedor" type="category" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(v: any) => formatMoney(v || 0)} />
                        <Bar dataKey="precio" fill="#6b7280">
                          {comparacionPrecios.map((entry, idx) => (
                            <Cell key={idx} fill={entry.ultimoPrecio === menorPrecioActual ? '#16a34a' : '#6b7280'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : insumoSeleccionado ? (
              <div className="bg-white rounded-lg border p-12 text-center">
                <p className="text-gray-400">No hay compras registradas para este insumo</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border p-12 text-center">
                <Scale className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Seleccioná un insumo para comparar precios entre proveedores</p>
              </div>
            )
          ) : (
            /* MODO CATEGORÍA - Matriz insumos vs proveedores */
            categoriaComparador && matrizPreciosCategoria.insumos.length > 0 ? (
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Matriz de precios: {CATEG_LABELS[categoriaComparador] || categoriaComparador}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {matrizPreciosCategoria.insumos.length} insumos · {matrizPreciosCategoria.proveedores.length} proveedores
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50 z-10 min-w-[180px]">
                          Insumo
                        </th>
                        {matrizPreciosCategoria.proveedores.map(proveedor => (
                          <th key={proveedor} className="px-3 py-3 text-center text-[10px] font-medium text-gray-500 uppercase min-w-[100px]">
                            <div className="truncate max-w-[100px]" title={proveedor}>
                              {proveedor}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {matrizPreciosCategoria.insumos.map(insumo => {
                        const mejorPrecio = mejorPrecioPorInsumo.get(insumo.id)
                        return (
                          <tr key={insumo.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 border-r">
                              {insumo.nombre}
                            </td>
                            {matrizPreciosCategoria.proveedores.map(proveedor => {
                              const precio = matrizPreciosCategoria.precios.get(`${insumo.id}|${proveedor}`)
                              const esMejor = mejorPrecio?.proveedor === proveedor && precio !== undefined

                              return (
                                <td key={proveedor} className={`px-3 py-2 text-center text-xs ${esMejor ? 'bg-green-50' : ''}`}>
                                  {precio !== undefined ? (
                                    <span className={`font-medium ${esMejor ? 'text-green-700' : 'text-gray-900'}`}>
                                      {formatMoney(precio)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-100 rounded" /> Mejor precio por insumo
                  </span>
                </div>
              </div>
            ) : categoriaComparador ? (
              <div className="bg-white rounded-lg border p-12 text-center">
                <p className="text-gray-400">No hay datos de precios para esta categoría</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border p-12 text-center">
                <Scale className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">Seleccioná una categoría para ver la matriz de precios</p>
              </div>
            )
          )}
        </div>
      ) : activeTab === 'variacion' ? (
        /* ============ TAB VARIACIÓN ============ */
        <div className="space-y-4">
          {allCategResumen.length === 0 ? (
            <div className="bg-white rounded-lg border p-12 text-center">
              <p className="text-gray-400">No hay datos de precios en el período seleccionado</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Insumos c/Var</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variación Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {allCategResumen.map((cat) => {
                    const isExpanded = categoriaExpandida === cat.categoria
                    return (
                      <React.Fragment key={cat.categoria}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setCategoriaExpandida(isExpanded ? null : cat.categoria)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600">
                            {cat.insumosDetalle.length} insumos
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {cat.variacion > 0 ? (
                                <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                              ) : cat.variacion < 0 ? (
                                <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Minus className="w-3.5 h-3.5 text-gray-400" />
                              )}
                              <span className={`text-sm font-bold ${
                                cat.variacion > 0 ? 'text-red-600' : cat.variacion < 0 ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {cat.variacion > 0 ? '+' : ''}{cat.variacion.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={3} className="px-0 py-0">
                              <div className="bg-gray-50 border-y">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="text-[10px] text-gray-500 uppercase">
                                      <th className="px-6 py-2 text-left font-medium">Insumo</th>
                                      <th className="px-4 py-2 text-right font-medium">Precio Inicial</th>
                                      <th className="px-4 py-2 text-right font-medium">Precio Final</th>
                                      <th className="px-4 py-2 text-right font-medium">Variación</th>
                                      <th className="px-4 py-2 text-center font-medium">Compras</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {cat.insumosDetalle.map((ins) => (
                                      <tr key={ins.id} className="bg-white hover:bg-gray-50">
                                        <td className="px-6 py-2 text-sm text-gray-900">{ins.nombre}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                          {formatMoney(ins.precioInicial)}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-600 text-right">
                                          {formatMoney(ins.precioFinal)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          {ins.precioInicial !== ins.precioFinal ? (
                                            <div className="flex items-center justify-end gap-1">
                                              {ins.variacion > 0 ? (
                                                <TrendingUp className="w-3 h-3 text-red-500" />
                                              ) : ins.variacion < 0 ? (
                                                <TrendingDown className="w-3 h-3 text-green-500" />
                                              ) : (
                                                <Minus className="w-3 h-3 text-gray-400" />
                                              )}
                                              <span className={`text-xs font-semibold ${
                                                ins.variacion > 0 ? 'text-red-600' : ins.variacion < 0 ? 'text-green-600' : 'text-gray-500'
                                              }`}>
                                                {ins.variacion > 0 ? '+' : ''}{ins.variacion.toFixed(1)}%
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-gray-400">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <span className="text-xs text-gray-500">{ins.cantidadRegistros}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>

              {/* Promedio general */}
              <div className="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Variación promedio general: {' '}
                  <span className={`font-bold ${
                    (allCategResumen.reduce((s, r) => s + r.variacion, 0) / allCategResumen.length) > 0
                      ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {((allCategResumen.reduce((s, r) => s + r.variacion, 0) / allCategResumen.length) > 0 ? '+' : '')}
                    {(allCategResumen.reduce((s, r) => s + r.variacion, 0) / allCategResumen.length).toFixed(1)}%
                  </span>
                </span>
                <span className="text-xs text-gray-400">
                  Ordenado por mayor variación
                </span>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'alertas' ? (
        /* ============ TAB ALERTAS ============ */
        <div className="space-y-4">
          {/* Resumen de alertas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-50 rounded-lg border border-red-200 p-4">
              <div className="flex items-center gap-2 text-red-700 mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">Aumentos &gt;10%</span>
              </div>
              <p className="text-2xl font-bold text-red-700">
                {alertas.filter(a => a.tipo === 'aumento').length}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-200 p-4">
              <div className="flex items-center gap-2 text-green-700 mb-1">
                <Lightbulb className="w-4 h-4" />
                <span className="text-xs font-medium">Oportunidades</span>
              </div>
              <p className="text-2xl font-bold text-green-700">
                {alertas.filter(a => a.tipo === 'oportunidad').length}
              </p>
            </div>
          </div>

          {/* Lista de alertas */}
          {alertas.length > 0 ? (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="divide-y divide-gray-200">
                {alertas.map(alerta => (
                  <div
                    key={alerta.id}
                    className={`p-4 ${alerta.tipo === 'aumento' ? 'hover:bg-red-50' : 'hover:bg-green-50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${
                        alerta.tipo === 'aumento' ? 'bg-red-100' : 'bg-green-100'
                      }`}>
                        {alerta.tipo === 'aumento' ? (
                          <AlertTriangle className={`w-4 h-4 text-red-600`} />
                        ) : (
                          <Lightbulb className={`w-4 h-4 text-green-600`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-semibold ${
                            alerta.tipo === 'aumento' ? 'text-red-700' : 'text-green-700'
                          }`}>
                            {alerta.tipo === 'aumento' ? 'Aumento de precio' : 'Oportunidad de ahorro'}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            alerta.tipo === 'aumento'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {alerta.tipo === 'aumento' ? '+' : '-'}{Math.abs(alerta.porcentaje).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 font-medium">{alerta.insumoNombre}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {alerta.tipo === 'aumento' ? (
                            <>Proveedor: <span className="font-medium">{alerta.proveedorAfectado}</span></>
                          ) : (
                            <>
                              <span className="font-medium">{alerta.proveedorAlternativo}</span> tiene mejor precio que <span className="font-medium">{alerta.proveedorAfectado}</span>
                            </>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(alerta.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No hay alertas en este momento</p>
              <p className="text-xs text-gray-400 mt-1">Las alertas se generan automáticamente desde las facturas</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
