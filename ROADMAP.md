# Roadmap — Recetas Tero

Mapa del sistema y camino a seguir. Dos partes:
1. **El mapa** — qué hay hoy y cómo se conecta (para no perderse al tocar algo).
2. **El camino** — qué sigue, en tres horizontes.

**Cómo se mantiene:** cada vez que se agrega una entrada al `CHANGELOG` de `src/lib/version.ts`
para un push, se actualiza también este archivo (mover el item hecho, subir uno de *Próximo*
a *Ahora*). Si no se toca junto con el changelog, este documento muere.

Sin fechas a propósito: las estimaciones no se cumplen y le hacen perder credibilidad al mapa.

---

## 1. El mapa: qué hay hoy

### Flujo del dato (el circuito que sostiene todo)

```
Órdenes de compra  →  Facturas  →  precio del insumo  →  costo de la receta  →  carta / margen
                                          ↑
                                   Comparador de precios
                                   Importación de vinos

Consumo real (Análisis)  ┐
                         ├→  food cost real
Ventas del día (Ventas)  ┘
```

**Regla de oro del sistema:** el precio de un insumo sale siempre de la **última factura
registrada**. Todo lo demás (costo de recetas, márgenes, carta) se deriva de ahí por triggers
en Supabase. Si el precio entra mal, se propaga a todo el sistema en silencio.

> 📄 El detalle completo del costeo —fórmula del C. Final, qué dispara cada recálculo, qué
> pantalla recalcula y cuál lee de la tabla— está en **`docs/SISTEMA-COSTOS.md`**.
> Leerlo antes de tocar costos, precios o recetas.

### Módulos

| Módulo | Para qué sirve |
|---|---|
| **Inicio** | Panel de entrada: KPIs de la semana, alertas de variación de precios, compras por categoría y **Cifras del mes** — ventas, compras, margen bruto e incidencia teórica y real contra el mes anterior (V.32) |
| **Insumos** | Ingredientes: unidad, categoría, IVA, merma, presentaciones. Acceso a Proveedores y al Comparador de precios |
| **Vinos** | Carta de vinos con importación de listas de precios desde Excel de bodega (matching por código y cepa) |
| **Elaboraciones** | Sub-recetas (bases) que se usan como ingrediente dentro de las recetas |
| **Recetas** | Platos: ingredientes, costo, margen, precio de venta, foto |
| **Tragos** | Coctelería con costos y beverage cost |
| **Carta** | Carta editorial en HTML + QR al menú digital público (`/menu`). Exporta a Excel lo que está en carta y lo que quedó afuera. Desde acá se llega a Menús ejecutivos y especiales |
| **Menús ejecutivos** | Menú del día: entrada + principal + bebida. La ficha muestra la **Composición del costo** (V.36) — torta por componente, coloreada según el papel (principal, entrada, bebida) y con un matiz por porción, porque un menú de parrilla tiene siete componentes que son todos principal. Sirve para ver qué componente decide el costo: en Menu Pescados el salmón es el 75% |
| **Órdenes de Compra** | Pedidos a proveedores, con PDF |
| **Facturas** | Facturas de compra: alimentan el precio de cada insumo. Soportan descuentos y notas de crédito. Solapa **Resumen semanal** (V.26): faltantes, cambios de precio, agregados sin pedir y órdenes sin factura, con notas por línea y PDF |
| **Ventas** | Carga diaria de ventas. **Nivel grueso:** ventas vs compras del período |
| **Análisis** | Carga del consumo real por servicio: insumos, elaboraciones, recetas, menús ejecutivos, tragos y vinos, con el costo separado en Cocina y Barra (V.23). **Nivel fino:** consumo real vs ventas, incidencia por insumo. Desde Resumen se baja la planilla de pedido de la semana, con la cantidad **a comprar** ajustada por merma (V.30) |
| **Estadísticas** | Dashboard consolidado (6 pestañas: las 4 de compras y precios, más **Cierre de mes** (V.25) y **ABC de insumos** (V.28)) |
| **Inventario** | Hojas de control de stock. **Pausado a propósito** — ver Decisiones tomadas |
| **Papelera** | Recuperación de items borrados (soft delete vía campo `activo`) |

### Convenciones que no se negocian

- Soft delete con campo `activo`, nunca borrado físico.
- Números siempre con `font-mono` (JetBrains Mono) para alineación tabular.
- Formato argentino: `1.234,56` y fechas `DD/MM/YYYY`.
- **Inputs numéricos editables:** mientras el campo está en foco debe mostrar el *texto* que se
  está tipeando, y recién convertir a número en el `blur`. Si el input muestra directamente el
  número del estado, la coma se borra sola al escribirla y no se pueden cargar decimales.
  Ya pasó dos veces (editar OC en mayo, editar factura en V.18) — revisar esto en cualquier
  pantalla nueva con cantidades o precios editables.
