import { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  className?: string
  hideOnMobile?: boolean
  mobileLabel?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyMessage?: string
  isLoading?: boolean
  onRowClick?: (item: T) => void
  mobileCard?: (item: T) => ReactNode
}

export default function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No hay datos disponibles',
  isLoading = false,
  onRowClick,
  mobileCard,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="table-container p-8 text-center">
        <div className="animate-pulse flex justify-center">
          <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
        </div>
        <p className="mt-2 text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="table-container p-8 text-center">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      {/* Vista de tabla para desktop */}
      <div className="table-container hidden md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`table-header px-6 py-3 ${column.className || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`table-cell ${column.className || ''}`}>
                    {column.render
                      ? column.render(item)
                      : (item as Record<string, unknown>)[column.key] as ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista de cards para mobile */}
      <div className="md:hidden space-y-3">
        {data.map((item) => (
          <div
            key={keyExtractor(item)}
            className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${onRowClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
            onClick={() => onRowClick?.(item)}
          >
            {mobileCard ? (
              mobileCard(item)
            ) : (
              // Vista de card por defecto basada en columnas
              <div className="space-y-2">
                {columns.filter(col => !col.hideOnMobile && col.key !== 'acciones').map((column) => (
                  <div key={column.key} className="flex justify-between items-start gap-2">
                    <span className="text-xs text-gray-500 flex-shrink-0">{column.mobileLabel || column.header}:</span>
                    <div className="text-sm text-right">
                      {column.render
                        ? column.render(item)
                        : (item as Record<string, unknown>)[column.key] as ReactNode}
                    </div>
                  </div>
                ))}
                {/* Acciones al final */}
                {columns.find(col => col.key === 'acciones')?.render && (
                  <div className="pt-2 border-t mt-2 flex justify-end">
                    {columns.find(col => col.key === 'acciones')?.render?.(item)}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
