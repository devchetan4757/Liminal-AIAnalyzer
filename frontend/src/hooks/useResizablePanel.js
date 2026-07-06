import { useCallback, useEffect, useRef, useState } from 'react'

function readStoredBool(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function readStoredWidth(key, { minWidth, maxWidth, defaultWidth }) {
  try {
    const v = Number(localStorage.getItem(key))
    return v >= minWidth && v <= maxWidth ? v : defaultWidth
  } catch {
    return defaultWidth
  }
}

/**
 * Drives a collapsible, drag-resizable side panel (the main nav sidebar,
 * the Connected Apps list, or any other left-hand panel that wants the
 * same behavior):
 *  - drag the edge handle (mouse/pen/touch) to resize it between
 *    minWidth and maxWidth, or drag it in far enough to snap collapsed
 *  - swipe left/right anywhere on the panel body to collapse/expand it
 *    on touch devices, without needing to find the handle
 *  - a plain click toggle is exposed too, for anyone on a
 *    mouse-and-keyboard setup who'd rather not drag
 *
 * Width and collapsed state persist in localStorage under `storageKey`
 * - this is just a layout preference, not account data, so it's fine to
 * key it globally rather than per-user. Pass a distinct storageKey per
 * panel so multiple panels on the same page don't clobber each other's
 * saved state.
 */
export function useResizablePanel({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  collapsedWidth,
  collapseSnapThreshold,
  swipeDistanceThreshold = 50,
  swipeMaxDurationMs = 600,
}) {
  const widthOpts = { minWidth, maxWidth, defaultWidth }

  const [collapsed, setCollapsed] = useState(() => readStoredBool(`${storageKey}:collapsed`, false))
  const [width, setWidth] = useState(() => readStoredWidth(`${storageKey}:width`, widthOpts))

  const dragState = useRef(null)
  const touchState = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(`${storageKey}:collapsed`, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed, storageKey])

  useEffect(() => {
    try { localStorage.setItem(`${storageKey}:width`, String(width)) } catch { /* ignore */ }
  }, [width, storageKey])

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), [])

  // --- Drag-to-resize handle ---
  const handlePointerDown = useCallback((e) => {
    if (collapsed) return
    dragState.current = { startX: e.clientX, startWidth: width }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [collapsed, width])

  const handlePointerMove = useCallback((e) => {
    if (!dragState.current) return
    const delta = e.clientX - dragState.current.startX
    const next = dragState.current.startWidth + delta
    setWidth(Math.min(maxWidth, Math.max(minWidth, next)))
  }, [maxWidth, minWidth])

  const handlePointerUp = useCallback((e) => {
    if (!dragState.current) return
    const delta = e.clientX - dragState.current.startX
    const finalWidth = dragState.current.startWidth + delta
    dragState.current = null

    if (finalWidth < collapseSnapThreshold) {
      setCollapsed(true)
      setWidth(defaultWidth) // restore a sane width for next time it opens
    }
  }, [collapseSnapThreshold, defaultWidth])

  // --- Swipe-to-collapse/expand (touch only) ---
  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0]
    touchState.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now() }
  }, [])

  const handleTouchEnd = useCallback((e) => {
    const start = touchState.current
    touchState.current = null
    if (!start) return

    const t = e.changedTouches[0]
    const dx = t.clientX - start.startX
    const dy = t.clientY - start.startY
    const duration = Date.now() - start.startTime

    const tooSlow = duration > swipeMaxDurationMs
    const tooShort = Math.abs(dx) < swipeDistanceThreshold
    const tooVertical = Math.abs(dx) < Math.abs(dy)
    if (tooSlow || tooShort || tooVertical) return

    if (dx < 0 && !collapsed) setCollapsed(true)
    if (dx > 0 && collapsed) setCollapsed(false)
  }, [collapsed, swipeDistanceThreshold, swipeMaxDurationMs])

  return {
    collapsed,
    width: collapsed ? collapsedWidth : width,
    toggleCollapsed,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleTouchStart,
    handleTouchEnd,
  }
}
