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

### El vino tiene su propia fórmula (V.23)

Los vinos **no pasan por `insumos`**: no tienen merma ni IVA editable, y el precio
viene por caja desde la lista de la bodega. Su costo por botella es:

```
costo botella = (precio_caja ÷ unidades_caja) × (1 − descuento%)
```

`precio_caja` ya trae el IVA adentro (es el "Precio Final" de la lista de la bodega).
El descuento se pacta sobre el neto, así que la cuenta original sacaba el IVA, aplicaba
el descuento y lo volvía a poner — esas dos operaciones se cancelan.

Vive en **un solo lugar**: `src/lib/costos.ts` → `costoBotellaVino()`. La usan la
pantalla de Vinos y la carga de consumo de Análisis. No la copies en una tercera.

### La incidencia real vive en UN solo lugar (V.29)

`resumirIncidencias()`, en `src/lib/consumo-queries.ts`. La usan la solapa
**Incidencia**, el **Histórico** y el **Cierre de mes**.

La regla que define: **la incidencia se calcula solo sobre los servicios que
tienen el consumo cargado**, nunca sobre la venta total del período.

```
incidencia = costo / venta_de_los_dias_con_costo
```

La carga de consumo es parcial. Dividir el costo de 9 servicios por el ingreso
de 11 no da un food cost: da un promedio diluido, más bajo que el real y sin
significado. Por eso el muestreo (`9 de 11`) va **siempre** al lado del número.

Hasta V.29 el Histórico tenía su propia copia de la cuenta, escrita inline, y
esa copia dividía por la venta total: mostraba 21,6% donde Incidencia mostraba
26,3%, con exactamente los mismos datos. **Los seis meses del gráfico estaban
subestimados.** Tercera vez que el mismo patrón —la misma fórmula copiada en
dos lados— produce números distintos sin que nadie lo note: primero la merma,
después el costo de los menús ejecutivos, ahora esto.

### Otro par que también vive en dos lugares (V.23)

Qué tipos de consumo cuentan como **Barra** y cuáles como **Cocina**:

| Capa | Archivo / función |
|---|---|
| Frontend | `src/types/analisis.ts` → `TIPOS_BARRA` |
| Base | función `recalcular_costo_consumo()`, en `supabase-analisis-tipos-consumo.sql` |

Hoy son `trago` y `vino`. Misma regla: si se agrega un tipo de barra, se toca en los dos
lados o los totales de `consumo_diario` dejan de cerrar con lo que muestra la pantalla.

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

  **Medido el 08/08/26, tres días después del recálculo de V.20 y un día después de
  cargar una factura:** 8 de 17 menús ya estaban desfasados, hasta 5% ($320). Los 84
  platos, en cambio, coincidían todos dentro del 0,5% — la cadena
  `precio insumo → plato` funciona; el eslabón que falta es `plato → menú ejecutivo`.

  Desde V.23 esto pesa más: el menú ejecutivo se puede cargar en el consumo de
  Análisis, y el buscador toma `menus_ejecutivos.costo_total` (igual que las recetas
  toman el suyo). Si la tabla está vieja, el análisis hereda el error. Verificarlo así:

  ```sql
  SELECT m.nombre, m.costo_total AS guardado,
         SUM(mi.costo_linea)     AS suma_items
  FROM menus_ejecutivos m
  JOIN menu_ejecutivo_items mi ON mi.menu_ejecutivo_id = m.id
  WHERE m.activo GROUP BY m.id, m.nombre, m.costo_total
  HAVING ROUND(m.costo_total,2) <> ROUND(SUM(mi.costo_linea),2);
  ```
  Ojo: eso solo detecta que la cabecera no cierra con sus items. Si lo viejo es el
  `costo_linea` de los items, hay que compararlos contra el costo actual del plato o
  de la elaboración que referencian.

---

## 3. Quién recalcula en vivo y quién lee de la tabla

Esto explica por qué un mismo plato puede mostrar dos números distintos.

