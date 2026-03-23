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
│   ├── menus-ejecutivos/         # Menús ejecutivos (menú del día)
│   │   ├── nuevo/
│   │   └── [id]/
│   ├── menus-especiales/         # Menús para eventos especiales
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
│   ├── generar-pdf-carta.ts      # Generador PDF de carta
│   ├── generar-pdf-carta-vinos.ts
│   ├── generar-pdf-oc.ts
│   ├── generar-pdf-comparacion.ts
│   └── generar-pdf-stock.ts
│
└── types/
    └── database.ts               # Tipos TypeScript para la DB
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

### Menús Ejecutivos (`/menus-ejecutivos`)
Menús del día con secciones: Parrilla, Entrada, Fondo, Postre, Jugo. Cálculo automático de costo.

### Menús Especiales (`/menus-especiales`)
Menús para eventos con presupuestación.

### Carta (`/carta`)
Vista de carta para imprimir. Generación de PDF.

### Órdenes de Compra (`/ordenes-compra`)
Creación de OC con numeración automática, estados (borrador, enviada, recibida, etc.) y generación de PDF.

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

## Características

- Cálculo automático de costos por plato
- IVA configurable por insumo (0%, 10%, 21%)
- Historial de precios con seguimiento de cambios
- Comparador de precios entre proveedores
- Órdenes de compra con numeración automática y PDF
- Facturas con actualización automática de precios
- Notas de Crédito que restan stock y compras
- Menús ejecutivos y especiales con costeo
- Carta/Menú en PDF lista para imprimir
- Control de inventario con hojas de control
- Dashboard de estadísticas con gráficos
- Papelera con soft delete
- Formateo argentino (números y fechas)
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
