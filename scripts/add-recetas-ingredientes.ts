import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function addRecetasIngredientes() {
  const { data: recetas } = await supabase.from('recetas_base').select('id, nombre')
  const { data: insumos } = await supabase.from('insumos').select('id, nombre')

  if (!recetas || !insumos) {
    console.log('No hay recetas o insumos')
    return
  }

  const insumosMap: Record<string, string> = {}
  for (const i of insumos) {
    insumosMap[i.nombre] = i.id
  }

  const ingredientesPorReceta: Record<string, {insumo: string, cantidad: number}[]> = {
    'Salsa de Tomate Casera': [
      { insumo: 'Tomate', cantidad: 2 },
      { insumo: 'Cebolla', cantidad: 0.3 },
      { insumo: 'Aceite de Oliva', cantidad: 0.1 },
      { insumo: 'Sal Fina', cantidad: 0.02 },
    ],
    'Puré de Papas': [
      { insumo: 'Papa', cantidad: 1.5 },
      { insumo: 'Manteca', cantidad: 0.1 },
      { insumo: 'Leche Entera', cantidad: 0.2 },
      { insumo: 'Sal Fina', cantidad: 0.01 },
    ],
    'Salsa Criolla': [
      { insumo: 'Tomate', cantidad: 0.5 },
      { insumo: 'Cebolla', cantidad: 0.3 },
      { insumo: 'Aceite de Oliva', cantidad: 0.15 },
      { insumo: 'Vinagre Balsámico', cantidad: 0.05 },
    ],
    'Vinagreta Clásica': [
      { insumo: 'Aceite de Oliva', cantidad: 0.3 },
      { insumo: 'Vinagre Balsámico', cantidad: 0.1 },
      { insumo: 'Sal Fina', cantidad: 0.01 },
      { insumo: 'Pimienta Negra', cantidad: 0.005 },
    ],
    'Demi-glace': [
      { insumo: 'Cebolla', cantidad: 0.2 },
      { insumo: 'Zanahoria', cantidad: 0.15 },
      { insumo: 'Manteca', cantidad: 0.08 },
      { insumo: 'Harina 000', cantidad: 0.05 },
    ],
  }

  for (const receta of recetas) {
    const ingredientes = ingredientesPorReceta[receta.nombre]
    if (!ingredientes) continue

    for (const ing of ingredientes) {
      const insumoId = insumosMap[ing.insumo]
      if (!insumoId) {
        console.log('Insumo no encontrado:', ing.insumo)
        continue
      }

      await supabase.from('receta_base_ingredientes').insert({
        receta_base_id: receta.id,
        insumo_id: insumoId,
        cantidad: ing.cantidad,
      })
    }
    console.log('✓ Ingredientes agregados a receta:', receta.nombre)
  }

  console.log('\n✅ Recetas base completadas!')
}

addRecetasIngredientes().catch(console.error)
