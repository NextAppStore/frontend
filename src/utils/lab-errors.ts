/**
 * Map a lab API error onto an i18n key under ``KubernetesStudentsPanel.errors``.
 *
 * The lab routes answer with a structured ``detail.reason`` for the cases a
 * teacher can act on (``lab_not_deployed``, ``lab_cluster_unavailable``). The
 * kubeconfig download is fetched as a blob, so its error body is a Blob and
 * carries no readable ``detail`` — the HTTP status is the fallback signal.
 *
 * Returns ``null`` for anything unmapped; callers then show
 * ``extractErrorMessage(err)``.
 */
const REASON_KEYS: Record<string, string> = {
  lab_not_deployed: 'KubernetesStudentsPanel.errors.notDeployed',
  lab_cluster_unavailable: 'KubernetesStudentsPanel.errors.clusterUnavailable',
  lab_view_forbidden: 'KubernetesStudentsPanel.errors.forbidden',
  lab_operate_forbidden: 'KubernetesStudentsPanel.errors.forbidden',
}

const STATUS_KEYS: Record<number, string> = {
  403: 'KubernetesStudentsPanel.errors.forbidden',
  409: 'KubernetesStudentsPanel.errors.taskActive',
  412: 'KubernetesStudentsPanel.errors.notDeployed',
  422: 'KubernetesStudentsPanel.errors.invalidInput',
  502: 'KubernetesStudentsPanel.errors.clusterUnavailable',
}

interface ErrorLike {
  response?: {
    status?: number
    data?: { detail?: unknown } | unknown
  }
}

export function labErrorKey(err: unknown): string | null {
  const response = (err as ErrorLike | null)?.response
  const data = response?.data
  const detail = data && typeof data === 'object' && 'detail' in data
    ? (data as { detail?: unknown }).detail
    : undefined
  if (detail && typeof detail === 'object' && 'reason' in detail) {
    const reason = (detail as { reason?: unknown }).reason
    const key = typeof reason === 'string' ? REASON_KEYS[reason] : undefined
    if (key) return key
  }
  const status = response?.status
  return typeof status === 'number' ? STATUS_KEYS[status] ?? null : null
}
