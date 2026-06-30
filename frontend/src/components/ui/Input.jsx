import { forwardRef } from 'react'

export const Input = forwardRef(function Input(
  { className = '', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`
        h-10 w-full rounded-md
        bg-bg-inset border border-border
        px-3 text-sm text-text placeholder:text-text-faint
        outline-none transition-colors
        focus:border-accent/60 focus:ring-2 focus:ring-accent/20
        disabled:opacity-40
        ${className}
      `}
      {...props}
    />
  )
})