- **Nombre de ítem clickeable:** en las tablas, el nombre abre la vista de detalle (verde +
  subrayado en hover, ojo al costado). Usar el componente `ClickableItemName` de
  `src/components/ui/` — no reescribir la lógica inline. Ya se usa en En Carta, Recetas y
  Elaboraciones (V.19); el texto secundario en gris va **fuera** del área clickeable.
- Toda tabla nueva en Supabase: GRANT + RLS + policy (ver `CLAUDE.md` global).
  **`anon` no recibe nada por defecto** — la plantilla vieja incluía `grant select ... to anon`
  y eso dejó 22 tablas legibles sin login hasta el 13/08/26. Si una página pública necesita
  datos, se concede **columna por columna**.
- **Insumos y vinos conviven en las mismas líneas** (`factura_items`, `orden_compra_items`):
  un vino tiene `insumo_id` en `null` y `vino_id` cargado. Nunca emparejar por `insumo_id`
  solo: `null === null` es verdadero y todos los vinos matchean entre sí. Usar `claveItem()`
  de `src/lib/auditoria-semanal.ts`, que devuelve `i:<uuid>` o `v:<uuid>`. Ya rompió dos
  veces: el semáforo de facturas y la detección de comprobantes duplicados.
- **La cantidad de una receta es el NETO que va al plato, no lo que hay que comprar.**
  La merma se aplica al precio (`÷ (1 − merma)`), no a la cantidad: si se aplicara a las dos
  se contaría dos veces. Para saber cuánto pedir hay que dividir el neto por el factor de
  aprovechamiento — con 25% de merma, 18,40 kg netos son 24,53 kg de compra. Cualquier
  pantalla que sirva para armar pedidos tiene que hacer esa conversión o induce a pedir de menos.
- **Los invariantes los garantiza la base, no el código.** Un insumo tiene exactamente
  un precio vigente, y eso lo asegura un índice único parcial, no los triggers. Hasta V.31
  la única defensa eran los triggers: cuando uno falló, el dato quedó corrupto en silencio
  y las recetas costearon con un precio viejo durante semanas. Donde haya una regla del
  tipo "uno solo" o "siempre suma cero", conviene que la base la imponga.
- **El título de página no lleva clases de tipografía.** Se escribe `<h1>Insumos</h1>` a secas:
  el estilo vive una sola vez en `globals.css` (Instrument Serif, peso 400, 34px). Antes cada
  pantalla tenía su propio tamaño y había 34 títulos distintos. Instrument Serif tiene un solo
  peso, así que `font-bold` la sintetiza y ensucia el trazo — la jerarquía la da el tamaño.
- **El color no informa, salvo en el semáforo y en los deltas.** Las categorías y los estados
  se distinguen por tipografía y posición. La terracota queda para alertas y un CTA por pantalla.
- **Todo lo que lea muchas filas va paginado.** PostgREST corta en 1000 sin avisar y sin
  error. `factura_items` ya pasó las 2300 y `precios_insumo` las 3500. Ya escondió 63
  variaciones de precio (V.22).
- Antes de cada push: changelog → build → diff → confirmación.

---

## 2. El camino

### Ahora

- **Informes.** El plan son ocho; van cinco. Hechos: **Cierre de mes** (V.25),
  **Resumen semanal de compras** (V.26–V.27) y **ABC de insumos** (V.28). Queda uno con
  los datos ya disponibles:
  - **Proveedor × variación** — media pantalla ya existe en Estadísticas.

  Y tres que **no dependen de programar sino de qué se carga**, así que están bloqueados:
  - *Rentabilidad por sección*: el sistema no registra qué plato se vendió. `ventas_diarias`
    guarda un total por turno y nada más.
  - *Costo por cubierto ejecutivo vs a la carta*: `Servicio` es `mediodia | noche | eventos`,
    no existe esa distinción.
  - *Cocina vs barra*: el **costo** ya se separa desde V.23, pero la **venta de barra** no se
    carga, así que se puede mostrar cuánto costó cada área pero no su margen.

- **Backup a Excel.** Hecho en V.26: las seis pantallas maestras bajan su Excel.
  **Lo que NO se va a construir es "Restaurar backup"**: Supabase ya hace backups diarios y
  point-in-time, un JSON restaurado desde el navegador es estrictamente peor, escribiría sobre
  tablas con triggers en orden impredecible, y no se puede probar salvo el día de la
  emergencia. Exportar sí, restaurar desde la app no.

