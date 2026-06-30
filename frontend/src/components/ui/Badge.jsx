const tones = {
  neutral: 'bg-bg-inset text-text-dim border-border',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger:  'bg-danger-soft text-danger border-danger/30',
  accent:  'bg-accent-soft text-accent border-accent/30',
}

export function Badge({ tone = 'neutral', className = '', children, ...props }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-full border px-2.5 py-0.5
        text-xs font-medium font-mono
        ${tones[tone]} ${className}
      `}
      {...props}
    >
      {children}
    </span>
  )
}
