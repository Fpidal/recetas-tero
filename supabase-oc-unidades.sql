-- =====================================================
-- Órdenes de compra: cuántos bultos, además de cuánto pesan
-- =====================================================
--
-- POR QUÉ. Un queso reggianito se pide por horma y una horma pesa unos 7 kg,
-- pero nunca los mismos 7: depende de la pieza. Lo mismo el bife de chorizo,
-- que se pide por unidad y pesa alrededor de 5 kg cada uno. Hasta ahora la OC
-- solo guardaba un número —la cantidad— y el selector de al lado (kg / unidad)
-- cambiaba únicamente la ETIQUETA, sin recalcular nada. Así, pedir "2 unidades
-- a $21.000" dejaba una OC de $42.000 cuando lo que entra son 10 kg, o sea
-- $210.000.
--
-- Se encontraron 45 líneas con esa forma —muzzarella cilindro, queso azul,
-- brie, panceta, jamón cocido— por $862.021 cargados, alrededor de un 0,7% del
-- total histórico de OC. Como el objetivo de compras semanal se calcula sobre
-- esos subtotales, cada una de esas líneas lo afloja sin que se note.
--
-- QUÉ HACE ESTA COLUMNA, Y QUÉ NO. Guarda cuántos bultos se piden: 1 horma,
-- 2 bifes, 3 cajones. Es información PARA EL PROVEEDOR, que es quien despacha
-- por pieza.
--
-- NO entra en ninguna cuenta. El subtotal sigue siendo `cantidad` (los kg) por
-- `precio_unitario`, que es lo que leen el objetivo semanal
-- (`objetivo-compras.ts`) y el semáforo que compara la OC contra la factura.
-- El costeo de insumos ni se entera: no mira las órdenes de compra.
--
-- Se eligió acá y no en `insumos` a propósito. Un peso guardado en el insumo
-- queda congelado —y el packaging del proveedor cambia—, mientras que el
-- aproximado de cada pedido se decide cuando se tiene la mercadería delante.
--
-- SIN DEFAULT, a propósito: las órdenes viejas quedan en NULL y se muestran
-- como hasta ahora. Ponerles 1 a todas sería inventar un dato que nadie cargó.
-- En el formulario, una línea nueva arranca en 1.

alter table public.orden_compra_items
  add column if not exists unidades numeric;

comment on column public.orden_compra_items.unidades is
  'Cuántos bultos/piezas se piden (1 horma, 2 bifes). Informativo para el proveedor: NO interviene en el subtotal, que sale de cantidad * precio_unitario.';
