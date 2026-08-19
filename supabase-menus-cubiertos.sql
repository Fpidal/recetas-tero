-- =====================================================
-- MENUS: cuantos cubiertos alimenta cada uno
-- =====================================================
--
-- EL PROBLEMA: hay productos que se cargan como 1 unidad pero alimentan a
-- varias personas. El caso concreto es "Menu parrillada 2 (Noche)": una linea
-- de consumo, dos comensales.
--
-- Eso rompe cualquier comparacion entre productos, y no de forma sutil.
-- Medido el 18/08/26 con los datos del servicio del 8/8:
--
--   Menu Pescados      cuesta $11.945 y alimenta 1 persona
--   Menu parrillada 2  cuesta $24.396 y alimenta 2  ->  $12.198 por persona
--
-- Por persona son casi el mismo producto (2% de diferencia). Pero sin dividir,
-- la parrillada aparece con el doble de costo y el doble de contribucion que
-- todo lo demas. En la matriz de ingenieria de menu eso corrio el umbral de
-- contribucion de la seccion de $19.345 a $20.139, y con eso el Menu Pescados
-- -que deja $20.055- cruzo de "estrella" a "caballo" por $84 de diferencia.
--
-- O sea: un solo producto mal medido daba vuelta el diagnostico del producto
-- mas vendido del restaurante.
--
-- LA CORRECCION: una columna con cuantos cubiertos cubre cada menu. Vale 1
-- para casi todos, y solo hay que tocarla donde no lo sea.
--
-- Es NOT NULL DEFAULT 1, asi que ningun dato existente cambia de significado:
-- todos los menus que ya estan cargados quedan en 1, que es lo correcto para
-- todos menos la parrillada.
--
-- numeric y no integer porque un "2/3 pax" puede querer cargarse como 2,5.
-- =====================================================

-- 1. La columna
alter table public.menus_ejecutivos
  add column if not exists cubiertos numeric(4,2) not null default 1;

-- 2. Que no se pueda cargar 0 ni negativo: se usa como divisor
alter table public.menus_ejecutivos
  drop constraint if exists menus_ejecutivos_cubiertos_positivo;

alter table public.menus_ejecutivos
  add constraint menus_ejecutivos_cubiertos_positivo
  check (cubiertos > 0);

comment on column public.menus_ejecutivos.cubiertos is
  'A cuantas personas alcanza una unidad de este menu. 1 para los individuales. '
  'Se usa para normalizar el ranking y la matriz de ingenieria de menu: sin esto '
  'un menu para dos aparece con el doble de contribucion que uno individual y '
  'corre el umbral de toda la seccion.';

-- 3. PERMISOS: no hace falta tocar nada.
--    Los GRANT de menus_ejecutivos son a nivel tabla para `authenticated` y
--    `service_role`, y esos alcanzan a las columnas nuevas automaticamente.
--    `anon` no tiene ningun permiso sobre esta tabla -la carta publica solo
--    lee 4 columnas de `platos` y 4 de `carta`- asi que la columna nueva no
--    queda expuesta. Ver supabase-cerrar-acceso-anonimo.sql.


-- =====================================================
-- PASO 1: MIRAR ANTES DE TOCAR
-- =====================================================
-- Correr esto primero. Muestra todos los menus activos con su valor actual
-- de cubiertos (van a estar todos en 1) para decidir cuales hay que cambiar.

select
  nombre,
  cubiertos,
  costo_total,
  precio_carta,
  round(costo_total / nullif(cubiertos, 0), 0)  as costo_por_cubierto,
  round(precio_carta / nullif(cubiertos, 0), 0) as precio_por_cubierto
from public.menus_ejecutivos
where activo = true
order by nombre;


-- =====================================================
-- PASO 2: RECIEN DESPUES DE MIRAR
-- =====================================================
-- Descomentar y ajustar segun lo que haya salido arriba.
-- El WHERE va por nombre exacto para no pisar otro menu por accidente.
--
-- update public.menus_ejecutivos
--    set cubiertos = 2
--  where nombre = 'Menu parrillada 2 (Noche)';
--
-- Si hubiera otros compartidos (una picada, una fuente para dos), va uno por
-- linea con su nombre exacto. No usar LIKE: 'Menu parrillada%' podria agarrar
-- una variante vieja que quedo activa.


-- =====================================================
-- PASO 3: VERIFICAR
-- =====================================================
-- Despues del update, esto tiene que mostrar la parrillada en 2 y el costo
-- por cubierto en linea con el resto de los menus (~$12.000 al 18/08/26).
--
-- select nombre, cubiertos,
--        round(costo_total / cubiertos, 0) as costo_por_cubierto
--   from public.menus_ejecutivos
--  where activo = true
--  order by costo_por_cubierto desc;
