/**
 * Consultar la base, en solo lectura.
 *
 * POR QUÉ EXISTE: cuando hace falta un dato de la base y no hay forma de
 * mirarlo, se termina razonando sobre el código en vez de sobre los datos. De
 * ahí salen los números inventados. Este script cierra ese hueco.
 *
 * QUÉ SIRVE Y QUÉ NO — importa tenerlo claro:
 *
 *   ✅ Verificar invariantes: ¿hay insumos con dos precios vigentes?
 *      ¿cocina + barra da el total? ¿hay facturas duplicadas?
 *   ✅ Investigar: por qué el queso brie aparece tres veces, qué cambió
 *      entre dos fechas, cuántas filas tiene una tabla.
 *   ✅ Comparar el repo contra la base: si un `.sql` versionado describe una
 *      función que no existe, acá se ve (ver CLAUDE.md — pasó en V.20 y costó
 *      una hora de arqueología).
 *
 *   ❌ NO sirve para reproducir los cálculos de la app. Las funciones de
 *      `src/lib/*-queries.ts` hablan por la API REST de Supabase; esto se
 *      conecta directo a Postgres. Son transportes distintos y no se cruzan.
 *      Reescribir acá el costeo, la incidencia o la matriz sería crear una
 *      segunda implementación que se va a separar de la app — exactamente lo
 *      que ya pasó con la merma (V.20), la incidencia (V.29) y la terracota
 *      (V.34). Si hace falta saber qué muestra una pantalla, se mira la
 *      pantalla.
 *
 * SEGURIDAD: se conecta con `lector_analisis`, un rol que solo tiene SELECT
 * (ver supabase-rol-lectura.sql). No es una promesa: Postgres rechaza
 * cualquier escritura. El chequeo de abajo que bloquea las sentencias que no
 * son SELECT es un segundo cinturón, para fallar con un mensaje claro en vez
 * de un error de permisos.
 *
 * USO:
 *   npm run consultar                      → lista los chequeos disponibles
 *   npm run consultar -- chequeos          → corre todos los invariantes
 *   npm run consultar -- precios-vigentes  → corre uno
 *   npm run consultar -- --sql "SELECT …"  → consulta libre
 *   npm run consultar -- --sql "…" --json  → salida JSON
 */

import { Client } from 'pg'
import { config } from 'dotenv'
import { CHEQUEOS, type Chequeo } from './chequeos'

config({ path: '.env.local' })

const URL_LECTOR = process.env.DATABASE_URL_LECTOR

/** Solo SELECT y WITH. Segundo cinturón sobre los permisos del rol. */
function esSoloLectura(sql: string): boolean {
  // Sin comentarios, que son el lugar clásico para esconder una segunda sentencia
  const limpio = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .toLowerCase()
  if (!/^(select|with)\b/.test(limpio)) return false
  return !/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/.test(limpio)
}

function formatearTabla(filas: any[]): string {
  if (filas.length === 0) return '  (sin resultados)'
  const cols = Object.keys(filas[0])
  const ancho = cols.map((c) =>
    Math.max(c.length, ...filas.map((f) => String(f[c] ?? '—').length))
  )
  const linea = (celdas: string[]) =>
    '  ' + celdas.map((v, i) => v.padEnd(ancho[i])).join('  ')
  return [
    linea(cols),
    '  ' + ancho.map((a) => '─'.repeat(a)).join('  '),
    ...filas.map((f) => linea(cols.map((c) => String(f[c] ?? '—')))),
  ].join('\n')
}

