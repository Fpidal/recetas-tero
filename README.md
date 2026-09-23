# Recetas Tero

Sistema de gestión de recetas, costos y menús para restaurante. Permite administrar insumos, calcular costos de platos, gestionar proveedores, crear órdenes de compra, controlar inventario y generar reportes.

## Tech Stack

| Categoría | Tecnología |
|-----------|------------|
| **Framework** | Next.js 14.2.5 (App Router) |
| **Lenguaje** | TypeScript 5.5.4 |
| **Base de datos** | Supabase (PostgreSQL) |
| **Estilos** | Tailwind CSS 3.4.7 |
| **Tipografías** | Instrument Sans (interfaz), IBM Plex Mono (cifras), Instrument Serif (logo y títulos) |
| **Iconos** | Lucide React |
| **PDF** | jsPDF + jspdf-autotable |
| **Excel** | ExcelJS (escritura, con estilos) · SheetJS/xlsx (solo lectura de listas de bodegas) |
| **Gráficos** | Recharts |
| **Deploy** | Vercel |

## Sistema de Diseño

### Tipografía

| Rol | Fuente | Dónde |
|---|---|---|
| **Display** | Instrument Serif (400) | Logo del sidebar y títulos de página, y nada más |
| **Interfaz** | Instrument Sans | Todo el resto: navegación, labels, botones, tablas |
| **Cifras** | IBM Plex Mono | Toda cifra: montos, porcentajes, fechas, cantidades |

Reglas:

- La serif aparece **solo** en el logo y en los títulos de página. Si se usara también en subtítulos o botones dejaría de señalar nada.
- Instrument Serif tiene un único peso (400). Poner `font-bold` la sintetiza y ensucia el trazo: la jerarquía la da el tamaño.
- El `<h1>` se estila una sola vez, en `globals.css`. Las páginas escriben `<h1>Insumos</h1>` sin clases de tipografía, así todos los títulos quedan iguales.
- Todo número lleva `font-mono`, incluso dentro de un párrafo. Las columnas numéricas van alineadas a la derecha.


### Colores

La paleta de colores está definida en `tailwind.config.ts` con variantes para:
- **Primary**: Tonos principales de la marca
- **Gray**: Escala de grises para texto y fondos
- **Semánticos**: Green (éxito), Yellow (warning), Red (danger)

## Estructura de Carpetas

```
src/
├── app/                          # Rutas (App Router)
│   ├── carta/                    # Carta/Menú del restaurante
│   ├── estadisticas/             # Dashboard de estadísticas
│   ├── facturas/                 # Gestión de facturas de proveedores
│   │   ├── nueva/
│   │   └── [id]/editar/
│   ├── insumos/                  # Gestión de insumos/ingredientes
│   ├── inventario/               # Control de inventario
│   ├── menus-ejecutivos/         # Menús ejecutivos (accesible desde Carta)
│   │   ├── nuevo/
│   │   └── [id]/
│   ├── menus-especiales/         # Menús especiales (accesible desde Carta)
│   │   ├── nuevo/
│   │   └── [id]/
│   ├── ordenes-compra/           # Órdenes de compra a proveedores
│   │   ├── nueva/
│   │   └── [id]/editar/
│   ├── papelera/                 # Items eliminados (soft delete)
│   ├── platos/                   # Recetas y platos
│   │   ├── nuevo/
│   │   └── [id]/
│   ├── proveedores/              # Gestión de proveedores
│   ├── recetas-base/             # Recetas base (sub-recetas)
│   │   ├── nuevo/
│   │   └── [id]/
│   ├── ventas/                   # Ventas diarias e incidencia
│   │   └── components/
│   ├── analisis/                 # Carga de consumo, food cost real
│   │   └── components/
│   └── vinos/                    # Gestión de vinos
│
├── components/
│   ├── ui/                       # Componentes UI reutilizables
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Select.tsx
│   │   ├── Table.tsx
│   │   └── index.ts
│   ├── inventario/
│   │   └── HojasControl.tsx
│   ├── insumos/
│   │   └── ComparadorPrecios.tsx
│   └── Sidebar.tsx               # Navegación lateral
│
├── lib/
│   ├── supabase.ts               # Cliente Supabase
│   ├── formato-numeros.ts        # Formateo de números/moneda (AR)
│   ├── oc-numero.ts              # Numeración de órdenes de compra
│   ├── ventas-queries.ts         # Queries y cálculos del módulo Ventas
│   ├── consumo-queries.ts        # Queries y desglose del módulo Análisis
│   ├── generar-pdf-carta.ts      # Generador PDF de carta
│   ├── generar-pdf-carta-vinos.ts
│   ├── generar-pdf-oc.ts
│   ├── generar-pdf-comparacion.ts
│   └── generar-pdf-stock.ts
│
└── types/
    ├── database.ts               # Tipos TypeScript para la DB
    ├── ventas.ts                 # Tipos del módulo Ventas
    └── analisis.ts               # Tipos del módulo Análisis
```

