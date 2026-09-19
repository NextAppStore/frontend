/**
 * Phase stepper labels and step count for the deployment live-progress view.
 *
 * The worker ships the authoritative phase sequence (``phase_names``) with
 * every SSE progress event. Before the first event arrives, this composable
 * falls back to static tables keyed by task type (deploy / destroy / pause /
 * resume / redeploy). Multi-image deploy phases that don't match any static
 * table fall back further to a numeric slot index so the stepper never renders
 * an empty label.
 *
 * Exports:
 *   PHASE_LABELS_*    — static fallback tables (also used by tests)
 *   phaseLabel        — formats a raw UPPER_SNAKE_CASE phase name for display
 *   useDeploymentPhaseLabels — composable returning phaseStepCount + phaseStepLabel
 */

import type { Ref } from 'vue'

// TODO: move constants + logic from DeploymentDetailView.vue (~lines 662–803)

export const PHASE_LABELS_DEPLOY_FULL = [] as const
export const PHASE_LABELS_DEPLOY_NO_PACKER = [] as const
export const PHASE_LABELS_DESTROY = [] as const
export const PHASE_LABELS_PAUSE = [] as const
export const PHASE_LABELS_RESUME = [] as const
export const PHASE_LABELS_REDEPLOY = [] as const

export function phaseLabel(_phase: unknown): string {
  // placeholder — replace with implementation from DeploymentDetailView
  return ''
}

export function useDeploymentPhaseLabels(_params: {
  streamTotalPhases: Ref<number>
  streamCurrentPhaseIndex: Ref<number | null>
  streamProgress: Ref<number | null>
  streamPhaseNames: Ref<string[]>
  activeTaskType: Ref<string | null | undefined>
}) {
  // placeholder — replace with phaseStepCount + phaseStepLabel from DeploymentDetailView

  const phaseStepCount = { value: 11 }
  const phaseStepLabel = (_idx: number): string => ''

  return { phaseStepCount, phaseStepLabel }
}
