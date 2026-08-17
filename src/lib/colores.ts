/**
 * La paleta del sistema — en un solo lugar.
 *
 * POR QUÉ EXISTE: el color terracota estaba escrito a mano en unos 25 lugares,
 * y no con el mismo valor. Había tres:
 *
 *   #C4704B   en los componentes y gráficos
 *   #A35234   en los cinco generadores de PDF, como [163, 82, 52]
 *   #B5613E   en la config de Tailwind, como "dark"
 *
 * O sea que la pantalla y el PDF del mismo informe salían de distinto color, y
 * nadie lo notaba porque nunca se ven juntos. Es el mismo problema que tuvimos
 * con la fórmula de la merma copiada en 30 archivos: cada copia deriva sola.
 *
 * CÓMO SE USA:
 *
 *   Componentes   →  PALETA.terracotta            ('#B5613E')
 *   Tailwind      →  lo importa tailwind.config.ts
 *   PDF (jsPDF)   →  rgb(PALETA.terracotta)       ([181, 97, 62])
 *   Excel         →  argb(PALETA.terracotta)      ('B5613E')
 *
 * Si hace falta un color nuevo, se agrega acá. No se escribe un hex suelto en
 * una pantalla: en tres meses hay una cuarta terracota.
 */

export const PALETA = {
  // Fondos
  cream: '#FBFAF8',
  creamLight: '#FFFFFF',
  creamDark: '#F4F2EE',

  // Sidebar
  forest: '#1B3A2D',
  forestLight: '#24483A',

  // Textos
  ink: '#1A1A1A',
  inkStrong: '#4A4744',
  inkMuted: '#6B6560',
  inkLight: '#9B948C',
  inkFaint: '#C2BCB4',

  // Bordes
  sandLight: '#E9E5DF',
  sand: '#DDD8D0',
  sandDark: '#CBC5BB',

  /**
   * Acento. Reservado para alertas y UN solo CTA por pantalla: si aparece en
   * todos lados deja de señalar nada.
   */
  terracotta: '#B5613E',
  terracottaDark: '#98502F',
  terracottaLight: '#C98460',
  terracottaBg: '#F8EDE6',

  // Funcionales
  success: '#2F7A50',
  successBg: '#E9F3ED',
  successLine: '#BFDDCC',
  warning: '#9A6E2E',
  warningBg: '#F8F0DF',
  warningLine: '#E4D2AC',
  danger: '#8F2A2A',
  dangerBg: '#F8E6E4',
  dangerLine: '#E5BFBB',
  info: '#4A6572',
  infoBg: '#EDF2F4',

  olive: '#5C7A5E',
  oliveLight: '#8CA88F',
} as const

/**
 * Serie para gráficos, en este orden.
 *
 * Cinco alcanzan si la cola se agrupa en "Otros". Si un gráfico necesita más de
 * cinco colores propios, el problema es del gráfico y no de la paleta: nadie
 * distingue ocho tonos en una torta.
 */
export const SERIE_GRAFICOS = [
  PALETA.forest,
  PALETA.olive,
  PALETA.terracotta,
  PALETA.info,
  PALETA.warning,
] as const

/**
 * Semáforo de incidencia — el ÚNICO lugar donde el color decide una lectura.
 * Los tres comparten luminosidad para que ninguno grite más que otro, y pasan
 * contraste AA sobre su propio fondo.
 */
export const SEMAFORO = {
  ok: { texto: PALETA.success, fondo: PALETA.successBg, linea: PALETA.successLine },
  atencion: { texto: PALETA.warning, fondo: PALETA.warningBg, linea: PALETA.warningLine },
  fuera: { texto: PALETA.danger, fondo: PALETA.dangerBg, linea: PALETA.dangerLine },
} as const

/** "#B5613E" → [181, 97, 62]. Es lo que espera jsPDF. */
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** "#B5613E" → "B5613E". Es lo que espera exceljs. */
export function argb(hex: string): string {
  return hex.replace('#', '').toUpperCase()
}
