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
npm run dev        # Desarrollo en localhost:3000 — ⚠️ apunta a la BASE DE PRODUCCIÓN
npm run dev:demo   # Desarrollo en localhost:3001 contra la BASE DE DEMO
npm run build      # Build de producción
npm run start      # Servidor de producción
npm run lint       # Linter
npm run seed-demo  # Cargar datos de demo
```

⚠️ **Después de un build, verificar que las fuentes hayan bajado:**

```bash
find .next -name "*.woff2" | wc -l     # tienen que ser ~24, no 0
```

`next/font/google` descarga Instrument Serif, Instrument Sans e IBM Plex Mono **durante el
build**. Si la red falla en ese momento, no bajan y Next cae a las tipografías del sistema
**en silencio**: el build igual dice `✓ Compiled successfully`. Pasó el 19/08/26 —la red estuvo
intermitente todo el día— y se descubrió recién cuando el usuario vio que las letras habían
cambiado. Se arregla borrando `.next` y reconstruyendo con red.

No afecta a producción: Vercel construye con su propia red y las baja siempre.

⚠️ **Nunca correr `npm run build` con el dev server levantado:** los dos escriben en `.next`
y el build le pisa los archivos al server en caliente. Bajar el dev primero.

⚠️ **`npm run dev` usa la base real.** Para probar sin riesgo, `npm run dev:demo`.

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
- **inventario_conteos**: Cada vez que se cuenta la cámara
- **inventario_conteo_items**: Lo contado de cada insumo, contra lo que decía el sistema

> ⚠️ `inventario_stock` y `hojas_control_inventario` figuraban acá hasta el
> 26/08/26 y **nunca existieron en la base**. La pantalla de Inventario no las
> usaba: mostraba como "stock" la suma de TODAS las facturas desde el origen sin
> restar una sola salida — 616 kg de bola de lomo, $60 millones de mercadería
> imaginaria. Vale como recordatorio de que este archivo también miente si no se
> actualiza.

### Convenciones

- Soft delete: campo `activo` (boolean) en lugar de borrar
- Timestamps: `created_at` automático
- IVA: almacenado como decimal (0.21, 0.10, 0)
- Números: siempre con `font-mono` para alineación tabular

## ⚠️ Nueve trampas que ya rompieron cosas

**1. `anon` no recibe permisos — hoy, ninguno.** La clave anónima viaja en el bundle público.
Hasta el 13/08/26 había 22 tablas legibles sin login —3.539 precios, 476 facturas, los
márgenes— porque la plantilla de tabla nueva incluía `grant select ... to anon`. Se cerró todo
salvo 8 columnas para el menú del QR, y en V.41, al sacarse ese menú, **también esas ocho**:
ya no hay ninguna pantalla que muestre datos sin sesión. Si algún día vuelve a hacer falta una
página pública, se concede **columna por columna** y nunca la tabla entera. Ver
`supabase-cerrar-anon-total.sql`. Lo verifica `npm run consultar -- anon-sin-permisos`.

Desde V.41 las policies son **todas `to authenticated`** (`supabase-policies-authenticated.sql`).
Es la segunda pared: el `GRANT` se evalúa antes que la policy, así que ninguno alcanza solo —
pero con los dos, un `GRANT` concedido por descuido ya no abre la tabla. Antes sí: era el único
freno, y por eso un solo error dejó 22 tablas legibles.

⚠️ Ese chequeo lee el **catálogo de Postgres**, no `information_schema`. Esa vista solo muestra
los permisos que involucran al rol que consulta, así que el rol lector veía cero y el chequeo
daba verde con `anon` teniendo las 8 columnas concedidas. Un chequeo de seguridad que mira el
lugar equivocado es peor que no tenerlo.

**2. Insumos y vinos comparten las líneas.** En `factura_items` y `orden_compra_items`, un
vino tiene `insumo_id = null` y `vino_id` cargado. Emparejar por `insumo_id` solo hace que
**todos los vinos matcheen entre sí**, porque `null === null` es verdadero. Usar `claveItem()`
de `src/lib/auditoria-semanal.ts`. Ya rompió el semáforo de facturas y la detección de
comprobantes duplicados.

**3. Un insumo tiene UN precio vigente, y lo garantiza un índice.** `precios_insumo` tiene
muchas filas por insumo pero solo una con `es_precio_actual = true`. Si hay dos, la vista
`v_insumos_con_precio` devuelve el insumo duplicado y las pantallas toman "el primero que
llega": el costo de las recetas queda al azar. Pasó el 14/08/26 con el queso brie —tres
precios vigentes, costeando con el de junio— por dos triggers que hacían el mismo trabajo.
Ver `supabase-fix-precio-vigente-unico.sql`.

**4. PostgREST corta en 1000 filas.** Sin error y sin aviso. `factura_items` pasó las 2.300 y
`precios_insumo` las 3.500. Todo lo que lea muchas filas va paginado con `.range()` — ver
`obtenerHistorialPrecios()` o `traerTodo()` en `src/lib/exportaciones.ts`. Este corte escondió
63 variaciones de precio durante semanas (V.22).

**5. Tailwind borra las clases que no encuentra escaneando, y no avisa.** El `content` de
`tailwind.config.ts` define QUÉ archivos se leen para decidir qué CSS generar. Una clase que
vive en un archivo fuera de esa lista no llega al CSS: el elemento se renderiza sin estilo, sin
error y sin warning. Hasta V.36 la lista no incluía `src/types/` ni `src/lib/`, donde viven
varias constantes de estilo (`TIPO_CONFIG.badgeClass`, `getColorEstado()`). Eran 11 clases
purgadas. Lo que lo volvió difícil de ver: los badges de Insumo y Vino se veían bien **de
casualidad**, porque `bg-blue-100` y `bg-purple-100` aparecen en otros 15 y 13 componentes que
sí se escaneaban; Receta, Ejecutivo y Trago usan colores que no figuran en ningún otro lado y
salían en negro. **Si agregás una carpeta nueva con clases de Tailwind adentro, va al `content`.**

**6. `ordenes_compra.total` guarda el NETO, y ninguna pantalla lo usa.** Todas calculan el IVA
en vivo a partir del `iva_porcentaje` de cada insumo (ver `calcularTotalConIva` en
`ordenes-compra/page.tsx`). Así que el número que ve el usuario **siempre tiene IVA** aunque la
columna diga otra cosa. Comparar `ordenes_compra.total` contra `facturas_proveedor.total` —que sí
incluye IVA y percepciones— da una diferencia del 21,9% que parece un problema de compras y es
solo el impuesto: contra el neto de la factura, la diferencia real entre lo pedido y lo entregado
es 3,4%. Pasó el 20/08/26 al armar el objetivo de compras.

**7. `plato_ingredientes` no acepta vino.** Solo tiene `insumo_id` y `receta_base_id`, así que una
receta no puede llevar una copa de vino. Cuando haga falta relacionar un vino con una venta
fraccionada —una copa es 0,333 de botella— se usa el `factor` de `mapeo_ventas`, que guarda la
equivalencia sin duplicar el vino como insumo. Duplicarlo dejaría dos precios que mantener, y el
día que llegue una factura de esa bodega se actualiza uno solo, sin que nada avise.

**8. El inventario descuenta en BRUTO, y el stock no se guarda en ningún lado.** La receta
guarda el NETO que va al plato —7 kg de cebolla pelada— pero de la cámara salieron
7 ÷ (1 − merma) = 7,78 kg con cáscara. Descontar el neto haría que el conteo nunca cierre,
porque lo que se cuenta son cebollas enteras. Y las compras van al revés: la factura carga
30 **cajas** de agua y el salón sirve botellas, así que se multiplican por
`insumos.cantidad_por_paquete` (agua 12, gaseosa 350 24). Sin ese factor el agua da −447.
El stock sale siempre de la cuenta —último conteo + compras − consumo— en `src/lib/inventario.ts`;
no hay tabla de stock que pueda quedar desfasada.

**9. El precio de un vino NO sale de la factura: sale de la lista de la bodega.** Es la
excepción a la regla de oro del sistema. El costo de una botella es
`precio_caja ÷ unidades_caja × (1 − descuento)` con `costoBotellaVino()`, y `precios_vino`
se carga al **importar la lista** —el 01/08/26 entraron 80 vinos de una— no al facturar.
Consecuencia: una promo no mueve el costo. El 25/08 entraron 12 cajas de Salentein Reserva
pagando 10 al 50% y 2 sin cargo: la botella salió $6.387 y el sistema la sigue costeando a
$7.665, los de la lista. La pantalla de Vinos muestra ese precio real como **P.P**, sólo como
referencia. Es una decisión, no un bug: el negocio se maneja con la lista del proveedor.

## Consultar la base (solo lectura)

```bash
npm run consultar -- chequeos            # los invariantes de las trampas de arriba
npm run consultar -- --sql "SELECT ..."  # consulta libre
```

Se conecta con el rol `lector_analisis`, que **solo tiene SELECT** — cualquier escritura la
rechaza Postgres, no una convención. Los cambios en la base los corre el usuario. Ver
`supabase-rol-lectura.sql`.

**Un chequeo que da verde puede estar mintiendo.** Por eso cada uno informa sobre cuántas filas
corrió, y si no ve ninguna marca `⊘` en vez de `✓`. Pasó el 19/08/26: el rol no veía
`consumo_diario` ni `ventas_diarias` —sus policies son `to authenticated` y el rol no lo es— y
los siete chequeos dieron verde sobre tablas vacías. Se arregló con `ALTER ROLE ... BYPASSRLS`,
que deja leer todas las filas sin dar permiso de escritura.

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
