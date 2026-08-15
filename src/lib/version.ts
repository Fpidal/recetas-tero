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
    version: 'V.32',
    fecha: '15/08/26',
    cambios: [
      'Menú lateral reorganizado por áreas: Compras, Cocina, Barra, Operación e Informes. Son los mismos accesos de siempre, agrupados para encontrarlos más rápido',
      'Nueva tipografía en todo el sistema, más legible en los números de las tablas',
      'Dashboard: nueva tarjeta "Cifras del mes" con ventas, compras, margen bruto e incidencia, comparados contra el mes anterior',
      'Dashboard: ahora muestra la incidencia teórica (compras sobre ventas) además de la real, y el desvío entre las dos',
      'Se corrigió el gráfico de variación de precios, donde los porcentajes se encimaban con las barras',
      'Dashboard: ahora entra completo en una pantalla, sin scroll',
      'Dashboard: las alertas se leen de un vistazo — el número grande a la derecha, sin iconos ni etiquetas de color',
    ],
  },
  {
    version: 'V.31',
    fecha: '14/08/26',
    cambios: [
      'Se corrigió un problema por el que un insumo podía quedar con varios precios "vigentes" a la vez. El queso brie tenía tres, y las recetas costeaban con el de junio en lugar del de la última factura',
      'Cuando pasaba, el insumo aparecía repetido en los buscadores, como si fueran productos distintos',
      'El sistema ahora impide que vuelva a ocurrir: si algo intenta dejar dos precios vigentes, avisa con un error en vez de guardar mal en silencio',
    ],
  },
  {
    version: 'V.30',
    fecha: '14/08/26',
    cambios: [
      'Análisis → Resumen: nuevo PDF del consumo de la semana, agrupado por rubro (Carnes, Pescados, Verduras…), pensado para armar los pedidos',
      'Ese PDF trae una columna "A comprar" que ajusta por la merma: si consumiste 18,40 kg de roast beef con 25% de merma, tenés que comprar 24,53 kg. Antes había que hacer esa cuenta a mano, y era fácil pedir de menos',
      'Trae también una columna en blanco para anotar el pedido a mano mientras se recorre la cocina',
      'Las cantidades ahora se muestran siempre con dos decimales, así las columnas quedan alineadas y se comparan de un vistazo',
    ],
  },
  {
    version: 'V.29',
    fecha: '14/08/26',
    cambios: [
      'Análisis → Histórico: se corrigió la incidencia real, que venía más baja que la verdadera. Dividía el costo de los servicios cargados por la venta de TODO el mes, incluyendo días sin consumo cargado',
      'Los seis meses del gráfico estaban afectados: los valores nuevos son los correctos, no subió nada',
      'Histórico ahora muestra el muestreo (por ejemplo "9 de 11"), para saber cuán confiable es cada mes',
    ],
  },
  {
    version: 'V.28',
    fecha: '13/08/26',
    cambios: [
      'Estadísticas: nueva pestaña "ABC de Insumos" — de más de 300 insumos, te dice cuáles son los 60 que se llevan el 80% del gasto, y cuáles no vale la pena mirar',
      'ABC: cada insumo muestra si su precio se movió en el período. Un insumo caro con precio estable no necesita atención; uno que además sube, sí',
      'Carta: nuevo botón para bajar toda la carta en Excel, con una columna que distingue lo que está en carta de lo que quedó afuera',
      'Estadísticas: al entrar a Cierre de Mes o ABC ya no aparece el filtro de fechas de arriba, que no se usaba en esas pantallas y confundía',
    ],
  },
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
