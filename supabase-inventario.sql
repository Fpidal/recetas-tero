-- =====================================================
-- Inventario: stock calculado, con conteos que lo corrigen
-- =====================================================
--
-- CÓMO FUNCIONA. El stock no se guarda: se calcula.
--
--   stock = lo contado en el último conteo de ese insumo
--         + compras posteriores a esa fecha   (facturas × cantidad_por_paquete)
--         − consumo posterior a esa fecha     (Análisis, expandido y en BRUTO)
--
-- Por eso no hace falta una tabla de "stock actual" ni un "stock inicial": el
-- conteo ES el punto cero, y cada conteo nuevo vuelve a fijarlo. Un insumo que
-- nunca se contó no tiene stock confiable, y la pantalla lo dice en vez de
-- inventar un número.
--
-- EL CONSUMO SE DESCUENTA EN BRUTO. La receta guarda el NETO que va al plato:
-- 7 kg de cebolla pelada. De la cámara salieron 7 ÷ (1 − merma) = 7,78 kg con
-- cáscara. Descontar el neto haría que el conteo nunca cierre, porque lo que se
-- cuenta en la cámara son cebollas enteras. La merma va del lado del consumo,
-- nunca del stock.
--
-- LAS BEBIDAS ENTRAN POR CAJA. La factura carga 30 cajas de agua y el salón
-- sirve botellas: la compra se multiplica por `insumos.cantidad_por_paquete`,
-- que ya está cargado (agua 12, gaseosa 350 24). Sin eso el stock da negativo.
--
-- NADA DE ESTO TOCA EL COSTEO. Estas tablas solo se leen para el inventario;
-- el precio de los insumos, el costo de las recetas y las facturas siguen
-- exactamente igual.

-- -----------------------------------------------------
-- 1. Un conteo: la foto de un día
-- -----------------------------------------------------
create table if not exists public.inventario_conteos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  notas text,
  created_at timestamptz not null default now()
);

comment on table public.inventario_conteos is
  'Cada vez que se cuenta la cámara. La fecha del conteo es el punto cero desde el cual se recalcula el stock.';

-- -----------------------------------------------------
-- 2. Lo contado de cada insumo, con su diferencia
-- -----------------------------------------------------
create table if not exists public.inventario_conteo_items (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inventario_conteos(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id),
  -- Lo que decía el sistema en ese momento. Se guarda, no se recalcula: es la
  -- foto de lo que se comparó. Si mañana se corrige una factura vieja, el
  -- teórico de hoy cambiaría y la diferencia registrada dejaría de tener sentido.
  cantidad_teorica numeric(12,3) not null,
  cantidad_contada numeric(12,3) not null,
  diferencia numeric(12,3) generated always as (cantidad_contada - cantidad_teorica) stored,
  -- Por qué no coincidió. Es lo que vuelve útil al ajuste: sin motivo, a los
  -- tres meses hay una lista de diferencias y ninguna explicación.
  -- Texto y no enum, para poder agregar motivos sin una migration.
  motivo text,
  nota text,
  created_at timestamptz not null default now(),
  unique (conteo_id, insumo_id)
);

comment on column public.inventario_conteo_items.cantidad_teorica is
  'Lo que el sistema calculaba al momento de contar. Congelado a propósito.';
comment on column public.inventario_conteo_items.motivo is
  'falta_registrar | merma_de_mas | rotura | error_carga | sin_explicacion';

create index if not exists idx_conteo_items_insumo
  on public.inventario_conteo_items (insumo_id);

-- -----------------------------------------------------
-- 3. Permisos, RLS y policy (obligatorio en tabla nueva)
-- -----------------------------------------------------
-- `anon` no recibe nada: la clave anónima viaja en el bundle público.
grant select, insert, update, delete on public.inventario_conteos to authenticated;
grant select, insert, update, delete on public.inventario_conteos to service_role;
grant select, insert, update, delete on public.inventario_conteo_items to authenticated;
grant select, insert, update, delete on public.inventario_conteo_items to service_role;

alter table public.inventario_conteos enable row level security;
alter table public.inventario_conteo_items enable row level security;

create policy "solo autenticados" on public.inventario_conteos
  for all to authenticated using (true) with check (true);
create policy "solo autenticados" on public.inventario_conteo_items
  for all to authenticated using (true) with check (true);

-- El rol de lectura del repo necesita verlas para los chequeos
grant select on public.inventario_conteos to lector_analisis;
grant select on public.inventario_conteo_items to lector_analisis;
