import { forwardRef } from 'react'

const variants = {
  primary:
    'bg-accent text-bg hover:bg-accent-strong shadow-glow',
  secondary:
    'bg-bg-raised text-text border border-border hover:border-accent/50',
  ghost:
    'bg-transparent text-text-dim hover:text-text hover:bg-bg-raised',
  danger:
    'bg-danger text-text hover:bg-danger/90',
}

const sizes = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  iconXs: 'h-8 w-8 p-0',
  iconSm: 'h-9 w-9 p-0',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-md font-medium
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg
        disabled:opacity-40 disabled:pointer-events-none
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
})
