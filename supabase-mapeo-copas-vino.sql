-- =====================================================
-- Copas de vino: el factor describe UNA copa, no la venta
-- =====================================================
--
-- POR QUÉ. `mapeo_ventas.factor` se multiplica por las unidades de cada línea
-- del informe (`cantidad = unidades * factor`, `importar-ventas.ts:322`). O sea
-- que responde "¿cuánta botella es UNA copa?" — nunca "¿cuánta botella es esta
-- venta?", porque cuántas se vendieron ya viene en el informe. Poner ahí el
-- total multiplica dos veces.
--
-- Al 07/09/26 los cuatro códigos de copa estaban mal, cada uno distinto:
--
--   615  C. Copa Blanco Chard   0,25   copa de 187cc, no de 250
--   616  C. Copa Vino Tinto     1,00   cada copa descontaba una BOTELLA entera
--   619  M. Copa Blanco Chard   —      ignorada, sin mapear
--   620  M. Copa Tinto          —      ignorada, sin mapear
--
-- El 616 se vio en la carga del sábado 5 a la noche: 3 copas de tinto entraron
-- como 3 botellas de Salentein Reserva Malbec. Sumadas a las 5 vendidas, el
-- servicio registró 8 botellas cuando salieron 6 — $15.330 de más. El blanco
-- fallaba al revés: 2 copas entraron como 0,5 botella en vez de 0,667.
--
-- Las del MENÚ (619, 620) estaban ignoradas por una regla que en general está
-- bien: una fila en $0 del informe suele ser un componente que ya viene adentro
-- de un menú ya costeado —la ensalada del Menú Pescado, por ejemplo—, y
-- cargarla aparte la contaría dos veces.
--
-- Con el vino esa regla falla, y por un motivo estructural: `menu_ejecutivo_items`
-- tiene `insumo_id`, `receta_base_id` y `plato_id`, y NO tiene `vino_id`. El menú
-- no puede contener una copa de vino ni queriendo (misma limitación que
-- `plato_ingredientes`, trampa 7). Así que la copa del menú no estaba costeada en
-- ningún lado: ni adentro del menú, ni por el mapeo. Por eso salía en $0.
--
-- LA MEDIDA. Botella de 750cc, copa de 250cc → 3 copas por botella → 0,333.
-- Igual para las cuatro. Al describir una copa y no una venta, el factor no se
-- vuelve a tocar nunca: sirve para 3 copas y para 30.
--
-- NO ES RETROACTIVO. El costo se congela en `consumo_items` al importar, así que
-- las cargas anteriores mantienen sus números. Es lo correcto: ya sustentaron
-- reportes emitidos.

update mapeo_ventas set factor = 0.333 where codigo in ('615', '616');

update mapeo_ventas
   set vino_id = (select id from vinos
                   where bodega = 'Salentein' and nombre = 'Reserva' and cepa = 'Malbec' limit 1),
       tipo = 'vino', factor = 0.333, ignorar = false
 where codigo = '620';

update mapeo_ventas
   set vino_id = (select id from vinos
                   where bodega = 'Salentein' and nombre = 'Reserva' and cepa = 'Chardonnay' limit 1),
       tipo = 'vino', factor = 0.333, ignorar = false
 where codigo = '619';
