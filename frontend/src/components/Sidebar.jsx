import {
  SearchCheck,
  MessageSquare,
  History,
  ShieldCheck,
  Activity,
  Bell,
  Clock3,
  Plug,
} from "lucide-react";

const NAV = [
  {
    section: "Security",
    items: [
      {
        key: "manual",
        label: "Manual Analysis",
        icon: SearchCheck,
      },
      {
        key: "chat",
        label: "Liminal (AI)",
        icon: MessageSquare,
      },
      {
        key: "history",
        label: "History",
        icon: History,
      },
    ],
  },

  {
    section: "Infrastructure",
    items: [
      {
        key: "watchlist",
        label: "Watchlist",
        icon: Bell,
      },
      {
        key: "timeline",
        label: "Timeline",
        icon: Clock3,
      },
    ],
  },

  {
    section: "Integrations",
    items: [
      {
        key: "connected-apps",
        label: "Connected Apps",
        icon: Plug,
      },
    ],
  },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-raised">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">
          <ShieldCheck size={18} />
        </div>

        <div>
          <div className="text-sm font-semibold text-text leading-tight">
            Liminal
          </div>

          <div className="text-[11px] text-text-faint leading-tight">
            Blue Team Toolkit
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">

        {NAV.map((group) => (
          <div key={group.section} className="mb-5">

            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              {group.section}
            </div>

            <div className="space-y-1">

              {group.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active === item.key
                      ? "bg-accent-soft text-accent"
                      : "text-text-dim hover:bg-bg-inset hover:text-text"
                  }`}
                >
                  <item.icon size={17} />

                  <span>{item.label}</span>
                </button>
              ))}

            </div>
          </div>
        ))}

      </nav>

      <div className="border-t border-border p-3 text-[11px] text-text-faint">
        Manual monitoring and connected apps work together. Every connected
        service becomes a monitored resource while manual resources can be added
        without any integration.
      </div>
    </aside>
  );
}
