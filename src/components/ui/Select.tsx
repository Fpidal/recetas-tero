import { SelectHTMLAttributes, forwardRef } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  compact?: boolean
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, id, options, compact, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className={compact
              ? "block text-[11px] font-medium text-ink mb-0.5"
              : "block text-sm font-medium text-ink mb-1.5"
            }
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          autoComplete="new-password"
          data-lpignore="true"
          data-form-type="other"
          className={`
            block w-full rounded-lg border
            bg-white cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-terracotta/15 focus:border-terracotta
            transition-colors
            ${compact
              ? 'h-8 px-2.5 py-1.5 text-[13px]'
              : 'px-3 py-2.5 sm:py-2 text-base sm:text-sm'
            }
            ${error
              ? 'border-danger focus:ring-danger/15 focus:border-danger'
              : 'border-sand-dark'
            }
            ${className}
          `}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1 text-sm text-danger">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select
