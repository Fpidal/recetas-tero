export type CategoriaInsumo =
  | 'Carnes'
  | 'Almacen'
  | 'Verduras_Frutas'
  | 'Pescados_Mariscos'
  | 'Lacteos_Fiambres'
  | 'Bebidas'
  | 'Salsas_Recetas'

export type UnidadMedida = 'kg' | 'lt' | 'unidad' | 'gr' | 'ml' | 'porcion'

export interface Database {
  public: {
    Tables: {
      proveedores: {
        Row: {
          id: string
          nombre: string
          codigo: string | null
          categoria: string | null
          contacto: string | null
          celular: string | null
          telefono: string | null
          email: string | null
          situacion_iva: string | null
          condicion_pago: string | null
          forma_pago: string | null
          cuit: string | null
          banco: string | null
          cbu: string | null
          direccion: string | null
          notas: string | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['proveedores']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['proveedores']['Insert']>
      }
      insumos: {
        Row: {
          id: string
          nombre: string
          categoria: CategoriaInsumo
          unidad_medida: UnidadMedida
          cantidad_por_paquete: number
          merma_porcentaje: number
          iva_porcentaje: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['insumos']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['insumos']['Insert']>
      }
      precios_insumo: {
        Row: {
          id: string
          insumo_id: string
          proveedor_id: string | null
          precio: number
          fecha: string
          es_precio_actual: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['precios_insumo']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['precios_insumo']['Insert']>
      }
      recetas_base: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          rendimiento_porciones: number
          costo_total: number
          costo_por_porcion: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['recetas_base']['Row'], 'id' | 'created_at' | 'updated_at' | 'costo_total' | 'costo_por_porcion'>
        Update: Partial<Database['public']['Tables']['recetas_base']['Insert']>
      }
      receta_base_ingredientes: {
        Row: {
          id: string
          receta_base_id: string
          insumo_id: string
          cantidad: number
          costo_linea: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['receta_base_ingredientes']['Row'], 'id' | 'created_at' | 'costo_linea'>
        Update: Partial<Database['public']['Tables']['receta_base_ingredientes']['Insert']>
      }
      platos: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          costo_total: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['platos']['Row'], 'id' | 'created_at' | 'updated_at' | 'costo_total'>
        Update: Partial<Database['public']['Tables']['platos']['Insert']>
      }
      plato_ingredientes: {
        Row: {
          id: string
          plato_id: string
          insumo_id: string | null
          receta_base_id: string | null
          cantidad: number
          costo_linea: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['plato_ingredientes']['Row'], 'id' | 'created_at' | 'costo_linea'>
        Update: Partial<Database['public']['Tables']['plato_ingredientes']['Insert']>
      }
      menus_ejecutivos: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          costo_total: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['menus_ejecutivos']['Row'], 'id' | 'created_at' | 'updated_at' | 'costo_total'>
        Update: Partial<Database['public']['Tables']['menus_ejecutivos']['Insert']>
      }
      menu_ejecutivo_items: {
        Row: {
          id: string
          menu_ejecutivo_id: string
          insumo_id: string
          cantidad: number
          es_bebida: boolean
          costo_linea: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['menu_ejecutivo_items']['Row'], 'id' | 'created_at' | 'costo_linea'>
        Update: Partial<Database['public']['Tables']['menu_ejecutivo_items']['Insert']>
      }
      menus_especiales: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          costo_promedio: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['menus_especiales']['Row'], 'id' | 'created_at' | 'updated_at' | 'costo_promedio'>
        Update: Partial<Database['public']['Tables']['menus_especiales']['Insert']>
      }
      menu_especial_opciones: {
        Row: {
          id: string
          menu_especial_id: string
          plato_id: string
          tipo_opcion: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['menu_especial_opciones']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['menu_especial_opciones']['Insert']>
      }
      carta: {
        Row: {
          id: string
          plato_id: string
          precio_sugerido: number
          precio_carta: number
          margen_objetivo: number
          food_cost_real: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['carta']['Row'], 'id' | 'created_at' | 'updated_at' | 'precio_sugerido' | 'food_cost_real'>
        Update: Partial<Database['public']['Tables']['carta']['Insert']>
      }
      ordenes_compra: {
        Row: {
          id: string
          numero: string | null
          proveedor_id: string
          fecha: string
          estado: 'borrador' | 'enviada' | 'recibida' | 'cancelada' | 'parcialmente_recibida'
          total: number
          notas: string | null
          orden_origen_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['ordenes_compra']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['ordenes_compra']['Insert']>
      }
      orden_compra_items: {
        Row: {
          id: string
          orden_compra_id: string
          insumo_id: string
          cantidad: number
          precio_unitario: number
          subtotal: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['orden_compra_items']['Row'], 'id' | 'created_at' | 'subtotal'>
        Update: Partial<Database['public']['Tables']['orden_compra_items']['Insert']>
      }
      facturas_proveedor: {
        Row: {
          id: string
          proveedor_id: string
          numero_factura: string
          fecha: string
          total: number
          orden_compra_id: string | null
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['facturas_proveedor']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['facturas_proveedor']['Insert']>
      }
      factura_items: {
        Row: {
          id: string
          factura_id: string
          insumo_id: string
          cantidad: number
          precio_unitario: number
          subtotal: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['factura_items']['Row'], 'id' | 'created_at' | 'subtotal'>
        Update: Partial<Database['public']['Tables']['factura_items']['Insert']>
      }
    }
  }
}

// Tipos de ayuda para usar en la aplicación
export type Proveedor = Database['public']['Tables']['proveedores']['Row']
export type Insumo = Database['public']['Tables']['insumos']['Row']
export type PrecioInsumo = Database['public']['Tables']['precios_insumo']['Row']
export type RecetaBase = Database['public']['Tables']['recetas_base']['Row']
export type RecetaBaseIngrediente = Database['public']['Tables']['receta_base_ingredientes']['Row']
export type Plato = Database['public']['Tables']['platos']['Row']
export type PlatoIngrediente = Database['public']['Tables']['plato_ingredientes']['Row']
export type MenuEjecutivo = Database['public']['Tables']['menus_ejecutivos']['Row']
export type MenuEjecutivoItem = Database['public']['Tables']['menu_ejecutivo_items']['Row']
export type MenuEspecial = Database['public']['Tables']['menus_especiales']['Row']
export type MenuEspecialOpcion = Database['public']['Tables']['menu_especial_opciones']['Row']
export type CartaItem = Database['public']['Tables']['carta']['Row']
export type OrdenCompra = Database['public']['Tables']['ordenes_compra']['Row']
export type OrdenCompraItem = Database['public']['Tables']['orden_compra_items']['Row']
export type FacturaProveedor = Database['public']['Tables']['facturas_proveedor']['Row']
export type FacturaItem = Database['public']['Tables']['factura_items']['Row']
