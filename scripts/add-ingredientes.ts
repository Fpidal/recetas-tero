import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function addIngredientes() {
  const { data: platos } = await supabase.from('platos').select('id, nombre')
  const { data: insumos } = await supabase.from('insumos').select('id, nombre')

  if (!platos || !insumos) {
    console.log('No hay platos o insumos')
    return
  }

  const insumosMap: Record<string, string> = {}
  for (const i of insumos) {
    insumosMap[i.nombre] = i.id
  }

  const ingredientesPorPlato: Record<string, {insumo: string, cantidad: number}[]> = {
    'Bife de Chorizo con Papas': [
      { insumo: 'Bife de Chorizo', cantidad: 0.4 },
      { insumo: 'Papa', cantidad: 0.3 },
      { insumo: 'Sal Fina', cantidad: 0.01 },
      { insumo: 'Aceite de Oliva', cantidad: 0.03 },
    ],
    'Lomo al Champignon': [
      { insumo: 'Lomo', cantidad: 0.3 },
      { insumo: 'Champiñones', cantidad: 0.15 },
      { insumo: 'Crema de Leche', cantidad: 0.1 },
      { insumo: 'Manteca', cantidad: 0.03 },
    ],
    'Pollo al Verdeo': [
      { insumo: 'Pechuga de Pollo', cantidad: 0.25 },
      { insumo: 'Cebolla', cantidad: 0.1 },
      { insumo: 'Zanahoria', cantidad: 0.1 },
      { insumo: 'Aceite de Oliva', cantidad: 0.02 },
    ],
    'Cordero Patagónico': [
      { insumo: 'Cordero Costillar', cantidad: 0.4 },
      { insumo: 'Papa', cantidad: 0.2 },
      { insumo: 'Aceite de Oliva', cantidad: 0.03 },
    ],
    'Salmón Grillado': [
      { insumo: 'Salmón Rosado', cantidad: 0.25 },
      { insumo: 'Espinaca', cantidad: 0.1 },
      { insumo: 'Limón', cantidad: 0.05 },
      { insumo: 'Aceite de Oliva', cantidad: 0.02 },
    ],
    'Risotto de Mariscos': [
      { insumo: 'Arroz Carnaroli', cantidad: 0.12 },
      { insumo: 'Langostinos', cantidad: 0.1 },
      { insumo: 'Mejillones', cantidad: 0.1 },
      { insumo: 'Crema de Leche', cantidad: 0.05 },
      { insumo: 'Queso Parmesano', cantidad: 0.03 },
    ],
    'Trucha a la Manteca': [
      { insumo: 'Trucha', cantidad: 0.3 },
      { insumo: 'Manteca', cantidad: 0.05 },
      { insumo: 'Limón', cantidad: 0.03 },
    ],
    'Ravioles de Ricota': [
      { insumo: 'Pasta Seca', cantidad: 0.2 },
      { insumo: 'Tomate', cantidad: 0.15 },
      { insumo: 'Queso Parmesano', cantidad: 0.03 },
    ],
    'Ñoquis de Papa': [
      { insumo: 'Papa', cantidad: 0.3 },
      { insumo: 'Harina 000', cantidad: 0.1 },
      { insumo: 'Huevos', cantidad: 2 },
      { insumo: 'Tomate', cantidad: 0.15 },
    ],
    'Risotto de Hongos': [
      { insumo: 'Arroz Carnaroli', cantidad: 0.12 },
      { insumo: 'Champiñones', cantidad: 0.15 },
      { insumo: 'Queso Parmesano', cantidad: 0.04 },
      { insumo: 'Crema de Leche', cantidad: 0.05 },
    ],
    'Ensalada César': [
      { insumo: 'Lechuga', cantidad: 1 },
      { insumo: 'Pechuga de Pollo', cantidad: 0.15 },
      { insumo: 'Queso Parmesano', cantidad: 0.03 },
    ],
    'Carpaccio de Lomo': [
      { insumo: 'Lomo', cantidad: 0.12 },
      { insumo: 'Aceite de Oliva', cantidad: 0.03 },
      { insumo: 'Queso Parmesano', cantidad: 0.02 },
    ],
    'Provoleta': [
      { insumo: 'Queso Mozzarella', cantidad: 0.2 },
      { insumo: 'Aceite de Oliva', cantidad: 0.01 },
    ],
    'Flan Casero': [
      { insumo: 'Huevos', cantidad: 3 },
      { insumo: 'Leche Entera', cantidad: 0.25 },
      { insumo: 'Azúcar', cantidad: 0.1 },
      { insumo: 'Crema de Leche', cantidad: 0.05 },
    ],
    'Tiramisú': [
      { insumo: 'Huevos', cantidad: 3 },
      { insumo: 'Azúcar', cantidad: 0.08 },
      { insumo: 'Crema de Leche', cantidad: 0.15 },
    ],
  }

  for (const plato of platos) {
    const ingredientes = ingredientesPorPlato[plato.nombre]
    if (!ingredientes) continue

    for (const ing of ingredientes) {
      const insumoId = insumosMap[ing.insumo]
      if (!insumoId) {
        console.log('Insumo no encontrado:', ing.insumo)
        continue
      }

      await supabase.from('plato_ingredientes').insert({
        plato_id: plato.id,
        insumo_id: insumoId,
        cantidad: ing.cantidad,
      })
    }
    console.log('✓ Ingredientes agregados a:', plato.nombre)
  }

  console.log('\n✅ Ingredientes completados!')
}

addIngredientes().catch(console.error)
