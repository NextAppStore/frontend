/**
 * Status badge styles for deployment and task status values.
 *
 * Both DeploymentDetailView and DeploymentsListView need consistent status
 * colors, icons, and i18n label keys. Centralising them here means a new
 * status value only needs to be added in one place.
 *
 * Exports:
 *   getStatusStyles — returns { label, dotClass, textClass, badgeClass, icon }
 *                     for a given status string
 *   getStatusColor  — returns only the badgeClass string (used by DeploymentsListView)
 */

// TODO: move getStatusStyles from DeploymentDetailView.vue (~lines 1106–1221)
//       and consolidate with getStatusColor from DeploymentsListView.vue

export function getStatusStyles(_status: string | undefined): {
  label: string
  dotClass: string
  textClass: string
  badgeClass: string
  icon: unknown
} {
  // placeholder — replace with full switch block from DeploymentDetailView
  return { label: '', dotClass: '', textClass: '', badgeClass: '', icon: null }
}

export function getStatusColor(_status: string): string {
  // placeholder — replace with color map from DeploymentsListView
  return ''
}
