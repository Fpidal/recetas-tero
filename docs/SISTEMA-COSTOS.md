# Cómo funciona el costeo — estado REAL

> **Leé esto antes de tocar cualquier cosa de costos, precios o recetas.**
>
> Este documento describe lo que efectivamente corre en Supabase, extraído con
> `pg_get_functiondef` el 04/08/26 — no lo que dicen los `.sql` del repo.
>
> Los archivos `supabase-trigger-actualizar-costos.sql` y partes de
> `supabase-schema.sql` describen funciones que **no existen** en producción.
> Confiar en ellos costó una hora de arqueología para cambiar una fórmula.

---

## 1. La fórmula: C. Final

Todo el sistema costea con un único número por insumo, en **unidad base**:

```
C. Final = precio × (1 + IVA/100) ÷ (1 − merma/100)
```

- **precio**: ya viene normalizado a unidad base. El paquete de 3 kg se convirtió
  a precio por kilo al cargar la factura (`precio_unitario / cantidad_por_paquete`).
  Esa normalización es lo que hace comparables a todas las recetas entre sí.
- **merma**: pérdida de aprovechamiento. Si comprás 1 kg y perdés 10% al limpiarlo,
  te quedan 0,9 kg utilizables → el kilo servible costó `precio / 0,9`.
  **No es `× 1,10`.** Ese error subestimaba el costo, y cada vez más cuanto mayor
  la merma (1% con merma 10%, 19% con merma 40%). Corregido en V.20.

### Dónde vive la fórmula — DOS lugares, y solo dos

| Capa | Archivo / función |
|---|---|
| Frontend | `src/lib/costos.ts` → `costoFinalInsumo(precio, iva, merma)` |
| Base | función `costo_final_insumo(p_precio, p_iva, p_merma)` |

**Si tocás una, tocá la otra.** Antes esta cuenta estaba copiada en 30 lugares del
frontend y escrita inline en el trigger; por eso el error de la merma sobrevivió
meses sin que nadie lo viera. No la vuelvas a duplicar.

---

## 2. Qué dispara el recálculo

**Solo hay un disparador real: un INSERT en `precios_insumo`.**

```
                    ┌─ Cargar una factura
INSERT en           │    factura_items → trigger_actualizar_precio_factura
precios_insumo  ←───┤
                    └─ Editar un insumo en la pantalla de Insumos
                         si el precio > 0, el formulario reinserta el precio
                         (insumos/page.tsx). Por eso cambiar la merma también
                         propaga: de rebote, no por diseño.
        │
        ▼
trigger_actualizar_costos_recetas  →  actualizar_costos_recetas_base()
        │   recalcula costo_linea de receta_base_ingredientes y plato_ingredientes
        │   para ese insumo, y re-suma recetas_base y platos
        ▼
recetas_base actualizada
        │
        ▼  trigger_actualizar_costos_platos → actualizar_costos_platos_desde_receta()
platos que usan esa elaboración
```

Más dos triggers de edición directa, que solo **re-suman** (no recalculan precios):

- `plato_ingredientes` → `recalcular_costo_plato_trigger()`
- `receta_base_ingredientes` → `recalcular_costo_receta_trigger()`

### Lo que NO dispara nada

- **Cambiar `cantidad_por_paquete`** de un insumo. El precio unitario ya se calculó
  al cargar la factura; corregir el contenido después no lo recalcula. Pendiente.
- **Los menús ejecutivos no tienen trigger.** Su `costo_total` guardado se
  desactualiza en silencio; el frontend lo recalcula al mostrarlo, así que la
  pantalla miente menos que la tabla. En el recálculo de V.20 algunos se movieron
  ±20% solo por estar viejos.

---

## 3. Quién recalcula en vivo y quién lee de la tabla

Esto explica por qué un mismo plato puede mostrar dos números distintos.

| Pantalla | Costo |
|---|---|
| Recetas — lista y ficha | **Recalcula** en vivo |
| Elaboraciones | **Recalcula** |
| Carta | **Recalcula** |
| Menús ejecutivos | **Recalcula** |
| Insumos (C. Final) | **Recalcula** |
| Tragos | usa `tragos.costo_total` |
| PDFs y reportes | leen de la tabla |

Consecuencia práctica: **un dato corrupto en la base puede no verse en pantalla.**
Fue exactamente lo que pasó con el IVA faltante — 37 platos dañados que las
pantallas tapaban al recalcular.

---

## 4. El RPC que corrompía datos (corregido en V.20)

`platos/[id]/page.tsx` llama por RPC a `recalcular_costo_plato()` al guardar un
plato, para actualizar `carta`. Esa función usa `calcular_costo_insumo()`, que
**no aplicaba IVA**: cada guardado le borraba el IVA a las líneas de ese plato.

Peor: el trigger de precio corregía después **una sola línea** (la del insumo cuyo
precio cambió), dejando el plato en estado mixto — unas líneas con IVA y otras sin.
Por eso los números no cerraban de ninguna manera coherente.

Ya está corregido: `calcular_costo_insumo()` ahora delega en `costo_final_insumo()`.

---

## 5. Recalcular todo a mano

Cambiar la definición de una función **no** recalcula lo ya guardado:

```sql
SELECT recalcular_todos_los_costos();
```

Recorre elaboraciones → platos → menús → carta, en ese orden (cada nivel depende
del anterior). Devuelve el conteo de lo recalculado.

> **Ojo:** Supabase bloquea `UPDATE` sin `WHERE` (error `21000`). Todo UPDATE
> masivo necesita al menos `WHERE id IS NOT NULL`.

---

## 6. Regla para cambios en la base

**Toda función o trigger que se toque en el dashboard de Supabase tiene que
volver al repo en el mismo día, en un `.sql` versionado.**

Si no, el repo miente y el próximo cambio simple se convierte en una hora de
arqueología. Ya pasó tres veces: el trigger de vinos, el del descuento en
facturas (V.16) y esta fórmula de merma (V.20).

Para extraer el estado real de la base:

```sql
-- Definición de funciones
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%costo%' OR p.proname LIKE '%precio%')
ORDER BY p.proname;

-- Triggers activos y a qué función llaman
SELECT c.relname AS tabla, t.tgname AS trigger, p.proname AS funcion
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
```

---

## 7. Archivos del repo que NO son confiables

| Archivo | Problema |
|---|---|
| `supabase-trigger-actualizar-costos.sql` | **Obsoleto.** Define `propagar_cambio_precio_insumo` y `trg_precio_insumo_insertado`, que no existen en la base. La cadena real es otra (ver punto 2) |
| `supabase-schema.sql` | El esquema de tablas sirve; las **funciones** están desactualizadas |
| `supabase-fix-formula-merma.sql` | ✅ Este sí refleja el estado real (04/08/26) |
