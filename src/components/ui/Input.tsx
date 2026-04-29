import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-ink mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`
            block w-full rounded-lg border px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-white
            placeholder:text-ink-light
            focus:outline-none focus:ring-2 focus:ring-terracotta/15 focus:border-terracotta
            transition-colors
            ${error
              ? 'border-danger focus:ring-danger/15 focus:border-danger'
              : 'border-sand-dark'
            }
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-danger">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
