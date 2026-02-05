// Formato argentino: punto para miles, coma para decimales
// Ejemplo: 33.000,25

/**
 * Formatea un número para mostrar en formato argentino
 * @param valor - Número a formatear
 * @param decimales - Cantidad de decimales (default 2)
 */
export function formatearNumero(valor: number | string | null | undefined, decimales: number = 2): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const num = typeof valor === 'string' ? parseFloat(valor) : valor
  if (isNaN(num)) return ''

  return num.toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/**
 * Formatea un valor monetario en formato argentino
 * @param valor - Número a formatear
 * @param conSigno - Si incluir el signo $ (default true)
 */
export function formatearMoneda(valor: number | string | null | undefined, conSigno: boolean = true): string {
  if (valor === null || valor === undefined || valor === '') return conSigno ? '$0,00' : '0,00'
  const num = typeof valor === 'string' ? parseFloat(valor) : valor
  if (isNaN(num)) return conSigno ? '$0,00' : '0,00'

  const formatted = num.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return conSigno ? `$${formatted}` : formatted
}

/**
 * Formatea una cantidad (peso, volumen, unidades)
 * @param valor - Número a formatear
 * @param decimales - Cantidad de decimales (default 2)
 */
export function formatearCantidad(valor: number | string | null | undefined, decimales: number = 2): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const num = typeof valor === 'string' ? parseFloat(valor) : valor
  if (isNaN(num)) return ''

  return num.toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

/**
 * Parsea un string en formato argentino a número
 * Acepta: "33.000,25" o "33000.25" o "33000,25"
 * @param valor - String a parsear
 */
export function parsearNumero(valor: string): number {
  if (!valor || valor.trim() === '') return 0

  // Limpiar espacios
  let limpio = valor.trim()

  // Si tiene punto y coma, asumimos formato argentino (33.000,25)
  if (limpio.includes('.') && limpio.includes(',')) {
    // Quitar puntos de miles y cambiar coma por punto
    limpio = limpio.replace(/\./g, '').replace(',', '.')
  }
  // Si solo tiene coma, es decimal argentino (33000,25)
  else if (limpio.includes(',') && !limpio.includes('.')) {
    limpio = limpio.replace(',', '.')
  }
  // Si solo tiene punto, verificar si es miles o decimal
  else if (limpio.includes('.')) {
    // Si hay más de un punto, son miles (33.000.000)
    const puntos = limpio.match(/\./g)
    if (puntos && puntos.length > 1) {
      limpio = limpio.replace(/\./g, '')
    }
    // Si el punto está seguido de 3 dígitos al final, es miles (33.000)
    else if (/\.\d{3}$/.test(limpio)) {
      limpio = limpio.replace('.', '')
    }
    // Sino asumimos que es decimal (33.25)
  }

  const num = parseFloat(limpio)
  return isNaN(num) ? 0 : num
}

/**
 * Formatea el valor de un input mientras el usuario escribe
 * Solo permite coma como decimal, agrega puntos de miles automáticamente
 * Ejemplo: 33000,25 → 33.000,25
 */
export function formatearInputNumero(valor: string): string {
  // Solo permitir dígitos y coma
  let limpio = valor.replace(/[^\d,]/g, '')

  // Asegurar solo una coma
  const partes = limpio.split(',')
  if (partes.length > 2) {
    limpio = partes[0] + ',' + partes.slice(1).join('')
  }

  // Separar parte entera y decimal
  const [entero, decimal] = limpio.split(',')

  // Agregar puntos de miles a la parte entera
  const enteroConPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  // Reconstruir
  if (decimal !== undefined) {
    return enteroConPuntos + ',' + decimal
  }
  return enteroConPuntos
}