- **Cerrar el módulo Análisis.** Es el más nuevo del sistema. Ya están la carga del consumo,
  la descarga en PDF del servicio (V.17) y los cinco tipos de carga con separación
  Cocina / Barra (V.23), con los seis tipos de carga: insumo, elaboración, receta, menú
  ejecutivo, trago y vino. Falta:
  - **Incidencia separada Cocina / Barra.** El costo ya se guarda separado en
    `consumo_diario.costo_cocina` / `costo_barra`, pero la venta no: `ventas_diarias` solo
    tiene el total por servicio. Para mostrar las dos incidencias hay que cargar la venta de
    barra todos los días — decisión de rutina, no técnica.
  - Que las solapas **Resumen** e **Histórico** muestren la evolución en el tiempo. Sin eso se
    carga el consumo todos los días y no se ve la tendencia, que es el motivo por el que
    existe el módulo.

- **Propagación a menús ejecutivos.** Detectado el 08/08/26: cuando cambia el precio de un
  insumo, el costo se propaga bien hasta el plato, pero **no llega a los menús ejecutivos**.
  `menu_ejecutivo_items.costo_linea` y `menus_ejecutivos.costo_total` quedan con el valor
  viejo hasta que alguien abre el menú y lo guarda. Al 08/08 eran 8 de 17 menús, con hasta 5%
  de desvío; los 84 platos y las 79 elaboraciones, en cambio, estaban exactos — falla solo el
  último eslabón.

  Síntoma visible: la **ficha** del menú y la **lista** de menús muestran números distintos
  del mismo menú (la ficha recalcula, la lista lee la tabla). Ejemplo del 08/08:
  "Sugerencia Pescados Noche", $11.943 en la ficha contra $12.264 en la lista.

  V.23 no lo arregla, pero **se protege**: el buscador de Análisis reconstruye el costo desde
  los insumos en vez de leer la tabla, así el consumo no hereda el desvío. Falta el arreglo de
  fondo, que es un trigger `plato → menú ejecutivo`, más corregir la lista para que muestre lo
  mismo que la ficha.

- **Sistema visual, por capas.** Hechas: el **Sidebar agrupado** por áreas (Compras, Cocina,
  Barra, Operación, Informes), las **tipografías** (Instrument Serif / Instrument Sans /
  IBM Plex Mono), el Dashboard como piloto del nuevo formato, y el **módulo de colores**
  (V.34).

  Sobre el módulo de colores, porque la lección no es la que esperábamos: la terracota estaba
  escrita a mano en ~25 lugares con **cuatro** valores distintos (`#C4704B` en componentes,
  `#A35234` en los PDF y el Excel, `#B5613E` en la config, y una cuarta copia muerta en las
  variables CSS de `globals.css`). Ahora sale toda de `src/lib/colores.ts`, que exporta
  `rgb()` para jsPDF y `argb()` para exceljs, y del que también lee `tailwind.config.ts`.
  **El cambio no se ve**: la diferencia entre el valor viejo y el nuevo es ΔE 5,7, y en la
  pantalla la terracota cae sobre bordes de 1px y texto chico. Se nota solo en áreas llenas
  —el encabezado del Excel, el header del PDF de órdenes—. El valor del módulo es que pantalla
  y archivo no vuelvan a separarse, no que hoy se vea mejor.

  **Limpieza de iconos, hecha (V.35).** Cero emojis en la interfaz. La regla que se
  aplicó, y que conviene mantener: *un icono reemplaza una palabra, no la acompaña.*
  Casi todos los casos eran del segundo tipo — `{SERVICIO_ICON[s]} {SERVICIO_LABEL[s]}`
  pintaba "🌞 Mediodía", con el emoji al lado de la palabra que ya lo decía. Se quitó
  `SERVICIO_ICON` entero (7 pantallas).

  **La excepción, y vale como criterio.** En `ventas/CargaDiaria` los iconos se
  quitaron primero y se repusieron: son tres campos idénticos que se cargan todos los
  días, y ahí el glifo deja de ser decoración y pasa a ser marca de posición —
  encontrás el campo sin leer la etiqueta. La regla completa es entonces: *un icono
  reemplaza una palabra, o ayuda a ubicarse entre varios elementos iguales; si no hace
  ninguna de las dos, se va.* Por eso quedaron en el formulario y en las tarjetas de
  mobile (con Lucide, no con los emojis originales), y NO en la tabla de cubiertos de
  `DashboardIncidencia`, donde ya se lee la fila entera, ni en los `<select>` de
  Análisis, donde además no se puede renderizar un icono dentro de un `<option>`.
  El otro icono que sobrevivió es el `<Check/>` de "Mapeo guardado" en vinos, que
  confirma un estado en vez de repetir el texto.

  Dos hallazgos del paso: la leyenda del semáforo en los dos `Historico` decía
  "✅ ≤30% · ⚠️ 31-35% · ❌ >35%" mientras la tabla pintaba badges de color —
  enseñaba un código que en las filas no existía. Ahora la leyenda usa los mismos
  badges, y en `ventas/Historico` el mapeo estado→clase quedó en una sola constante
  (`BADGE_ESTADO`) que leen la leyenda y la columna, para que no se separen.
  Los `⚠️` de los comentarios de código (`auditoria-semanal.ts`, `exportaciones.ts`,
  `types/analisis.ts`) se dejaron: no son interfaz y ahí funcionan.

  **Los badges de tipo nunca tuvieron color, y no era de diseño (V.36).** `TIPO_CONFIG`
  define `badgeClass` para los seis tipos desde el principio, pero `tailwind.config.ts`
  no escaneaba `src/types/`, así que 11 clases se purgaban del CSS. Insumo y Vino se
  veían bien de casualidad —sus colores aparecen en otros componentes que sí se
  escaneaban— y Receta, Ejecutivo y Trago salían en negro. Está documentado como la
  quinta trampa en `CLAUDE.md`, porque es una familia de bug que no da error.

  Falta:
  - **Migrar la paleta**: los componentes usan `gray-*` y la paleta estándar de Tailwind en el
    93% de los casos, así que cambiar los tokens de la config no alcanza — hay que reescribir
    las clases. **Postergado a propósito** (V.34): es el mismo perfil que el módulo de
    colores —mucho movimiento de archivos, diferencia imperceptible— y no paga sin un motivo
    concreto. Si se hace, por módulo y con la app al lado, nunca con un reemplazo global.
  - **Nota**: `colores.ts` y `tailwind.config.ts` todavía discrepan en 7 valores
    (success, warning, danger, cream, forestLight, inkLight, sand), con ΔE entre 1,9 y 6,5.
    Se dejó así a propósito: no hay una sola pantalla donde los dos valores convivan
    —`PALETA.success` solo se usa en `estadisticas/page.tsx`, y `text-success` en `carta`,
    `Button`, `Input` y `Select`—, así que unificarlos cambiaría colores sin arreglar nada.
    Si algún día una pantalla usa las dos vías, ahí sí hay que unificar primero.

