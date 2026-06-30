import { SearchCheck, MessageSquare, History, ShieldCheck } from 'lucide-react'

const NAV = [
  { key: 'manual', label: 'Manual Analysis', icon: SearchCheck },
  { key: 'chat', label: 'Liminal (AI)', icon: MessageSquare },
  { key: 'history', label: 'History', icon: History },
]

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-bg-raised">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
          <ShieldCheck size={18} />
        </div>
        <div>
          <div className="text-sm font-semibold text-text leading-tight">Sentry</div>
          <div className="text-[11px] text-text-faint leading-tight">Blue Team Toolkit</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {NAV.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active === item.key
                ? 'bg-accent-soft text-accent'
                : 'text-text-dim hover:bg-bg-inset hover:text-text'
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto p-3 text-[11px] text-text-faint">
        Liminal is the AI-assist layer — everything it does is also available manually.
      </div>
    </aside>
  )
}
