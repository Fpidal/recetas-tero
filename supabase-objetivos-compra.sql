-- =====================================================
-- OBJETIVO DE COMPRAS SEMANAL
-- =====================================================
--
-- PARA QUE: fijar cuanto se piensa gastar en compras por semana y ver, durante
-- la semana, cuanto va y cuanto queda. Hoy la pantalla de Ordenes muestra solo
-- lo pendiente de recibir, que no dice si se esta dentro o fuera del plan.
--
-- UNA FILA POR CAMBIO, NO POR SEMANA. El objetivo de una semana es el de la
-- fila mas reciente con `semana_desde` menor o igual: se carga 5.500.000 una
-- vez y rige hasta que se cambie. Asi no hay que cargarlo todas las semanas, y
-- el historial de objetivos sale solo de esta tabla — cada fila es "a partir de
-- esta semana, el objetivo es X".
--
-- POR QUE LUNES: `semana_desde` es siempre un lunes, igual que en el resto del
-- sistema (Resumen semanal, auditoria, Dashboard). Que una pantalla cuente la
-- semana distinto ya paso y dio compras en $0 los domingos (V.33).
--
-- EN QUE MONEDA: el objetivo va CON IVA, que es como se ven los totales de OC
-- en pantalla. Ojo que `ordenes_compra.total` guarda el NETO — ninguna pantalla
-- usa esa columna, todas calculan el IVA en vivo desde cada insumo. Comparar el
-- objetivo contra `total` a secas daria un 20% de menos.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.objetivos_compra (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Lunes a partir del cual rige este objetivo
  semana_desde DATE NOT NULL UNIQUE,
  -- Con IVA, sin vinos
  objetivo     NUMERIC(12,2) NOT NULL CHECK (objetivo > 0),
  notas        TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Para buscar "el objetivo vigente en tal semana"
CREATE INDEX IF NOT EXISTS idx_objetivos_compra_semana
  ON public.objetivos_compra (semana_desde DESC);

COMMENT ON TABLE public.objetivos_compra IS
  'Objetivo de compras semanal, con IVA y sin vinos. Una fila por CAMBIO de '
  'objetivo: rige desde su semana_desde hasta que aparezca otra posterior.';


-- =====================================================
-- PERMISOS: GRANT + RLS + POLICY, los tres
-- =====================================================
-- `anon` no recibe nada. Desde V.41 no hay ninguna pantalla publica, y esta
-- tabla ademas tiene informacion de gestion.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objetivos_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objetivos_compra TO service_role;

ALTER TABLE public.objetivos_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo autenticados"
  ON public.objetivos_compra FOR ALL
  TO authenticated
  USING (true);


-- =====================================================
-- CARGAR EL PRIMERO
-- =====================================================
-- Ajustar la fecha al lunes desde el que quieras que rija, y el monto.
-- Con ON CONFLICT se puede volver a correr para corregirlo.

INSERT INTO public.objetivos_compra (semana_desde, objetivo)
VALUES ('2026-08-17', 5500000)
ON CONFLICT (semana_desde) DO UPDATE SET objetivo = EXCLUDED.objetivo,
                                         updated_at = TIMEZONE('utc', NOW());

SELECT semana_desde, objetivo FROM public.objetivos_compra ORDER BY semana_desde DESC;
