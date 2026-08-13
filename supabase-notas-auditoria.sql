-- =====================================================
-- NOTAS DEL RESUMEN SEMANAL DE COMPRAS
-- =====================================================
--
-- PARA QUÉ: el resumen semanal detecta el desvío, pero no puede saber POR QUÉ
-- pasó. Si el parmesano subió 100%, el sistema ve la suba; solo una persona
-- sabe que se cambió por uno de mejor calidad, o que hacía seis meses que no
-- se compraba y la comparación no significa nada.
--
-- Sin esto, cada semana se vuelve a discutir lo mismo. Con la nota escrita, el
-- informe que se lleva a la reunión ya trae lo que se explicó la vez anterior.
--
-- GRANO: una nota por (semana, bloque, línea). La nota pertenece al EVENTO de
-- esa semana, no al insumo: "hacía tiempo que no se compraba" explica la suba
-- de esta semana y no tiene sentido arrastrarla a la siguiente.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notas_auditoria (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Lunes de la semana del informe
  semana_desde DATE NOT NULL,
  -- Qué sección del informe
  bloque       TEXT NOT NULL CHECK (bloque IN (
                 'faltante', 'cambio_precio', 'precio_distinto',
                 'agregado', 'orden_sin_factura'
               )),
  -- Identifica la línea dentro del bloque. La arma el frontend
  -- (referenciaDe() en src/lib/auditoria-semanal.ts) para que sea estable
  -- entre recargas: por ejemplo "i:<uuid>|0004-00073434".
  referencia   TEXT NOT NULL,
  nota         TEXT NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),

  -- Una sola nota por línea: escribir de nuevo pisa la anterior
  CONSTRAINT notas_auditoria_unica UNIQUE (semana_desde, bloque, referencia)
);

CREATE INDEX IF NOT EXISTS idx_notas_auditoria_semana
  ON public.notas_auditoria (semana_desde);


-- =====================================================
-- updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION public.tocar_updated_at_notas_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notas_auditoria_updated_at ON public.notas_auditoria;
CREATE TRIGGER trigger_notas_auditoria_updated_at
  BEFORE UPDATE ON public.notas_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at_notas_auditoria();


-- =====================================================
-- PERMISOS + RLS + POLICY
-- =====================================================
-- ⚠️ `anon` NO recibe nada. La convención vieja del CLAUDE.md global incluía
-- `grant select ... to anon` en toda tabla nueva, y eso dejó 22 tablas legibles
-- sin login (corregido el 13/08/26, ver supabase-cerrar-acceso-anonimo.sql).
-- Estas notas hablan de proveedores y precios: no van a internet.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_auditoria TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_auditoria TO service_role;

ALTER TABLE public.notas_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solo autenticados" ON public.notas_auditoria;
CREATE POLICY "solo autenticados"
  ON public.notas_auditoria FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- La tabla existe con sus constraints
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.notas_auditoria'::regclass
ORDER BY contype, conname;

-- anon no tiene ningún permiso sobre ella (tiene que dar cero filas)
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'notas_auditoria'
  AND grantee = 'anon';