| Pantalla | Costo |
|---|---|
| Recetas — lista y ficha | **Recalcula** en vivo |
| Elaboraciones | **Recalcula** |
| Carta | **Recalcula** |
| Insumos (C. Final) | **Recalcula** |
| Tragos — lista | **Recalcula** siempre; nunca lee `tragos.costo_total` |
| Menús ejecutivos — **ficha** | **Recalcula**, y escribe la tabla solo al guardar |
| Menús ejecutivos — **lista** | lee `menus_ejecutivos.costo_total` ⚠️ |
| Análisis — buscador de consumo | **Recalcula** (V.23, ver abajo) |
| PDFs y reportes | leen de la tabla |

Consecuencia práctica: **un dato corrupto en la base puede no verse en pantalla.**
Fue exactamente lo que pasó con el IVA faltante — 37 platos dañados que las
pantallas tapaban al recalcular.

Y al revés también: la ficha de un menú ejecutivo y la lista de menús ejecutivos
muestran **números distintos del mismo menú** cuando la tabla quedó vieja. El 08/08/26
"Sugerencia Pescados Noche" mostraba $11.943 en la ficha (correcto) y $12.264 en la
lista. Verificado ese día: los 84 platos y las 79 elaboraciones estaban exactos, así
que el desfasaje es solo de la cabecera del menú.

**Por eso el buscador de Análisis reconstruye el costo desde los insumos**
(`costearCompuestos` en `src/lib/consumo-queries.ts`) en vez de leer `costo_total`
de tragos o menús. Si leyera la tabla, el consumo cargado arrastraría el número
viejo al análisis y a la incidencia. Como usa el mismo expansor que el desglose,
además queda garantizado que el costo con el que se carga un item sea idéntico al
que sale cuando se lo desglosa.

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

## 4 bis. Los triggers de `factura_items` (corregidos en V.21)

Cinco triggers rodean a `factura_items`. Estaban rotos de tres formas distintas:

| Función | Qué le pasaba |
|---|---|
| `revertir_precio_item_eliminado` | Llamaba a `propagar_cambio_precio_insumo()`, **que nunca existió** → borrar items de factura fallaba |
| `revertir_precios_factura_anulada` | Restauraba el precio anterior pero **no propagaba**: los platos quedaban con el costo de la factura anulada |
| `actualizar_precio_insumo_on_update` | Escribía en `precio_insumos` (singular), **tabla inexistente** |
| `revertir_precio_al_eliminar_factura` | Buscaba el precio anterior con `factura_item_id != OLD.id`; los precios cargados a mano tienen ese campo en NULL y `NULL != x` da NULL, así que **nunca los encontraba** (90 de 302 precios vigentes) |

**Por qué sobrevivió tanto:** plpgsql no valida que las funciones llamadas existan
al crear la función, solo la sintaxis. El error aparece recién al ejecutarse. Y el
frontend hacía `console.log` del error del DELETE y **seguía insertando igual**, así
que el síntoma no era un error sino items duplicados en la factura.

Corregido en `supabase-fix-triggers-factura-items.sql` + el guard del frontend en
`facturas/[id]/editar/page.tsx`. Verificado el 04/08/26 editando dos veces seguidas la
factura 1001-00174837: sin duplicados, el precio del insumo se actualiza y al revertir
se elimina el registro que ya no corresponde.

De las 450 facturas activas, solo dos habían quedado con items duplicados. La de Morres
se reparó; la de El triunfo (26/01/26) se dejó como está a propósito — enero fue el mes
de arranque y esas cargas fueron de prueba.

**Pendiente conocido:** al restaurar un precio anterior, los triggers no desmarcan
los otros `es_precio_actual`. Si se borran varios items del mismo insumo de una vez,
quedan varios precios marcados como vigentes. La vista `v_insumos_con_precio` usa
`DISTINCT ON` y toma el más reciente, así que la app no se rompe, pero el dato queda
sucio.

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