## Módulos Principales

### Insumos (`/insumos`)
Gestión de ingredientes con categorías, unidades de medida, IVA configurable (0%, 10%, 21%), merma y cantidad por paquete.

### Proveedores (`/proveedores`)
CRUD de proveedores con datos de contacto, situación IVA, condiciones de pago, datos bancarios.

### Vinos (`/vinos`)
Gestión especializada de vinos con bodega, varietal, precio lista y descuentos.

**Carta de vinos en PDF** (V.55), en dos versiones: *con precios* y *sin precios*. Fondo blanco,
el logo de Tero como cabecera, precio por botella, y los vinos ordenados de mayor a menor precio
dentro de cada sección. Las secciones salen de la **categoría de la ficha** del vino (Tintos,
Blancos, Rosados, Espumantes, Dulces) y de nada más: si un vino aparece donde no va, se corrige
la categoría en la pantalla, nunca en el generador.

> El costo de la botella sale de la **lista de la bodega**, no de la factura (ver `CLAUDE.md`,
> trampa 9). El precio que se imprime en la carta es otra cosa: `carta_vinos.precio_carta`, que
> es lo que se le cobra al cliente.

### Recetas Base (`/recetas-base`)
Sub-recetas reutilizables (salsas, guarniciones). Cálculo automático de costo por porción.

### Platos (`/platos`)
Recetas con ingredientes, cálculo automático de costo total, margen y precio de venta.

### Carta (`/carta`)
Vista unificada con 4 tabs:
- **En Carta / Fuera de Carta**: Platos activos e inactivos con modal de preview
- **Ejecutivos**: Menús del día con secciones (Parrilla, Entrada, Fondo, Postre, Jugo)
- **Especiales**: Menús para eventos con presupuestación

Navegación inteligente: al volver de editar un menú, se mantiene la tab activa.
Generación de PDF de carta lista para imprimir.

### Órdenes de Compra (`/ordenes-compra`)
Creación de OC con numeración automática, estados (borrador, enviada, recibida, parcial, cancelada) y generación de PDF.

**OC Recibida con comparación vs Factura:**
- Muestra cantidades y precios reales de la factura
- Badges de estado: Completo, Parcial (X de Y), No entregado
- Diferencia de precio con porcentaje (+X% / -X%)
- Total calculado desde valores de factura
- PDF con badge "RECIBIDA", comparación de precios y diferencia total
- Generación automática de OC de faltantes

### Facturas (`/facturas`)
Dos solapas:

- **Facturas** — registro de facturas de proveedores, con actualización automática de precios de insumos y soporte para Notas de Crédito. El semáforo compara cada factura contra su orden de compra: faltantes, cantidad menor, precio distinto y agregados sin pedir. En el detalle se puede comentar cada ítem (*"sin stock, viene el jueves"*): ese comentario se lee después en el resumen semanal.
- **Resumen semanal** — el pantallazo de la semana cerrada, pensado para la reunión con el encargado de compras. Cinco bloques ordenados por plata: lo que no llegó completo, los cambios de precio (avisando si además cambió el proveedor), lo facturado a distinto precio del pedido, lo que llegó sin pedirse, y las órdenes que siguen sin factura. Cada línea acepta una nota, y todo se baja en PDF.

