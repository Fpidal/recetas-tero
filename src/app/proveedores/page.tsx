'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Phone, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select, Modal, Table } from '@/components/ui'
import { Proveedor } from '@/types/database'

const CATEGORIAS = [
  { value: '', label: 'Seleccionar...' },
  { value: 'Almacén', label: 'Almacén' },
  { value: 'Alquiler', label: 'Alquiler' },
  { value: 'Arreglos', label: 'Arreglos' },
  { value: 'Bebidas', label: 'Bebidas' },
  { value: 'Bodega', label: 'Bodega' },
  { value: 'Carnes', label: 'Carnes' },
  { value: 'Impuestos Municipales', label: 'Impuestos Municipales' },
  { value: 'IVA', label: 'IVA' },
  { value: 'Limpieza', label: 'Limpieza' },
  { value: 'Panadería', label: 'Panadería' },
  { value: 'Pescadería', label: 'Pescadería' },
  { value: 'Planes AFIP/ARBA', label: 'Planes AFIP/ARBA' },
  { value: 'Pollo', label: 'Pollo' },
  { value: 'Quesos y Fiambres', label: 'Quesos y Fiambres' },
  { value: 'Servicio Gas', label: 'Servicio Gas' },
  { value: 'Servicio Luz', label: 'Servicio Luz' },
  { value: 'Verduras', label: 'Verduras' },
  { value: 'Otros', label: 'Otros' },
]

const SITUACIONES_IVA = [
  { value: '', label: 'Seleccionar...' },
  { value: 'Responsable Inscripto', label: 'Responsable Inscripto' },
  { value: 'Monotributista', label: 'Monotributista' },
  { value: 'Exento', label: 'Exento' },
  { value: 'Consumidor Final', label: 'Consumidor Final' },
]

const CONDICIONES_PAGO = [
  { value: '', label: 'Seleccionar...' },
  { value: 'Contado', label: 'Contado' },
  { value: '7 días', label: '7 días' },
  { value: '15 días', label: '15 días' },
  { value: '21 días', label: '21 días' },
  { value: '30 días', label: '30 días' },
  { value: '60 días', label: '60 días' },
]

const FORMAS_PAGO = [
  { value: '', label: 'Seleccionar...' },
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Tarjeta', label: 'Tarjeta' },
]

interface ProveedorForm {
  nombre: string
  codigo: string
  categoria: string
  contacto: string
  celular: string
  telefono: string
  email: string
  situacion_iva: string
  condicion_pago: string
  forma_pago: string
  cuit: string
  banco: string
  cbu: string
  direccion: string
  notas: string
}

