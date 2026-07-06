import { useEffect, useState } from "react";
import {
  SearchCheck,
  MessageSquare,
  History,
  ShieldCheck,
  Activity,
  Bell,
  Clock3,
  Plug,
  LogOut,
  UserCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getCurrentUser } from "../api/client";
import { useSidebarWidth } from "../hooks/useSidebarWidth";

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

export default function Sidebar({ active, onSelect, onLogout }) {
  const [username, setUsername] = useState(localStorage.getItem("username") || "")

  const {
    collapsed,
    width,
    toggleCollapsed,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTouchStart,
    handleTouchEnd,
  } = useSidebarWidth()

  useEffect(() => {
    if (username) return
    // Covers sessions where the token exists but "username" wasn't cached
    // locally (e.g. carried over from before accounts existed).
    getCurrentUser()
      .then((me) => {
        setUsername(me.username)
        localStorage.setItem("username", me.username)
      })
      .catch(() => {})
  }, [username])

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-border bg-bg-raised transition-[width] duration-150 ease-out"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`flex items-center gap-2 border-b border-border px-4 py-4 ${collapsed ? "justify-center px-2" : ""}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <ShieldCheck size={18} />
        </div>

        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text leading-tight">
              Liminal
            </div>

            <div className="truncate text-[11px] text-text-faint leading-tight">
              Threat Intel, Live Infra Watch
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">

        {NAV.map((group) => (
          <div key={group.section} className="mb-5">

            {!collapsed && (
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                {group.section}
              </div>
            )}

            <div className="space-y-1">

              {group.items.map((item) => (
                <button
                  key={item.key}
                  title={collapsed ? item.label : undefined}
                  onClick={() => onSelect(item.key)}
                  className={`flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors ${
                    collapsed ? "justify-center px-0" : "px-3"
                  } ${
                    active === item.key
                      ? "bg-accent-soft text-accent"
                      : "text-text-dim hover:bg-bg-inset hover:text-text"
                  }`}
                >
                  <item.icon size={17} className="shrink-0" />

                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              ))}

            </div>
          </div>
        ))}

      </nav>

      <div className={`border-t border-border p-3 ${collapsed ? "px-2" : ""}`}>
        <div className={`mb-2 flex items-center gap-2 px-1 text-xs text-text-dim ${collapsed ? "justify-center px-0" : ""}`}>
          <UserCircle2 size={16} className="shrink-0 text-text-faint" />
          {!collapsed && <span className="truncate">{username || "…"}</span>}
        </div>
        <button
          onClick={onLogout}
          title={collapsed ? "Log out" : undefined}
          className={`flex w-full items-center gap-2 rounded-md py-1.5 text-xs font-medium text-text-faint transition-colors hover:bg-bg-inset hover:text-danger ${
            collapsed ? "justify-center px-0" : "px-2"
          }`}
        >
          <LogOut size={14} className="shrink-0" />
          {!collapsed && "Log out"}
        </button>
        {!collapsed && (
          <p className="mt-2 text-[11px] text-text-faint">
            Every account's connected apps, watchlist, and history are private
            to that account only.
          </p>
        )}
      </div>

      {/* Collapse/expand toggle - always available for click users, not
          just drag/swipe. Sits centered on the edge like most split-pane
          UIs so it's discoverable without instructions. */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-1/2 -right-3 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg-raised text-text-faint shadow-glow transition-colors hover:text-accent"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      {/* Drag-to-resize handle - invisible hit area over the border,
          only active (and only rendered with a resize cursor) while
          expanded, since a collapsed rail has a fixed width. */}
      {!collapsed && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute top-0 -right-1 h-full w-2 cursor-col-resize touch-none"
        />
      )}
    </aside>
  );
}
