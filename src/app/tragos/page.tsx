'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Eye, Martini, Search, ChevronDown, ChevronRight, Package, BookOpen, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { formatearInputNumero, parsearNumero } from '@/lib/formato-numeros'
import Link from 'next/link'

interface TragoConCosto {
  id: string
  nombre: string
  descripcion: string | null
  vaso: string | null
  tecnica: string | null
  ingredientes_texto: string
  costo_total: number
  precio_venta: number
  margen_objetivo: number
}

interface InsumoEnTragos {
  id: string
  nombre: string
  tipo: 'insumo' | 'elaboracion'
  cantidadTragos: number
  tragos: { id: string; nombre: string }[]
}

// BC = costo / precio. Verde ≤22, amarillo ≤28, rojo >28
function bcClasses(bc: number): string {
  if (bc <= 22) return 'text-green-600'
  if (bc <= 28) return 'text-amber-500'
  return 'text-red-600'
}

function precioSugerido(costo: number, margen: number): number {
  return margen > 0 ? costo / (margen / 100) : 0
}

export default function TragosPage() {
  const [tragos, setTragos] = useState<TragoConCosto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [tab, setTab] = useState<'tragos' | 'insumos'>('tragos')
  const [insumosEnTragos, setInsumosEnTragos] = useState<InsumoEnTragos[]>([])
  const [isLoadingInsumos, setIsLoadingInsumos] = useState(false)
  const [insumoExpandido, setInsumoExpandido] = useState<string | null>(null)
  const [busquedaInsumos, setBusquedaInsumos] = useState('')

  // Edición inline: { [id]: { margen, precio } }
  const [editValues, setEditValues] = useState<Record<string, { margen: string; precio: string }>>({})
  const [margenGlobal, setMargenGlobal] = useState('25')
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => {
    fetchTragos()
  }, [])

  useEffect(() => {
    if (tab === 'insumos' && insumosEnTragos.length === 0) {
      fetchInsumosEnTragos()
    }
  }, [tab])

  async function fetchTragos() {
    setIsLoading(true)

    const { data: tragosData, error } = await supabase
      .from('tragos')
      .select(`
        id, nombre, descripcion, vaso, tecnica, precio_venta, margen_objetivo,
        trago_ingredientes (
          insumo_id,
          receta_base_id,
          cantidad,
          insumos (nombre),
          recetas_base (nombre)
        )
      `)
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching tragos:', error)
      setIsLoading(false)
      return
    }

    const { data: insumosData } = await supabase
      .from('v_insumos_con_precio')
      .select('id, precio_actual, iva_porcentaje, merma_porcentaje')

    const { data: recetasBaseData } = await supabase
      .from('recetas_base')
      .select(`
        id, rendimiento_porciones,
        receta_base_ingredientes (
          insumo_id,
          cantidad
        )
      `)
      .eq('activo', true)

    function getCostoFinalInsumo(insumoId: string): number {
      const insumo = insumosData?.find(i => i.id === insumoId)
      if (!insumo || !insumo.precio_actual) return 0
      return insumo.precio_actual * (1 + (insumo.iva_porcentaje || 0) / 100) * (1 + (insumo.merma_porcentaje || 0) / 100)
    }

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

    const tragosConCosto: TragoConCosto[] = (tragosData || []).map((trago: any) => {
      let costo = 0
      for (const ing of trago.trago_ingredientes || []) {
        if (ing.insumo_id) {
          costo += ing.cantidad * getCostoFinalInsumo(ing.insumo_id)
        } else if (ing.receta_base_id) {
          costo += ing.cantidad * getCostoPorcionReceta(ing.receta_base_id)
        }
      }

      const nombres = (trago.trago_ingredientes || [])
        .map((ing: any) => ing.insumos?.nombre || ing.recetas_base?.nombre || '')
        .filter(Boolean)

      return {
        id: trago.id,
        nombre: trago.nombre,
        descripcion: trago.descripcion,
        vaso: trago.vaso,
        tecnica: trago.tecnica,
        ingredientes_texto: nombres.join(' · '),
        costo_total: costo,
        precio_venta: Number(trago.precio_venta) || 0,
        margen_objetivo: Number(trago.margen_objetivo) || 25,
      }
    })

    // Inicializar valores editables
    const ev: Record<string, { margen: string; precio: string }> = {}
    tragosConCosto.forEach(t => {
      ev[t.id] = {
        margen: t.margen_objetivo.toString().replace('.', ','),
        precio: t.precio_venta ? t.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '',
      }
    })
    setEditValues(ev)
    setTragos(tragosConCosto)
    setIsLoading(false)
  }

  async function fetchInsumosEnTragos() {
    setIsLoadingInsumos(true)

    const { data: tragosData } = await supabase
      .from('tragos')
      .select(`
        id, nombre,
        trago_ingredientes (
          insumo_id,
          receta_base_id,
          insumos (id, nombre),
          recetas_base (id, nombre)
        )
      `)
      .eq('activo', true)

    if (!tragosData) {
      setIsLoadingInsumos(false)
      return
    }

    const insumoMap = new Map<string, { nombre: string; tipo: 'insumo' | 'elaboracion'; tragos: { id: string; nombre: string }[] }>()

    tragosData.forEach((trago: any) => {
      const ingredientes = trago.trago_ingredientes || []
      ingredientes.forEach((ing: any) => {
        if (ing.insumo_id && ing.insumos) {
          const key = `insumo-${ing.insumo_id}`
          if (!insumoMap.has(key)) {
            insumoMap.set(key, { nombre: ing.insumos.nombre, tipo: 'insumo', tragos: [] })
          }
          const item = insumoMap.get(key)!
          if (!item.tragos.find(t => t.id === trago.id)) {
            item.tragos.push({ id: trago.id, nombre: trago.nombre })
          }
        }
        if (ing.receta_base_id && ing.recetas_base) {
          const key = `elaboracion-${ing.receta_base_id}`
          if (!insumoMap.has(key)) {
            insumoMap.set(key, { nombre: ing.recetas_base.nombre, tipo: 'elaboracion', tragos: [] })
          }
          const item = insumoMap.get(key)!
          if (!item.tragos.find(t => t.id === trago.id)) {
            item.tragos.push({ id: trago.id, nombre: trago.nombre })
          }
        }
      })
    })

    const resultado: InsumoEnTragos[] = Array.from(insumoMap.entries()).map(([key, value]) => ({
      id: key,
      nombre: value.nombre,
      tipo: value.tipo,
      cantidadTragos: value.tragos.length,
      tragos: value.tragos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    })).sort((a, b) => b.cantidadTragos - a.cantidadTragos)

    setInsumosEnTragos(resultado)
    setIsLoadingInsumos(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este trago?')) return
    const { error } = await supabase.from('tragos').update({ activo: false }).eq('id', id)
    if (error) alert('Error al eliminar el trago')
    else fetchTragos()
  }

  function setEdit(id: string, field: 'margen' | 'precio', value: string) {
    setEditValues(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  // Guardar margen objetivo de un trago (on blur)
  async function handleSaveMargen(trago: TragoConCosto) {
    const nuevoMargen = parsearNumero(editValues[trago.id]?.margen) || 25
    if (nuevoMargen === trago.margen_objetivo) return
    await supabase.from('tragos').update({ margen_objetivo: nuevoMargen }).eq('id', trago.id)
    setTragos(prev => prev.map(t => t.id === trago.id ? { ...t, margen_objetivo: nuevoMargen } : t))
  }

  // Guardar precio de venta de un trago (on blur)
  async function handleSavePrecio(trago: TragoConCosto) {
    const nuevoPrecio = parsearNumero(editValues[trago.id]?.precio) || 0
    if (nuevoPrecio === trago.precio_venta) return
    await supabase.from('tragos').update({ precio_venta: nuevoPrecio }).eq('id', trago.id)
    setTragos(prev => prev.map(t => t.id === trago.id ? { ...t, precio_venta: nuevoPrecio } : t))
  }

  // Aplicar un margen objetivo a TODOS y ajustar sus precios al sugerido
  async function handleAplicarATodos() {
    const margen = parsearNumero(margenGlobal) || 25
    if (margen <= 0) { alert('Ingresá un margen objetivo válido'); return }
    if (!confirm(
      `⚠️ ATENCIÓN: vas a aplicar margen objetivo ${margen}% a ${tragos.length} ` +
      `${tragos.length === 1 ? 'trago' : 'tragos'} y SOBRESCRIBIR sus precios de carta con el sugerido.\n\n` +
      `Esta acción no se puede deshacer. ¿Confirmás?`
    )) return

    setAplicando(true)
    for (const t of tragos) {
      const precio = Math.round(precioSugerido(t.costo_total, margen))
      await supabase.from('tragos').update({ margen_objetivo: margen, precio_venta: precio }).eq('id', t.id)
    }
    setAplicando(false)
    fetchTragos()
  }

  const tragosFiltrados = busqueda
    ? tragos.filter(t => t.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : tragos

  const insumosFiltrados = busquedaInsumos
    ? insumosEnTragos.filter(i => i.nombre.toLowerCase().includes(busquedaInsumos.toLowerCase()))
    : insumosEnTragos

  function bcDe(t: TragoConCosto): number {
    return t.precio_venta > 0 ? (t.costo_total / t.precio_venta) * 100 : 0
  }

  // Card mobile (editable)
  const TragoCard = ({ trago }: { trago: TragoConCosto }) => {
    const bc = bcDe(trago)
    const sug = precioSugerido(trago.costo_total, parsearNumero(editValues[trago.id]?.margen) || trago.margen_objetivo)
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-start gap-2 flex-1">
            <div className="p-1.5 bg-orange-100 rounded-lg flex-shrink-0">
              <Martini className="w-4 h-4 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{trago.nombre}</p>
              {(trago.vaso || trago.tecnica) && (
                <p className="text-xs text-gray-400">{[trago.vaso, trago.tecnica].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-500">Costo</p>
            <p className="font-bold text-green-700 font-mono">
              ${trago.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">M.Obj %</p>
            <input
              type="text"
              inputMode="decimal"
              value={editValues[trago.id]?.margen ?? ''}
              onChange={(e) => setEdit(trago.id, 'margen', formatearInputNumero(e.target.value))}
              onBlur={() => handleSaveMargen(trago)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono"
            />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">Precio</p>
            <input
              type="text"
              inputMode="decimal"
              value={editValues[trago.id]?.precio ?? ''}
              onChange={(e) => setEdit(trago.id, 'precio', formatearInputNumero(e.target.value))}
              onBlur={() => handleSavePrecio(trago)}
              placeholder={`sug. ${Math.round(sug).toLocaleString('es-AR')}`}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-mono"
            />
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 mb-0.5">Bev. Cost</p>
            <p className={`text-sm font-bold font-mono ${trago.precio_venta > 0 ? bcClasses(bc) : 'text-gray-300'}`}>
              {trago.precio_venta > 0 ? `${bc.toFixed(0)}%` : '—'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-1 pt-2 border-t">
          <Link href={`/tragos/${trago.id}?view=true`}>
            <Button variant="ghost" size="sm"><Eye className="w-4 h-4 text-blue-500" /></Button>
          </Link>
          <Link href={`/tragos/${trago.id}`}>
            <Button variant="ghost" size="sm"><Pencil className="w-4 h-4" /></Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(trago.id)}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tragos</h1>
          <p className="text-sm text-gray-600">Recetas de coctelería y barra</p>
        </div>
        {tab === 'tragos' && (
          <Link href="/tragos/nuevo" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Trago
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('tragos')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'tragos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Tragos
        </button>
        <button
          onClick={() => setTab('insumos')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'insumos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Insumos de Tragos
        </button>
      </div>

      {tab === 'tragos' && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar trago..."
              className="pl-9 pr-3 py-2.5 sm:py-2 w-full sm:w-64 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {/* Aplicar margen a todos */}
          {tragos.length > 0 && (
            <div className="flex items-end gap-2 bg-gray-50 border rounded-lg px-3 py-2">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">Margen objetivo (todos)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={margenGlobal}
                    onChange={(e) => setMargenGlobal(formatearInputNumero(e.target.value))}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm font-mono"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              </div>
              <Button size="sm" onClick={handleAplicarATodos} disabled={aplicando}>
                <Check className="w-4 h-4 mr-1" />
                {aplicando ? 'Aplicando...' : 'Aplicar a todos'}
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'tragos' && (
        isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Cargando...</p>
          </div>
        ) : tragos.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <Martini className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No hay tragos registrados</p>
            <Link href="/tragos/nuevo">
              <Button className="mt-3" size="sm"><Plus className="w-4 h-4 mr-1" />Crear el primero</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile: Cards */}
            <div className="md:hidden space-y-3">
              {tragosFiltrados.map((trago) => (
                <TragoCard key={trago.id} trago={trago} />
              ))}
            </div>

            {/* Desktop: Grilla editable */}
            <div className="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trago</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-green-50">Costo</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">P.Sug.</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">M.Obj %</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">P.Carta</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bev. Cost</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tragosFiltrados.map((trago) => {
                    const bc = bcDe(trago)
                    const margenEdit = parsearNumero(editValues[trago.id]?.margen) || trago.margen_objetivo
                    const sug = precioSugerido(trago.costo_total, margenEdit)
                    return (
                      <tr key={trago.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-orange-100 rounded-lg">
                              <Martini className="w-4 h-4 text-orange-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {trago.nombre}
                                {(trago.vaso || trago.tecnica) && (
                                  <span className="ml-2 text-xs text-gray-400 font-normal">
                                    {[trago.vaso, trago.tecnica].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </p>
                              {trago.ingredientes_texto && (
                                <p className="text-[10px] text-gray-400 truncate max-w-xs">{trago.ingredientes_texto}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-green-700 bg-green-50 tabular-nums font-mono">
                          ${trago.costo_total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500 tabular-nums font-mono">
                          ${Math.round(sug).toLocaleString('es-AR')}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editValues[trago.id]?.margen ?? ''}
                            onChange={(e) => setEdit(trago.id, 'margen', formatearInputNumero(e.target.value))}
                            onBlur={() => handleSaveMargen(trago)}
                            className="w-14 rounded border border-gray-300 px-1.5 py-1 text-xs text-center font-mono focus:ring-2 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editValues[trago.id]?.precio ?? ''}
                            onChange={(e) => setEdit(trago.id, 'precio', formatearInputNumero(e.target.value))}
                            onBlur={() => handleSavePrecio(trago)}
                            placeholder={Math.round(sug).toLocaleString('es-AR')}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-right font-mono focus:ring-2 focus:ring-primary-500"
                          />
                        </td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold tabular-nums font-mono ${trago.precio_venta > 0 ? bcClasses(bc) : 'text-gray-300'}`}>
                          {trago.precio_venta > 0 ? `${bc.toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Link href={`/tragos/${trago.id}?view=true`}>
                              <Button variant="ghost" size="sm" title="Ver"><Eye className="w-3.5 h-3.5 text-blue-500" /></Button>
                            </Link>
                            <Link href={`/tragos/${trago.id}`}>
                              <Button variant="ghost" size="sm" title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(trago.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {/* Vista Insumos de Tragos */}
      {tab === 'insumos' && (
        <>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busquedaInsumos}
                onChange={(e) => setBusquedaInsumos(e.target.value)}
                placeholder="Buscar insumo o elaboración..."
                className="pl-9 pr-3 py-2.5 sm:py-2 w-full sm:w-64 rounded-lg border border-gray-300 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {isLoadingInsumos ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">Cargando...</p>
            </div>
          ) : insumosEnTragos.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No hay insumos en tragos</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-3 bg-gray-50 border-b">
                <p className="text-xs text-gray-500">
                  {insumosFiltrados.length} {insumosFiltrados.length === 1 ? 'ingrediente' : 'ingredientes'} encontrados
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {insumosFiltrados.map((item) => (
                  <div key={item.id}>
                    <button
                      onClick={() => setInsumoExpandido(insumoExpandido === item.id ? null : item.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className={`p-1.5 rounded-lg ${item.tipo === 'insumo' ? 'bg-green-100' : 'bg-purple-100'}`}>
                        {item.tipo === 'insumo' ? (
                          <Package className="w-4 h-4 text-green-600" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-purple-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                        <p className="text-xs text-gray-500">
                          {item.tipo === 'insumo' ? 'Insumo' : 'Elaboración'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-blue-600 font-mono">
                          {item.cantidadTragos} {item.cantidadTragos === 1 ? 'trago' : 'tragos'}
                        </span>
                        {insumoExpandido === item.id ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {insumoExpandido === item.id && (
                      <div className="bg-gray-50 px-4 py-2 border-t">
                        <p className="text-xs font-medium text-gray-500 mb-2">Tragos que lo usan:</p>
                        <div className="space-y-1">
                          {item.tragos.map((trago) => (
                            <Link
                              key={trago.id}
                              href={`/tragos/${trago.id}`}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 transition-colors"
                            >
                              <Martini className="w-3.5 h-3.5 text-orange-500" />
                              <span className="text-sm text-gray-700">{trago.nombre}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
