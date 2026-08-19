import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Ruta pública: solo el login. El menú digital del QR se sacó en V.41, así
  // que ya NO hay ninguna pantalla que muestre datos sin sesión — y por eso se
  // le pudieron revocar a `anon` las 8 columnas que le quedaban.
  const esRutaPublica = request.nextUrl.pathname.startsWith('/login')

  // Si no hay usuario y no es ruta pública, redirigir a login
  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si hay usuario y está en /login, redirigir al inicio
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Pasar el pathname al layout para condicionar el Sidebar
  supabaseResponse.headers.set('x-next-pathname', request.nextUrl.pathname)

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Proteger todas las rutas excepto:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon, iconos, manifest (PWA)
     */
    '/((?!_next/static|_next/image|favicon|icons|apple-touch-icon|manifest.json|.*\\.png$).*)',
  ],
}
