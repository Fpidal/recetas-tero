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
| **Inicio** | Panel de entrada: alertas de variación de precios (últimos 30 días) |
| **Insumos** | Ingredientes: unidad, categoría, IVA, merma, presentaciones. Acceso a Proveedores y al Comparador de precios |
| **Vinos** | Carta de vinos con importación de listas de precios desde Excel de bodega (matching por código y cepa) |
| **Elaboraciones** | Sub-recetas (bases) que se usan como ingrediente dentro de las recetas |
| **Recetas** | Platos: ingredientes, costo, margen, precio de venta, foto |
| **Tragos** | Coctelería con costos y beverage cost |
| **Carta** | Carta editorial en HTML + QR al menú digital público (`/menu`). Desde acá se llega a Menús ejecutivos y especiales |
| **Órdenes de Compra** | Pedidos a proveedores, con PDF |
| **Facturas** | Facturas de compra: alimentan el precio de cada insumo. Soportan descuentos y notas de crédito |
| **Ventas** | Carga diaria de ventas. **Nivel grueso:** ventas vs compras del período |
| **Análisis** | Carga del consumo real de cocina por servicio. **Nivel fino:** consumo real vs ventas, incidencia por insumo |
| **Estadísticas** | Dashboard consolidado (4 pestañas) |
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
- Antes de cada push: changelog → build → diff → confirmación.

---

## 2. El camino

### Ahora

- **Cerrar el módulo Análisis.** Es el más nuevo del sistema. Ya están la carga del consumo y
  la descarga en PDF del servicio (V.17). Falta que las solapas **Resumen** e **Histórico**
  muestren la evolución en el tiempo. Sin eso se carga el consumo todos los días y no se ve la
  tendencia, que es el motivo por el que existe el módulo.

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

- **Este roadmap cubre solo recetas-tero.** Los otros sistemas (Admin Tero, Eventos, Faisán,
  Bodega Catena) son proyectos independientes, con su propia base de datos. Integrarlos no está
  en el alcance de este documento.
