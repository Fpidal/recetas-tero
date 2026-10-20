-- =====================================================
-- Restaurantes: los datos de la empresa, en la base y no en el código
-- =====================================================
-- 20/10/26. Correr en el SQL Editor de Supabase.
--
-- POR QUÉ. La razón social, el CUIT y la dirección de Tero estaban escritos a
-- mano en generar-pdf-oc.ts, y "Tero Restó" en unos diez lugares más (menú,
-- PDF, Excel). El logo de la OC y de cuatro PDF más era "el primer archivo que
-- aparezca en el bucket fotos platos": funcionaba de casualidad. Con un
-- segundo restaurante, todo eso saldría con el nombre de Tero.
--
-- QUÉ HACE. Crea `restaurantes`, una fila por restaurante, y carga la de Tero
-- con los datos que hoy salen en la OC. Se edita desde Configuración → Empresa.
--
-- Es la pieza base del multiusuario (ver ROADMAP): cuando llegue, las demás
-- tablas van a tener un `restaurante_id` que apunte acá. Por ahora hay una
-- sola fila y la app lee esa.
--
-- PERMISOS. Leer: cualquier usuario logueado (el nombre sale en el menú y en
-- todos los PDF). Modificar: sólo un perfil con rol 'admin'. Alta y baja de
-- restaurantes no se hace desde la app: no hay policy de INSERT ni de DELETE.
-- `anon` no recibe nada.
--
-- El logo se guarda como data URL (PNG achicado a 400 px por la pantalla,
-- unas decenas de KB). Así no hace falta un bucket nuevo con sus policies, y
-- los PDF lo usan directo sin bajarlo.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.restaurantes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_fantasia  TEXT NOT NULL,
  razon_social     TEXT,
  cuit             TEXT,
  condicion_iva    TEXT,
  direccion        TEXT,
  localidad        TEXT,
  codigo_postal    TEXT,
  provincia        TEXT,
  telefono         TEXT,
  email_compras    TEXT,
  horario_entrega  TEXT,
  condiciones_oc   TEXT,   -- una condición por renglón
  logo             TEXT,   -- data URL de la imagen
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- =====================================================
-- PERMISOS: GRANT + RLS + POLICY, los tres
-- =====================================================

GRANT SELECT, UPDATE ON public.restaurantes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurantes TO service_role;

ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lectura autenticada" ON public.restaurantes;
CREATE POLICY "lectura autenticada"
  ON public.restaurantes FOR SELECT
  TO authenticated
  USING (true);

-- La subconsulta a perfiles funciona porque cada usuario puede leer su propio
-- perfil ("Leer propio perfil", auth.uid() = id).
DROP POLICY IF EXISTS "solo admin modifica" ON public.restaurantes;
CREATE POLICY "solo admin modifica"
  ON public.restaurantes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));

-- =====================================================
-- updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION actualizar_updated_at_restaurantes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_restaurantes_updated_at ON public.restaurantes;
CREATE TRIGGER trigger_restaurantes_updated_at
  BEFORE UPDATE ON public.restaurantes
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at_restaurantes();

-- =====================================================
-- La fila de Tero, con lo que hoy sale en la OC
-- =====================================================
-- Condición de IVA, teléfono, mail y logo quedan vacíos: se cargan desde
-- Configuración → Empresa.

INSERT INTO public.restaurantes (
  nombre_fantasia, razon_social, cuit, direccion, localidad, codigo_postal,
  provincia, horario_entrega, condiciones_oc
)
SELECT
  'Tero Restó', 'Oret SRL', '30-71732567-9', 'Av. Agustín García 9501',
  'Benavídez', '1621', 'Buenos Aires',
  'de lunes a sábado de 10.00 a 16.00',
  E'Mercadería sujeta a control de calidad al recibir.\nConfirmar si el pedido será entregado en su totalidad.\nConfirmar fecha de entrega.'
WHERE NOT EXISTS (SELECT 1 FROM public.restaurantes);

-- Verificación: una fila, la de Tero
SELECT nombre_fantasia, razon_social, cuit, localidad FROM public.restaurantes;
