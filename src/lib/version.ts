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
    version: 'V.48',
    fecha: '26/08/26',
    cambios: [
      'Inventario: el stock ahora se calcula. Es lo último que contaste, más lo que entró por facturas, menos lo que salió por Análisis. Antes mostraba la suma de todas las compras desde enero sin restar nada: decía 616 kg de bola de lomo y $60 millones de mercadería que no estaba',
      'Nueva solapa para contar: cargás sólo los insumos que contaste, y donde no coincide se elige el motivo. Lo que dejás vacío no se toca',
      'Nueva solapa de diferencias: dónde se repite el faltante y cuánto de eso quedó sin explicación, que es el número que importa mirar',
      'Lo que sale de la cámara se descuenta en bruto: una receta que pide 7 kg de cebolla pelada saca 7,78 del cajón, que es lo que vas a contar',
      'Las bebidas se compran por caja y se sirven por botella: el sistema convierte solo y muestra la equivalencia al lado',
      'Un insumo que nunca se contó, o que no se cuenta hace más de 30 días, aparece marcado — su número existe pero no se da por bueno',
      'Desde el inventario se abre la ficha de cualquier insumo con un clic, y al guardar volvés donde estabas',
    ],
  },
  {
    version: 'V.47',
    fecha: '25/08/26',
    cambios: [
      'Órdenes de compra: nueva columna de unidades, para pedir por pieza sin perder el peso. Una horma de reggianito son 7 kg y dos bifes de chorizo son 10: ahora el proveedor ve cuántos bultos preparar y el precio se sigue calculando sobre los kilos',
      'Antes, elegir "unidad" en el pedido solo cambiaba la etiqueta: pedir 2 bifes a $21.000 el kilo dejaba una orden de $42.000 en vez de $210.000, y el objetivo de compras semanal quedaba más holgado de lo que era',
      'En el PDF, la columna aparece solo si alguna línea se pide por bultos. Una orden que va toda por kg sale igual que siempre',
    ],
  },
  {
    version: 'V.46',
    fecha: '25/08/26',
    cambios: [
      'Dashboard: los gráficos de compras por semana y por categoría muestran 8 semanas en vez de 4. Con dos meses a la vista se ve una tendencia; con cuatro puntos la línea era casi un segmento',
      'Dashboard: nuevos colores en el gráfico de categorías. Verduras y Lácteos eran los dos verdes y Pescados un gris azulado — no se distinguían a simple vista. Lácteos pasa a violeta y los cinco quedaron medidos, también para daltonismo',
    ],
  },
  {
    version: 'V.45',
    fecha: '24/08/26',
    cambios: [
      'Importar ventas: ahora la fecha y el turno se eligen en la misma pestaña. Antes había que ir a Carga diaria a cambiarlos y volver, y no se veía claro a qué turno iba el archivo',
      'Ventas: al pararse en un día sin cargar quedaban a la vista los montos del día anterior, y Guardar los escribía en el día vacío sin avisar. Ahora el formulario muestra siempre el día que dice la fecha',
      'Ventas: el botón "Cancelar" volvía al día de hoy con todo en blanco, como si se hubieran borrado los datos. Ahora dice "Descartar cambios", vuelve a mostrar lo guardado de ese mismo día, y solo aparece si hay algo sin guardar',
      'Ventas: la fecha se puede cambiar también estando parado en un día ya cargado. Antes quedaba bloqueada y había que buscar el día en la lista de abajo',
      'Los precios y las facturas cargados después de las 21:00 quedaban fechados al día siguiente. Un precio cargado un domingo a la noche caía en la semana siguiente y aparecía en el informe equivocado',
      'Insumos: al guardar un precio que se aparta más de 50% del que está, el sistema muestra los dos números y pide apretar Guardar otra vez. Es para atajar el error de tipeo —el asado a $243 en vez de $24.300— antes de que el precio equivocado empiece a costear recetas',
    ],
  },
  {
    version: 'V.44',
    fecha: '21/08/26',
    cambios: [
      'Nueva sección "Otros" en la carta, para lo que se cobra pero no se elige del menú. El Cubierto vive ahí: en Entradas se llevaba el 90% de las unidades y dejaba a todas las entradas reales fuera del análisis',
      'Análisis: nueva pestaña "Importar" para subir el informe del sistema de ventas. En vez de tipear 45 renglones, se sube el Excel y se revisa',
      'De un solo archivo salen la venta del turno, los cubiertos y el consumo de cada producto. El costo sigue saliendo de las recetas',
      'Los productos se enlazan una sola vez con los del recetario y quedan guardados: la próxima importación reconoce todo solo',
      'Lo que viene incluido en un menú no se carga dos veces — el sistema de ventas ya lo marca en $0',
      'La copa de vino se puede enlazar con su botella indicando qué fracción es, sin tener que crear un producto aparte',
    ],
  },
  {
    version: 'V.43',
    fecha: '20/08/26',
    cambios: [
      'Órdenes de Compra: nuevo objetivo de compras semanal. Muestra cuánto se pidió en la semana, cuánto llegó, cuánto falta y cuánto queda del objetivo — así se puede frenar a tiempo en vez de enterarse después',
      'La barra avisa desde el 85% del objetivo, no al pasarse: enterarse cuando ya está comprado no deja hacer nada',
      'Nueva solapa "Historial" con el objetivo contra lo real de las últimas 12 semanas, y el desvío de cada una',
      'Los vinos no cuentan contra el objetivo — se compran por caja cuando hay oferta, no semana a semana — pero se muestran aparte',
    ],
  },
  {
    version: 'V.42',
    fecha: '19/08/26',
    cambios: [
      'Ranking: la matriz de Promociones no se dibujaba nunca, porque pedía 5 productos y las promos son 4. Ahora se dibuja desde 3, avisando cuando la sección es chica',
      'Carta: nueva fila de secciones para filtrar de un clic. Con 44 platos, llegar a Bebidas obligaba a colapsar las secciones de arriba una por una',
      'Facturas: las percepciones se eligen de una lista (PERC IVA 3%, PERC IIBB BS AS 4%) y el monto se calcula solo sobre el subtotal neto. Sigue siendo editable si el proveedor redondeó distinto',
      'Si agregás ítems después de elegir la percepción, el monto se actualiza solo — salvo que lo hayas corregido a mano',
      'Se arregló el comentario por ítem en la ficha de factura, que fallaba siempre desde que se agregó en V.27. La base no reconocía ese tipo de nota',
      'Cuando una nota no se puede guardar, el mensaje ahora dice el motivo real en vez de suponer que falta la tabla',
    ],
  },
  {
    version: 'V.41',
    fecha: '19/08/26',
    cambios: [
      'Se sacó la carta para imprimir y el menú digital del QR: la carta la manda a diseñar cada restaurante a su estilo, y el QR estaba atado a ese PDF. La pantalla de Carta sigue igual — platos, precios, food cost y el Excel',
      'Al no quedar ninguna pantalla que muestre datos sin iniciar sesión, se cerró por completo el acceso público a la base, y ahora hacen falta dos errores distintos para que una tabla quede expuesta en vez de uno',
    ],
  },
  {
    version: 'V.40',
    fecha: '19/08/26',
    cambios: [
      'Análisis: nueva pestaña "Por cubierto" — cuánto consume cada persona que se sienta, comparado contra el período anterior. Sirve para ver si algo cambió sin que haya cambiado la venta: el pan viene entre 30 y 39 gramos por persona desde abril',
    ],
  },
  {
    version: 'V.39',
    fecha: '19/08/26',
    cambios: [
      'Herramienta interna para revisar la base: verifica que no haya insumos con dos precios vigentes, facturas cargadas dos veces, platos en carta sin precio, ni tablas desprotegidas',
    ],
  },
  {
    version: 'V.38',
    fecha: '19/08/26',
    cambios: [
      'Nueva sección "Bebidas" en la carta, para el café, las gaseosas, las aguas, las cervezas y el té',
      'Carga diaria: si elegís un insumo que ya tiene su receta —como el café— ahora te avisa y te ofrece cargar la receta, que es la que hace que la venta figure en el ranking',
      'El agua, la gaseosa y la cerveza dejaron de contarse como costo de cocina. El total de un servicio ahora se abre en Cocina y Bebidas',
    ],
  },
  {
    version: 'V.37',
    fecha: '19/08/26',
    cambios: [
      'Nueva pestaña "Ranking" en Análisis: qué se vendió, cuánto dejó cada producto y en qué cuadrante cae dentro de su sección (estrella, caballo, rompecabezas o perro)',
      'La matriz compara por contribución en pesos, no por food cost. Un plato con 40% de food cost que deja $15.000 rinde más que uno con 20% que deja $3.000',
      'Cada sección se compara contra sí misma: las entradas y los postres son porciones más chicas y contra los principales siempre saldrían perdiendo',
      'Los productos sin precio de carta aparecen marcados, así se ve qué falta cargar',
      'Ficha del menú: nuevo campo "¿Para cuántas personas?". Un menú para dos ahora se compara bien contra los platos individuales',
    ],
  },
  {
    version: 'V.36',
    fecha: '18/08/26',
    cambios: [
      'Ficha de un menú ejecutivo: nueva "Composición del costo", con gráfico de torta que muestra cuánto pesa el principal, la entrada y la bebida. Sirve para ver de un vistazo qué componente decide el costo del menú',
      'En la carga diaria, los tipos Receta, Ejecutivo y Trago aparecían en negro mientras Insumo y Vino tenían color. Ahora los seis tipos se distinguen por color',
    ],
  },
  {
    version: 'V.35',
    fecha: '17/08/26',
    cambios: [
      'Se sacaron los emojis de toda la app, salvo donde el icono realmente ayuda: en la carga de ventas siguen el sol, la luna y los eventos, porque ahí permiten encontrar el campo sin leer',
      'La referencia del semáforo en Histórico ahora usa los mismos colores que la tabla. Antes mostraba tildes y cruces que no aparecían en ninguna fila',
      'Los estados de la carga diaria (Confirmado, Borrador, Sin carga) ahora se distinguen por color',
    ],
  },
  {
    version: 'V.34',
    fecha: '17/08/26',
    cambios: [
      'Los colores de la app, los PDF y los Excel ahora salen del mismo lugar. El naranja de la pantalla y el de los archivos descargados eran distintos entre sí y no coincidían con el de la app',
      'Gráfico de compras por categoría: cuando había ocho rubros, dos porciones salían del mismo color y no se podían distinguir',
    ],
  },
  {
    version: 'V.33',
    fecha: '16/08/26',
    cambios: [
      'Dashboard: las compras de la semana daban $0 los domingos. El sistema contaba la semana de domingo a sábado, distinto al resto de las pantallas — ahora va de lunes a domingo en todos lados',
      'Cifras del mes: ahora compara el mismo tramo de los dos meses (por ejemplo del 1 al 16 de agosto contra el 1 al 16 de julio). Antes comparaba el mes en curso contra el mes anterior completo, así que siempre parecía que habías comprado y vendido menos',
      'El último día del mes la comparación pasa sola a mes completo contra mes completo',
    ],
  },
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
