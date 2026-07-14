import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, Trash2, MessagesSquare, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui/Button'
import { listConversations, createConversation, deleteConversation } from '../api/client'
import { useSidebarWidth } from '../hooks/useSidebarWidth'

function relativeTime(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function groupConversations(conversations) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const sevenDaysAgo = new Date(startOfToday)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const buckets = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const c of conversations) {
    const t = c.last_message_at ? new Date(c.last_message_at) : null
    if (t && t >= startOfToday) buckets[0].items.push(c)
    else if (t && t >= startOfYesterday) buckets[1].items.push(c)
    else if (t && t >= sevenDaysAgo) buckets[2].items.push(c)
    else buckets[3].items.push(c)
  }

  return buckets.filter((b) => b.items.length > 0)
}

function SkeletonRow({ delay, collapsed }) {
  if (collapsed) {
    return (
      <div
        className="mb-1 flex items-center justify-center rounded-lg py-2.5 animate-pulse"
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className="h-4 w-4 rounded bg-bg-inset" />
      </div>
    )
  }
  return (
    <div
      className="mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2.5 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-3.5 flex-1 rounded bg-bg-inset" />
      <div className="h-3 w-6 shrink-0 rounded bg-bg-inset" />
    </div>
  )
}

export default function ConversationSidebar({ activeId, onSelect, onCreated }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  // Own storage key so this rail's collapsed/width state is independent
  // from the main app Sidebar's.
  const {
    collapsed,
    width,
    toggleCollapsed,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTouchStart,
    handleTouchEnd,
  } = useSidebarWidth('conversationSidebar')

  const refresh = useCallback(async () => {
    try {
      const data = await listConversations()
      setConversations(data)
    } catch {
      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!activeId || loading) return
    const known = conversations.some((c) => c.id === activeId)
    if (!known) refresh()
  }, [activeId, conversations, loading, refresh])

  const handleNewChat = useCallback(async () => {
    try {
      const convo = await createConversation()
      setConversations((prev) => [convo, ...prev])
      onCreated(convo.id)
    } catch {
      // fall through, chat.py mints one implicitly anyway
    }
  }, [onCreated])

  const handleDelete = useCallback(
    async (e, id) => {
      e.stopPropagation()
      setDeletingId(id)
      try {
        await deleteConversation(id)
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (id === activeId) onSelect(null)
      } catch {
        // leave the list as-is on failure
      } finally {
        setDeletingId(null)
      }
    },
    [activeId, onSelect],
  )

  const groups = useMemo(() => groupConversations(conversations), [conversations])

  return (
    <div
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-bg-raised transition-[width] duration-150 ease-out"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={`border-b border-border p-3 ${collapsed ? 'px-2' : ''}`}>
        {!collapsed && (
          <div className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
            Conversations
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          title={collapsed ? 'New Chat' : undefined}
          className={collapsed ? 'w-full justify-center px-0' : 'w-full justify-center gap-2'}
          onClick={handleNewChat}
        >
          <MessageSquarePlus size={16} />
          {!collapsed && 'New Chat'}
        </Button>
      </div>

      <div className={`flex-1 overflow-y-auto overflow-x-hidden py-3 ${collapsed ? 'px-1.5' : 'px-2'}`}>
        {loading && (
          <div>
            <SkeletonRow delay={0} collapsed={collapsed} />
            <SkeletonRow delay={75} collapsed={collapsed} />
            <SkeletonRow delay={150} collapsed={collapsed} />
          </div>
        )}

        {!loading && conversations.length === 0 && !collapsed && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MessagesSquare size={20} />
            </div>
            <p className="text-xs font-medium text-text-dim">
              No saved conversations yet
            </p>
            <p className="text-[11px] leading-relaxed text-text-faint">
              Start a new chat and it'll show up here automatically.
            </p>
          </div>
        )}

        {!loading &&
          groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              {!collapsed && (
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                  {group.label}
                </div>
              )}

              <div className="space-y-0.5">
                {group.items.map((c) => {
                  const isActive = c.id === activeId
                  const isDeleting = deletingId === c.id

                  if (collapsed) {
                    return (
                      <button
                        key={c.id}
                        onClick={() => onSelect(c.id)}
                        title={c.title || 'New chat'}
                        className={`group relative flex w-full items-center justify-center rounded-lg py-2.5 transition-all duration-150 ${
                          isActive
                            ? 'bg-accent-soft text-accent'
                            : 'text-text-dim hover:bg-bg-inset hover:text-text'
                        } ${isDeleting ? 'opacity-40' : ''}`}
                      >
                        <span
                          className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-opacity duration-150 ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        <MessageCircle
                          size={15}
                          className={isActive ? 'text-accent' : 'text-text-faint'}
                        />
                      </button>
                    )
                  }

                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      className={`group relative flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-2 text-left text-sm transition-all duration-150 ${
                        isActive
                          ? 'bg-accent-soft text-accent'
                          : 'text-text-dim hover:bg-bg-inset hover:text-text'
                      } ${isDeleting ? 'opacity-40' : ''}`}
                    >
                      <span
                        className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-opacity duration-150 ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />

                      <MessageCircle
                        size={14}
                        className={`shrink-0 ${isActive ? 'text-accent' : 'text-text-faint'}`}
                      />

                      <span className="min-w-0 flex-1 truncate font-medium">
                        {c.title || 'New chat'}
                      </span>

                      <span className="shrink-0 text-[10px] text-text-faint group-hover:opacity-0 transition-opacity">
                        {relativeTime(c.last_message_at)}
                      </span>

                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => handleDelete(e, c.id)}
                        title="Delete conversation"
                        className="absolute right-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-faint opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Collapse/expand toggle */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-1/2 -right-3 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg-raised text-text-faint shadow-glow transition-colors hover:text-accent"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      {/* Drag-to-resize handle */}
      {!collapsed && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute top-0 -right-1 h-full w-2 cursor-col-resize touch-none"
        />
      )}
    </div>
  )
}
