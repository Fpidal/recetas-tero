'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Wine, Search, X, Save, BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Modal } from '@/components/ui'
import { Vino, CartaVino } from '@/types/database'

const CATEGORIAS_VINO = ['Tintos', 'Blancos', 'Espumantes']

const CEPAS = [
  'Malbec', 'Cabernet Sauvignon', 'Cabernet Franc', 'Cabernet Merlot',
  'Pinot Noir', 'Merlot', 'Syrah', 'Blend', 'Chardonnay', 'Sauvignon Blanc',
  'Torrontés', 'Petit Verdot', 'Tannat', 'Bonarda', 'Tempranillo', 'Rosé',
  'Brut Nature', 'Extra Brut', 'Blanc de Blanc', 'Otra'
]

const ZONAS = [
  'Luján de Cuyo (Mendoza)',
  'Valle de Uco (Mendoza)',
  'Maipú (Mendoza)',
  'San Rafael (Mendoza)',
  'Cafayate (Salta)',
  'Valles Calchaquíes (Salta)',
  'Quebrada de Humahuaca (Jujuy)',
  'Valle de Pedernal (San Juan)',
  'Valle de Tulum (San Juan)',
  'Alto Valle (Río Negro)',
  'San Patricio del Chañar (Neuquén)',
  'Chapadmalal (Buenos Aires)'
]

interface VinoForm {
  bodega: string
  nombre: string
  categoria: string
  cepa: string
  zona: string
  precio_caja: string
  unidades_caja: string
  descuento_porcentaje: string
}

const initialForm: VinoForm = {
  bodega: '', nombre: '', categoria: '', cepa: '', zona: '',
  precio_caja: '', unidades_caja: '6', descuento_porcentaje: '50'
}

interface Bodega { id: string; nombre: string }

interface VinoConCarta extends Vino {
  carta?: CartaVino
  costo: number // precio final botella
}

