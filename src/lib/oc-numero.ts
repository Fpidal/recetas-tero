import { supabase } from './supabase'

/**
 * Genera el próximo número de OC con formato A01-XXXX
 * Ejemplo: A01-0001, A01-0002, etc.
 */
export async function getNextOCNumber(): Promise<string> {
  const { data } = await supabase
    .from('ordenes_compra')
    .select('numero')
    .not('numero', 'is', null)
    .order('numero', { ascending: false })
    .limit(1)

  if (!data || data.length === 0 || !data[0].numero) {
    return 'A01-0001'
  }

  const ultimo = data[0].numero as string
  // Formato esperado: A01-XXXX
  const match = ultimo.match(/^(A\d+)-(\d+)$/)
  if (!match) {
    return 'A01-0001'
  }

  const prefix = match[1]
  const num = parseInt(match[2], 10) + 1
  return `${prefix}-${num.toString().padStart(4, '0')}`
}
