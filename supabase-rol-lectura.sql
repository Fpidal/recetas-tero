-- =====================================================
-- ROL DE SOLO LECTURA, para consultar la base desde afuera
-- =====================================================
--
-- PARA QUE: hasta ahora, cada vez que hacia falta un dato de la base habia que
-- pedirle al usuario que corriera un SELECT y pegara el resultado. En una sola
-- sesion eso paso ocho veces. Peor: cuando el dato no estaba disponible, se
-- terminaba razonando sobre el codigo en vez de sobre los datos, y de ahi
-- salieron numeros inventados.
--
-- POR QUE NO LA service_role: es una llave maestra. Lee, escribe, borra, y
-- saltea la RLS entera — todas las policies dejan de aplicar. Para un trabajo
-- que solo necesita LEER, es poder de mas.
--
-- Y el argumento honesto: los scripts se escriben con errores. En la sesion
-- que origino este archivo hubo un join a una tabla inexistente y un SQL que
-- dejaba filas fuera de las dos sumas por un NULL. Con un rol de solo lectura,
-- un error asi devuelve un error. Con la service_role, un UPDATE mal escrito
-- modifica datos de produccion.
--
-- La diferencia no es cuanto se cuide el script: es que pasa cuando falla.
--
-- ES LA MISMA LECCION QUE DEJO LO DE `anon` (ver CLAUDE.md, trampa 1): el
-- permiso es la primera linea de defensa, no la policy. Aca directamente no
-- existe el permiso de escribir, asi que no hay policy que revisar ni descuido
-- posible: si el script intenta un DELETE, Postgres lo rechaza.
-- =====================================================

-- 1. El rol. CAMBIAR LA CONTRASEÑA por una generada al azar, y guardarla en
--    .env.local (que ya esta en .gitignore). No reutilizar ninguna existente.
CREATE ROLE lector_analisis LOGIN PASSWORD 'PONER_UNA_CONTRASEÑA_LARGA_ACA';

-- 2. Puede ver el esquema...
GRANT USAGE ON SCHEMA public TO lector_analisis;

-- 3. ...y leer las tablas y vistas que existen hoy.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lector_analisis;

-- 4. Poder ver las FILAS, no solo las tablas.
--
--    SIN ESTO EL ROL NO SIRVE, Y LO PEOR ES QUE NO DA ERROR. Las tablas viejas
--    tienen policies `to public`, asi que se ven. Las nuevas —consumo_diario,
--    consumo_items, ventas_diarias— siguen la convencion correcta y las tienen
--    `to authenticated`. El rol lector no es `authenticated`, asi que ninguna
--    policy le aplica y Postgres le devuelve CERO FILAS en silencio.
--
--    Paso el 19/08/26, la primera vez que se corrieron los chequeos: los siete
--    dieron verde sobre tablas vacias. Un chequeo que pasa porque no vio nada
--    es peor que no tener chequeo.
--
--    BYPASSRLS deja leer todas las filas sin importar las policies. NO da
--    permiso de escritura: el rol sigue teniendo solo SELECT.
--
--    Para el multiusuario que viene: este atributo hace que el rol vea los
--    datos de TODOS los inquilinos. Para una credencial de auditoria del dueño
--    esta bien —es justamente lo que se quiere— pero nunca darsela a un
--    inquilino.
ALTER ROLE lector_analisis BYPASSRLS;

-- 5. Y las tablas que se creen mas adelante.
--
--    OJO — esto es lo mismo que causo el desastre de `anon`, asi que vale
--    explicar por que aca si corresponde. `anon` es PUBLICO: su clave viaja
--    dentro del JavaScript del navegador, asi que cualquiera la saca del
--    bundle. `lector_analisis` necesita una contraseña que vive solo en tu
--    maquina, y solo puede leer. El riesgo no se parece.
--
--    Si preferis controlarlo tabla por tabla, comenta esta linea: cada tabla
--    nueva va a necesitar su GRANT explicito.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO lector_analisis;


-- =====================================================
-- VERIFICAR QUE QUEDO BIEN
-- =====================================================
-- Tiene que devolver SELECT y nada mas. Si aparece INSERT, UPDATE o DELETE,
-- algo se concedio de mas.

SELECT DISTINCT privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee = 'lector_analisis'
 ORDER BY privilege_type;


-- =====================================================
-- SI ALGUN DIA QUERES CORTAR EL ACCESO
-- =====================================================
-- Un solo comando, y no toca la app: sigue usando sus propias claves.
--
-- DROP OWNED BY lector_analisis;
-- DROP ROLE lector_analisis;
