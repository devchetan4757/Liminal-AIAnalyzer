export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`
        rounded-lg border border-border bg-bg-raised
        p-4
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className = '', children, ...props }) {
  return (
    <div className={`mb-3 flex items-center justify-between ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className = '', children, ...props }) {
  return (
    <h3 className={`text-sm font-semibold text-text ${className}`} {...props}>
      {children}
    </h3>
  )
}
