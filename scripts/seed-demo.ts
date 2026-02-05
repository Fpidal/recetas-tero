import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Cargar variables de entorno desde .env.demo
config({ path: resolve(process.cwd(), '.env.demo') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function seedDemo() {
  console.log('Iniciando carga de datos demo...\n')

  // =====================================================
  // 1. PROVEEDORES (10)
  // =====================================================
  console.log('Creando proveedores...')
  const proveedores = [
    { nombre: 'Carnes Don Pedro', categoria: 'Carnes', contacto: 'Pedro Rodríguez', telefono: '11-4444-1111', email: 'pedro@carnesdonpedro.com', cuit: '20-12345678-9' },
    { nombre: 'Frigorífico del Sur', categoria: 'Carnes', contacto: 'Martín Suárez', telefono: '11-4444-2222', email: 'ventas@frigosur.com', cuit: '30-23456789-0' },
    { nombre: 'Pescadería El Atlántico', categoria: 'Pescadería', contacto: 'Laura Méndez', telefono: '11-4444-3333', email: 'laura@atlantico.com', cuit: '27-34567890-1' },
    { nombre: 'Verdulería Los Andes', categoria: 'Verduras', contacto: 'Carlos Gómez', telefono: '11-4444-4444', email: 'carlos@losandes.com', cuit: '20-45678901-2' },
    { nombre: 'Distribuidora Central', categoria: 'Almacén', contacto: 'Ana López', telefono: '11-4444-5555', email: 'ana@distcentral.com', cuit: '30-56789012-3' },
    { nombre: 'Lácteos La Pradera', categoria: 'Quesos y Fiambres', contacto: 'Roberto Fernández', telefono: '11-4444-6666', email: 'roberto@lapradera.com', cuit: '20-67890123-4' },
    { nombre: 'Bodega San Telmo', categoria: 'Bodega', contacto: 'Miguel Ángel', telefono: '11-4444-7777', email: 'miguel@santelmo.com', cuit: '30-78901234-5' },
    { nombre: 'Panadería Artesanal', categoria: 'Panadería', contacto: 'María Elena', telefono: '11-4444-8888', email: 'maria@panartesanal.com', cuit: '27-89012345-6' },
    { nombre: 'Bebidas del Norte', categoria: 'Bebidas', contacto: 'José Martínez', telefono: '11-4444-9999', email: 'jose@bebidasnorte.com', cuit: '20-90123456-7' },
    { nombre: 'Importadora Gourmet', categoria: 'Almacén', contacto: 'Sofía Vargas', telefono: '11-4444-0000', email: 'sofia@gourmet.com', cuit: '30-01234567-8' },
  ]

  // Primero verificar si ya hay proveedores
  const { data: existingProvs } = await supabase.from('proveedores').select('id, nombre').limit(1)

  let provs: any[]
  if (existingProvs && existingProvs.length > 0) {
    // Ya hay proveedores, obtenerlos todos
    const { data: allProvs } = await supabase.from('proveedores').select('*')
    provs = allProvs || []
    console.log(`✓ ${provs.length} proveedores existentes`)
  } else {
    const { data: newProvs, error: provError } = await supabase
      .from('proveedores')
      .insert(proveedores)
      .select()

    if (provError) {
      console.error('Error creando proveedores:', provError)
      return
    }
    provs = newProvs || []
    console.log(`✓ ${provs.length} proveedores creados`)
  }

  // =====================================================
  // 2. INSUMOS (40)
  // =====================================================
  console.log('\nCreando insumos...')
  const insumos = [
    // Carnes (8)
    { nombre: 'Bife de Chorizo', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 15, iva_porcentaje: 10.5 },
    { nombre: 'Bife Angosto', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 12, iva_porcentaje: 10.5 },
    { nombre: 'Lomo', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 10, iva_porcentaje: 10.5 },
    { nombre: 'Entraña', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 8, iva_porcentaje: 10.5 },
    { nombre: 'Pollo Entero', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 25, iva_porcentaje: 10.5 },
    { nombre: 'Pechuga de Pollo', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 5, iva_porcentaje: 10.5 },
    { nombre: 'Cerdo Bondiola', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 10, iva_porcentaje: 10.5 },
    { nombre: 'Cordero Costillar', categoria: 'Carnes', unidad_medida: 'kg', merma_porcentaje: 20, iva_porcentaje: 10.5 },
    // Pescados (6)
    { nombre: 'Salmón Rosado', categoria: 'Pescados_Mariscos', unidad_medida: 'kg', merma_porcentaje: 15, iva_porcentaje: 10.5 },
    { nombre: 'Merluza', categoria: 'Pescados_Mariscos', unidad_medida: 'kg', merma_porcentaje: 20, iva_porcentaje: 10.5 },
    { nombre: 'Langostinos', categoria: 'Pescados_Mariscos', unidad_medida: 'kg', merma_porcentaje: 10, iva_porcentaje: 10.5 },
    { nombre: 'Pulpo', categoria: 'Pescados_Mariscos', unidad_medida: 'kg', merma_porcentaje: 25, iva_porcentaje: 10.5 },
    { nombre: 'Mejillones', categoria: 'Pescados_Mariscos', unidad_medida: 'kg', merma_porcentaje: 30, iva_porcentaje: 10.5 },
    { nombre: 'Trucha', categoria: 'Pescados_Mariscos', unidad_medida: 'kg', merma_porcentaje: 18, iva_porcentaje: 10.5 },
    // Verduras (10)
    { nombre: 'Papa', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 10, iva_porcentaje: 21 },
    { nombre: 'Cebolla', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 8, iva_porcentaje: 21 },
    { nombre: 'Tomate', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 15, iva_porcentaje: 21 },
    { nombre: 'Lechuga', categoria: 'Verduras_Frutas', unidad_medida: 'unidad', merma_porcentaje: 20, iva_porcentaje: 21 },
    { nombre: 'Zanahoria', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 12, iva_porcentaje: 21 },
    { nombre: 'Zapallo', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 25, iva_porcentaje: 21 },
    { nombre: 'Espinaca', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 30, iva_porcentaje: 21 },
    { nombre: 'Limón', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 5, iva_porcentaje: 21 },
    { nombre: 'Palta', categoria: 'Verduras_Frutas', unidad_medida: 'unidad', merma_porcentaje: 15, iva_porcentaje: 21 },
    { nombre: 'Champiñones', categoria: 'Verduras_Frutas', unidad_medida: 'kg', merma_porcentaje: 10, iva_porcentaje: 21 },
    // Almacén (8)
    { nombre: 'Aceite de Oliva', categoria: 'Almacen', unidad_medida: 'lt', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Sal Fina', categoria: 'Almacen', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Pimienta Negra', categoria: 'Almacen', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Arroz Carnaroli', categoria: 'Almacen', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Pasta Seca', categoria: 'Almacen', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Harina 000', categoria: 'Almacen', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Azúcar', categoria: 'Almacen', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 21 },
    { nombre: 'Vinagre Balsámico', categoria: 'Almacen', unidad_medida: 'lt', merma_porcentaje: 0, iva_porcentaje: 21 },
    // Lácteos (8)
    { nombre: 'Crema de Leche', categoria: 'Lacteos_Fiambres', unidad_medida: 'lt', merma_porcentaje: 5, iva_porcentaje: 10.5 },
    { nombre: 'Manteca', categoria: 'Lacteos_Fiambres', unidad_medida: 'kg', merma_porcentaje: 0, iva_porcentaje: 10.5 },
    { nombre: 'Queso Parmesano', categoria: 'Lacteos_Fiambres', unidad_medida: 'kg', merma_porcentaje: 5, iva_porcentaje: 10.5 },
    { nombre: 'Queso Mozzarella', categoria: 'Lacteos_Fiambres', unidad_medida: 'kg', merma_porcentaje: 5, iva_porcentaje: 10.5 },
    { nombre: 'Jamón Crudo', categoria: 'Lacteos_Fiambres', unidad_medida: 'kg', merma_porcentaje: 10, iva_porcentaje: 10.5 },
    { nombre: 'Panceta', categoria: 'Lacteos_Fiambres', unidad_medida: 'kg', merma_porcentaje: 8, iva_porcentaje: 10.5 },
    { nombre: 'Huevos', categoria: 'Lacteos_Fiambres', unidad_medida: 'unidad', merma_porcentaje: 5, iva_porcentaje: 10.5 },
    { nombre: 'Leche Entera', categoria: 'Lacteos_Fiambres', unidad_medida: 'lt', merma_porcentaje: 0, iva_porcentaje: 10.5 },
  ]

  // Verificar insumos existentes
  const { data: existingInsumos } = await supabase.from('insumos').select('id, nombre').limit(1)

  let insumosData: any[]
  if (existingInsumos && existingInsumos.length > 0) {
    const { data: allInsumos } = await supabase.from('insumos').select('*')
    insumosData = allInsumos || []
    console.log(`✓ ${insumosData.length} insumos existentes`)
  } else {
    const { data: newInsumos, error: insError } = await supabase
      .from('insumos')
      .insert(insumos)
      .select()

    if (insError) {
      console.error('Error creando insumos:', insError)
      return
    }
    insumosData = newInsumos || []
    console.log(`✓ ${insumosData.length} insumos creados`)
  }

  // =====================================================
  // 3. PRECIOS (actual + anterior para variación)
  // =====================================================
  console.log('\nCreando precios...')

  const preciosBase: Record<string, number> = {
    'Bife de Chorizo': 12500, 'Bife Angosto': 11000, 'Lomo': 15000, 'Entraña': 9500,
    'Pollo Entero': 3200, 'Pechuga de Pollo': 4500, 'Cerdo Bondiola': 7800, 'Cordero Costillar': 14000,
    'Salmón Rosado': 18000, 'Merluza': 5500, 'Langostinos': 22000, 'Pulpo': 16000,
    'Mejillones': 8000, 'Trucha': 9000,
    'Papa': 800, 'Cebolla': 600, 'Tomate': 1500, 'Lechuga': 350, 'Zanahoria': 700,
    'Zapallo': 500, 'Espinaca': 2200, 'Limón': 1800, 'Palta': 450, 'Champiñones': 4500,
    'Aceite de Oliva': 6500, 'Sal Fina': 350, 'Pimienta Negra': 15000, 'Arroz Carnaroli': 3200,
    'Pasta Seca': 1800, 'Harina 000': 850, 'Azúcar': 1200, 'Vinagre Balsámico': 4800,
    'Crema de Leche': 2800, 'Manteca': 5500, 'Queso Parmesano': 18000, 'Queso Mozzarella': 8500,
    'Jamón Crudo': 25000, 'Panceta': 12000, 'Huevos': 180, 'Leche Entera': 1100,
  }

  const { data: existingPrecios } = await supabase.from('precios_insumo').select('id').limit(1)

  if (existingPrecios && existingPrecios.length > 0) {
    console.log('✓ Ya existen precios')
  } else {
  // Crear precios anteriores (hace 30 días) y actuales
  const fechaAnterior = new Date()
  fechaAnterior.setDate(fechaAnterior.getDate() - 30)
  const fechaActual = new Date()

  for (const insumo of insumosData) {
    const precioBase = preciosBase[insumo.nombre] || 1000
    // Variación aleatoria entre -5% y +20%
    const variacion = 0.95 + Math.random() * 0.25
    const precioAnterior = Math.round(precioBase / variacion)

    // Seleccionar proveedor según categoría
    let provId = provs[4].id // Default: Distribuidora Central
    if (insumo.categoria === 'Carnes') provId = provs[Math.random() > 0.5 ? 0 : 1].id
    if (insumo.categoria === 'Pescados_Mariscos') provId = provs[2].id
    if (insumo.categoria === 'Verduras_Frutas') provId = provs[3].id
    if (insumo.categoria === 'Lacteos_Fiambres') provId = provs[5].id

    // Precio anterior
    await supabase.from('precios_insumo').insert({
      insumo_id: insumo.id,
      proveedor_id: provId,
      precio: precioAnterior,
      fecha: fechaAnterior.toISOString().split('T')[0],
      es_precio_actual: false,
    })

    // Precio actual
    await supabase.from('precios_insumo').insert({
      insumo_id: insumo.id,
      proveedor_id: provId,
      precio: precioBase,
      fecha: fechaActual.toISOString().split('T')[0],
      es_precio_actual: true,
    })
  }
  console.log('✓ Precios creados (actual + anterior)')
  }

  // =====================================================
  // 4. RECETAS BASE (5)
  // =====================================================
  console.log('\nCreando recetas base...')
  const recetasBase = [
    { nombre: 'Salsa de Tomate Casera', descripcion: 'Base para pastas y pizzas', rendimiento_porciones: 10 },
    { nombre: 'Puré de Papas', descripcion: 'Guarnición clásica', rendimiento_porciones: 8 },
    { nombre: 'Salsa Criolla', descripcion: 'Para carnes a la parrilla', rendimiento_porciones: 15 },
    { nombre: 'Vinagreta Clásica', descripcion: 'Para ensaladas', rendimiento_porciones: 20 },
    { nombre: 'Demi-glace', descripcion: 'Reducción para carnes', rendimiento_porciones: 6 },
  ]

  const { data: existingRecetas } = await supabase.from('recetas_base').select('id').limit(1)
  let recetasData: any[]

  if (existingRecetas && existingRecetas.length > 0) {
    const { data: allRecetas } = await supabase.from('recetas_base').select('*')
    recetasData = allRecetas || []
    console.log(`✓ ${recetasData.length} recetas base existentes`)
  } else {
    const { data: newRecetas } = await supabase
      .from('recetas_base')
      .insert(recetasBase)
      .select()
    recetasData = newRecetas || []
    console.log(`✓ ${recetasData.length} recetas base creadas`)
  }

  // =====================================================
  // 5. PLATOS (15)
  // =====================================================
  console.log('\nCreando platos...')
  const platos = [
    { nombre: 'Bife de Chorizo con Papas', seccion: 'Carnes', descripcion: '400g de bife con guarnición' },
    { nombre: 'Lomo al Champignon', seccion: 'Carnes', descripcion: 'Lomo con salsa de hongos' },
    { nombre: 'Pollo al Verdeo', seccion: 'Carnes', descripcion: 'Pechuga con verduras salteadas' },
    { nombre: 'Cordero Patagónico', seccion: 'Carnes', descripcion: 'Costillar de cordero con hierbas' },
    { nombre: 'Salmón Grillado', seccion: 'Pescados', descripcion: 'Con vegetales al wok' },
    { nombre: 'Risotto de Mariscos', seccion: 'Pescados', descripcion: 'Langostinos, mejillones y pulpo' },
    { nombre: 'Trucha a la Manteca', seccion: 'Pescados', descripcion: 'Con almendras y limón' },
    { nombre: 'Ravioles de Ricota', seccion: 'Pastas', descripcion: 'Con salsa fileto' },
    { nombre: 'Ñoquis de Papa', seccion: 'Pastas', descripcion: 'Con salsa bolognesa' },
    { nombre: 'Risotto de Hongos', seccion: 'Pastas', descripcion: 'Con parmesano y trufa' },
    { nombre: 'Ensalada César', seccion: 'Entradas', descripcion: 'Con pollo grillado' },
    { nombre: 'Carpaccio de Lomo', seccion: 'Entradas', descripcion: 'Con rúcula y parmesano' },
    { nombre: 'Provoleta', seccion: 'Entradas', descripcion: 'A la parrilla con orégano' },
    { nombre: 'Flan Casero', seccion: 'Postres', descripcion: 'Con dulce de leche y crema' },
    { nombre: 'Tiramisú', seccion: 'Postres', descripcion: 'Receta italiana tradicional' },
  ]

  const { data: existingPlatos } = await supabase.from('platos').select('id').limit(1)
  let platosData: any[]

  if (existingPlatos && existingPlatos.length > 0) {
    const { data: allPlatos } = await supabase.from('platos').select('*')
    platosData = allPlatos || []
    console.log(`✓ ${platosData.length} platos existentes`)
  } else {
    const { data: newPlatos } = await supabase
      .from('platos')
      .insert(platos)
      .select()
    platosData = newPlatos || []
    console.log(`✓ ${platosData.length} platos creados`)
  }

  // =====================================================
  // 6. CARTA (10 platos en carta)
  // =====================================================
  console.log('\nAgregando platos a la carta...')
  const { data: existingCarta } = await supabase.from('carta').select('id').limit(1)

  if (existingCarta && existingCarta.length > 0) {
    console.log('✓ Carta ya tiene items')
  } else if (platosData && platosData.length > 0) {
    const cartaItems = platosData.slice(0, 10).map((plato, i) => ({
      plato_id: plato.id,
      precio_carta: [18500, 22000, 14500, 28000, 19500, 24000, 17500, 12000, 10500, 16500][i],
      margen_objetivo: 30,
      activo: true,
    }))

    await supabase.from('carta').insert(cartaItems)
    console.log('✓ Carta actualizada')
  }

  // =====================================================
  // 7. ÓRDENES DE COMPRA (historial 8 semanas)
  // =====================================================
  console.log('\nCreando órdenes de compra...')
  const { data: existingOC } = await supabase.from('ordenes_compra').select('id').limit(1)

  if (existingOC && existingOC.length > 0) {
    console.log('✓ Ya existen órdenes de compra')
  } else {
  for (let semana = 8; semana >= 0; semana--) {
    const fechaOC = new Date()
    fechaOC.setDate(fechaOC.getDate() - (semana * 7))
    const fechaStr = fechaOC.toISOString().split('T')[0]

    // 2-3 órdenes por semana
    const numOrdenes = 2 + Math.floor(Math.random() * 2)

    for (let i = 0; i < numOrdenes; i++) {
      const provIdx = Math.floor(Math.random() * provs.length)
      const estado = semana === 0 && i === 0 ? 'enviada' : 'recibida'

      const { data: oc } = await supabase
        .from('ordenes_compra')
        .insert({
          proveedor_id: provs[provIdx].id,
          fecha: fechaStr,
          estado,
          numero: `OC-2026-${String(100 - semana * 3 + i).padStart(3, '0')}`,
        })
        .select()
        .single()

      if (oc) {
        // 3-6 items por orden
        const numItems = 3 + Math.floor(Math.random() * 4)
        const insumosRandom = [...insumosData].sort(() => Math.random() - 0.5).slice(0, numItems)

        for (const ins of insumosRandom) {
          const cantidad = 5 + Math.floor(Math.random() * 20)
          const precio = preciosBase[ins.nombre] || 1000

          await supabase.from('orden_compra_items').insert({
            orden_compra_id: oc.id,
            insumo_id: ins.id,
            cantidad,
            precio_unitario: precio,
          })
        }
      }
    }
  }
  console.log('✓ Órdenes de compra creadas')
  }

  // =====================================================
  // 8. FACTURAS (historial 8 semanas)
  // =====================================================
  console.log('\nCreando facturas...')
  const { data: existingFacturas } = await supabase.from('facturas_proveedor').select('id').limit(1)

  if (existingFacturas && existingFacturas.length > 0) {
    console.log('✓ Ya existen facturas')
  } else {
  // Obtener órdenes recibidas
  const { data: ordenesRecibidas } = await supabase
    .from('ordenes_compra')
    .select('id, proveedor_id, fecha, numero')
    .eq('estado', 'recibida')
    .order('fecha', { ascending: true })

  if (ordenesRecibidas) {
    for (const oc of ordenesRecibidas) {
      const numFactura = `A-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}-${String(Math.floor(Math.random() * 90000000) + 10000000)}`

      // Obtener items de la OC
      const { data: items } = await supabase
        .from('orden_compra_items')
        .select('insumo_id, cantidad, precio_unitario')
        .eq('orden_compra_id', oc.id)

      if (items && items.length > 0) {
        const total = items.reduce((sum, it) => sum + (it.cantidad * it.precio_unitario), 0)

        const { data: factura } = await supabase
          .from('facturas_proveedor')
          .insert({
            proveedor_id: oc.proveedor_id,
            numero_factura: numFactura,
            fecha: oc.fecha,
            total,
            orden_compra_id: oc.id,
          })
          .select()
          .single()

        if (factura) {
          for (const item of items) {
            await supabase.from('factura_items').insert({
              factura_id: factura.id,
              insumo_id: item.insumo_id,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
            })
          }
        }
      }
    }
  }
  console.log('✓ Facturas creadas')
  }

  console.log('\n========================================')
  console.log('✅ Datos demo cargados exitosamente!')
  console.log('========================================')
}

seedDemo().catch(console.error)
