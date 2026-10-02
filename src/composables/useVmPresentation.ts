/**
 * Shared presentation helpers for the Infrastructure VM components
 * (``InfrastructureVmCard`` and ``InfrastructureVmDrawer``).
 *
 * Both components render the same two derived values: the VM uptime
 * (from ``hardware.launched_at``) and the lifecycle pill's colour
 * classes (from a resolved tone). These helpers are the single source
 * of truth for that formatting so the two components stay in lockstep.
 */

/** Lifecycle pill tone. Both spellings of the neutral tone are accepted
 *  because the two callers historically differ (``'grey'`` vs.
 *  ``'gray'``); both resolve to the same neutral classes. */
export type PillTone = 'green' | 'amber' | 'red' | 'grey' | 'gray'

/**
 * Format a VM's uptime relative to the user's browser clock.
 *
 * Server-clock-robust: we subtract ``launched_at`` from ``Date.now()``
 * in the user's browser. A 200ms-skewed clock costs nothing.
 *
 * Returns ``null`` when the timestamp is absent, unparseable, or in the
 * future (negative delta).
 */
export function formatUptime(launchedAt?: string | null): string | null {
  if (!launchedAt) return null
  const launched = new Date(launchedAt).getTime()
  if (!Number.isFinite(launched)) return null
  const delta = Date.now() - launched
  if (delta < 0) return null
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

/**
 * Map a resolved lifecycle tone to its Tailwind pill classes. The
 * colour palette is the only place the frontend interprets OpenStack
 * lifecycle vocabulary — keep it tight.
 */
export function pillToneClass(tone: PillTone): string {
  switch (tone) {
    case 'green':
      return 'bg-status-successLight text-status-success border-status-success/30'
    case 'red':
      return 'bg-status-errorLight text-status-error border-status-error/30'
    case 'amber':
      return 'bg-status-warningLight text-status-warning border-status-warning/40'
    default:
      return 'bg-surface-input text-content-secondary border-border'
  }
}