### Próximo

- **Blindar los triggers de Supabase.** *Primer paso hecho en V.20:* el sistema de costeo
  quedó documentado en `docs/SISTEMA-COSTOS.md` sobre el estado real de la base, la fórmula
  vive en un solo lugar por capa, y `supabase-trigger-actualizar-costos.sql` está marcado
  como obsoleto. **Falta el resto:** los triggers de `factura_items` (son cuatro, más el de
  anulación) siguen sin estar versionados, y son los que más regresiones causaron.
  Costó tres incidentes llegar hasta acá: trigger de vinos, descuento en facturas (V.16) y
  fórmula de merma (V.20). Esta última convirtió un cambio de 10 minutos en una hora, porque
  el repo describía funciones inexistentes.

- **Objetivo de food cost por categoría.** Hoy Análisis dice *cuánto* se consumió, pero no si
  está bien o mal. Definir un target por categoría convierte el dato en alerta accionable.

### Más adelante

- **Inventario conectado al consumo.** Reactivar cuando haya suficiente carga de datos de venta
  para que el stock se concilie contra el consumo real. *Condición de disparo: varios meses de
  ventas y consumo cargados de forma consistente.*
- **Mobile para cocina.** La carga de consumo se hace parada en la cocina, con el celular.
- **Nombre clickeable en las tarjetas de celular** de Recetas y Elaboraciones. En V.19 se aplicó
  solo a las tablas (escritorio): en touch no hay hover, así que el nombre no daría ninguna
  pista visual y el ojo nunca aparecería. Las tarjetas conservan su botón "Ver". Si se hace,
  el ojo tiene que quedar siempre visible, no en hover.
- **Alertas proactivas de aumentos de precio**, más allá del panel de Inicio.
- **Accesos directos** a Proveedores y Menús en el sidebar (hoy se llega desde Insumos y Carta).

---

## 3. Decisiones tomadas

Registradas para no volver a discutirlas.

- **Ventas y Análisis no se unifican.** Son dos niveles de zoom sobre el mismo negocio:
  Ventas es la foto gruesa (ventas vs compras), Análisis es el detalle fino (consumo real de
  cocina vs ventas, insumo por insumo). Que ambos hablen de food cost no los hace redundantes.

- **Inventario está pausado a propósito**, no abandonado. Espera masa crítica de datos de venta
  para que la conciliación con el consumo tenga sentido.

- **La factura 00004-00118609 (El triunfo, 26/01/26) queda con sus items duplicados.**
  Enero fue el mes de arranque del sistema y esas cargas fueron de prueba. Es la única
  que quedó con el problema que se corrigió en V.21; no se limpia a propósito. Si una
  auditoría futura la detecta, no es un bug nuevo.

- **Este roadmap cubre solo recetas-tero.** Los otros sistemas (Admin Tero, Eventos, Faisán,
  Bodega Catena) son proyectos independientes, con su propia base de datos. Integrarlos no está
  en el alcance de este documento.
