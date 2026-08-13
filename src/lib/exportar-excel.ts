/**
 * Exportación a Excel — el motor, en un solo lugar.
 *
 * POR QUÉ EXISTE: los archivos tienen dos usos que se contradicen un poco.
 * Uno es mirarlos (que se lean bien, con colores y ordenados) y el otro es
 * pasárselos a otra aplicación o al contador. Esto resuelve los dos:
 *
 *   · La FILA 1 son siempre los encabezados. Nada de títulos ni logos arriba:
 *     cualquier otro programa espera los nombres de columna en la primera fila,
 *     y un título decorativo rompe la importación. Los metadatos (qué es, de
 *     qué fecha) van en el nombre del archivo y en la hoja "Info".
 *
 *   · Los números se escriben como NÚMEROS, no como texto. Es la trampa más
 *     común con formato argentino: si se escribe "1.234,56" como cadena, del
 *     otro lado es una palabra y Excel no la puede sumar. Acá va el número
 *     crudo y el formato se aplica en la celda, así se ve con coma decimal
 *     pero sigue siendo un número.
 *
 *   · Las fechas van como fechas, para que se puedan ordenar y filtrar.
 *
 * exceljs se carga con import dinámico: pesa cerca de 1 MB y no tiene sentido
 * que lo descargue alguien que nunca toca el botón de exportar.
 */

const TERRACOTA = 'A35234'
const GRIS_FILA = 'F7F7F7'

export type TipoColumna =
  | 'texto'
  | 'numero'      // 1.234,56
  | 'entero'      // 1.234
  | 'moneda'      // $ 1.234,56
  | 'porcentaje'  // 12,5%
  | 'fecha'       // 13/08/2026

/** Formato de celda por tipo. Se usan los patrones de Excel, no strings ya
 *  formateados: así el separador decimal lo pone el Excel de quien lo abre. */
const FORMATO: Record<TipoColumna, string | undefined> = {
  texto: undefined,
  numero: '#,##0.00',
  entero: '#,##0',
  moneda: '"$" #,##0.00',
  porcentaje: '#,##0.0"%"',
  fecha: 'dd/mm/yyyy',
}

const ANCHO_POR_TIPO: Record<TipoColumna, number> = {
  texto: 28,
  numero: 14,
  entero: 12,
  moneda: 16,
  porcentaje: 12,
  fecha: 13,
}

export interface Columna<T = any> {
  titulo: string
  /** Nombre del campo, o una función que lo calcule */
  valor: keyof T | ((fila: T) => unknown)
  tipo?: TipoColumna
  ancho?: number
}

export interface Hoja<T = any> {
  nombre: string
  columnas: Columna<T>[]
  filas: T[]
  /** Nota al pie de la hoja: criterios, filtros aplicados, lo que haga falta aclarar */
  nota?: string
}

export interface OpcionesExcel {
  /** Sin extensión: se le agrega .xlsx */
  nombreArchivo: string
  hojas: Hoja[]
  /** Qué es este archivo, para la hoja Info */
  descripcion?: string
}

function leer<T>(fila: T, col: Columna<T>): unknown {
  return typeof col.valor === 'function'
    ? (col.valor as (f: T) => unknown)(fila)
    : (fila as any)[col.valor]
}

/** Excel no acepta / \ ? * [ ] : en el nombre de hoja, y corta en 31 caracteres */
function nombreHojaValido(nombre: string): string {
  return nombre.replace(/[\/\\?*\[\]:]/g, '-').slice(0, 31)
}

export async function descargarExcel({ nombreArchivo, hojas, descripcion }: OpcionesExcel): Promise<void> {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Tero Restó'
  wb.created = new Date()

  for (const hoja of hojas) {
    const ws = wb.addWorksheet(nombreHojaValido(hoja.nombre), {
      views: [{ state: 'frozen', ySplit: 1 }], // la fila de títulos queda fija al scrollear
    })

    ws.columns = hoja.columnas.map((c) => ({
      header: c.titulo,
      key: c.titulo,
      width: c.ancho ?? ANCHO_POR_TIPO[c.tipo ?? 'texto'],
    }))

    // Encabezado
    const cabecera = ws.getRow(1)
    cabecera.height = 20
    cabecera.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TERRACOTA } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF8A4529' } } }
    })

    // Datos
    hoja.filas.forEach((fila, i) => {
      const valores = hoja.columnas.map((c) => {
        const v = leer(fila, c)
        if (v === null || v === undefined) return null
        if (c.tipo === 'fecha') {
          // Las fechas vienen como "YYYY-MM-DD". Se construyen en hora local
          // para que no se corran un día por zona horaria.
          if (typeof v === 'string') {
            const [a, m, d] = v.split('-').map(Number)
            return a && m && d ? new Date(a, m - 1, d) : v
          }
          return v
        }
        if (c.tipo && c.tipo !== 'texto') {
          const n = Number(v)
          return isFinite(n) ? n : null
        }
        return v
      })

      const row = ws.addRow(valores)
      row.eachCell((cell, idx) => {
        const tipo = hoja.columnas[idx - 1]?.tipo ?? 'texto'
        const fmt = FORMATO[tipo]
        if (fmt) cell.numFmt = fmt
        if (tipo !== 'texto') cell.alignment = { horizontal: 'right' }
        cell.font = { size: 10 }
        // Rayado suave: ayuda a seguir la fila en tablas anchas
        if (i % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_FILA } }
        }
      })
    })

    // Autofiltro sobre el encabezado, solo si hay datos
    if (hoja.filas.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: hoja.columnas.length },
      }
    }

    if (hoja.nota) {
      ws.addRow([])
      const nota = ws.addRow([hoja.nota])
      nota.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF777777' } }
    }
  }

  // Hoja Info: de dónde salió el archivo. Va última para no estorbar.
  const info = wb.addWorksheet('Info')
  info.columns = [{ width: 22 }, { width: 60 }]
  const ahora = new Date()
  const filas: [string, string][] = [
    ['Sistema', 'Recetas Tero'],
    ['Generado', ahora.toLocaleString('es-AR')],
    ['Contenido', descripcion || hojas.map((h) => h.nombre).join(', ')],
    ['Hojas', String(hojas.length)],
    ['Registros', String(hojas.reduce((a, h) => a + h.filas.length, 0))],
  ]
  filas.forEach(([k, v]) => {
    const r = info.addRow([k, v])
    r.getCell(1).font = { bold: true, size: 10 }
    r.getCell(2).font = { size: 10 }
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "2026-08-13" para el nombre del archivo */
export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