### Inventario (`/inventario`)
Control de stock con hojas de control diario. Las NC restan del inventario automáticamente.

> **No hay tabla de stock.** El stock sale siempre de la cuenta *último conteo + compras −
> consumo* (`src/lib/inventario.ts`), justamente para que no pueda quedar desfasado. Este README
> listó `inventario_stock` y `hojas_control_inventario` como tablas hasta el 23/09/26 y **nunca
> existieron**: la misma invención que tenía `CLAUDE.md` y que costó $60 millones de mercadería
> imaginaria en pantalla.

### Estadísticas (`/estadisticas`)
Dashboard analítico en cinco solapas:
- Compras semanales por insumo/proveedor
- Comparación mensual
- Compras por proveedor
- Variación de precios, con alertas de aumentos
- **ABC de insumos** — Pareto del gasto: qué insumos son el 80% de las compras (clase A), cuáles el 15% (B) y cuáles el 5% restante (C), con la volatilidad de precio de cada uno. Sirve tanto para saber qué vigilar como para dejar de perder tiempo con lo que no mueve la aguja.
- **Cierre de mes** — la foto del mes: compras, ventas, incidencia real, cubiertos y ticket promedio contra el mes anterior, más compras por rubro, semana por semana, top 10 de insumos y ventas por servicio. Se baja en un PDF de una carilla.

### Ventas (`/ventas`)
Carga diaria de ventas y cubiertos, con análisis de incidencia (food cost real). Vista en 3 solapas:

- **Carga diaria**: Form con ventas y cubiertos por servicio (mediodía / noche / eventos). Confirmación de reemplazo cuando la fecha ya existe. Tabla con últimos 15 días editables.
- **Incidencia**: KPIs del período (Ventas, Compras, **% Incidencia con semáforo**, Margen). Análisis de cubiertos con ticket promedio por servicio. Gráfico de torta por servicio y línea de tendencia con objetivo del 30%. Toggle Mensual / Semanal con navegación.
- **Histórico**: Gráfico de barras Ventas vs Compras + tabla detallada con incidencia, cubiertos, ticket promedio y margen. Toggle Mensual / Semanal.

**Cálculo de incidencia**: `(suma de facturas activas / ventas totales) × 100`. Objetivo: ≤ 30%. Semáforo: ✅ ≤30% / ⚠️ 31-35% / ❌ >35%.

### Análisis (`/analisis`)
Módulo de **food cost real** basado en lo realmente consumido por cocina al final de cada servicio (en vez de lo facturado por proveedores). Vista en 5 solapas:

- **Carga diaria**: cocina carga el consumo real del servicio (mediodía/noche/eventos). Soporta seis tipos de items mezclados:
  - **Insumos** (pesados sueltos: ej. pollo, papas)
  - **Elaboraciones** (recetas base: ej. salsa criolla, puré)
  - **Recetas** (platos: ej. milanesa, lomo a la parrilla)
  - **Menús ejecutivos** (un menú = un cubierto)
  - **Tragos** y **Vinos** (se imputan a Barra, no a Cocina)

  Buscador por fragmentos sueltos e ignorando acentos ("sal res mal" encuentra "Reserva Malbec (Salentein)"), todos los costos con IVA incluido. El costo del servicio se muestra separado en **Cocina** y **Barra**.
- **Consumo diario**: vista informativa que **desglosa recetas y elaboraciones a nivel insumo** (ej: "12 milanesas + 2,5 kg pollo" → "Bola de lomo: 1,8 kg, Pollo: 2,5 kg, ..."). Botón "Confirmar consumo" como paso previo al descuento de stock.
- **Incidencia**: carga manual de venta + cubiertos por día/servicio. Cruza automático con el costo de cocina. KPIs: ventas, costo real, **% Incidencia REAL** con semáforo, margen bruto. Detalle día a día.
- **Resumen**: consumo de la semana desglosado a nivel insumo y agrupado por rubro, con descarga en PDF (ver abajo).
- **Histórico**: evolución mensual de la incidencia real (últimos 6 meses) con gráfico de tendencia y línea de objetivo, y el **muestreo** de cada mes.

