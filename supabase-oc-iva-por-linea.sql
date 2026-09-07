-- =====================================================
-- Órdenes de compra: el IVA de la línea, no el del insumo
-- =====================================================
--
-- POR QUÉ. La pantalla de carga siempre dejó elegir el IVA de cada ítem
-- (`handleIvaChange` en `ordenes-compra/nueva/page.tsx`) y recalculaba los
-- totales en vivo, así que el usuario veía el porcentaje que había puesto.
-- Pero el INSERT nunca guardó ese valor —no había dónde— y al reabrir la orden
-- el IVA se volvía a leer del insumo. El número elegido se perdía en silencio:
-- ni un error, ni un aviso, y los totales de la pantalla de carga no coincidían
-- con los de la orden guardada.
--
-- Salió a la luz el 07/09/26 con la OC A01-0495 de Avicola del Norte: la
-- bondiola está cargada con 0% en `insumos`, se le puso 21% al pedirla, y la
-- orden guardada la mostró de nuevo en 0%. El "IVA 21%: $12.209,40" de esa
-- orden son exactamente los $58.140 del huevo por 0,21 — la bondiola no aportó
-- un peso.
--
-- POR QUÉ EN LA LÍNEA Y NO EN EL INSUMO. Porque el mismo insumo se compra con
-- distinto IVA según a quién. La bondiola a este proveedor viene con 21% y a
-- otros no, así que corregir `insumos.iva_porcentaje` arreglaría esta orden y
-- rompería las demás. Es la misma decisión que ya se tomó en `factura_items`,
-- que guarda su propio `iva_porcentaje` por línea desde siempre. Esta columna
-- empareja la orden con la factura; también es lo que permite que el semáforo
-- que compara pedido contra facturado mire el mismo impuesto de los dos lados.
--
-- SIN DEFAULT, a propósito. Las órdenes ya cargadas quedan en NULL y siguen
-- calculando con el IVA del insumo, exactamente como hasta hoy: el código lee
-- `iva_porcentaje ?? insumos.iva_porcentaje ?? 21`. Ponerles un número a todas
-- sería inventar un dato que nadie cargó, y cambiaría totales de órdenes que ya
-- se enviaron. Desde ahora, cada línea nueva guarda el suyo.
--
-- La tabla ya tiene GRANT y RLS (`supabase-policies-authenticated.sql`); esto
-- es un ALTER, no una tabla nueva, así que no hace falta repetir los bloques.

alter table public.orden_compra_items
  add column if not exists iva_porcentaje numeric;

comment on column public.orden_compra_items.iva_porcentaje is
  'IVA pactado para ESTA línea (21 / 10.5 / 0). NULL en las órdenes anteriores al 07/09/26, que caen al iva_porcentaje del insumo. Existe porque el mismo insumo se compra con distinto IVA según el proveedor.';