const initialForm: ProveedorForm = {
  nombre: '',
  codigo: '',
  categoria: '',
  contacto: '',
  celular: '',
  telefono: '',
  email: '',
  situacion_iva: '',
  condicion_pago: '',
  forma_pago: '',
  cuit: '',
  banco: '',
  cbu: '',
  direccion: '',
  notas: '',
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProveedorForm>(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [nextCodigo, setNextCodigo] = useState('')

  useEffect(() => {
    fetchProveedores()
  }, [])

  async function fetchProveedores() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (error) {
      console.error('Error fetching proveedores:', error)
    } else {
      setProveedores(data || [])
    }
    setIsLoading(false)
  }

  async function generateNextCodigo() {
    const { data } = await supabase
      .from('proveedores')
      .select('codigo')
      .not('codigo', 'is', null)
      .order('codigo', { ascending: false })
      .limit(1)

    if (data && data.length > 0 && data[0].codigo) {
      const match = data[0].codigo.match(/PROV-(\d+)/)
      if (match) {
        const next = parseInt(match[1]) + 1
        return `PROV-${next.toString().padStart(4, '0')}`
      }
    }
    return `PROV-0001`
  }

  async function handleOpenModal(proveedor?: Proveedor) {
    if (proveedor) {
      setEditingId(proveedor.id)
      setForm({
        nombre: proveedor.nombre,
        codigo: proveedor.codigo || '',
        categoria: proveedor.categoria || '',
        contacto: proveedor.contacto || '',
        celular: proveedor.celular || '',
        telefono: proveedor.telefono || '',
        email: proveedor.email || '',
        situacion_iva: proveedor.situacion_iva || '',
        condicion_pago: proveedor.condicion_pago || '',
        forma_pago: proveedor.forma_pago || '',
        cuit: proveedor.cuit || '',
        banco: proveedor.banco || '',
        cbu: proveedor.cbu || '',
        direccion: proveedor.direccion || '',
        notas: proveedor.notas || '',
      })
    } else {
      setEditingId(null)
      const codigo = await generateNextCodigo()
      setNextCodigo(codigo)
      setForm({ ...initialForm, codigo })
    }
    setIsModalOpen(true)
  }

  function handleCloseModal() {
    setIsModalOpen(false)
    setEditingId(null)
    setForm(initialForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)

    const payload = {
      nombre: form.nombre,
      codigo: form.codigo || null,
      categoria: form.categoria || null,
      contacto: form.contacto || null,
      celular: form.celular || null,
      telefono: form.telefono || null,
      email: form.email || null,
      situacion_iva: form.situacion_iva || null,
      condicion_pago: form.condicion_pago || null,
      forma_pago: form.forma_pago || null,
      cuit: form.cuit || null,
      banco: form.banco || null,
      cbu: form.cbu || null,
      direccion: form.direccion || null,
      notas: form.notas || null,
    }

    if (editingId) {
      const { error } = await supabase
        .from('proveedores')
        .update(payload)
        .eq('id', editingId)

      if (error) {
        console.error('Error updating proveedor:', error)
        alert('Error al actualizar el proveedor')
      } else {
        handleCloseModal()
        fetchProveedores()
      }
    } else {
      const { error } = await supabase
        .from('proveedores')
        .insert({ ...payload, activo: true })

      if (error) {
        console.error('Error creating proveedor:', error)
        alert('Error al crear el proveedor')
      } else {
        handleCloseModal()
        fetchProveedores()
      }
    }
    setIsSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de que querés eliminar este proveedor?')) {
      return
    }

    const { error } = await supabase
      .from('proveedores')
      .update({ activo: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting proveedor:', error)
      alert('Error al eliminar el proveedor')
    } else {
      fetchProveedores()
    }
  }

  async function handleDeleteFromModal() {
    if (!editingId) return
    if (!confirm('¿Estás seguro de que querés eliminar este proveedor?')) return

    const { error } = await supabase
      .from('proveedores')
      .update({ activo: false })
      .eq('id', editingId)

    if (error) {
      console.error('Error deleting proveedor:', error)
      alert('Error al eliminar el proveedor')
    } else {
      handleCloseModal()
      fetchProveedores()
    }
  }

  const columns = [
    {
      key: 'nombre',
      header: 'Nombre',
      render: (p: Proveedor) => (
        <div>
          <p className="font-medium text-gray-900">{p.nombre}</p>
          {p.contacto && <p className="text-sm text-gray-500">{p.contacto}</p>}
        </div>
      ),
    },
    {
      key: 'codigo',
      header: 'Código',
      render: (p: Proveedor) => (
        <span className="text-sm text-gray-600 font-mono">{p.codigo || '-'}</span>
      ),
    },
    {
      key: 'categoria',
      header: 'Categoría',
      render: (p: Proveedor) => (
        <span className="text-sm text-gray-600">{p.categoria || '-'}</span>
      ),
    },
    {
      key: 'contacto',
      header: 'Contacto',
      render: (p: Proveedor) => (
        <div className="space-y-1">
          {(p.celular || p.telefono) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4" />
              {p.celular || p.telefono}
            </div>
          )}
          {p.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4" />
              {p.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'condicion',
      header: 'Cond. Pago',
      render: (p: Proveedor) => (
        <span className="text-sm text-gray-600">{p.condicion_pago || '-'}</span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      className: 'text-right',
      render: (p: Proveedor) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenModal(p)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(p.id)}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-gray-600">Gestión de proveedores de insumos</p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proveedor
        </Button>
      </div>

      <Table
        columns={columns}
        data={proveedores}
        keyExtractor={(p) => p.id}
        isLoading={isLoading}
        emptyMessage="No hay proveedores registrados"
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Fila 1: Nombre + Código */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label="Nombre *"
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
                placeholder="Nombre del proveedor"
              />
            </div>
            <Input
              label="Código"
              id="codigo"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              placeholder="PROV-0001"
            />
          </div>

          {/* Fila 2: Categoría + Contacto + Celular */}
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Categoría"
              id="categoria"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              options={CATEGORIAS}
            />
            <Input
              label="Contacto"
              id="contacto"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              placeholder="Nombre del contacto"
            />
            <Input
              label="Celular"
              id="celular"
              value={form.celular}
              onChange={(e) => setForm({ ...form, celular: e.target.value })}
              placeholder="11-XXXX-XXXX"
            />
          </div>

          {/* Fila 3: Situación IVA + Condición Pago + Forma Pago */}
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Situación IVA"
              id="situacion_iva"
              value={form.situacion_iva}
              onChange={(e) => setForm({ ...form, situacion_iva: e.target.value })}
              options={SITUACIONES_IVA}
            />
            <Select
              label="Condición Pago"
              id="condicion_pago"
              value={form.condicion_pago}
              onChange={(e) => setForm({ ...form, condicion_pago: e.target.value })}
              options={CONDICIONES_PAGO}
            />
            <Select
              label="Forma Pago"
              id="forma_pago"
              value={form.forma_pago}
              onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}
              options={FORMAS_PAGO}
            />
          </div>

          {/* Fila 4: CUIT + Teléfono + Email */}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="CUIT"
              id="cuit"
              value={form.cuit}
              onChange={(e) => setForm({ ...form, cuit: e.target.value })}
              placeholder="XX-XXXXXXXX-X"
            />
            <Input
              label="Teléfono"
              id="telefono"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="11-5555-1234"
            />
            <Input
              label="Email"
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@ejemplo.com"
            />
          </div>

          {/* Fila 5: Banco + CBU */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Banco"
              id="banco"
              value={form.banco}
              onChange={(e) => setForm({ ...form, banco: e.target.value })}
              placeholder="Nombre del banco"
            />
            <Input
              label="CBU"
              id="cbu"
              value={form.cbu}
              onChange={(e) => setForm({ ...form, cbu: e.target.value })}
              placeholder="CBU / Alias"
            />
          </div>

          {/* Dirección (ancho completo) */}
          <Input
            label="Dirección"
            id="direccion"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            placeholder="Dirección del proveedor"
          />

          {/* Notas (ancho completo) */}
          <div className="w-full">
            <label
              htmlFor="notas"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Notas
            </label>
            <textarea
              id="notas"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Notas adicionales..."
            />
          </div>

          {/* Botones: Eliminar (izq) | Cancelar + Guardar (der) */}
          <div className="flex justify-between items-center pt-3 border-t">
            <div>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDeleteFromModal}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
