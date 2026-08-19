-- =====================================================
-- notas_auditoria: aceptar el bloque 'item_factura'
-- =====================================================
-- V.27 agrego los comentarios por item en la ficha de factura, con un bloque
-- nuevo ('item_factura'), pero el CHECK de la tabla quedo con los cinco
-- valores originales. Resultado: comentar un item fallaba SIEMPRE, con un
-- mensaje que ademas culpaba a la tabla por no existir.
--
-- Es la tercera vez que un cambio de codigo no vuelve a la base: trigger de
-- vinos, descuento en facturas (V.16), formula de merma (V.20). Y la primera
-- que se detecta por un usuario intentando usar la funcion.
-- =====================================================

ALTER TABLE public.notas_auditoria
  DROP CONSTRAINT IF EXISTS notas_auditoria_bloque_check;

ALTER TABLE public.notas_auditoria
  ADD CONSTRAINT notas_auditoria_bloque_check
  CHECK (bloque IN (
    'faltante', 'cambio_precio', 'precio_distinto',
    'agregado', 'orden_sin_factura', 'item_factura'
  ));

-- Verificar: tiene que aparecer item_factura en la definicion
SELECT conname, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid = 'public.notas_auditoria'::regclass AND contype = 'c';
