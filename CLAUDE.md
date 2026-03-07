# CLAUDE.md - Recetas Tero

## Descripción del Proyecto

Sistema de gestión de recetas, costos y menús para restaurante. Permite administrar insumos, calcular costos de platos, gestionar proveedores, crear órdenes de compra y controlar inventario.

## Stack Tecnológico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Base de datos**: Supabase (PostgreSQL)
- **Estilos**: Tailwind CSS
- **Iconos**: Lucide React
- **PDF**: jsPDF + jspdf-autotable
- **Gráficos**: Recharts

## Comandos

```bash
npm run dev        # Desarrollo en localhost:3000
npm run build      # Build de producción
npm run lint       # Linter
npm run seed-demo  # Cargar datos de demo
```

## Estructura del Proyecto

```
src/
├── app/                    # Rutas (App Router)
│   ├── carta/              # Carta/Menú del restaurante
│   ├── estadisticas/       # Dashboard de estadísticas
│   ├── facturas/           # Gestión de facturas de proveedores
│   ├── insumos/            # Gestión de insumos/ingredientes
│   ├── inventario/         # Control de inventario
│   ├── menus-ejecutivos/   # Menús ejecutivos (menú del día)
│   ├── menus-especiales/   # Menús para eventos especiales
│   ├── ordenes-compra/     # Órdenes de compra a proveedores
│   ├── papelera/           # Items eliminados (soft delete)
│   ├── platos/             # Recetas y platos
│   ├── proveedores/        # Gestión de proveedores
│   └── recetas-base/       # Recetas base (sub-recetas)
├── components/
│   ├── ui/                 # Componentes UI reutilizables
│   ├── inventario/         # Componentes de inventario
│   ├── insumos/            # Componentes de insumos (ComparadorPrecios)
│   └── Sidebar.tsx         # Navegación lateral
├── lib/
│   ├── supabase.ts         # Cliente Supabase
│   ├── formato-numeros.ts  # Formateo de números/moneda
│   ├── oc-numero.ts        # Numeración de órdenes de compra
│   └── generar-pdf-*.ts    # Generadores de PDF
└── types/
    └── database.ts         # Tipos de TypeScript para la DB
```

## Base de Datos (Supabase)

### Tablas Principales

- **insumos**: Ingredientes con unidad, categoría, IVA
- **proveedores**: Proveedores con datos de contacto
- **platos**: Recetas con ingredientes, categoría, margen
- **plato_insumos**: Relación plato-insumo con cantidad
- **facturas_proveedor**: Facturas de compra
- **factura_items**: Items de cada factura con precio
- **ordenes_compra**: Órdenes de compra
- **orden_compra_items**: Items de cada orden
- **comparaciones_precios**: Comparaciones de precios entre proveedores
- **comparacion_proveedores**: Proveedores en cada comparación
- **comparacion_items**: Items con precios de cada proveedor
- **menus_ejecutivos**: Menús del día
- **menus_especiales**: Menús para eventos
- **inventario_stock**: Stock actual
- **hojas_control_inventario**: Control diario de inventario

### Convenciones

- Soft delete: campo `activo` (boolean) en lugar de borrar
- Timestamps: `created_at` automático
- IVA: almacenado como decimal (0.19, 0.10, 0)

## Patrones de Código

### Queries a Supabase

```typescript
const { data, error } = await supabase
  .from('tabla')
  .select('*')
  .eq('activo', true)
  .order('nombre')
```

### Formateo de Moneda (CLP)

```typescript
import { formatCLP, formatNumber } from '@/lib/formato-numeros'
formatCLP(15000)  // "$15.000"
formatNumber(1.5) // "1,5"
```

### Componentes UI

Usar componentes de `@/components/ui/`:
- `Button`, `Input`, `Select`, `Modal`, `Table`

## Deploy

- **Producción**: Vercel (https://recetas-tero.vercel.app)
- **Push + Deploy**: `git push` (Vercel auto-deploy desde main)

## Notas Importantes

- Los precios de insumos vienen de la última factura registrada
- El IVA es editable por insumo (19%, 10%, 0%)
- Las comparaciones de precios permiten proveedores temporales (sin registrar)
- Los menús ejecutivos tienen secciones: Parrilla, Entrada, Fondo, Postre, Jugo
- El inventario usa "hojas de control" para registro diario
