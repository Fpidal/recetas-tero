# CLAUDE.md - Recetas Tero

## Descripción del Proyecto

Sistema de gestión de recetas, costos y menús para restaurante. Permite administrar insumos, calcular costos de platos, gestionar proveedores, crear órdenes de compra y controlar inventario.

## Stack Tecnológico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Base de datos**: Supabase (PostgreSQL)
- **Estilos**: Tailwind CSS
- **Tipografías**: DM Sans (texto), JetBrains Mono (números), Playfair Display (logo)
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
- IVA: almacenado como decimal (0.21, 0.10, 0)
- Números: siempre con `font-mono` para alineación tabular

## Patrones de Código

### Queries a Supabase

```typescript
const { data, error } = await supabase
  .from('tabla')
  .select('*')
  .eq('activo', true)
  .order('nombre')
```

### Formateo de Moneda (ARS)

```typescript
import { formatearMoneda, formatNumber } from '@/lib/formato-numeros'
formatearMoneda(15000)  // "$15.000"
formatNumber(1.5)       // "1,5"
```

### Tipografía Numérica

Todos los valores numéricos deben usar la clase `font-mono` (JetBrains Mono):
- Montos: `$1.234.567`
- Porcentajes: `32,5%`
- Cantidades: `15 kg`
- Inputs numéricos

```tsx
<span className="font-mono">{precio.toLocaleString('es-AR')}</span>
<span className="font-mono">{porcentaje.toFixed(1)}%</span>
```

### Componentes UI

Usar componentes de `@/components/ui/`:
- `Button`, `Input`, `Select`, `Modal`, `Table`

## Deploy

- **Producción**: Vercel (https://recetas-tero.vercel.app)
- **Push + Deploy**: `git push` (Vercel auto-deploy desde main)

## ⚠️ ANTES DE TOCAR COSTOS, PRECIOS O RECETAS

**Leer `docs/SISTEMA-COSTOS.md`.** Tiene el mapa real del costeo: la fórmula del
C. Final, qué dispara el recálculo, qué pantalla recalcula y cuál lee de la tabla.

Está escrito sobre lo que efectivamente corre en Supabase, extraído con
`pg_get_functiondef`. **Los `.sql` del repo describen funciones que no existen** —
en particular `supabase-trigger-actualizar-costos.sql`, que está marcado como
obsoleto. Confiar en él convirtió un cambio de 10 minutos en una hora de
arqueología (V.20).

### Regla obligatoria para cambios en la base

Toda función o trigger que se toque en el dashboard de Supabase **vuelve al repo
el mismo día**, en un `.sql` versionado. Si no, el repo miente y el próximo cambio
simple se paga carísimo. Ya pasó tres veces: trigger de vinos, descuento en
facturas (V.16) y fórmula de merma (V.20).

### La fórmula del costo vive en DOS lugares, y solo dos

| Capa | Dónde |
|---|---|
| Frontend | `src/lib/costos.ts` → `costoFinalInsumo()` |
| Base | función `costo_final_insumo()` |

Si se toca una, se toca la otra. Nunca volver a copiarla inline en una pantalla.

## Notas Importantes

- Los precios de insumos vienen de la última factura registrada
- El IVA es editable por insumo (19%, 10%, 0%)
- Las comparaciones de precios permiten proveedores temporales (sin registrar)
- Los menús ejecutivos tienen secciones: Parrilla, Entrada, Fondo, Postre, Jugo
- El inventario usa "hojas de control" para registro diario

## IMPORTANTE: Workflow de Git

### Al INICIAR cada sesión (OBLIGATORIO):
```bash
git pull origin main
```
Sincronizar con Vercel antes de hacer cualquier cambio.

### Antes de cada PUSH (OBLIGATORIO):

1. **Actualizar el changelog** en `src/lib/version.ts` (ver sección "Versiones / Changelog")
2. `npm run build` → Verificar que compila sin errores
3. `git diff origin/main --stat` → Mostrar resumen de cambios
4. **MOSTRAR al usuario** los archivos que van a cambiar
5. **ESPERAR confirmación** de que son SOLO los archivos esperados
6. Recién ahí hacer `git push`

**Si aparece un archivo que no tocamos en la sesión → PARAR y revisar antes de pushear.**

### Nunca hacer push sin confirmación del usuario.

## Versiones / Changelog

La app muestra su versión en el Sidebar (ej: `V.13 (09/07/26)`). Al hacer clic se abre
el modal de **Novedades** con el historial completo. Todo sale de `src/lib/version.ts`.

### Regla obligatoria en CADA push a producción:

Agregar una entrada NUEVA arriba de todo en el array `CHANGELOG` de `src/lib/version.ts`:

```ts
export const CHANGELOG: VersionEntry[] = [
  {
    version: 'V.14',            // subir el número respecto de la entrada anterior
    fecha: '10/07/26',         // fecha del push, formato DD/MM/YY
    cambios: [
      'Descripción corta y clara del cambio, en lenguaje de usuario',
    ],
  },
  // ...entradas anteriores debajo, NO borrarlas
]
```

**Reglas:**
- La entrada más nueva va SIEMPRE primera (la app la marca como "actual").
- `APP_VERSION` y `APP_FECHA` se derivan solos de `CHANGELOG[0]` — nunca editarlos a mano.
- Los `cambios` se escriben pensando en el usuario del restaurante, no en términos técnicos
  (ej: "Foto del plato en la ficha de recetas", no "add columna imagen_url").
- Nunca borrar entradas viejas: el historial sirve para rastrear qué versión introdujo un problema.
