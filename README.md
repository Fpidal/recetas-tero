# Recetas Tero

Sistema de gestión de recetas, costos y menús para restaurante. Permite administrar insumos, calcular costos de platos, gestionar proveedores, crear órdenes de compra, controlar inventario y generar reportes.

## Tech Stack

| Categoría | Tecnología |
|-----------|------------|
| **Framework** | Next.js 14.2.5 (App Router) |
| **Lenguaje** | TypeScript 5.5.4 |
| **Base de datos** | Supabase (PostgreSQL) |
| **Estilos** | Tailwind CSS 3.4.7 |
| **Iconos** | Lucide React |
| **PDF** | jsPDF + jspdf-autotable |
| **Gráficos** | Recharts |
| **Deploy** | Vercel |

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
│   ├── generar-pdf-carta.ts      # Generador PDF de carta
│   ├── generar-pdf-carta-vinos.ts
│   ├── generar-pdf-oc.ts
│   ├── generar-pdf-comparacion.ts
│   └── generar-pdf-stock.ts
│
└── types/
    ├── database.ts               # Tipos TypeScript para la DB
    └── ventas.ts                 # Tipos del módulo Ventas
```

## Módulos Principales

### Insumos (`/insumos`)
Gestión de ingredientes con categorías, unidades de medida, IVA configurable (0%, 10%, 21%), merma y cantidad por paquete.

### Proveedores (`/proveedores`)
CRUD de proveedores con datos de contacto, situación IVA, condiciones de pago, datos bancarios.

### Vinos (`/vinos`)
Gestión especializada de vinos con bodega, varietal, precio lista y descuentos.

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
Registro de facturas de proveedores. Actualización automática de precios de insumos. Soporte para Notas de Crédito.

### Inventario (`/inventario`)
Control de stock con hojas de control diario. Las NC restan del inventario automáticamente.

### Estadísticas (`/estadisticas`)
Dashboard analítico con:
- Compras semanales por insumo/proveedor
- Comparador de precios histórico
- Variación de precios
- Alertas de aumentos

### Ventas (`/ventas`)
Carga diaria de ventas y cubiertos, con análisis de incidencia (food cost real). Vista en 3 solapas:

- **Carga diaria**: Form con ventas y cubiertos por servicio (mediodía / noche / eventos). Confirmación de reemplazo cuando la fecha ya existe. Tabla con últimos 15 días editables.
- **Incidencia**: KPIs del período (Ventas, Compras, **% Incidencia con semáforo**, Margen). Análisis de cubiertos con ticket promedio por servicio. Gráfico de torta por servicio y línea de tendencia con objetivo del 30%. Toggle Mensual / Semanal con navegación.
- **Histórico**: Gráfico de barras Ventas vs Compras + tabla detallada con incidencia, cubiertos, ticket promedio y margen. Toggle Mensual / Semanal.

**Cálculo de incidencia**: `(suma de facturas activas / ventas totales) × 100`. Objetivo: ≤ 30%. Semáforo: ✅ ≤30% / ⚠️ 31-35% / ❌ >35%.

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
git clone https://github.com/tu-usuario/recetas-tero.git
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
```

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
| `inventario_stock` | Stock actual |
| `ventas_diarias` | Ventas y cubiertos por día (mediodía/noche/eventos) |

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
  - % Incidencia (food cost real) con objetivo del 30% y semáforo
  - Análisis Mensual y Semanal
  - Gráficos de tendencia y comparativos
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

## Deploy

El proyecto está configurado para deploy automático en Vercel:

```bash
git push origin main  # Auto-deploy a producción
```

## Licencia

Proyecto privado - Tero Restó
