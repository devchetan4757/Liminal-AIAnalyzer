import { useResizablePanel } from './useResizablePanel'

/**
 * Nav sidebar's collapse/resize/swipe behavior - see useResizablePanel
 * for the actual mechanics. Kept as its own named hook (rather than
 * calling useResizablePanel directly from Sidebar.jsx) so the
 * dimensions/storage key live in one obvious place.
 */
export function useSidebarWidth() {
  return useResizablePanel({
    storageKey: 'sidebar',
    defaultWidth: 256,     // matches the old fixed w-64
    minWidth: 200,
    maxWidth: 360,
    collapsedWidth: 72,    // icon-only rail
    collapseSnapThreshold: 160,
  })
}
