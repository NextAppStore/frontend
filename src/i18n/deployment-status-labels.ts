import type { DeploymentStatus } from "@/types"

/**
 * Central deployment-status label registry, mirroring ``role-labels.ts``.
 * Views call ``t(deploymentStatusLabelKey(status))`` instead of printing the
 * raw backend value, which would surface strings like ``pause_failed`` in the
 * UI and stay English in both languages.
 *
 * Keys live in ``i18n/locales/{de,en}.ts`` under ``DeploymentsView.*``, where
 * they already existed for the detail view — this registry only makes them
 * reachable from everywhere else.
 */
const KEYS: Record<DeploymentStatus, string> = {
  pending: "DeploymentsView.deploymentPending",
  running: "DeploymentsView.deploymentRunning",
  success: "DeploymentsView.deploymentSuccessful",
  failed: "DeploymentsView.deploymentFailed",
  destroying: "DeploymentsView.deploymentDestroying",
  destroyed: "DeploymentsView.deploymentDestroyed",
  cancelled: "DeploymentsView.deploymentCancelled",
  pausing: "DeploymentsView.deploymentPausing",
  paused: "DeploymentsView.deploymentPaused",
  resuming: "DeploymentsView.deploymentResuming",
  pause_failed: "DeploymentsView.deploymentPauseFailed",
  resume_failed: "DeploymentsView.deploymentResumeFailed",
}

/**
 * Label key for a deployment status. Unknown values — a status the backend
 * added before the frontend learned about it — fall back to a neutral key
 * rather than leaking the raw value into the page.
 */
export function deploymentStatusLabelKey(status: string | undefined | null): string {
  if (status && status in KEYS) return KEYS[status as DeploymentStatus]
  return "DeploymentsView.noStatus"
}
