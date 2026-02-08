'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, ChefHat, Calculator } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/ui'

interface Plato {
  id: string
  nombre: string
  costo_total: number
  seccion: string
  precio_carta?: number
}

interface Insumo {
  id: string
  nombre: string
  precio: number
  unidad_medida: string
}

interface OpcionMenu {
  id: string
  plato_id: string | null
  insumo_id: string | null
  nombre: string
  tipo_opcion: string
  costo: number
  precio_carta: number
  es_insumo: boolean
  isNew?: boolean
}

// Secciones del menú especial
const SECCIONES_MENU = [
  { value: 'Entradas', label: 'Entradas', secciones_plato: ['Entradas'], esInsumo: false },
  { value: 'Principales', label: 'Principales', secciones_plato: ['Principales', 'Pastas y Arroces', 'Ensaladas'], esInsumo: false },
  { value: 'Postres', label: 'Postres', secciones_plato: ['Postres'], esInsumo: false },
  { value: 'Bebidas', label: 'Bebidas', secciones_plato: [], esInsumo: true },
]

// Normalizar tipo_opcion de valores viejos a nuevos
function normalizarTipoOpcion(tipo: string): string {
  const mapeo: Record<string, string> = {
    'entrada': 'Entradas',
    'Entrada': 'Entradas',
    'principal': 'Principales',
    'Principal': 'Principales',
    'Pastas y Arroces': 'Principales',
    'Ensaladas': 'Principales',
    'postre': 'Postres',
    'Postre': 'Postres',
    'bebida': 'Bebidas',
    'Bebida': 'Bebidas',
    'guarnicion': 'Principales',
    'Guarnición': 'Principales',
  }
  return mapeo[tipo] || tipo
}

