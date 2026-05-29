'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, Wine, Search, X, Save, BookOpen, FileText, Star, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Modal } from '@/components/ui'
import { parsearNumero, formatearMoneda } from '@/lib/formato-numeros'
import { Vino, CartaVino } from '@/types/database'
import { generarPDFCartaVinos } from '@/lib/generar-pdf-carta-vinos'
import * as XLSX from 'xlsx'

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
  codigo_proveedor: string
  categoria: string
  cepa: string
  zona: string
  precio_caja: string
  unidades_caja: string
  descuento_porcentaje: string
}

const initialForm: VinoForm = {
  bodega: '', nombre: '', codigo_proveedor: '', categoria: '', cepa: '', zona: '',
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
  const [editingVino, setEditingVino] = useState<Vino | null>(null)
  const [form, setForm] = useState<VinoForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)

  // Carta state
  const [editingCartaId, setEditingCartaId] = useState<string | null>(null)
  const [cartaForm, setCartaForm] = useState({ precio_carta: '', margen_objetivo: '30' })

  // Importar precios state
  const [showImportModal, setShowImportModal] = useState(false)
  const [importBodega, setImportBodega] = useState('')
  const [importFechaLista, setImportFechaLista] = useState('')
  const [importData, setImportData] = useState<{
    codigo: string
    producto: string
    vinoId: string | null
    vinoNombre: string
    precioAnterior: number
    precioNuevo: number
    incluir: boolean
    matchType: 'codigo' | 'sin_match'
  }[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ actualizados: number; sinMatch: number; codigosGuardados: number } | null>(null)
  const [guardarCodigos, setGuardarCodigos] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Estado para selección de hoja de Excel
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')

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
      setEditingVino(vino)
      setForm({
        bodega: vino.bodega, nombre: vino.nombre,
        codigo_proveedor: vino.codigo_proveedor || '',
        categoria: vino.categoria || '',
        cepa: vino.cepa, zona: vino.zona || '',
        precio_caja: vino.precio_caja.toLocaleString('es-AR'),
        unidades_caja: vino.unidades_caja.toString(),
        descuento_porcentaje: vino.descuento_porcentaje.toString()
      })
    } else {
      setEditingId(null)
      setEditingVino(null)
      setForm(initialForm)
    }
    setShowModal(true)
  }

  function handleCloseModal() {
    setShowModal(false)
    setEditingVino(null)
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
    const descuentoValue = parsearNumero(form.descuento_porcentaje)
    const vinoData = {
      bodega: form.bodega.trim(), nombre: form.nombre.trim(),
      codigo_proveedor: form.codigo_proveedor.trim() || null,
      categoria: form.categoria, cepa: form.cepa, zona: form.zona || null,
      precio_caja: parsearNumero(form.precio_caja),
      unidades_caja: parseInt(form.unidades_caja) || 6,
      descuento_porcentaje: descuentoValue || 50
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
    const precioCarta = parsearNumero(cartaForm.precio_carta)
    const margenObjetivo = parsearNumero(cartaForm.margen_objetivo) || 30

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

  async function handleToggleRecomendado(vino: VinoConCarta) {
    if (!vino.carta) return
    await supabase.from('carta_vinos')
      .update({ recomendado: !vino.carta.recomendado })
      .eq('id', vino.carta.id)
    fetchVinosConCarta()
  }

  async function handleDescargarPDF() {
    await generarPDFCartaVinos()
  }

  // === IMPORT FUNCTIONS ===
  function handleCloseImportModal() {
    setShowImportModal(false)
    setImportBodega('')
    setImportFechaLista('')
    setImportData([])
    setImportResult(null)
    setGuardarCodigos(true)
    setExcelWorkbook(null)
    setAvailableSheets([])
    setSelectedSheet('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function normalizeString(str: string): string {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
  }

  function calcularSimilitud(str1: string, str2: string): number {
    const s1 = normalizeString(str1)
    const s2 = normalizeString(str2)
    if (s1 === s2) return 1
    if (s1.includes(s2) || s2.includes(s1)) return 0.8
    // Palabras en común
    const words1 = s1.split(/\s+/).filter(w => w.length > 2)
    const words2 = s2.split(/\s+/).filter(w => w.length > 2)
    const common = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)))
    return common.length / Math.max(words1.length, words2.length, 1)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !importBodega) return

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })

    // Guardar el workbook y las hojas disponibles
    setExcelWorkbook(workbook)
    setAvailableSheets(workbook.SheetNames)
    setImportData([])

    // Si solo hay una hoja, procesarla automáticamente
    if (workbook.SheetNames.length === 1) {
      setSelectedSheet(workbook.SheetNames[0])
      processSheet(workbook, workbook.SheetNames[0])
    } else {
      // Si hay múltiples hojas, limpiar selección para que el usuario elija
      setSelectedSheet('')
    }
  }

  function processSheet(workbook: XLSX.WorkBook, sheetName: string) {
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    // Buscar la fila de encabezados (primera fila con 4+ celdas no vacías en las primeras 15 filas)
    let headerRowIndex = -1
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i] as any[]
      if (!row) continue
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '').length
      if (nonEmptyCells >= 4) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      const debugRows = rows.slice(0, 5).map((r, i) => `Fila ${i + 1}: ${(r || []).slice(0, 6).join(' | ')}`).join('\n')
      alert('No se encontró una fila de encabezados válida (necesita 4+ columnas).\n\nPrimeras filas:\n' + debugRows)
      return
    }

    const headerRow = rows[headerRowIndex] as string[]

    // Buscar columnas de código, producto y precio (flexible)
    let codigoCol = -1, productoCol = -1, precioCol = -1, precioColPriority: number | undefined

    // Variantes de nombres de columna (en orden de prioridad)
    const variantesProducto = ['producto', 'descripción', 'descripcion', 'nombre', 'detalle', 'description', 'item']
    // Priorizar precio por caja sobre precio por unidad
    const variantesPrecio = ['precio final', 'final caja', 'precio caja', 'p. final', 'final unit', 'final botella', 'precio', 'price', 'importe', 'total']
    const variantesCodigo = ['código', 'codigo', 'cód.', 'cód', 'cod.', 'cod', 'code', 'sku', 'ref']

    headerRow.forEach((cell, idx) => {
      const cellStr = String(cell || '').toLowerCase().trim()

      // Buscar columna de código
      if (codigoCol === -1) {
        for (const v of variantesCodigo) {
          if (cellStr === v || cellStr.startsWith(v + ' ') || cellStr.endsWith(' ' + v)) {
            codigoCol = idx
            break
          }
        }
      }

      // Buscar columna de producto
      if (productoCol === -1) {
        for (const v of variantesProducto) {
          if (cellStr === v || cellStr.includes(v)) {
            productoCol = idx
            break
          }
        }
      }

      // Buscar columna de precio (respetar orden de prioridad)
      for (let vi = 0; vi < variantesPrecio.length; vi++) {
        const v = variantesPrecio[vi]
        if (cellStr === v || cellStr.includes(v)) {
          // Solo asignar si no hay columna o esta tiene mayor prioridad (índice menor)
          if (precioCol === -1 || vi < (precioColPriority ?? Infinity)) {
            precioCol = idx
            precioColPriority = vi
          }
          break
        }
      }
    })

    if (productoCol === -1 || precioCol === -1) {
      const debugRows = rows.slice(0, 5).map((r, i) => `Fila ${i + 1}: ${(r || []).slice(0, 6).join(' | ')}`).join('\n')
      alert(`No se encontraron columnas de Producto y Precio.\n\nEncabezado (fila ${headerRowIndex + 1}): ${headerRow.join(', ')}\n\nPrimeras filas:\n${debugRows}`)
      return
    }

    // Obtener vinos de la bodega seleccionada
    const vinosBodega = vinos.filter(v => v.bodega === importBodega)

    const items: typeof importData = []
    // Empezar desde la fila siguiente al encabezado
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i] as any[]
      const codigo = codigoCol >= 0 ? String(row[codigoCol] || '').trim() : ''
      const producto = String(row[productoCol] || '').trim()
      const precioRaw = row[precioCol]

      if (!producto || !precioRaw) continue

      // Parsear precio (puede venir como número o string con formato)
      let precioNuevo = 0
      if (typeof precioRaw === 'number') {
        precioNuevo = precioRaw
      } else {
        const precioStr = String(precioRaw).replace(/[^0-9,.]/g, '').replace(',', '.')
        precioNuevo = parseFloat(precioStr) || 0
      }

      if (precioNuevo === 0) continue

      // Buscar match SOLO por código exacto
      // (el código se carga manualmente en cada vino para evitar confusiones)
      let matchedVino: Vino | null = null
      let matchType: 'codigo' | 'sin_match' = 'sin_match'

      if (codigo) {
        matchedVino = vinosBodega.find(v =>
          v.codigo_proveedor?.toLowerCase() === codigo.toLowerCase()
        ) || null
        if (matchedVino) matchType = 'codigo'
      }

      items.push({
        codigo,
        producto,
        vinoId: matchedVino?.id || null,
        vinoNombre: matchedVino ? `${matchedVino.nombre} (${matchedVino.cepa})` : '',
        precioAnterior: matchedVino?.precio_caja || 0,
        precioNuevo,
        incluir: matchedVino !== null,
        matchType
      })
    }

    setImportData(items)
  }

  function handleSheetSelect(sheetName: string) {
    setSelectedSheet(sheetName)
    if (excelWorkbook && sheetName) {
      processSheet(excelWorkbook, sheetName)
    }
  }

  async function handleActualizarPrecios() {
    const itemsToUpdate = importData.filter(item => item.incluir && item.vinoId)
    if (itemsToUpdate.length === 0) {
      alert('No hay vinos para actualizar')
      return
    }

    setIsImporting(true)
    let actualizados = 0
    let codigosGuardados = 0

    for (const item of itemsToUpdate) {
      const updateData: {
        precio_caja: number
        precio_caja_anterior?: number
        fecha_lista_precios?: string
        codigo_proveedor?: string
      } = {
        precio_caja: item.precioNuevo
      }

      // Guardar precio anterior si hay cambio
      if (item.precioAnterior > 0 && item.precioAnterior !== item.precioNuevo) {
        updateData.precio_caja_anterior = item.precioAnterior
      }

      // Guardar fecha de lista de precios
      if (importFechaLista) {
        updateData.fecha_lista_precios = importFechaLista
      }

      // Si está activado guardar códigos y hay código en el Excel
      if (guardarCodigos && item.codigo) {
        updateData.codigo_proveedor = item.codigo
        codigosGuardados++
      }

      const { error } = await supabase
        .from('vinos')
        .update(updateData)
        .eq('id', item.vinoId)

      if (!error) actualizados++
    }

    setImportResult({
      actualizados,
      sinMatch: importData.filter(item => !item.vinoId).length,
      codigosGuardados
    })
    setIsImporting(false)
    fetchVinos()
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
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 text-white"
              style={{ backgroundColor: '#7a7a3a' }}
            >
              <Upload className="w-3.5 h-3.5" />
              Importar Precios
            </button>
            <Button onClick={() => handleOpenModal()} size="sm" className="flex-1 sm:flex-none text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Nuevo Vino
            </Button>
          </div>
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
        {activeTab === 'carta' && (
          <button onClick={handleDescargarPDF} className="px-2 py-1 border border-gray-300 rounded text-[10px] text-gray-600 hover:bg-gray-50 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Carta de Vinos
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
                        <p className="text-[10px] font-medium font-mono">{fmt(precioUnidad)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-500">Desc</p>
                        <p className="text-[10px] font-medium font-mono">{vino.descuento_porcentaje}%</p>
                      </div>
                      <div className="bg-green-100 rounded -m-1.5 p-1.5">
                        <p className="text-[9px] text-green-700">Final</p>
                        <p className="text-[10px] font-bold text-green-700 font-mono">{fmt(precioUnidad * (1 - vino.descuento_porcentaje / 100) * 1.21)}</p>
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
                        <td className="px-2 py-1.5 text-xs text-right text-gray-900 font-mono">{fmt(vino.precio_caja)}</td>
                        <td className="px-2 py-1.5 text-xs text-center text-gray-600 font-mono">{vino.unidades_caja}</td>
                        <td className="px-2 py-1.5 text-xs text-center text-gray-600 font-mono">{vino.descuento_porcentaje}%</td>
                        <td className="px-2 py-1.5 text-right"><span className="text-xs font-medium text-gray-900 font-mono">{fmt(totalConDescuento)}</span></td>
                        <td className="px-2 py-1.5 text-right bg-green-50"><span className="text-xs font-bold text-green-700 font-mono">{fmt(finalBotella)}</span></td>
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
                      <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-8">Rec</th>
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
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleToggleRecomendado(vino)}
                              disabled={!enCarta}
                              className={`p-1 rounded transition-colors ${
                                vino.carta?.recomendado
                                  ? 'text-yellow-500 hover:text-yellow-600'
                                  : 'text-gray-300 hover:text-gray-400'
                              } ${!enCarta ? 'cursor-not-allowed' : ''}`}
                              title={vino.carta?.recomendado ? 'Quitar de recomendados' : 'Marcar como recomendado'}
                            >
                              <Star className={`w-4 h-4 ${vino.carta?.recomendado ? 'fill-current' : ''}`} />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleOpenModal(vino)}
                              className="text-left hover:bg-purple-50 rounded px-1 -mx-1 transition-colors"
                            >
                              <p className="text-xs font-medium text-gray-900 hover:text-purple-700">{vino.bodega} - {vino.nombre}</p>
                              <p className="text-[10px] text-gray-500">{vino.cepa}{vino.zona ? ` · ${vino.zona}` : ''}</p>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-xs font-medium text-gray-900 font-mono">{fmtDec(vino.costo)}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-xs text-gray-500 font-mono">{fmt(precioSugerido)}</span>
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
                              <span className={`text-xs font-semibold font-mono ${precioCarta > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
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
                              <span className="text-xs text-gray-600 font-mono">{margenObj}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs font-medium font-mono ${Math.round(foodCost) >= 40 ? 'text-red-600' : Math.round(foodCost) > margenObj ? 'text-yellow-600' : 'text-green-600'}`}>
                              {precioCarta > 0 ? pct(foodCost) : '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`text-xs font-semibold font-mono ${contribucion > 0 ? 'text-green-600' : 'text-gray-400'}`}>
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
                          <button
                            onClick={() => handleToggleRecomendado(vino)}
                            disabled={!enCarta}
                            className={`mt-0.5 ${
                              vino.carta?.recomendado
                                ? 'text-yellow-500'
                                : 'text-gray-300'
                            }`}
                          >
                            <Star className={`w-4 h-4 ${vino.carta?.recomendado ? 'fill-current' : ''}`} />
                          </button>
                          <button onClick={() => handleOpenModal(vino)} className="text-left">
                            <p className="text-xs font-medium text-gray-900">{vino.bodega} - {vino.nombre}</p>
                            <p className="text-[10px] text-gray-500">{vino.cepa}</p>
                          </button>
                        </div>
                        <button onClick={() => handleEditCarta(vino)} className="p-1">
                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center bg-gray-50 rounded p-1.5 text-[10px]">
                        <div>
                          <p className="text-gray-500">Costo</p>
                          <p className="font-medium font-mono">{fmt(vino.costo)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">P.Carta</p>
                          <p className="font-semibold font-mono">{precioCarta > 0 ? fmt(precioCarta) : '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">FC</p>
                          <p className={`font-medium font-mono ${Math.round(foodCost) >= 40 ? 'text-red-600' : Math.round(foodCost) > margenObj ? 'text-yellow-600' : 'text-green-600'}`}>
                            {precioCarta > 0 ? pct(foodCost) : '-'}
                          </p>
                        </div>
                        <div className="bg-green-100 rounded -m-1.5 p-1.5">
                          <p className="text-green-700">Contrib.</p>
                          <p className="font-bold text-green-700 font-mono">{precioCarta > 0 ? fmt(contribucion) : '-'}</p>
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
          {/* Fila 1: Bodega + Nombre */}
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

          {/* Fila 2: Código proveedor + Categoría */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código Proveedor</label>
              <input type="text" value={form.codigo_proveedor} onChange={(e) => setForm({ ...form, codigo_proveedor: e.target.value })}
                placeholder="Ej: SRM1, SGVU1*" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500">
                <option value="">Seleccionar...</option>
                {CATEGORIAS_VINO.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Info de última actualización de precios (solo al editar) */}
          {editingVino?.fecha_lista_precios && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Última lista de precios</p>
                  <p className="text-sm text-blue-900">
                    {new Date(editingVino.fecha_lista_precios).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
                {editingVino.precio_caja_anterior && editingVino.precio_caja_anterior !== editingVino.precio_caja && (
                  <div className="text-right">
                    <p className="text-xs text-blue-600 font-medium">Variación</p>
                    {(() => {
                      const variacion = ((editingVino.precio_caja - editingVino.precio_caja_anterior) / editingVino.precio_caja_anterior) * 100
                      return (
                        <p className={`text-sm font-semibold font-mono ${variacion > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {variacion > 0 ? '+' : ''}{variacion.toFixed(1)}%
                          <span className="text-xs text-gray-500 ml-1">
                            (ant: ${editingVino.precio_caja_anterior.toLocaleString('es-AR')})
                          </span>
                        </p>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fila 3: Cepa + Zona */}
          <div className="grid grid-cols-2 gap-3">
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
            const precioCaja = parsearNumero(form.precio_caja)
            const unidadesCaja = parseInt(form.unidades_caja) || 1
            const descuentoValue = parsearNumero(form.descuento_porcentaje)
            const descuento = descuentoValue || 50
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
                    <p className="text-sm font-semibold text-gray-900 font-mono">{form.precio_caja ? fmt(precioUnidad) : '-'}</p>
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
                    <p className="text-sm font-semibold text-gray-900 font-mono">{form.precio_caja ? fmt(precioUnidad * (1 - descuento / 100)) : '-'}</p>
                  </div>
                  <div className="text-center bg-green-100 rounded-md p-2 border border-green-200">
                    <p className="text-xs text-green-700">Botella Final</p>
                    <p className="text-sm font-bold text-green-700 font-mono">{form.precio_caja ? fmt(precioUnidad * (1 - descuento / 100) * 1.21) : '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-[80px_1fr_1fr] gap-3 items-end">
                  <div></div>
                  <div className="text-center bg-gray-50 rounded-md p-2 border border-gray-200">
                    <p className="text-xs text-gray-500">Caja c/Desc</p>
                    <p className="text-sm font-semibold text-gray-900 font-mono">{form.precio_caja ? fmt(precioCaja * (1 - descuento / 100)) : '-'}</p>
                  </div>
                  <div className="text-center bg-green-100 rounded-md p-2 border border-green-200">
                    <p className="text-xs text-green-700">Caja Final</p>
                    <p className="text-sm font-bold text-green-700 font-mono">{form.precio_caja ? fmt(precioCaja * (1 - descuento / 100) * 1.21) : '-'}</p>
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

      {/* Modal Importar Precios */}
      <Modal isOpen={showImportModal} onClose={handleCloseImportModal} title="Importar Precios de Bodega">
        <div className="space-y-4">
          {/* Paso 1: Seleccionar bodega */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bodega *</label>
            <select
              value={importBodega}
              onChange={(e) => {
                setImportBodega(e.target.value)
                setImportData([])
                setImportResult(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Seleccionar bodega...</option>
              {bodegas.map(b => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}
            </select>
          </div>

          {/* Paso 2: Fecha de lista de precios */}
          {importBodega && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de lista de precios</label>
              <input
                type="date"
                value={importFechaLista}
                onChange={(e) => setImportFechaLista(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">Fecha de la lista de precios del proveedor</p>
            </div>
          )}

          {/* Paso 3: Subir archivo */}
          {importBodega && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Archivo de precios (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
              <p className="text-xs text-gray-500 mt-1">El archivo debe tener columnas de Código (opcional), Producto y Precio</p>
            </div>
          )}

          {/* Paso 4: Seleccionar hoja (si hay múltiples) */}
          {availableSheets.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar hoja del Excel *</label>
              <select
                value={selectedSheet}
                onChange={(e) => handleSheetSelect(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Elegir hoja...</option>
                {availableSheets.map((sheet, idx) => (
                  <option key={idx} value={sheet}>{sheet}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                El archivo tiene {availableSheets.length} hojas disponibles
              </p>
            </div>
          )}

          {/* Paso 5: Preview de datos */}
          {importData.length > 0 && !importResult && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Vista previa ({importData.filter(i => i.incluir).length} de {importData.length} vinos a actualizar)
                </p>
                <div className="flex gap-2 text-[10px]">
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Match por código</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Sin match (agregar código al vino)</span>
                </div>
              </div>

              {/* Toggle guardar códigos */}
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardarCodigos}
                  onChange={(e) => setGuardarCodigos(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">Guardar códigos de proveedor</span>
                <span className="text-xs text-gray-500">(para matching automático en próximas importaciones)</span>
              </label>

              <div className="max-h-64 overflow-y-auto border rounded-md">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500 w-8"></th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Código</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Excel</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Sistema</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Anterior</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Nuevo</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Dif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importData.map((item, idx) => {
                      const diferencia = item.precioAnterior > 0
                        ? ((item.precioNuevo - item.precioAnterior) / item.precioAnterior) * 100
                        : 0
                      return (
                        <tr key={idx} className={!item.vinoId ? 'bg-gray-50 opacity-60' : ''}>
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={item.incluir}
                              disabled={!item.vinoId}
                              onChange={() => {
                                const newData = [...importData]
                                newData[idx].incluir = !newData[idx].incluir
                                setImportData(newData)
                              }}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="font-mono text-gray-600">{item.codigo || '-'}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="text-gray-900">{item.producto}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            {item.vinoId ? (
                              <span className={`px-1 py-0.5 rounded ${
                                item.matchType === 'codigo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {item.vinoNombre}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">Sin match</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-gray-500">
                            {item.precioAnterior > 0 ? fmt(item.precioAnterior) : '-'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-medium">
                            {fmt(item.precioNuevo)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {item.precioAnterior > 0 && (
                              <span className={diferencia > 0 ? 'text-red-600' : diferencia < 0 ? 'text-green-600' : 'text-gray-500'}>
                                {diferencia > 0 ? '+' : ''}{diferencia.toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                <Button type="button" variant="secondary" onClick={handleCloseImportModal}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleActualizarPrecios}
                  disabled={isImporting || importData.filter(i => i.incluir).length === 0}
                  className="text-white"
                  style={{ backgroundColor: '#7a7a3a' }}
                >
                  {isImporting ? 'Actualizando...' : `Actualizar ${importData.filter(i => i.incluir).length} precios`}
                </Button>
              </div>
            </div>
          )}

          {/* Resultado */}
          {importResult && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Save className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-1">
                {importResult.actualizados} precio{importResult.actualizados !== 1 ? 's' : ''} actualizado{importResult.actualizados !== 1 ? 's' : ''}
              </p>
              {importResult.codigosGuardados > 0 && (
                <p className="text-sm text-green-600">
                  {importResult.codigosGuardados} código{importResult.codigosGuardados !== 1 ? 's' : ''} de proveedor guardado{importResult.codigosGuardados !== 1 ? 's' : ''}
                </p>
              )}
              {importResult.sinMatch > 0 && (
                <p className="text-sm text-gray-500">
                  {importResult.sinMatch} producto{importResult.sinMatch !== 1 ? 's' : ''} sin match
                </p>
              )}
              <Button onClick={handleCloseImportModal} className="mt-4">
                Cerrar
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
