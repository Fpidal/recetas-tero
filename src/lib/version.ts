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
    version: 'V.27',
    fecha: '13/08/26',
    cambios: [
      'Facturas: en el detalle se puede comentar cada ítem — por ejemplo "sin stock, viene el jueves". Ese comentario aparece después en el Resumen semanal, así al auditar ya sabés qué pasó',
      'El punto de color de la lista de facturas ahora usa el mismo criterio que el Resumen semanal: avisa desde 1% de diferencia y no por centavos',
    ],
  },
  {
    version: 'V.26',
    fecha: '13/08/26',
    cambios: [
      'Facturas: nueva solapa "Resumen semanal" — lo que no llegó, lo que cambió de precio, lo que vino sin pedir y las órdenes que siguen sin factura, todo de la semana que cerró',
      'Resumen semanal: si un insumo cambió de precio y además se le compró a otro proveedor, avisa cuál era el anterior. Y muestra cuántas veces subió en los últimos dos meses',
      'Resumen semanal: se le puede escribir una nota a cada línea (por ejemplo "es de mejor calidad" o "hacía meses que no se compraba") y esa nota sale en el PDF',
      'Nuevo botón para bajar a Excel en Proveedores, Insumos, Recetas, Elaboraciones, Facturas y Órdenes de compra. En Facturas y Órdenes baja lo que estés viendo, con los filtros aplicados',
      'Los Excel salen con los importes desglosados en neto, IVA y percepciones, para que las cuentas cierren',
      'Se corrigió un error que comparaba mal los vinos entre la orden de compra y la factura: con dos vinos en la misma factura, uno figuraba como faltante sin serlo',
    ],
  },
  {
    version: 'V.25',
    fecha: '13/08/26',
    cambios: [
      'Estadísticas: nueva pestaña "Cierre de Mes" con la foto del mes — compras, ventas, incidencia, cubiertos y ticket promedio, todo comparado contra el mes anterior',
      'Cierre de Mes: compras por rubro, compras semana por semana con gráfico, top 10 de insumos por gasto y ventas por servicio',
      'Cierre de Mes: se puede bajar todo en un PDF de una carilla, con el mes en la cabecera',
    ],
  },
  {
    version: 'V.24',
    fecha: '13/08/26',
    cambios: [
      'Facturas: el sistema ya no deja cargar dos veces el mismo comprobante de un proveedor. Si pasa, avisa cuál es y qué hacer',
      'Seguridad: se cerró el acceso a los datos desde afuera del sistema. Antes, los precios, las facturas y los proveedores se podían leer sin usuario y contraseña',
      'La carta pública del QR sigue funcionando igual, pero ahora solo muestra nombre, descripción y precio: los costos y márgenes dejaron de estar expuestos',
    ],
  },
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