async function main() {
  const args = process.argv.slice(2)

  if (!URL_LECTOR) {
    console.error(`
  Falta DATABASE_URL_LECTOR en .env.local

  Es la cadena de conexión del rol de solo lectura. Se arma con los datos de
  Supabase → Settings → Database → Connection string, reemplazando el usuario
  y la contraseña por los del rol:

    DATABASE_URL_LECTOR="postgresql://lector_analisis:LA_CONTRASEÑA@HOST:5432/postgres"

  Si el rol todavía no existe, correr supabase-rol-lectura.sql.
`)
    process.exit(1)
  }

  // Sin argumentos: mostrar qué hay
  if (args.length === 0) {
    console.log('\n  Chequeos disponibles:\n')
    CHEQUEOS.forEach((c: Chequeo) => {
      console.log(`    ${c.nombre.padEnd(22)} ${c.descripcion}`)
    })
    console.log(`
  Uso:
    npm run consultar -- chequeos           corre todos
    npm run consultar -- <nombre>           corre uno
    npm run consultar -- --sql "SELECT …"   consulta libre
`)
    return
  }

  const db = new Client({
    connectionString: URL_LECTOR,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  try {
    // --- Consulta libre ---
    if (args[0] === '--sql') {
      const sql = args[1]
      if (!sql) throw new Error('Falta la consulta después de --sql')
      if (!esSoloLectura(sql)) {
        throw new Error(
          'Solo se aceptan SELECT y WITH. Los cambios en la base los corre el usuario.'
        )
      }
      const { rows } = await db.query(sql)
      console.log(args.includes('--json') ? JSON.stringify(rows, null, 2) : '\n' + formatearTabla(rows) + '\n')
      return
    }

    // --- Chequeos ---
    const aCorrer =
      args[0] === 'chequeos'
        ? CHEQUEOS
        : CHEQUEOS.filter((c: Chequeo) => c.nombre === args[0])

    if (aCorrer.length === 0) {
      throw new Error(`No existe el chequeo "${args[0]}". Corré sin argumentos para ver la lista.`)
    }

    let problemas = 0
    let ciegos = 0
    for (const chequeo of aCorrer) {
      // Primero: ¿este chequeo puede ver algo? Un chequeo que busca anomalías
      // da verde tanto cuando no hay anomalías como cuando no ve ni una fila,
      // y las dos se ven idénticas. Pasó el 19/08/26 con las tablas cuyas
      // policies son `to authenticated`: devolvían cero y los siete chequeos
      // dieron verde sobre tablas vacías.
      const { rows: univ } = await db.query(chequeo.universo)
      const filasVistas = Number(univ[0]?.n ?? 0)

      if (filasVistas === 0) {
        ciegos++
        console.log(`\n  ⊘  ${chequeo.nombre} — ${chequeo.descripcion}`)
        console.log(`     SIN DATOS A LA VISTA. No es que esté bien: es que no vio nada.`)
        console.log(`     Suele ser un permiso: si la tabla tiene RLS con policy \`to authenticated\`,`)
        console.log(`     el rol lector no la ve. Se arregla con: ALTER ROLE lector_analisis BYPASSRLS;`)
        continue
      }

      const { rows } = await db.query(chequeo.sql)
      const hayProblema = chequeo.problemaSi(rows)
      if (hayProblema) problemas++

      const marca = hayProblema ? '✗' : '✓'
      console.log(`\n  ${marca}  ${chequeo.nombre} — ${chequeo.descripcion}`)
      console.log(`     sobre ${filasVistas.toLocaleString('es-AR')} filas`)
      if (hayProblema || args[0] !== 'chequeos') {
        console.log(formatearTabla(rows))
        if (hayProblema) console.log(`\n     ${chequeo.queSignifica}`)
      }
    }

    if (args[0] === 'chequeos') {
      const partes = [`${CHEQUEOS.length} chequeos`]
      if (problemas > 0) partes.push(`${problemas} con problemas`)
      if (ciegos > 0) partes.push(`${ciegos} SIN PODER VERIFICAR`)
      if (problemas === 0 && ciegos === 0) partes.push('todo limpio')
      console.log(`\n  ${partes.join(' · ')}\n`)
      // Un chequeo ciego es tan malo como uno que falla: en los dos casos no
      // se sabe si el invariante se cumple.
      if (problemas > 0 || ciegos > 0) process.exitCode = 1
    }
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(`\n  Error: ${e.message}\n`)
  process.exit(1)
})