export default function EditarMenuEspecialPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [opciones, setOpciones] = useState<OpcionMenu[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isReadOnly, setIsReadOnly] = useState(false)

  // Cantidades por sección
  const [cantidades, setCantidades] = useState<Record<string, number>>({
    Entradas: 1,
    Principales: 2,
    Postres: 1,
    Bebidas: 1,
  })

  // Comensales y precios
  const [comensales, setComensales] = useState(2)
  const [margenObjetivo, setMargenObjetivo] = useState(25)
  const [precioVenta, setPrecioVenta] = useState(0)

  // Calculadora de eventos
  const [cantidadMesas, setCantidadMesas] = useState('')

  // Datos para selectores
  const [platos, setPlatos] = useState<Plato[]>([])
  const [bebidas, setBebidas] = useState<Insumo[]>([])

  // Estado para agregar nueva opción
  const [nuevoTipoOpcion, setNuevoTipoOpcion] = useState('Entradas')
  const [nuevoItemId, setNuevoItemId] = useState('')

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    setIsLoading(true)

    // Cargar insumos con precios para recalcular costos
    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    // Cargar recetas base con ingredientes
    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`
        id, rendimiento_porciones,
        receta_base_ingredientes (insumo_id, cantidad)
      `)
      .eq('activo', true)

    // Función para calcular costo final de insumo
    function getCostoFinalInsumo(insumoId: string): number {
      const insumo = insumosData?.find(i => i.id === insumoId)
      if (!insumo || !insumo.precio_actual) return 0
      return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
    }

    // Función para calcular costo por porción de receta base
    function getCostoPorcionReceta(recetaBaseId: string): number {
      const receta = recetasBaseData?.find((r: any) => r.id === recetaBaseId)
      if (!receta) return 0
      let costoTotal = 0
      for (const ing of (receta as any).receta_base_ingredientes || []) {
        costoTotal += ing.cantidad * getCostoFinalInsumo(ing.insumo_id)
      }
      return (receta as any).rendimiento_porciones > 0
        ? costoTotal / (receta as any).rendimiento_porciones
        : 0
    }

    // Cargar platos con ingredientes para recalcular costos
    const { data: platosData } = await supabase
      .from('platos')
      .select(`
        id, nombre, seccion, rendimiento_porciones,
        plato_ingredientes (insumo_id, receta_base_id, cantidad)
      `)
      .eq('activo', true)
      .order('nombre')

    // Cargar precios de carta
    const { data: cartaData } = await supabase
      .from('carta')
      .select('plato_id, precio_carta')
      .eq('activo', true)

    const cartaMap = new Map((cartaData || []).map(c => [c.plato_id, c.precio_carta]))

    // Calcular costo real de cada plato (por porción)
    const platosConCosto = (platosData || []).map((p: any) => {
      let costoReceta = 0
      for (const ing of p.plato_ingredientes || []) {
        if (ing.insumo_id) {
          costoReceta += ing.cantidad * getCostoFinalInsumo(ing.insumo_id)
        } else if (ing.receta_base_id) {
          costoReceta += ing.cantidad * getCostoPorcionReceta(ing.receta_base_id)
        }
      }
      const rendimiento = p.rendimiento_porciones > 0 ? p.rendimiento_porciones : 1
      const costoPorPorcion = costoReceta / rendimiento

      return {
        id: p.id,
        nombre: p.nombre,
        seccion: p.seccion || 'Principales',
        costo_total: costoPorPorcion, // Costo por porción calculado dinámicamente
        precio_carta: cartaMap.get(p.id) || 0
      }
    })
    setPlatos(platosConCosto)

    // Mapa para buscar costos recalculados por plato_id
    const platosMap = new Map(platosConCosto.map(p => [p.id, p]))

    // Cargar bebidas (insumos categoría Bebidas) con sus precios
    const { data: bebidasData } = await supabase
      .from('insumos')
      .select('id, nombre, unidad_medida')
      .eq('activo', true)
      .eq('categoria', 'Bebidas')
      .order('nombre')

    const bebidasMap = new Map<string, Insumo>()
    if (bebidasData) {
      const bebidasConPrecio = await Promise.all(
        bebidasData.map(async (b) => {
          const { data: precioData } = await supabase
            .from('precios_insumo')
            .select('precio')
            .eq('insumo_id', b.id)
            .order('fecha', { ascending: false })
            .limit(1)
            .single()
          return {
            ...b,
            precio: precioData?.precio || 0
          }
        })
      )
      bebidasConPrecio.forEach(b => bebidasMap.set(b.id, b))
      setBebidas(bebidasConPrecio)
    }

    // Cargar menú
    const { data: menu, error } = await supabase
      .from('menus_especiales')
      .select(`
        id, nombre, descripcion, costo_promedio, activo,
        comensales, margen_objetivo, precio_venta,
        cantidad_entradas, cantidad_principales, cantidad_postres, cantidad_bebidas,
        menu_especial_opciones (
          id, plato_id, insumo_id, tipo_opcion,
          platos (nombre, costo_total, seccion),
          insumos (nombre)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !menu) {
      alert('Menú no encontrado')
      router.push('/menus-especiales')
      return
    }

    setNombre(menu.nombre)
    setDescripcion(menu.descripcion || '')
    setIsReadOnly(menu.activo === false)
    setComensales((menu as any).comensales || 2)
    setMargenObjetivo((menu as any).margen_objetivo || 25)
    setPrecioVenta((menu as any).precio_venta || 0)
    setCantidades({
      Entradas: (menu as any).cantidad_entradas || 1,
      Principales: (menu as any).cantidad_principales || 2,
      Postres: (menu as any).cantidad_postres || 1,
      Bebidas: (menu as any).cantidad_bebidas || 1,
    })

    console.log('Menu cargado:', menu)
    console.log('Opciones raw:', menu.menu_especial_opciones)
    console.log('Cantidad de opciones en DB:', menu.menu_especial_opciones?.length || 0)

    // Si no hay opciones en la DB, mostrar mensaje
    if (!menu.menu_especial_opciones || menu.menu_especial_opciones.length === 0) {
      console.log('No hay opciones en la base de datos para este menú')
      setOpciones([])
      setIsLoading(false)
      return
    }

    // Mapear opciones con precios actuales
    const mappedOpciones: OpcionMenu[] = (menu.menu_especial_opciones as any[]).map((o: any) => {
      const tipoNormalizado = normalizarTipoOpcion(o.tipo_opcion)
      console.log('Procesando opción:', o.id, 'tipo original:', o.tipo_opcion, 'tipo normalizado:', tipoNormalizado)

      if (o.insumo_id) {
        // Es una bebida/insumo
        const bebida = bebidasMap.get(o.insumo_id)
        const nombreBebida = o.insumos?.nombre || bebida?.nombre || 'Bebida desconocida'
        return {
          id: o.id,
          plato_id: null,
          insumo_id: o.insumo_id,
          nombre: nombreBebida,
          tipo_opcion: tipoNormalizado,
          costo: bebida?.precio || 0,
          precio_carta: bebida?.precio || 0,
          es_insumo: true,
        }
      } else if (o.plato_id) {
        // Es un plato - usar costo recalculado del platosMap
        const platoRecalculado = platosMap.get(o.plato_id)
        return {
          id: o.id,
          plato_id: o.plato_id,
          insumo_id: null,
          nombre: platoRecalculado?.nombre || o.platos?.nombre || 'Plato desconocido',
          tipo_opcion: tipoNormalizado,
          costo: platoRecalculado?.costo_total || 0, // Usa el costo recalculado
          precio_carta: platoRecalculado?.precio_carta || cartaMap.get(o.plato_id) || 0,
          es_insumo: false,
        }
      } else {
        // Opción sin plato ni insumo (dato corrupto)
        console.warn('Opción sin plato_id ni insumo_id:', o)
        return {
          id: o.id,
          plato_id: null,
          insumo_id: null,
          nombre: 'Opción inválida',
          tipo_opcion: tipoNormalizado,
          costo: 0,
          precio_carta: 0,
          es_insumo: false,
        }
      }
    })

    console.log('Opciones mapeadas:', mappedOpciones)
    setOpciones(mappedOpciones)
    setIsLoading(false)
  }

  // Filtrar items según la sección seleccionada del menú
  const itemOptions = useMemo(() => {
    const seccionConfig = SECCIONES_MENU.find(s => s.value === nuevoTipoOpcion)

    if (seccionConfig?.esInsumo) {
      // Para bebidas, mostrar insumos
      return [
        { value: '', label: bebidas.length === 0 ? 'No hay bebidas cargadas' : 'Seleccionar bebida...' },
        ...bebidas.map(b => ({
          value: `insumo_${b.id}`,
          label: `${b.nombre} ($${b.precio.toLocaleString('es-AR', { maximumFractionDigits: 0 })} / ${b.unidad_medida})`
        }))
      ]
    } else {
      // Para platos
      const seccionesPlato = seccionConfig?.secciones_plato || []
      const platosFiltrados = platos.filter(p => seccionesPlato.includes(p.seccion))

      return [
        { value: '', label: platosFiltrados.length === 0 ? 'No hay platos en esta sección' : 'Seleccionar plato...' },
        ...platosFiltrados.map(p => ({
          value: `plato_${p.id}`,
          label: `${p.nombre} (Costo: $${p.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}${p.precio_carta ? ` | Carta: $${p.precio_carta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : ''})`
        }))
      ]
    }
  }, [platos, bebidas, nuevoTipoOpcion])

  function handleAgregarOpcion() {
    if (!nuevoItemId) {
      console.log('handleAgregarOpcion: nuevoItemId está vacío')
      return
    }

    console.log('handleAgregarOpcion: nuevoItemId =', nuevoItemId)

    // Separar tipo del ID (formato: "plato_uuid" o "insumo_uuid")
    const underscoreIndex = nuevoItemId.indexOf('_')
    if (underscoreIndex === -1) {
      console.log('handleAgregarOpcion: formato inválido, no hay underscore')
      return
    }

    const tipo = nuevoItemId.substring(0, underscoreIndex)
    const itemId = nuevoItemId.substring(underscoreIndex + 1)

    console.log('handleAgregarOpcion: tipo =', tipo, 'itemId =', itemId)

    let nuevaOpcion: OpcionMenu

    if (tipo === 'insumo') {
      const bebida = bebidas.find(b => b.id === itemId)
      console.log('handleAgregarOpcion: bebida encontrada =', bebida)
      if (!bebida) return

      nuevaOpcion = {
        id: crypto.randomUUID(),
        plato_id: null,
        insumo_id: itemId,
        nombre: bebida.nombre,
        tipo_opcion: nuevoTipoOpcion,
        costo: bebida.precio,
        precio_carta: bebida.precio,
        es_insumo: true,
        isNew: true,
      }
    } else {
      const plato = platos.find(p => p.id === itemId)
      console.log('handleAgregarOpcion: plato encontrado =', plato)
      if (!plato) {
        console.log('handleAgregarOpcion: plato no encontrado! Platos disponibles:', platos.map(p => ({ id: p.id, nombre: p.nombre })))
        return
      }

      nuevaOpcion = {
        id: crypto.randomUUID(),
        plato_id: itemId,
        insumo_id: null,
        nombre: plato.nombre,
        tipo_opcion: nuevoTipoOpcion,
        costo: plato.costo_total,
        precio_carta: plato.precio_carta || 0,
        es_insumo: false,
        isNew: true,
      }
    }

    console.log('handleAgregarOpcion: agregando opción =', nuevaOpcion)
    setOpciones([...opciones, nuevaOpcion])
    setNuevoItemId('')
  }

  function handleEliminarOpcion(opcionId: string) {
    setOpciones(opciones.filter(o => o.id !== opcionId))
  }

  // Agrupar opciones por tipo
  const opcionesPorTipo = useMemo(() => {
    const grupos: Record<string, OpcionMenu[]> = {}
    SECCIONES_MENU.forEach(t => grupos[t.value] = [])
    opciones.forEach(o => {
      if (!grupos[o.tipo_opcion]) grupos[o.tipo_opcion] = []
      grupos[o.tipo_opcion].push(o)
    })
    return grupos
  }, [opciones])

  // Calcular costos considerando cantidades
  const calculos = useMemo(() => {
    let costoMenu = 0
    let precioCartaTotal = 0

    SECCIONES_MENU.forEach(seccion => {
      const opts = opcionesPorTipo[seccion.value] || []
      const cant = cantidades[seccion.value] || 0
      if (opts.length > 0 && cant > 0) {
        const costoPromSeccion = opts.reduce((sum, o) => sum + o.costo, 0) / opts.length
        const precioPromSeccion = opts.reduce((sum, o) => sum + o.precio_carta, 0) / opts.length
        costoMenu += costoPromSeccion * cant
        precioCartaTotal += precioPromSeccion * cant
      }
    })

    const costoPorPersona = comensales > 0 ? costoMenu / comensales : 0
    const precioSugerido = margenObjetivo > 0 ? costoPorPersona / (margenObjetivo / 100) : 0
    const margenReal = precioVenta > 0 ? ((precioVenta - costoPorPersona) / precioVenta * 100) : 0
    const contribucion = precioVenta - costoPorPersona

    return {
      costoMenu,           // Costo total del menú (ej: para 2 personas)
      costoTotal: costoMenu, // Alias para compatibilidad
      costoPorPersona,     // Costo dividido por comensales
      precioSugerido,      // Precio sugerido según margen objetivo
      margenReal,          // Margen real con precio de venta
      contribucion,        // Contribución marginal
      precioCartaTotal     // Suma de precios de carta (referencia)
    }
  }, [opcionesPorTipo, cantidades, comensales, margenObjetivo, precioVenta])

  // Calcular costo total del evento (por cantidad de mesas)
  const mesas = parseInt(cantidadMesas) || 0
  const costoTotalEvento = calculos.costoMenu * mesas
  const precioTotalEvento = precioVenta * comensales * mesas

  async function handleGuardar() {
    if (!nombre.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    if (opciones.length === 0) {
      alert('Agregá al menos una opción al menú')
      return
    }

    setIsSaving(true)

    // Actualizar menú
    const { error: menuError } = await supabase
      .from('menus_especiales')
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        costo_promedio: calculos.costoPorPersona,
        comensales,
        margen_objetivo: margenObjetivo,
        precio_venta: precioVenta,
        cantidad_entradas: cantidades.Entradas,
        cantidad_principales: cantidades.Principales,
        cantidad_postres: cantidades.Postres,
        cantidad_bebidas: cantidades.Bebidas,
      })
      .eq('id', id)

    if (menuError) {
      console.error('Error actualizando menú:', menuError)
      alert('Error al actualizar el menú')
      setIsSaving(false)
      return
    }

    // Eliminar opciones existentes y crear nuevas
    await supabase.from('menu_especial_opciones').delete().eq('menu_especial_id', id)

    // Crear opciones - solo incluir campos con valor
    const opcionesToInsert = opciones.map(o => {
      const opcion: any = {
        menu_especial_id: id,
        tipo_opcion: o.tipo_opcion,
      }
      if (o.plato_id) opcion.plato_id = o.plato_id
      if (o.insumo_id) opcion.insumo_id = o.insumo_id
      return opcion
    })

    console.log('Insertando opciones:', opcionesToInsert)

    const { error: opcionesError } = await supabase
      .from('menu_especial_opciones')
      .insert(opcionesToInsert)

    if (opcionesError) {
      console.error('Error creando opciones:', opcionesError)
      console.error('Detalle:', JSON.stringify(opcionesError, null, 2))
      console.error('Opciones que se intentaron insertar:', JSON.stringify(opcionesToInsert, null, 2))
      alert('Error al actualizar las opciones del menú: ' + opcionesError.message + '\n\nCódigo: ' + opcionesError.code + '\nDetalle: ' + opcionesError.details)
      setIsSaving(false)
      return
    }

    router.push('/menus-especiales')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isReadOnly ? 'Ver Menú Especial' : 'Editar Menú Especial'}
          </h1>
          {isReadOnly ? (
            <span className="text-xs text-red-500">En papelera</span>
          ) : (
            <p className="text-gray-600">Modificá las opciones del menú</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Datos básicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre del Menú"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Menú Casamiento Premium"
            required
            disabled={isReadOnly}
          />
          <Input
            label="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: 3 pasos para 2 personas"
            disabled={isReadOnly}
          />
        </div>

        {/* Cantidades por sección */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Cantidad por sección (para el cálculo)</h3>
          <div className="flex gap-4 flex-wrap items-center">
            {SECCIONES_MENU.map(seccion => (
              <div key={seccion.value} className="flex items-center gap-2">
                <label className="text-sm text-gray-600">{seccion.label}:</label>
                <input
                  type="number"
                  min="0"
                  value={cantidades[seccion.value] || 0}
                  onChange={(e) => setCantidades({ ...cantidades, [seccion.value]: parseInt(e.target.value) || 0 })}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                  disabled={isReadOnly}
                />
              </div>
            ))}
            <div className="border-l pl-4 flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Comensales:</label>
              <input
                type="number"
                min="1"
                value={comensales}
                onChange={(e) => setComensales(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 border border-gray-300 rounded text-center font-semibold"
                disabled={isReadOnly}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Ej: Para 2 personas que comparten entrada y postre: Entradas=1, Principales=2, Postres=1, Comensales=2
          </p>
        </div>

        {/* Precios y Márgenes */}
        <div className="border-t pt-6">
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Análisis de Precios</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Costo del Menú */}
              <div className="text-center">
                <p className="text-xs text-gray-500">Costo Menú ({comensales} pers.)</p>
                <p className="text-lg font-bold text-gray-700">
                  ${calculos.costoMenu.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              {/* Costo por Persona */}
              <div className="text-center bg-white rounded-lg p-2">
                <p className="text-xs text-gray-500">Costo x Persona</p>
                <p className="text-xl font-bold text-green-600">
                  ${calculos.costoPorPersona.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              {/* Margen Objetivo */}
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Margen Objetivo</p>
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={margenObjetivo}
                    onChange={(e) => setMargenObjetivo(parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                    disabled={isReadOnly}
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
              {/* Precio Sugerido */}
              <div className="text-center">
                <p className="text-xs text-gray-500">Precio Sugerido</p>
                <p className="text-lg font-bold text-blue-600">
                  ${calculos.precioSugerido.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-green-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Precio de Venta */}
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Precio de Venta</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    value={precioVenta || ''}
                    onChange={(e) => setPrecioVenta(parseInt(e.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-center font-semibold"
                    placeholder="0"
                    disabled={isReadOnly}
                  />
                </div>
              </div>
              {/* Margen Real */}
              <div className="text-center bg-white rounded-lg p-2">
                <p className="text-xs text-gray-500">Margen Real</p>
                <p className={`text-xl font-bold ${calculos.margenReal >= margenObjetivo ? 'text-green-600' : 'text-red-600'}`}>
                  {calculos.margenReal.toFixed(1)}%
                </p>
              </div>
              {/* Contribución */}
              <div className="text-center bg-white rounded-lg p-2">
                <p className="text-xs text-gray-500">Contribución</p>
                <p className={`text-xl font-bold ${calculos.contribucion >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${calculos.contribucion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
              {/* Food Cost */}
              <div className="text-center">
                <p className="text-xs text-gray-500">Food Cost</p>
                <p className={`text-lg font-bold ${precioVenta > 0 ? (100 - calculos.margenReal <= 35 ? 'text-green-600' : 'text-yellow-600') : 'text-gray-400'}`}>
                  {precioVenta > 0 ? (100 - calculos.margenReal).toFixed(1) : '—'}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Calculadora de Evento */}
        <div className="border-t pt-6">
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-pink-500" />
              Calculadora de Evento
            </h3>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="w-40">
                <Input
                  label="Cantidad de Mesas/Grupos"
                  type="number"
                  value={cantidadMesas}
                  onChange={(e) => setCantidadMesas(e.target.value)}
                  placeholder="10"
                />
              </div>
              {mesas > 0 && (
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Costo Total Evento</p>
                    <p className="text-xl font-bold text-green-600">
                      ${costoTotalEvento.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Precio Carta Total</p>
                    <p className="text-xl font-bold text-blue-600">
                      ${precioTotalEvento.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {mesas > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {mesas} mesas × ${calculos.costoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })} por mesa
              </p>
            )}
          </div>
        </div>

        {/* Agregar opciones */}
        {!isReadOnly && (
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Agregar Opciones de Platos</h3>

            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-40">
                <Select
                  label="Sección"
                  options={SECCIONES_MENU.map(s => ({ value: s.value, label: s.label }))}
                  value={nuevoTipoOpcion}
                  onChange={(e) => { setNuevoTipoOpcion(e.target.value); setNuevoItemId('') }}
                />
              </div>
              <div className="flex-1 min-w-[300px]">
                <Select
                  label={nuevoTipoOpcion === 'Bebidas' ? 'Bebida' : 'Plato'}
                  options={itemOptions}
                  value={nuevoItemId}
                  onChange={(e) => setNuevoItemId(e.target.value)}
                />
              </div>
              <Button onClick={handleAgregarOpcion} disabled={!nuevoItemId}>
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </div>
          </div>
        )}

        {/* Mensaje si no hay opciones */}
        {opciones.length === 0 && (
          <div className="border-t pt-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
              <p className="text-yellow-700 font-medium">Este menú no tiene opciones de platos</p>
              <p className="text-yellow-600 text-sm mt-1">
                Usá el selector de arriba para agregar entradas, principales, postres y bebidas.
              </p>
            </div>
          </div>
        )}

        {/* Lista de opciones agrupadas */}
        {opciones.length > 0 && (
          <div className="border-t pt-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Opciones del Menú</h3>

            {SECCIONES_MENU.map(seccion => {
              const opts = opcionesPorTipo[seccion.value]
              if (opts.length === 0) return null
              const cant = cantidades[seccion.value] || 0

              return (
                <div key={seccion.value} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 font-medium text-gray-700 flex justify-between items-center">
                    <span>
                      {seccion.label}
                      <span className="ml-2 text-xs text-gray-500">
                        ({opts.length} {opts.length === 1 ? 'opción' : 'opciones'})
                      </span>
                    </span>
                    <span className="text-xs text-pink-600">
                      × {cant} = se calcula {cant}
                    </span>
                  </div>
                  <table className="min-w-full">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Plato</th>
                        <th className="px-4 py-2 text-right">Costo</th>
                        <th className="px-4 py-2 text-right">Precio Carta</th>
                        {!isReadOnly && <th className="px-4 py-2 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {opts.map(opcion => (
                        <tr key={opcion.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <ChefHat className="w-4 h-4 text-pink-500" />
                              <span className="text-sm font-medium text-gray-900">{opcion.nombre}</span>
                              {opcion.es_insumo && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Bebida</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-green-600 font-medium">
                            ${opcion.costo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-blue-600 font-medium">
                            {opcion.precio_carta > 0
                              ? `$${opcion.precio_carta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                              : <span className="text-gray-400">—</span>
                            }
                          </td>
                          {!isReadOnly && (
                            <td className="px-4 py-2">
                              <Button variant="ghost" size="sm" onClick={() => handleEliminarOpcion(opcion.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}

            {/* Resumen de costos */}
            <div className="bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500">Costo Menú ({comensales} pers.)</p>
                  <p className="text-xl font-bold text-green-600">
                    ${calculos.costoMenu.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Costo x Persona</p>
                  <p className="text-xl font-bold text-purple-600">
                    ${calculos.costoPorPersona.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Precio Carta Ref.</p>
                  <p className="text-xl font-bold text-blue-600">
                    ${calculos.precioCartaTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 text-center">
                Calculado con: {SECCIONES_MENU.map(s => `${cantidades[s.value] || 0} ${s.label.toLowerCase()}`).join(' + ')} para {comensales} comensales
              </p>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 border-t pt-6">
          <Button variant="secondary" onClick={() => router.back()}>
            {isReadOnly ? 'Volver' : 'Cancelar'}
          </Button>
          {!isReadOnly && (
            <Button onClick={handleGuardar} disabled={isSaving || !nombre.trim() || opciones.length === 0}>
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