export default function VinosPage() {
  const [activeTab, setActiveTab] = useState<'vinos' | 'carta'>('vinos')
  const [vinos, setVinos] = useState<Vino[]>([])
  const [vinosConCarta, setVinosConCarta] = useState<VinoConCarta[]>([])
  const [bodegas, setBodegas] = useState<Bodega[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroBodega, setFiltroBodega] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroCepa, setFiltroCepa] = useState('')
  const [filtroZona, setFiltroZona] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VinoForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)

  // Carta state
  const [editingCartaId, setEditingCartaId] = useState<string | null>(null)
  const [cartaForm, setCartaForm] = useState({ precio_carta: '', margen_objetivo: '30' })

  useEffect(() => {
    fetchVinos()
    fetchBodegas()
  }, [])

  useEffect(() => {
    if (activeTab === 'carta') {
      fetchVinosConCarta()
    }
  }, [activeTab, vinos])

  async function fetchBodegas() {
    const { data } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .eq('categoria', 'Bodega')
      .order('nombre')
    setBodegas(data || [])
  }

  async function fetchVinos() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('vinos')
      .select('*')
      .eq('activo', true)
      .order('bodega')
      .order('nombre')

    if (!error) setVinos(data || [])
    setIsLoading(false)
  }

  async function fetchVinosConCarta() {
    // Traer TODOS los registros (activos e inactivos) para poder hacer toggle
    const { data: cartaData } = await supabase
      .from('carta_vinos')
      .select('*')

    const cartaMap = new Map((cartaData || []).map(c => [c.vino_id, c]))

    const vinosConCosto = vinos.map(v => {
      const precioUnidad = v.unidades_caja > 0 ? v.precio_caja / v.unidades_caja : 0
      const costo = precioUnidad * (1 - v.descuento_porcentaje / 100) * 1.21
      return { ...v, costo, carta: cartaMap.get(v.id) }
    })

    setVinosConCarta(vinosConCosto)
  }

  function handleOpenModal(vino?: Vino) {
    if (vino) {
      setEditingId(vino.id)
      setForm({
        bodega: vino.bodega, nombre: vino.nombre, categoria: vino.categoria || '',
        cepa: vino.cepa, zona: vino.zona || '',
        precio_caja: vino.precio_caja.toLocaleString('es-AR'),
        unidades_caja: vino.unidades_caja.toString(),
        descuento_porcentaje: vino.descuento_porcentaje.toString()
      })
    } else {
      setEditingId(null)
      setForm(initialForm)
    }
    setShowModal(true)
  }

  function handleCloseModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.bodega || !form.nombre || !form.categoria || !form.cepa || !form.precio_caja || !form.unidades_caja) {
      alert('Completá todos los campos obligatorios')
      return
    }

    setIsSaving(true)
    const descuentoValue = parseFloat(form.descuento_porcentaje)
    const vinoData = {
      bodega: form.bodega.trim(), nombre: form.nombre.trim(),
      categoria: form.categoria, cepa: form.cepa, zona: form.zona || null,
      precio_caja: parseFloat(form.precio_caja.replace(/\./g, '').replace(',', '.')) || 0,
      unidades_caja: parseInt(form.unidades_caja) || 6,
      descuento_porcentaje: !isNaN(descuentoValue) ? descuentoValue : 50
    }

    if (editingId) {
      const { error } = await supabase.from('vinos').update(vinoData).eq('id', editingId)
      if (!error) { handleCloseModal(); fetchVinos() }
      else alert('Error al actualizar')
    } else {
      const { error } = await supabase.from('vinos').insert({ ...vinoData, activo: true })
      if (!error) { handleCloseModal(); fetchVinos() }
      else alert('Error al crear')
    }
    setIsSaving(false)
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Estás seguro de eliminar "${nombre}"?`)) return
    const { error } = await supabase.from('vinos').update({ activo: false }).eq('id', id)
    if (!error) fetchVinos()
    else alert('Error al eliminar')
  }

  // === CARTA FUNCTIONS ===
  function handleEditCarta(vino: VinoConCarta) {
    setEditingCartaId(vino.id)
    setCartaForm({
      precio_carta: vino.carta?.precio_carta?.toString() || '',
      margen_objetivo: vino.carta?.margen_objetivo?.toString() || '30'
    })
  }

  async function handleSaveCarta(vino: VinoConCarta) {
    const precioCarta = parseFloat(cartaForm.precio_carta.replace(/\./g, '').replace(',', '.')) || 0
    const margenObjetivo = parseFloat(cartaForm.margen_objetivo) || 30

    if (vino.carta) {
      await supabase.from('carta_vinos')
        .update({ precio_carta: precioCarta, margen_objetivo: margenObjetivo })
        .eq('id', vino.carta.id)
    } else {
      await supabase.from('carta_vinos')
        .insert({ vino_id: vino.id, precio_carta: precioCarta, margen_objetivo: margenObjetivo, activo: true })
    }

    setEditingCartaId(null)
    fetchVinosConCarta()
  }

  async function handleToggleEnCarta(vino: VinoConCarta) {
    if (vino.carta) {
      await supabase.from('carta_vinos').update({ activo: !vino.carta.activo }).eq('id', vino.carta.id)
    } else {
      // Crear con precio sugerido usando misma fórmula que carta: costo / (margen / 100)
      const margen = 30
      const precioSugerido = margen > 0 ? vino.costo / (margen / 100) : 0
      await supabase.from('carta_vinos')
        .upsert({ vino_id: vino.id, precio_carta: precioSugerido, margen_objetivo: margen, activo: true },
          { onConflict: 'vino_id' })
    }
    fetchVinosConCarta()
  }

  // Helpers
  function calcularValores(precioCaja: number, unidadesCaja: number, descuentoPorcentaje: number) {
    const precioUnidad = unidadesCaja > 0 ? precioCaja / unidadesCaja : 0
    const totalConDescuento = (precioCaja + precioCaja * 0.21) * (1 - descuentoPorcentaje / 100)
    return { precioUnidad, totalConDescuento }
  }

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  const fmtDec = (v: number) => `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const pct = (v: number) => `${v.toFixed(1)}%`

  // Filtros
  const categoriasUnicas = Array.from(new Set(vinos.map(v => v.categoria).filter((c): c is string => Boolean(c)))).sort()
  const cepasUnicas = Array.from(new Set(vinos.map(v => v.cepa))).sort()
  const zonasUnicas = Array.from(new Set(vinos.map(v => v.zona).filter((z): z is string => Boolean(z)))).sort()

  const vinosFiltrados = vinos.filter(v => {
    const matchSearch = search === '' || v.bodega.toLowerCase().includes(search.toLowerCase()) ||
      v.nombre.toLowerCase().includes(search.toLowerCase()) || v.cepa.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtroBodega === '' || v.bodega === filtroBodega) &&
      (filtroCategoria === '' || v.categoria === filtroCategoria) &&
      (filtroCepa === '' || v.cepa === filtroCepa) && (filtroZona === '' || v.zona === filtroZona)
  })

  const vinosCartaFiltrados = vinosConCarta.filter(v => {
    const matchSearch = search === '' || v.bodega.toLowerCase().includes(search.toLowerCase()) ||
      v.nombre.toLowerCase().includes(search.toLowerCase()) || v.cepa.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (filtroBodega === '' || v.bodega === filtroBodega) &&
      (filtroCategoria === '' || v.categoria === filtroCategoria) &&
      (filtroCepa === '' || v.cepa === filtroCepa) && (filtroZona === '' || v.zona === filtroZona)
  })

  // Agrupar por categoría para carta
  const vinosPorCategoria = vinosCartaFiltrados.reduce((acc, v) => {
    const cat = v.categoria || 'Sin categoría'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(v)
    return acc
  }, {} as Record<string, VinoConCarta[]>)

  return (
    <div className="overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Vinos</h1>
          <p className="text-xs text-gray-600">Gestión de vinos por bodega</p>
        </div>
        {activeTab === 'vinos' && (
          <Button onClick={() => handleOpenModal()} size="sm" className="w-full sm:w-auto text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Nuevo Vino
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        <button
          onClick={() => setActiveTab('vinos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'vinos'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Wine className="w-4 h-4 inline mr-1.5" />
          Vinos
        </button>
        <button
          onClick={() => setActiveTab('carta')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'carta'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4 inline mr-1.5" />
          Carta de Vinos
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[140px] max-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <select value={filtroBodega} onChange={(e) => setFiltroBodega(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-purple-500">
          <option value="">Bodega</option>
          {bodegas.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
        </select>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-purple-500">
          <option value="">Categoría</option>
          {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroCepa} onChange={(e) => setFiltroCepa(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-purple-500">
          <option value="">Cepa</option>
          {cepasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroZona} onChange={(e) => setFiltroZona(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-purple-500">
          <option value="">Zona</option>
          {zonasUnicas.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {(filtroBodega || filtroCategoria || filtroCepa || filtroZona || search) && (
          <button onClick={() => { setFiltroBodega(''); setFiltroCategoria(''); setFiltroCepa(''); setFiltroZona(''); setSearch('') }}
            className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8"><p className="text-xs text-gray-500">Cargando...</p></div>
      ) : activeTab === 'vinos' ? (
        /* ==================== TAB VINOS ==================== */
        vinos.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center">
            <Wine className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-xs text-gray-500">No hay vinos registrados</p>
            <Button onClick={() => handleOpenModal()} size="sm" className="mt-3 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />Agregar primer vino
            </Button>
          </div>
        ) : vinosFiltrados.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center">
            <p className="text-xs text-gray-500">No se encontraron vinos con los filtros seleccionados</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-3 py-2 bg-purple-50 border-b flex items-center">
              <Wine className="w-4 h-4 text-purple-600 mr-1.5" />
              <span className="text-xs text-purple-900">{vinosFiltrados.length} vinos</span>
            </div>

            {/* Vista Móvil */}
            <div className="lg:hidden divide-y">
              {vinosFiltrados.map((vino) => {
                const { precioUnidad, totalConDescuento } = calcularValores(vino.precio_caja, vino.unidades_caja, vino.descuento_porcentaje)
                return (
                  <div key={vino.id} className="p-3">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <p className="text-[10px] text-purple-600 font-medium">{vino.bodega}</p>
                        <p className="text-xs font-medium text-gray-900">{vino.nombre}</p>
                        <p className="text-[10px] text-gray-500">{vino.cepa}</p>
                      </div>
                      <div className="flex gap-0.5">
                        <button onClick={() => handleOpenModal(vino)} className="p-1 hover:bg-gray-100 rounded">
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button onClick={() => handleDelete(vino.id, vino.nombre)} className="p-1 hover:bg-gray-100 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center bg-gray-50 rounded p-1.5">
                      <div>
                        <p className="text-[9px] text-gray-500">x Unidad</p>
                        <p className="text-[10px] font-medium">{fmt(precioUnidad)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-500">Desc</p>
                        <p className="text-[10px] font-medium">{vino.descuento_porcentaje}%</p>
                      </div>
                      <div className="bg-green-100 rounded -m-1.5 p-1.5">
                        <p className="text-[9px] text-green-700">Final</p>
                        <p className="text-[10px] font-bold text-green-700">{fmt(precioUnidad * (1 - vino.descuento_porcentaje / 100) * 1.21)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Vista Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Bodega</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Vino</th>
                    <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cepa</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Precio Caja</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Ud</th>
                    <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Desc</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Final Caja</th>
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase bg-green-50">Final Botella</th>
                    <th className="px-1 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {vinosFiltrados.map((vino) => {
                    const { precioUnidad, totalConDescuento } = calcularValores(vino.precio_caja, vino.unidades_caja, vino.descuento_porcentaje)
                    const finalBotella = precioUnidad * (1 - vino.descuento_porcentaje / 100) * 1.21
                    return (
                      <tr key={vino.id} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5"><span className="text-xs font-medium text-purple-700">{vino.bodega}</span></td>
                        <td className="px-2 py-1.5"><span className="text-xs font-medium text-gray-900">{vino.nombre}</span></td>
                        <td className="px-2 py-1.5 text-xs text-gray-600">{vino.cepa}</td>
                        <td className="px-2 py-1.5 text-xs text-right text-gray-900">{fmt(vino.precio_caja)}</td>
                        <td className="px-2 py-1.5 text-xs text-center text-gray-600">{vino.unidades_caja}</td>
                        <td className="px-2 py-1.5 text-xs text-center text-gray-600">{vino.descuento_porcentaje}%</td>
                        <td className="px-2 py-1.5 text-right"><span className="text-xs font-medium text-gray-900">{fmt(totalConDescuento)}</span></td>
                        <td className="px-2 py-1.5 text-right bg-green-50"><span className="text-xs font-bold text-green-700">{fmt(finalBotella)}</span></td>
                        <td className="px-1 py-1.5">
                          <div className="flex justify-end gap-0.5">
                            <button onClick={() => handleOpenModal(vino)} className="p-1 hover:bg-gray-100 rounded">
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button onClick={() => handleDelete(vino.id, vino.nombre)} className="p-1 hover:bg-gray-100 rounded">
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* ==================== TAB CARTA DE VINOS ==================== */
        <div className="space-y-4">
          {Object.entries(vinosPorCategoria).map(([categoria, vinosCat]) => (
            <div key={categoria} className="bg-white rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 border-b flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wine className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-900">{categoria}</span>
                  <span className="text-[10px] text-purple-600">({vinosCat.length})</span>
                </div>
              </div>

              {/* Desktop */}
              <div className="hidden lg:block">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase w-8">Carta</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Vino</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Costo</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Sug.</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">P.Carta</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">M.Obj</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">FC</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Contrib.</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {vinosCat.map((vino) => {
                      const margenObj = vino.carta?.margen_objetivo || 30
                      const precioSugerido = margenObj > 0 ? vino.costo / (margenObj / 100) : 0
                      const precioCarta = vino.carta?.precio_carta || 0
                      const foodCost = precioCarta > 0 ? (vino.costo / precioCarta) * 100 : 0
                      const contribucion = precioCarta - vino.costo
                      const enCarta = vino.carta?.activo ?? false
                      const isEditing = editingCartaId === vino.id

                      return (
                        <tr key={vino.id} className={`hover:bg-gray-50 ${!enCarta ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={enCarta}
                              onChange={() => handleToggleEnCarta(vino)}
                              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-xs font-medium text-gray-900">{vino.bodega} - {vino.nombre}</p>
                            <p className="text-[10px] text-gray-500">{vino.cepa}{vino.zona ? ` · ${vino.zona}` : ''}</p>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-xs font-medium text-gray-900">{fmtDec(vino.costo)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-xs text-gray-500">{fmt(precioSugerido)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <input
                                type="text"
                                value={cartaForm.precio_carta}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\D/g, '')
                                  setCartaForm({ ...cartaForm, precio_carta: raw ? parseInt(raw).toLocaleString('es-AR') : '' })
                                }}
                                className="w-20 px-1 py-0.5 text-xs text-right border rounded"
                                autoFocus
                              />
                            ) : (
                              <span className={`text-xs font-semibold ${precioCarta > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                                {precioCarta > 0 ? fmt(precioCarta) : '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                value={cartaForm.margen_objetivo}
                                onChange={(e) => setCartaForm({ ...cartaForm, margen_objetivo: e.target.value })}
                                className="w-12 px-1 py-0.5 text-xs text-center border rounded"
                                min="0" max="100"
                              />
                            ) : (
                              <span className="text-xs text-gray-600">{margenObj}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs font-medium ${Math.round(foodCost) >= 40 ? 'text-red-600' : Math.round(foodCost) > margenObj ? 'text-yellow-600' : 'text-green-600'}`}>
                              {precioCarta > 0 ? pct(foodCost) : '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`text-xs font-semibold ${contribucion > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                              {precioCarta > 0 ? fmt(contribucion) : '-'}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleSaveCarta(vino)} className="p-1 hover:bg-green-100 rounded">
                                  <Save className="w-3.5 h-3.5 text-green-600" />
                                </button>
                                <button onClick={() => setEditingCartaId(null)} className="p-1 hover:bg-gray-100 rounded">
                                  <X className="w-3.5 h-3.5 text-gray-500" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleEditCarta(vino)} className="p-1 hover:bg-gray-100 rounded">
                                <Pencil className="w-3.5 h-3.5 text-gray-500" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="lg:hidden divide-y">
                {vinosCat.map((vino) => {
                  const margenObj = vino.carta?.margen_objetivo || 30
                  const precioCarta = vino.carta?.precio_carta || 0
                  const foodCost = precioCarta > 0 ? (vino.costo / precioCarta) * 100 : 0
                  const contribucion = precioCarta - vino.costo
                  const enCarta = vino.carta?.activo ?? false

                  return (
                    <div key={vino.id} className={`p-3 ${!enCarta ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={enCarta}
                            onChange={() => handleToggleEnCarta(vino)}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600"
                          />
                          <div>
                            <p className="text-xs font-medium text-gray-900">{vino.bodega} - {vino.nombre}</p>
                            <p className="text-[10px] text-gray-500">{vino.cepa}</p>
                          </div>
                        </div>
                        <button onClick={() => handleEditCarta(vino)} className="p-1">
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center bg-gray-50 rounded p-1.5 text-[10px]">
                        <div>
                          <p className="text-gray-500">Costo</p>
                          <p className="font-medium">{fmt(vino.costo)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">P.Carta</p>
                          <p className="font-semibold">{precioCarta > 0 ? fmt(precioCarta) : '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">FC</p>
                          <p className={`font-medium ${Math.round(foodCost) >= 40 ? 'text-red-600' : Math.round(foodCost) > margenObj ? 'text-yellow-600' : 'text-green-600'}`}>
                            {precioCarta > 0 ? pct(foodCost) : '-'}
                          </p>
                        </div>
                        <div className="bg-green-100 rounded -m-1.5 p-1.5">
                          <p className="text-green-700">Contrib.</p>
                          <p className="font-bold text-green-700">{precioCarta > 0 ? fmt(contribucion) : '-'}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Vino */}
      <Modal isOpen={showModal} onClose={handleCloseModal} title={editingId ? 'Editar Vino' : 'Nuevo Vino'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bodega *</label>
              <select value={form.bodega} onChange={(e) => setForm({ ...form, bodega: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                <option value="">Seleccionar...</option>
                {bodegas.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Gran VU" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                <option value="">Seleccionar...</option>
                {CATEGORIAS_VINO.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cepa *</label>
              <select value={form.cepa} onChange={(e) => setForm({ ...form, cepa: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                <option value="">Seleccionar...</option>
                {CEPAS.map(cepa => <option key={cepa} value={cepa}>{cepa}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
              <select value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                <option value="">Seleccionar...</option>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>

          {(() => {
            const precioCaja = parseFloat(form.precio_caja.replace(/\./g, '').replace(',', '.')) || 0
            const unidadesCaja = parseInt(form.unidades_caja) || 1
            const descuentoValue = parseFloat(form.descuento_porcentaje)
            const descuento = !isNaN(descuentoValue) ? descuentoValue : 50
            const { precioUnidad } = calcularValores(precioCaja, unidadesCaja, descuento)
            return (
              <>
                <div className="grid grid-cols-[1fr_80px_1fr] gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio Caja *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input type="text" value={form.precio_caja}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '')
                          setForm({ ...form, precio_caja: raw ? parseInt(raw).toLocaleString('es-AR') : '' })
                        }}
                        placeholder="0" className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ud *</label>
                    <input type="number" value={form.unidades_caja} onChange={(e) => setForm({ ...form, unidades_caja: e.target.value })}
                      min="1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-center focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="text-center bg-gray-50 rounded-md p-2 border border-gray-200">
                    <p className="text-xs text-gray-500">Precio x Unidad</p>
                    <p className="text-sm font-semibold text-gray-900">{form.precio_caja ? fmt(precioUnidad) : '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Desc %</label>
                    <input type="number" value={form.descuento_porcentaje} onChange={(e) => setForm({ ...form, descuento_porcentaje: e.target.value })}
                      min="0" max="100" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-center focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div className="text-center bg-gray-50 rounded-md p-2 border border-gray-200">
                    <p className="text-xs text-gray-500">Botella c/Desc</p>
                    <p className="text-sm font-semibold text-gray-900">{form.precio_caja ? fmt(precioUnidad * (1 - descuento / 100)) : '-'}</p>
                  </div>
                  <div className="text-center bg-green-100 rounded-md p-2 border border-green-200">
                    <p className="text-xs text-green-700">Botella Final</p>
                    <p className="text-sm font-bold text-green-700">{form.precio_caja ? fmt(precioUnidad * (1 - descuento / 100) * 1.21) : '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-end">
                  <div></div>
                  <div className="text-center bg-gray-50 rounded-md p-2 border border-gray-200">
                    <p className="text-xs text-gray-500">Caja c/Desc</p>
                    <p className="text-sm font-semibold text-gray-900">{form.precio_caja ? fmt(precioCaja * (1 - descuento / 100)) : '-'}</p>
                  </div>
                  <div className="text-center bg-green-100 rounded-md p-2 border border-green-200">
                    <p className="text-xs text-green-700">Caja Final</p>
                    <p className="text-sm font-bold text-green-700">{form.precio_caja ? fmt(precioCaja * (1 - descuento / 100) * 1.21) : '-'}</p>
                  </div>
                </div>
              </>
            )
          })()}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="secondary" onClick={handleCloseModal}>Cancelar</Button>
            <Button type="submit" disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />{editingId ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
