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
}

// Secciones del menú especial
const SECCIONES_MENU = [
  { value: 'Entradas', label: 'Entradas', secciones_plato: ['Entradas'], esInsumo: false },
  { value: 'Principales', label: 'Principales', secciones_plato: ['Principales', 'Pastas y Arroces', 'Ensaladas'], esInsumo: false },
  { value: 'Postres', label: 'Postres', secciones_plato: ['Postres'], esInsumo: false },
  { value: 'Bebidas', label: 'Bebidas', secciones_plato: [], esInsumo: true },
]

export default function NuevoMenuEspecialPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [opciones, setOpciones] = useState<OpcionMenu[]>([])
  const [isSaving, setIsSaving] = useState(false)

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
  }, [])

  async function fetchData() {
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
    if (platosData) {
      const platosConCosto = platosData.map((p: any) => {
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
    }

    // Cargar bebidas (insumos categoría Bebidas) con sus precios
    const { data: bebidasData } = await supabase
      .from('insumos')
      .select('id, nombre, unidad_medida')
      .eq('activo', true)
      .eq('categoria', 'Bebidas')
      .order('nombre')

    if (bebidasData) {
      // Obtener precios actuales de cada bebida
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
      setBebidas(bebidasConPrecio)
    }
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
    if (!nuevoItemId) return

    // Separar tipo del ID (formato: "plato_uuid" o "insumo_uuid")
    const underscoreIndex = nuevoItemId.indexOf('_')
    if (underscoreIndex === -1) return

    const tipo = nuevoItemId.substring(0, underscoreIndex)
    const itemId = nuevoItemId.substring(underscoreIndex + 1)

    let nuevaOpcion: OpcionMenu

    if (tipo === 'insumo') {
      const bebida = bebidas.find(b => b.id === itemId)
      if (!bebida) return

      nuevaOpcion = {
        id: crypto.randomUUID(),
        plato_id: null,
        insumo_id: itemId,
        nombre: bebida.nombre,
        tipo_opcion: nuevoTipoOpcion,
        costo: bebida.precio,
        precio_carta: bebida.precio, // Para bebidas, precio = costo
        es_insumo: true,
      }
    } else {
      const plato = platos.find(p => p.id === itemId)
      if (!plato) return

      nuevaOpcion = {
        id: crypto.randomUUID(),
        plato_id: itemId,
        insumo_id: null,
        nombre: plato.nombre,
        tipo_opcion: nuevoTipoOpcion,
        costo: plato.costo_total,
        precio_carta: plato.precio_carta || 0,
        es_insumo: false,
      }
    }

    setOpciones([...opciones, nuevaOpcion])
    setNuevoItemId('')
  }

  function handleEliminarOpcion(id: string) {
    setOpciones(opciones.filter(o => o.id !== id))
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
      costoMenu,
      costoTotal: costoMenu, // Alias para compatibilidad
      costoPorPersona,
      precioSugerido,
      margenReal,
      contribucion,
      precioCartaTotal,
      precioTotal: precioCartaTotal, // Alias para compatibilidad
      margen: precioCartaTotal > 0 ? ((precioCartaTotal - costoMenu) / precioCartaTotal * 100) : 0
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

    // Crear menú
    const { data: menu, error: menuError } = await supabase
      .from('menus_especiales')
      .insert({
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
      .select('id')
      .single()

    if (menuError || !menu) {
      console.error('Error creando menú:', menuError)
      alert('Error al crear el menú')
      setIsSaving(false)
      return
    }

    // Crear opciones - solo incluir campos con valor
    const opcionesToInsert = opciones.map(o => {
      const opcion: any = {
        menu_especial_id: menu.id,
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
      alert('Error al crear las opciones del menú: ' + opcionesError.message)
      setIsSaving(false)
      return
    }

    router.push('/menus-especiales')
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Menú Especial</h1>
          <p className="text-gray-600">Creá un menú con opciones de platos para eventos</p>
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
          />
          <Input
            label="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: 3 pasos para 2 personas"
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
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Ej: Para 2 personas que comparten entrada y postre: Entradas=1, Principales=2, Postres=1, Comensales=2
          </p>
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
                <label className="block text-xs text-gray-600 mb-1">Cantidad de Mesas/Grupos</label>
                <input
                  type="number"
                  value={cantidadMesas}
                  onChange={(e) => setCantidadMesas(e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
                    <p className="text-xs text-gray-500">Ingreso Total Evento</p>
                    <p className="text-xl font-bold text-blue-600">
                      ${precioTotalEvento.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {mesas > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {mesas} mesas × ${calculos.costoMenu.toLocaleString('es-AR', { maximumFractionDigits: 0 })} por mesa
              </p>
            )}
          </div>
        </div>

        {/* Agregar opciones */}
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

        {/* Lista de opciones agrupadas */}
        {opciones.length > 0 && (
          <div className="border-t pt-6 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Opciones del Menú</h3>

            {SECCIONES_MENU.map(seccion => {
              const opts = opcionesPorTipo[seccion.value]
              if (opts.length === 0) return null
              const cant = cantidades[seccion.value] || 0
              // Calcular promedios
              const costoPromSeccion = opts.length > 0 ? (opts.reduce((sum, o) => sum + o.costo, 0) / opts.length) * cant : 0
              const precioPromSeccion = opts.length > 0 ? (opts.reduce((sum, o) => sum + o.precio_carta, 0) / opts.length) * cant : 0

              return (
                <div key={seccion.value} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 font-medium text-gray-700 flex justify-between items-center">
                    <span>
                      {seccion.label}
                      <span className="ml-2 text-xs text-gray-500">
                        ({opts.length} {opts.length === 1 ? 'opción' : 'opciones'})
                      </span>
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-pink-600">× {cant}</span>
                      {cant > 0 && (
                        <>
                          <span className="text-green-600">
                            Costo: <span className="font-semibold">${costoPromSeccion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                          </span>
                          <span className="text-blue-600">
                            P.Carta: <span className="font-semibold">${precioPromSeccion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <table className="min-w-full">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Plato</th>
                        <th className="px-4 py-2 text-right">Costo</th>
                        <th className="px-4 py-2 text-right">Precio Carta</th>
                        <th className="px-4 py-2 w-10"></th>
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
                          <td className="px-4 py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEliminarOpcion(opcion.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </td>
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
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={isSaving || !nombre.trim() || opciones.length === 0}>
            {isSaving ? 'Guardando...' : 'Guardar Menú'}
          </Button>
        </div>
      </div>
    </div>
  )
}
