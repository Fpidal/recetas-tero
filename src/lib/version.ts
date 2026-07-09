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