> **La incidencia real se calcula solo sobre los servicios con consumo cargado**, nunca sobre la venta total del período: dividir el costo de 9 servicios por el ingreso de 11 da un número más bajo que el real. Por eso el muestreo (`9 de 11`) acompaña siempre al porcentaje.

**Diferencia con Ventas**: el módulo Ventas calcula incidencia *teórica* (facturas / ventas). Análisis calcula *real* (consumo cocina / ventas), que es el food cost efectivo del día.

Desde el **Resumen** se baja el consumo de la semana en PDF, agrupado por rubro y pensado como planilla de pedido: incluye una columna **A comprar** que ajusta el consumo neto por la merma de cada insumo, y una columna en blanco para anotar a mano.


### Papelera (`/papelera`)
Recuperación de items eliminados (soft delete).

## Correr el Proyecto Localmente

### Requisitos
- Node.js 18+
- npm o yarn
- Cuenta en Supabase

### Instalación

```bash
# Clonar el repositorio
git clone git@github.com:Fpidal/recetas-tero.git
cd recetas-tero

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase

# Ejecutar en desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

### Scripts Disponibles

```bash
npm run dev        # Desarrollo en localhost:3000
npm run build      # Build de producción
npm run start      # Iniciar servidor de producción
npm run lint       # Ejecutar ESLint
npm run seed-demo  # Cargar datos de demostración
npm run dev:demo   # Desarrollo contra la BASE DE DEMO (puerto 3001)
npm run consultar  # Consultar la base en SOLO LECTURA (rol lector_analisis)
```

```bash
npm run consultar -- chequeos            # los invariantes del sistema
npm run consultar -- --sql "SELECT ..."  # consulta libre
npm run consultar -- --sql "..." --json  # salida JSON
```

> `dev:demo` reemplaza temporalmente `.env.local` por `.env.demo` y lo restaura al salir.
> Es la única forma de trabajar sin tocar la base de producción: `npm run dev` apunta a la base real.

## Variables de Entorno

Crear un archivo `.env.local` en la raíz del proyecto:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### Obtener las credenciales de Supabase

1. Ir a [supabase.com](https://supabase.com) y crear un proyecto
2. En el dashboard, ir a **Settings > API**
3. Copiar la **URL** y la **anon/public key**

## Base de Datos

El schema de la base de datos está en los archivos `supabase-*.sql`. Para configurar una nueva instancia:

1. Crear un proyecto en Supabase
2. Ir al **SQL Editor**
3. Ejecutar `supabase-schema.sql` para crear las tablas principales
4. Ejecutar los demás scripts SQL según sea necesario

### Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `insumos` | Ingredientes con categoría, unidad, IVA |
| `proveedores` | Datos de proveedores |
| `precios_insumo` | Historial de precios por insumo |
| `platos` | Recetas con margen y precio |
| `plato_insumos` | Ingredientes de cada plato |
| `recetas_base` | Sub-recetas reutilizables |
| `facturas_proveedor` | Facturas y Notas de Crédito |
| `factura_items` | Items de cada factura |
| `ordenes_compra` | Órdenes de compra |
| `orden_compra_items` | Items de cada OC |
| `menus_ejecutivos` | Menús del día |
| `menus_especiales` | Menús para eventos |
| `vinos` | Vinos: bodega, cepa, zona, categoría, precio de caja y descuento |
| `carta_vinos` | Qué vinos están en carta, con su `precio_carta` y si son recomendados |
| `inventario_conteos` | Cada vez que se cuenta la cámara |
| `inventario_conteo_items` | Lo contado de cada insumo, contra lo que decía el sistema |
| `ventas_diarias` | Ventas y cubiertos por día (mediodía/noche/eventos) |
| `consumo_diario` | Cabecera de carga de consumo real por día/servicio |
| `consumo_items` | Items consumidos (insumo/elaboración/receta) con costo IVA inc. |

## Características

- Cálculo automático de costos por plato
- IVA configurable por insumo (0%, 10%, 21%)
- Historial de precios con seguimiento de cambios
- Comparador de precios entre proveedores
- Órdenes de compra con numeración automática y PDF
- **OC Recibida con comparación vs Factura**:
  - Visualización de diferencias (cantidad y precio)
  - Badges de estado (Completo/Parcial/No entregado)
  - PDF para reclamos con diferencias en rojo
  - Generación automática de OC de faltantes
- Facturas con actualización automática de precios
- Notas de Crédito que restan stock y compras
- Menús ejecutivos y especiales con costeo
- **Carta unificada con 4 tabs** (En Carta, Fuera de Carta, Ejecutivos, Especiales)
- Modal de preview de recetas
- Carta/Menú en PDF lista para imprimir
- Control de inventario con hojas de control
- Dashboard de estadísticas con gráficos
- **Módulo de Ventas e Incidencia**:
  - Carga diaria por servicio (mediodía / noche / eventos)
  - Cubiertos por servicio con ticket promedio
  - % Incidencia (food cost teórico desde facturas) con objetivo del 30% y semáforo
  - Análisis Mensual y Semanal
  - Gráficos de tendencia y comparativos
- **Módulo Análisis (food cost real)**:
  - Carga de consumo diario por cocina (insumos + recetas + elaboraciones)
  - Buscador unificado con autocompletar
  - Desglose automático de recetas a nivel insumo
  - Incidencia REAL = consumo cocina / ventas
  - Vista de tendencia mensual
- Papelera con soft delete
- Formateo argentino completo:
  - Input decimal con coma (0,5 en lugar de 0.5)
  - Separador de miles con punto (1.000)
  - Fechas DD/MM/YYYY
- PWA instalable
- Diseño responsive (mobile-first)

## Convenciones

- **Soft delete**: Campo `activo` (boolean) en lugar de borrar registros
- **IVA**: Almacenado como decimal (0.21, 0.10, 0)
- **Formato de números**: Punto para miles, coma para decimales (1.234,56)
- **Formato de fechas**: DD/MM/YYYY
- **Variables de dominio**: En español (`precioVenta`, `costoInsumo`)
- **Lógica técnica**: En inglés
- **Tipografía numérica**: Todos los valores numéricos usan `font-mono` (IBM Plex Mono)

## Deploy

Vercel deploya solo desde `main` en GitHub. **El push es el deploy**: no hay que tocar nada en el panel.

```bash
git push origin main
```

### El remote va por SSH, y conviene que siga así

```
origin  git@github.com:Fpidal/recetas-tero.git
```

**No pasarlo a HTTPS.** Por HTTPS el push tiene que sacar un token del llavero de macOS, y
cualquier proceso sin terminal interactiva —un agente, un script, un hook de CI— muere con
`could not read Username for 'https://github.com'`. El commit queda en local y nadie se entera.

Lo traicionero es que **el `pull` sigue andando igual**: el repo es público, así que leer es
anónimo y sólo escribir pide credenciales. No aparece ningún error, todo parece normal, y el
trabajo simplemente no llega a GitHub.

Pasó el 23/09/26. El push falló por credenciales, el `pull` del arranque había funcionado sin
problema, y se le dio "Redeploy" a Vercel tres veces sobre el mismo código de siempre,
buscando el error en el deploy. Nunca estuvo ahí: los commits no habían salido de la máquina.

**Si un cambio no aparece en producción, verificar esto ANTES de mirar Vercel:**

```bash
git status -sb          # "[ahead N]" = nunca salió. El problema es acá.
git log origin/main -1  # el commit que GitHub tiene de verdad
git remote -v           # tiene que decir git@github.com, no https://
```

Si el remote quedó en HTTPS, se vuelve a SSH con:

```bash
git remote set-url origin git@github.com:Fpidal/recetas-tero.git
ssh -T git@github.com   # tiene que responder "Hi Fpidal!"
```

## Licencia

Proyecto privado - Tero Restó
