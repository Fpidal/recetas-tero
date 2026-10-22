import { redirect } from 'next/navigation'

// El listado de menús vive en Carta → Menús. Esta ruta sólo queda para no
// romper enlaces viejos; alta y edición siguen en nuevo/ y [id]/.
export default function MenusEspecialesPage() {
  redirect('/carta?tab=especiales')
}
