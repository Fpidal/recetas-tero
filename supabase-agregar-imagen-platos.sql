-- Agregar campo imagen_url a la tabla platos (Recetas)
-- La columna ya existía en recetas_base (Elaboraciones) pero faltaba en platos,
-- por eso en Recetas no se podía subir la foto ("Error al guardar la URL de la imagen").
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE platos
ADD COLUMN IF NOT EXISTS imagen_url TEXT;

-- Comentario explicativo
COMMENT ON COLUMN platos.imagen_url IS 'URL pública de la foto de la receta (bucket "fotos platos")';
