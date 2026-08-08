// Historial de versiones de la app (changelog).
// En CADA push a producción: agregar una entrada NUEVA arriba de todo en CHANGELOG.
// APP_VERSION y APP_FECHA se derivan solos de la primera entrada, no tocarlos a mano.

export interface VersionEntry {
  version: string
  fecha: string // formato DD/MM/YY
  cambios: string[]
}

export const CHANGELOG: VersionEntry[] = [
  {
    version: 'V.23',
    fecha: '08/08/26',
    cambios: [
      'Análisis: además de insumos, elaboraciones y recetas, ahora se pueden cargar menús ejecutivos, tragos y vinos en el consumo del día',
      'Análisis: el costo del servicio se muestra separado en Cocina y Barra, para que el food cost de la cocina no quede tapado por la barra',
      'Análisis: los vinos aparecen en su propia sección del desglose, con el precio de botella con descuento de bodega',
      'El PDF del consumo suma las secciones de menús ejecutivos, tragos y vinos',
    ],
  },
  {
    version: 'V.22',
    fecha: '04/08/26',
    cambios: [
      'Insumos y panel de inicio: vuelven a mostrar las subas y bajas de precio que estaban faltando (63 insumos no las mostraban)',
      'Facturas con descuento: el porcentaje de variación ya no incluye el descuento del proveedor, así que muestra la suba real',
    ],
  },
  {
    version: 'V.21',
    fecha: '04/08/26',
    cambios: [
      'Editar facturas: se corrigió un error que duplicaba los items al guardar. Si algo falla, ahora avisa y no guarda nada',
      'Anular una factura ahora recalcula los costos de las recetas que usaban esos insumos',
    ],
  },
  {
    version: 'V.20',
    fecha: '04/08/26',
    cambios: [
      'Corrección importante: el costo de los insumos con merma estaba por debajo del real. Ahora recetas, elaboraciones, carta y menús muestran el costo verdadero',
      'Los menús ejecutivos vuelven a mostrar su costo actualizado (algunos estaban desfasados)',
    ],
  },
  {
    version: 'V.19',
    fecha: '04/08/26',
    cambios: [
      'Recetas y Elaboraciones: ahora se abre el detalle haciendo clic en el nombre, igual que en Carta',
    ],
  },
  {
    version: 'V.18',
    fecha: '03/08/26',
    cambios: [
      'Editar factura: ahora se pueden escribir decimales con coma en cantidad, precio y descuento (ej: 4,200 kg)',
    ],
  },
  {
    version: 'V.17',
    fecha: '31/07/26',
    cambios: [
      'Análisis: nuevo botón para descargar en PDF el consumo del servicio (con desglose por insumo y % sobre el total)',
    ],
  },
  {
    version: 'V.16',
    fecha: '18/07/26',
    cambios: [
      'Facturas con descuento: ahora el precio del insumo se guarda con el descuento aplicado',
    ],
  },
  {
    version: 'V.15',
    fecha: '09/07/26',
    cambios: [
      "Nueva categoría de insumos \"Otros\" (bolsas de vacío, carbón, leña, servilletas)",
    ],
  },
  {
    version: 'V.14',
    fecha: '09/07/26',
    cambios: [
      'Nuevo: historial de versiones (Novedades) al hacer clic en la versión del menú',
    ],
  },
  {
    version: 'V.13',
    fecha: '09/07/26',
    cambios: [
      'El ojo de recetas recalcula el costo con los precios actuales',
    ],
  },
  {
    version: 'V.12',
    fecha: '08/07/26',
    cambios: [
      'Nuevo: foto del plato en la ficha de recetas',
      'Fix: insumos duplicados al cargar una receta',
    ],
  },
  {
    version: 'V.11',
    fecha: '03/07/26',
    cambios: [
      'Estadísticas: simplificado a 4 pestañas',
    ],
  },
  {
    version: 'V.10',
    fecha: '19/06/26',
    cambios: [
      'Se agregó el número de versión y la fecha en el menú',
    ],
  },
]

// Versión actual = primera entrada del changelog (fuente única de verdad).
export const APP_VERSION = CHANGELOG[0].version
export const APP_FECHA = CHANGELOG[0].fecha
